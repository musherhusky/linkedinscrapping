## Context

`processAllUsersBatched` (`lib/orchestrator.js`) is the single entry point the nightly cron (`/api/process-all-users`) invokes once per configured hour. It already computes a rich summary internally (`userIds.length`, `totalSent`, `totalFailed`, elapsed time) and logs it via `logger.success`/`logger.error`, but that summary only reaches Vercel's function log stream — it is never persisted. Two existing tables already persist execution data for a related but distinct concern: `api_run_logs` (one row per raw external API call: Claude/Apify) and `api_usage_logs` (per-user cost attribution). Neither represents "did the batch itself run, and how did it go" — a batch can call zero, one, or several `api_run_logs` rows, or fail before any Apify call happens at all (e.g. no users scheduled for that hour, or a thrown error in step 2/3).

`api/dashboard.js` is scoped to a single `userId` and renders per-user engagement analytics; cron executions are batch-level (span all users sharing an hour), so they do not fit naturally as a per-user view. `api/process-all-users.js` and `api/dashboard.js` both already gate access behind `CRON_SECRET` (via `Authorization: Bearer` or `x-vercel-cron-secret`), which is the existing auth pattern for internal/ops endpoints in this project.

## Goals / Non-Goals

**Goals:**
- Persist exactly one row per `processAllUsersBatched` invocation, whether it completes normally, returns early (no users for that hour), or throws.
- Make that history reviewable without opening Vercel's log dashboard.
- Reuse existing patterns: best-effort insert helpers modeled on `saveApiRun`, and `CRON_SECRET`-gated endpoints modeled on `api/dashboard.js`.

**Non-Goals:**
- Not replacing or restructuring `api_run_logs` / `api_usage_logs` — those track external API cost/usage, this tracks the batch orchestration outcome.
- Not adding per-user drill-down inside this view (per-user detail already exists via `api_usage_logs` and the per-user dashboard); the new view is batch-level only.
- Not adding alerting/notifications (e.g. Slack/email on failure) — purely persistence + a read view, per this iteration.

## Decisions

**1. New table `cron_execution_logs`, not a new column on an existing table.**
A batch execution is a distinct entity from an API run or a per-user usage row (cardinality: one row per cron invocation, regardless of how many `api_run_logs`/`api_usage_logs` rows it produces). Columns:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `hour_utc INTEGER NOT NULL` — the batch hour parameter
- `status TEXT NOT NULL CHECK (status IN ('success', 'no_users', 'error'))`
- `users_processed INTEGER NOT NULL DEFAULT 0`
- `posts_sent INTEGER NOT NULL DEFAULT 0`
- `posts_failed INTEGER NOT NULL DEFAULT 0`
- `duration_ms INTEGER`
- `error_message TEXT`
- `started_at TIMESTAMPTZ NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` (i.e. when the row was written, at batch end)

Alternatives considered: reusing `api_run_logs` with `provider = 'cron'` — rejected because its schema (`model_or_actor`, `compute_units`, `total_cost_usd`) doesn't represent batch-level fields (`users_processed`, `status`) without overloading columns for an unrelated meaning.

**2. Recording happens inside `processAllUsersBatched`, on both the success path and the early-return ("no users") path, plus the `catch` block in `api/process-all-users.js` for unexpected throws.**
`processAllUsersBatched` already has all the summary values in scope at its two return points. The early-return path (`userIds.length === 0`) is recorded as `status: 'no_users'` (not an error) since it's an expected outcome when no user has that hour configured. Errors thrown inside `processAllUsersBatched` (e.g. a rejected `Promise.all` in step 2) propagate up to the `catch` in `api/process-all-users.js`, which is the last point with a `hourUtc` and elapsed time in scope — a `status: 'error'` row is recorded there via a small helper, so no execution is ever silently unlogged.

Alternatives considered: recording only in `api/process-all-users.js` — rejected because it would need `processAllUsersBatched` to return failure detail without throwing, which changes its existing error contract for legacy callers/tests; simpler to record success/no_users where the data already lives and only handle the failure case at the HTTP layer.

**3. New `saveCronExecution(stats, supabase)` function in `lib/database.js`, following the `saveApiRun` pattern: best-effort, wrapped in try/catch, logs a warning and returns `null` on failure, never throws.**
A logging failure must never fail or mask the batch's actual result.

**4. New endpoint `api/cron-status.js`, gated by the same `CRON_SECRET` pattern as `api/dashboard.js` and `api/process-all-users.js`, rendering the last N (default 30, capped 100) `cron_execution_logs` rows as a plain HTML table ordered by `started_at DESC`.**
Kept separate from `api/dashboard.js` because that page is inherently per-`userId`, while cron executions are global/batch-level and have no natural `userId` to scope by. A new small `maxDuration: 30, memory: 512` entry is added to `vercel.json`, matching `api/dashboard.js`'s existing function config.

## Risks / Trade-offs

- **[Risk] The failure-path insert in `api/process-all-users.js`'s `catch` won't have `users_processed`/`posts_sent` figures (the error may occur before those are computed) → Mitigation**: those columns default to `0` and are best-effort; `status: 'error'` + `error_message` is the primary signal for this path.
- **[Risk] Logging insert itself could fail (e.g. Supabase outage) → Mitigation**: `saveCronExecution` never throws (same as `saveApiRun`); a failed log write only produces a `logger.warn`, it never affects the batch's actual outcome or response.
- **[Risk] `cron_execution_logs` grows unbounded over time → Mitigation**: out of scope for this change; can be addressed later with a retention policy if needed (same posture as `api_run_logs` today).

## Migration Plan

1. Add `docs/migrations/create_cron_execution_logs.sql` creating the table (additive, no changes to existing tables).
2. Apply the migration to Supabase (user-confirmed step, per existing project convention for migrations).
3. Deploy `lib/database.js` + `lib/orchestrator.js` changes (additive — recording is best-effort and does not change `processAllUsersBatched`'s return shape or `api/process-all-users.js`'s response contract).
4. Deploy the new `api/cron-status.js` endpoint + `vercel.json` entry.

Rollback: the new table and endpoint are additive and independent of existing behavior; reverting the code deploy is sufficient (no data migration to undo).

## Open Questions

None — scope confirmed with the user as "DB persistence + endpoint/dashboard".
