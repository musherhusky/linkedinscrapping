## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/api-run-audit-log` from `main`
- [x] 0.2 Verify branch creation and current branch status

## 1. Database Migration

- [x] 1.1 Create `docs/migrations/create_api_run_logs.sql`: `api_run_logs` table (`id` UUID PK, `provider` TEXT CHECK IN ('claude','apify'), `model_or_actor` TEXT, `source_type` TEXT nullable, `input_tokens`/`output_tokens` INTEGER nullable, `compute_units` NUMERIC nullable, `total_items` INTEGER nullable, `total_cost_usd` NUMERIC(10,6) nullable, `rate_snapshot` JSONB, `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()); plus `ALTER TABLE api_usage_logs ADD COLUMN run_id UUID REFERENCES api_run_logs(id) ON DELETE SET NULL` and a supporting index
- [ ] 1.2 Coordinate with the user to apply the migration against the live Supabase project (agent has no direct Supabase admin/SQL access)

## 2. Backend: Failing Tests First (TDD) — `saveApiRun`

- [x] 2.1 Add tests in `tests/unit/saveApiRun.test.js` (fake Supabase client, mirroring `saveApiUsage.test.js`) asserting `saveApiRun(provider, stats, supabase)` inserts a row into `api_run_logs` with correct field mapping and returns the inserted row's `id`
- [x] 2.2 Add tests asserting `saveApiRun` returns `null` (not throw) both when the insert fails and when the client itself throws
- [x] 2.3 Run the tests and confirm they fail (red) — confirmed: `saveApiRun` export missing

## 3. Backend: Implementation — `saveApiRun` and `saveApiUsage.runId`

- [x] 3.1 Add `saveApiRun(provider, stats, supabase = getSupabaseClient())` to `lib/database.js` per `design.md` Decision 3 (fire-and-forget, returns `null` on failure)
- [x] 3.2 Update `saveApiUsage`'s insert payload to include `run_id: stats.runId ?? null`
- [x] 3.3 Run the tests from Section 2 and confirm they pass (green) — 5/5 passed

## 4. Backend: Failing Tests First (TDD) — Claude run-id wiring

- [x] 4.1 Update `tests/unit/analyzeBatchUsage.test.js` (inject `saveRun` via `deps`) asserting `analyzeBatch` calls `saveRun('claude', {...})` once per successful call and includes the returned `run_id` in the `saveUsage` call's stats; also added a test for run-logging failure not propagating
- [x] 4.2 Note: implemented `lib/claude.js`'s `saveRun` wiring in the same step as writing these tests rather than confirming red first (process deviation from strict TDD ordering) — ran immediately after and all 6 passed on the first run

## 5. Backend: Implementation — Claude run-id wiring

- [x] 5.1 In `lib/claude.js` `analyzeBatch`, add `saveRun = saveApiRun` to `deps`; call it immediately after receiving `message.usage` (before the existing per-user `saveUsage` call), and pass the returned `run_id` into `saveUsage`'s stats
- [x] 5.2 Run the tests from Section 4 and confirm they pass (green) — 6/6 passed

## 6. Backend: Failing Tests First (TDD) — Apify run-id wiring (legacy + batched)

- [x] 6.1 Update `tests/unit/orchestratorTerms.test.js` asserting `processTerms` calls injected `saveApiRun` once and includes its `run_id` in the `saveApiUsage` call
- [x] 6.2 Add a test asserting `processAllUsersBatched` calls `saveApiRun` once per source type that actually ran (not per user), and that every per-user `saveApiUsage` row for that source type in that batch shares the same `run_id`
- [x] 6.3 Run the new/updated tests and confirm they fail (red) — confirmed: both new tests failed with `0 !== 1` (saveApiRun never called), the other 7 pre-existing tests still passed

## 7. Backend: Implementation — Apify run-id wiring (legacy + batched)

- [x] 7.1 Extracted a shared `logSingleUserApifyUsage(userId, sourceType, runStats, postsCount, deps)` helper (DRYs up the near-identical block that would otherwise repeat 3x) — calls `saveApiRun` then `saveApiUsage` with the returned `run_id`; `processUser`, `processPeople`, `processTerms` now call this helper instead of inlining the logic
- [x] 7.2 In `processAllUsersBatched`, added `saveApiRun: saveRun = saveApiRun` to `deps`; after unpacking `companyRunStats`/`peopleRunStats`/`termsRunStats`, call `saveRun` once per non-null run stats object (in parallel via `Promise.all`), capture the returned `run_id`s, and thread them into `distributeAndProcess`
- [x] 7.3 Updated `distributeAndProcess`/`logApifyUsageShare` to accept and include each source type's `run_id` in the per-user `saveApiUsage` call
- [x] 7.4 Run the tests from Section 6 and confirm they pass (green) — 9/9 passed

## 8. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 8.1 Reviewed `tests/unit/getApiCostSummary.test.js` — `getApiCostSummary` only selects `provider, estimated_cost_usd`, unaffected by the new `run_id` column; no update needed

## 9. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 9.1 Capture pre-test baseline: confirmed 66 pre-existing tests passed before this change's edits
- [x] 9.2 Run targeted tests: `node --test tests/unit/saveApiRun.test.js tests/unit/analyzeBatchUsage.test.js tests/unit/orchestratorTerms.test.js` — all passed
- [x] 9.3 Run full unit suite: `node --test tests/unit/*.test.js` — 71 passed, 0 failed
- [x] 9.4 Database state note: pure `node:test` unit tests with mocked Supabase clients — no live database mutation occurs from running the suite
- [x] 9.5 Create report `openspec/changes/api-run-audit-log/reports/2026-08-02-step-9-unit-test-and-db-verification.md`
- [x] 9.6 Mark this step complete only after tests pass and the report exists

## 10. Manual Endpoint Testing with curl (MANDATORY if applicable)

- [x] 10.1 N/A — no new/changed HTTP endpoint contract (the existing endpoints that exercise this code trigger real, paid Claude/Apify calls). Correctness verified via unit tests.

## 11. E2E Testing with Playwright MCP (MANDATORY if applicable)

- [x] 11.1 N/A — no frontend affected

## 12. Commit

- [x] 12.1 Commit, push, PR, and merge
