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

### 2. Estimated cost stored as a derived column (not computed live)

Cost in USD is calculated at write time using static rate constants (`CLAUDE_INPUT_COST_PER_1K`, `CLAUDE_OUTPUT_COST_PER_1K`, `APIFY_COST_PER_CU`) and stored as `estimated_cost_usd NUMERIC(10,6)`.

**Rationale**: Rates rarely change; storing the derived value enables fast aggregation without joins or runtime computation. The rate used is also stored (`rate_snapshot JSONB`) so audits remain accurate even after rate changes.

### 3. Fire-and-forget persistence (non-blocking)

`saveApiUsage` is called with `await` but errors are caught and logged without rethrowing. A cost-logging failure must never interrupt the scraping pipeline.

**Rationale**: The primary value delivered to users is scraped posts. Cost tracking is observability infrastructure — degraded gracefully.

### 4. Apify compute units sourced from the run's `usageTotalUsd` field

Apify's run response (`waitData.data`) includes `usageTotalUsd` and `stats.computeUnits`. These are read after the `waitForFinish` poll in `runActor`.

**Rationale**: This is the only point in the code where the completed run object is available with final stats.

## Risks / Trade-offs

- **Rate staleness** → Rates are hardcoded constants; if Anthropic or Apify changes pricing, estimates drift silently. Mitigation: store the rate snapshot with each row; add a note in code to update constants when pricing changes.
- **Null Apify stats** → If an actor run fails before completion, compute units may be zero or absent. Mitigation: log what's available; `estimated_cost_usd` defaults to 0 for failed runs.
- **Token count accuracy** → Claude returns exact token counts; these are precise, not estimated.

## Migration Plan

1. Run Supabase migration to create `api_usage_logs` table.
2. Deploy updated `lib/claude.js` and `lib/apify.js` — new rows begin accumulating.
3. No rollback risk: the table is additive; removing the inserts reverts to the prior state with no data loss to existing tables.

## Open Questions

- Should we surface costs in the existing `/api/insights` endpoint or add a dedicated `/api/costs` route? (Leaning toward extending insights for now.)
- What Apify compute-unit rate should we use as default? (Current public rate: ~$0.25 / 1000 CU — confirm before implementation.)
