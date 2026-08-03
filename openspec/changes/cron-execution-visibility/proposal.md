## Why

The nightly cron (`/api/process-all-users`, driving `processAllUsersBatched`) only reports its outcome through `console.log`/`console.error` (via `lib/logger.js`), which lands in Vercel's function logs. Those logs are hard to search and rotate out, so there is no way to answer "did last night's batch run, and how did it go?" without digging through Vercel's log stream. We need a persisted, queryable record of each cron execution and a simple way to review it.

## What Changes

- Persist one row per `processAllUsersBatched` execution (batch start, hour, success/failure, users processed, posts sent/failed/duplicated per source type, duration, error message if any) to a new `cron_execution_logs` table.
- Add a `saveCronExecution` data-access function in `lib/database.js` following the existing `saveApiRun`/`saveApiUsage` pattern (best-effort insert, never throws, logs a warning on failure).
- Wire `processAllUsersBatched` in `lib/orchestrator.js` to record a cron execution row when the batch completes (success path) and when it fails (catch path), reusing the already-computed summary values (`userIds.length`, `totalSent`, `totalFailed`, elapsed time).
- Add a new secret-protected endpoint (`/api/cron-status`) that renders the most recent cron executions (reverse-chronological, e.g. last 30) as a simple HTML table, following the same `CRON_SECRET` auth pattern already used by `/api/dashboard` and `/api/process-all-users`.

## Capabilities

### New Capabilities
- `cron-execution-logging`: Persisting and reviewing the outcome of each scheduled batch cron run (`processAllUsersBatched`), independent of the existing per-provider API usage/cost logging.

### Modified Capabilities
(none — this does not change requirements of `api-usage-logging` or `batch-scraping-dedup`; it adds a new, separate record of the batch's own execution outcome)

## Impact

- **Database**: new `cron_execution_logs` table (migration required).
- **Backend**: `lib/database.js` (new `saveCronExecution` function), `lib/orchestrator.js` (call it from `processAllUsersBatched`'s success and error paths).
- **API**: new `api/cron-status.js` endpoint; `vercel.json` gets a new function entry (short `maxDuration`, like `api/dashboard.js`).
- **No changes** to the existing `/api/process-all-users` cron contract, `api_run_logs`/`api_usage_logs` tables, or per-user dashboard.
