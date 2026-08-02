## Why

`track-api-costs` (shipped in 3 phases) records per-user cost shares in `api_usage_logs`, but never the raw, unsplit cost of the underlying API call itself. For the batched cron path, one Apify run's cost is split proportionally across users — but if any returned post doesn't match any user (URL normalization mismatch, a company deactivated mid-batch, etc.), that fraction of cost is silently dropped: not attributed to any user, and not recorded anywhere else either. There is also no way to answer "what did this specific Claude call or Apify run cost in total?" directly from the data — `api_usage_logs` rows aren't correlated back to the call that produced them.

## What Changes

- Add a new `api_run_logs` table: one row per actual external API call (a Claude `messages.create` call, or an Apify actor run), recording the call's raw, unsplit cost and usage — independent of how many users it ends up attributed to.
- Add `run_id` to `api_usage_logs`, referencing the `api_run_logs` row each per-user share was derived from.
- `saveApiRun()` (new, in `lib/database.js`) creates the raw run row and returns its ID; `analyzeBatch()` (Claude) and the orchestrator's Apify call sites (`processAllUsersBatched`, `processUser`, `processPeople`, `processTerms`) call it once per underlying API call, then pass the returned `run_id` into every `saveApiUsage()` call derived from that run.

## Capabilities

### Modified Capabilities
- `api-usage-logging`: adds the `run_id` correlation column and the requirement that every per-user usage row traces back to a raw run row.

### New Capabilities
(none — this extends the existing `api-usage-logging` capability from `track-api-costs`, not a new one)

## Impact

- **Database**: new `api_run_logs` table (migration); `api_usage_logs` gains a nullable `run_id UUID REFERENCES api_run_logs(id)` column (migration).
- **Code**: `lib/database.js` (`saveApiRun`, `saveApiUsage` gains `runId`), `lib/claude.js` (`analyzeBatch`), `lib/orchestrator.js` (`processAllUsersBatched`, `processUser`, `processPeople`, `processTerms`, `distributeAndProcess`/`logApifyUsageShare`).
- **Out of scope**: reconciliation tooling that alerts when a batch's per-user shares don't sum to the run's total cost — the `run_id` correlation makes that queryable, but building an automated check is a follow-up, not part of this change.
