## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/fix-hallon-disabled-failure-logging` from `main`
- [x] 0.2 Verify branch creation and current branch status

## 1. Backend: Failing Tests First (TDD) — `processWithoutHallon`

- [x] 1.1 Create `tests/unit/processWithoutHallon.test.js` (currently no direct unit test exists) asserting: on a successful `savePost`, the function calls `savelog(userId, post, 'extracted', null, 'Hallon sending disabled', 'config')` and increments `sent`
- [x] 1.2 Add a test asserting: when `savePost` throws, the function calls `savelog(userId, post, 'failed', null, error.message, categorizeError(error.message))` and increments `failed`
- [x] 1.3 Add a test asserting the function's return shape (`{ sent, failed }`) is unchanged from current behavior
- [x] 1.4 Run the tests and confirm they fail (red) — the failure-path `savelog` call doesn't exist yet

## 2. Backend: Implementation

- [x] 2.1 In `lib/hallon.js`'s `processWithoutHallon` catch block, add `await savelog(userId, post, 'failed', null, error.message, categorizeError(error.message))` before incrementing `failed`, mirroring `processAndSendToHallon`'s existing catch block — implemented via an added `deps = {}` parameter (`persistPost`/`persistLog`, defaulting to `savePost`/`savelog`), mirroring `processAndSendToHallon`'s existing injection pattern, needed to make this path unit-testable
- [x] 2.2 Run the tests from Section 1 and confirm they pass (green)

## 3. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 3.1 Review `tests/unit/orchestratorTerms.test.js`, `tests/unit/batchUrlDedup.test.js`, and `tests/unit/orchestratorCronExecutionLog.test.js` (all inject a mocked `processWithoutHallon` via `deps`) to confirm none of them assert on `processWithoutHallon`'s internal `savelog` calls in a way this change would break — confirmed: no changes needed, all three mock the whole function at the orchestrator level; full suite run (92/92 pass) confirms no regression

## 4. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 4.1 Capture pre-test baseline: full passing test count before this change's edits — 89 (per `cron-execution-visibility`'s Step 7 report)
- [x] 4.2 Run targeted tests: `node --test tests/unit/processWithoutHallon.test.js` — 3/3 passed
- [x] 4.3 Run full unit suite: `node --test tests/unit/*.test.js` — 92/92 passed
- [x] 4.4 Database state note: pure `node:test` unit tests with a mocked `savePost`/`savelog` (fake or injected) — confirmed no live database mutation occurs from running the suite
- [x] 4.5 Create report `openspec/changes/fix-hallon-disabled-failure-logging/reports/2026-08-04-step-4-unit-test-and-db-verification.md`
- [x] 4.6 Mark this step complete only after tests pass and the report exists

## 5. Manual Endpoint Testing with curl (MANDATORY if applicable)

- [x] 5.1 N/A — this change touches no API endpoint; `processWithoutHallon` is only invoked internally by `lib/orchestrator.js` during the cron batch, not exposed via any HTTP handler

## 6. E2E Testing with Playwright MCP (MANDATORY if applicable)

- [x] 6.1 N/A — no frontend or user-facing workflow is affected by this change

## 7. Update Technical Documentation (MANDATORY)

- [x] 7.1 No `docs/data-model.md` change needed — `activity_log`'s schema and meaning are unchanged, this only fixes an existing code path to actually populate it in a previously-missed case

## 8. Commit

- [x] 8.1 Commit, push, PR, and merge
