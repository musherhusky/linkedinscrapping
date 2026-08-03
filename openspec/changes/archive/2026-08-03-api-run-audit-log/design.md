## Context

`track-api-costs` established `api_usage_logs` (one row per user per API call, cost split proportionally for batched Apify runs) and the `runActor`/`executeActor`/`executePeopleActor`/`executeTermsActor` return-shape change (`{ posts, runStats }`) that exposes each run's raw `computeUnits`/`usageTotalUsd`. `logApifyUsageShare()` in `lib/orchestrator.js` already does the per-user proportional split; this change adds the missing raw-run audit trail underneath it.

## Goals / Non-Goals

**Goals:**
- Record the raw, unsplit cost/usage of every external API call (Claude, Apify) exactly once, regardless of how many users its cost ends up split across.
- Correlate every `api_usage_logs` row back to the `api_run_logs` row it was derived from, via `run_id`.

**Non-Goals:**
- Automated reconciliation/alerting when per-user shares don't sum to the run total — `run_id` makes this queryable by hand or in a future dashboard, not automated here.
- Backfilling `run_id` for rows already written by the already-shipped `track-api-costs` phases — those rows keep `run_id = NULL`.
- Changing the proportional-split math itself (`design.md` Decision 5 in `track-api-costs`) — unchanged.

## Decisions

### 1. `api_run_logs` is providerless of `user_id` — it's not a per-user table

`api_run_logs` has no `user_id` column. A single Claude call always maps to one user (already true today), but a single batched Apify run maps to *many* users — there is no single correct `user_id` to put on the raw run row. Keeping `user_id` entirely off `api_run_logs` and only on `api_usage_logs` (which already handles the one-to-many fan-out) avoids inventing a meaningless "primary user" for batched runs.

### 2. Run-row creation happens in the orchestration layer, not inside `lib/apify.js`

`lib/apify.js` currently has zero dependency on `lib/database.js` (clean separation: `apify.js` = external API integration, `database.js` = persistence — per `docs/backend-standards.md` § 2's module responsibility table). Adding `saveApiRun` calls inside `runActor()` would blur that boundary and make `apify.js` responsible for persistence decisions it doesn't otherwise make.

**Decision**: run-row creation stays in `lib/orchestrator.js` (which already owns all `saveApiUsage` calls) and `lib/claude.js` (which already owns its own usage logging from `track-api-costs` Phase 1). Concretely:
- `analyzeBatch()` calls `saveApiRun('claude', {...})` once, immediately after receiving `message.usage`, then passes the returned `run_id` into its existing per-user `saveApiUsage` call.
- `processAllUsersBatched()` calls `saveApiRun('apify', {...})` up to three times (once per source type that actually ran — company/person/term), immediately after unpacking each `runStats`, then threads the three `run_id`s down through `distributeAndProcess` into `logApifyUsageShare()`, which includes the relevant `run_id` in every per-user row it writes for that source type.
- `processUser`/`processPeople`/`processTerms` (legacy single-user paths) each call `saveApiRun` once immediately after receiving their own `runStats`, then include the `run_id` in their single `saveApiUsage` call.

**Alternative considered**: have `saveApiUsage` itself create the run row lazily on first call per run (e.g., keyed by some run-scoped cache). Rejected — implicit, stateful, and harder to reason about than explicitly creating the run row once at the one call site that actually knows a new run just happened.

### 3. `saveApiRun` returns `null` on failure rather than throwing — fire-and-forget, matching Decision 3 of `track-api-costs`

If the `api_run_logs` insert fails, `saveApiRun` logs a warning and returns `null` (not caught by re-throwing — the caller never needs a try/catch around it). Downstream `saveApiUsage` calls then simply get `runId: null` — the per-user cost is still recorded, just without run-level correlation for that call. A logging-infrastructure failure must never interrupt the scraping/analysis pipeline, exactly as established for `saveApiUsage` itself.

## Risks / Trade-offs

- **[`run_id` is nullable, not enforced]** → Existing pre-migration `api_usage_logs` rows, and any row written when `saveApiRun` itself fails, have `run_id = NULL`. This is intentional (see Decision 3) — a `NOT NULL` constraint would make a run-logging failure fatal to the whole pipeline, which is the opposite of the established fire-and-forget philosophy.
- **[Two separate insert calls per run instead of one]** → `saveApiRun` + N × `saveApiUsage` are separate round trips rather than a single transactional write. If the process crashes between them, a run row could exist with no corresponding usage rows (or vice versa, for the pre-existing `run_id = NULL` case). Acceptable — this is observability infrastructure, not a source of truth for billing, and matches the already-accepted trade-offs of the existing fire-and-forget design.

## Migration Plan

1. Create `api_run_logs` (new table) and add `run_id` to `api_usage_logs` (single migration file, two statements) — user applies against the live Supabase project.
2. Deploy updated `lib/database.js`/`lib/claude.js`/`lib/orchestrator.js` — new runs begin populating both tables with correlation; no behavior change to existing cost figures.
3. Rollback: both changes are additive (new table, new nullable column) — reverting the code keeps existing data intact; dropping the column/table is safe and lossless for anything except the audit trail itself.
