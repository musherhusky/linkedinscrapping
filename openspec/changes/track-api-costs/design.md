## Context

The platform calls Anthropic (Claude) and Apify on every scraping run. Claude's `messages.create` response already contains a `usage` object with `input_tokens` and `output_tokens`. Apify's run response contains compute-unit stats. Neither is currently persisted; there is no way to see spend per user, per day, or per run.

The existing data layer uses Supabase (PostgreSQL) via the `@supabase/supabase-js` client. All persistent state lives in Supabase. The pattern for writing events is established in `lib/database.js` (`savelog`, `savePost`).

## Goals / Non-Goals

**Goals:**
- Persist every Claude API call's token counts and estimated USD cost in Supabase.
- Persist every Apify actor run's compute-unit count and estimated USD cost in Supabase.
- Expose aggregate cost data (by provider, by user, by date) through the existing insights/dashboard API.

**Non-Goals:**
- Real-time billing or payment collection.
- Alerting or quota enforcement (potential future work).
- Tracking costs for APIs other than Claude and Apify.
- Backfilling historical cost data.

## Decisions

### 1. Single `api_usage_logs` table (not provider-specific tables)

All external API usage events go into one table with a `provider` discriminator (`claude` | `apify`). Provider-specific columns are nullable.

**Rationale**: Keeps the schema flat and aggregation queries uniform. Adding a third provider only requires a new row, not a new table. Alternatives considered: separate `claude_usage_logs` and `apify_usage_logs` tables — rejected because queries spanning providers require a UNION and migrations diverge.

### 2. Estimated cost stored as a derived column (not computed live), from a per-model rate table with no guessed fallback

Cost in USD is calculated at write time and stored as `estimated_cost_usd NUMERIC(10,6)`. For Claude, this is `CLAUDE_RATE_TABLE_PER_1K` in `lib/claude.js` — a lookup by exact model ID (`claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-4-8`, etc.), populated only with rates that can be verified at implementation time. **If the resolved model (`getAnalysisModel()`) has no entry in the table, `estimated_cost_usd` is stored as `NULL` (token counts are still recorded) and a warning is logged** — a fabricated number would be worse than an honest gap, since the entire point of this feature is accurate spend visibility. Notably, the *default* value of `getAnalysisModel()` (`claude-opus-4-5`, a legacy model) has no verified rate in the table as of this writing; only models actually configured via `ANTHROPIC_MODEL_ANALYSIS` with a known current rate (e.g. `claude-haiku-4-5`, the model actually in use in production) get a real cost estimate today.

**Rationale**: Rates rarely change; storing the derived value enables fast aggregation without joins or runtime computation. The rate used is also stored (`rate_snapshot JSONB`) so audits remain accurate even after rate changes — or, for unrated models, records that no rate was available at write time.

### 3. Fire-and-forget persistence (non-blocking)

`saveApiUsage` is called with `await` but errors are caught and logged without rethrowing. A cost-logging failure must never interrupt the scraping pipeline.

**Rationale**: The primary value delivered to users is scraped posts. Cost tracking is observability infrastructure — degraded gracefully.

### 4. Apify compute units sourced from the run's `usageTotalUsd` field

Apify's run response (`waitData.data`) includes `usageTotalUsd` and `stats.computeUnits`. These are read after the `waitForFinish` poll in `runActor`.

**Rationale**: This is the only point in the code where the completed run object is available with final stats.

### 5. Terms actor coverage, and the batched multi-user attribution problem (resumed)

Since this design was first written, a third Apify actor was added (`executeTermsActor`, for search-term scraping — see the `target-terms-scraping` change). All three actor functions (`executeActor`, `executePeopleActor`, `executeTermsActor`) call the same shared `runActor(actorId, token, input)`, so instrumenting at that single choke point covers all three "for free" — no per-actor-type duplication.

However, `runActor` cannot simply accept a `userId` and log directly, because of how it's actually invoked:

- **Legacy single-user path** (`processUser`, `processPeople`, `processTerms` in `lib/orchestrator.js`): one user, one call to `executeActor`/`executePeopleActor`/`executeTermsActor` per run. A `userId` is available at the call site.
- **Batched path** (`processAllUsersBatched`): one Apify call covers the deduplicated URLs/terms of *all* users scheduled for that hour. There is no single `userId` at the point the actor runs — cost must be split proportionally across users *after* `distributeAndProcess` assigns posts back to each user (this was already anticipated in task 4.5 of the original plan, via `posts_received / total_posts_in_batch`).

**Decision**: `runActor` does not log usage itself. Instead, `executeActor` / `executePeopleActor` / `executeTermsActor` change their return shape from a bare `Post[]` array to `{ posts: Post[], runStats: { actorId, computeUnits, usageTotalUsd } }`, so callers in both paths can access run stats without a second network call. The legacy single-user path logs immediately with its known `userId`. The batched path logs once per user after distribution, splitting `runStats` proportionally by that user's `posts_received` for that source type.

**Alternative considered**: have `runActor` accept an optional `userId` and log inline when provided, leaving the batched path to log separately by some other means. Rejected — this splits the logging logic across two different code paths with two different data flows (inline vs. post-hoc), which is more error-prone than a single consistent shape change consumed uniformly by both callers.

**Consequence**: this is a breaking return-shape change to `executeActor`/`executePeopleActor`/`executeTermsActor`, requiring every call site to be updated (`lib/orchestrator.js`'s `processUser`, `processPeople`, `processTerms`, and `processAllUsersBatched`). This is why Apify instrumentation is its own separately-shipped change (see `proposal.md` → Delivery Plan) rather than bundled with the simpler, non-breaking Claude instrumentation.

### 6. `/api/insights` renders HTML, not JSON (discovered during Phase 3)

The original design assumed extending `/api/insights`'s JSON response with an `api_costs` field. In reality, `/api/insights` renders a full HTML dashboard (`Content-Type: text/html`) — there is no JSON response to extend. Cost data is surfaced as a new "Costes" card in the existing dashboard, styled consistently with the other cards (bar charts via the existing `bar()` helper), rather than a JSON field. The underlying `getApiCostSummary(userId, from, to)` query in `lib/database.js` is unchanged from the original plan — only how it's rendered differs.

## Risks / Trade-offs

- **Rate staleness** → Rates are hardcoded constants; if Anthropic or Apify changes pricing, estimates drift silently. Mitigation: store the rate snapshot with each row; add a note in code to update constants when pricing changes.
- **Null Apify stats** → If an actor run fails before completion, compute units may be zero or absent. Mitigation: log what's available; `estimated_cost_usd` defaults to 0 for failed runs.
- **Token count accuracy** → Claude returns exact token counts; these are precise, not estimated.

## Migration Plan

1. Run Supabase migration to create `api_usage_logs` table.
2. Deploy updated `lib/claude.js` and `lib/apify.js` — new rows begin accumulating.
3. No rollback risk: the table is additive; removing the inserts reverts to the prior state with no data loss to existing tables.

## Open Questions

None outstanding — resolved on resume (2026-08-02):
- **Insights route**: extend the existing `/api/insights` endpoint (not a dedicated `/api/costs` route) — no new endpoint needed, keeps cost data alongside other per-user metrics already surfaced there.
- **Apify compute-unit rate**: not applicable as a single constant — Apify's `harvestapi` actors (used for all three: companies, people, terms) are billed `PRICE_PER_DATASET_ITEM` ($0.002/result) per the actor metadata fetched during the `target-terms-scraping` change, not a flat compute-unit rate. `APIFY_COST_PER_CU` from the original design is replaced by reading `usageTotalUsd` directly from the run response when available (Apify computes and returns actual run cost), falling back to `NULL`/logged-as-unavailable if that field is absent — no separate rate constant to keep in sync with pricing changes.
