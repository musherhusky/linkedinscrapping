## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/apify-cost-settlement-delay` from `main`
- [x] 0.2 Verify branch creation and current branch status

## 1. Backend: Failing Tests First (TDD)

- [x] 1.1 Update `tests/unit/executeTermsActor.test.js`'s fetch mock to distinguish the `waitForFinish` poll response (preliminary `usageTotalUsd`/`stats.computeUnits`) from a second, non-`waitForFinish` re-fetch of `/runs/run-1` (settled, higher values)
- [x] 1.2 Add a test asserting `executeTermsActor`'s returned `runStats` reflects the settled (second-fetch) values, and that `delay` was called once with `>= 10000`ms
- [x] 1.3 Update existing tests to pass `{ delay: noDelay }` as the third arg so they don't incur a real wait
- [x] 1.4 Run the tests and confirm they fail (red) — confirmed: `0 !== 1` (delay never called), ran in ~67ms (no accidental real waits from the other 9 tests)

## 2. Backend: Implementation

- [x] 2.1 In `lib/apify.js`, add a `deps = {}` parameter to `runActor`, destructuring `delay` (default: real `setTimeout`-based wait via `defaultDelay`)
- [x] 2.2 After confirming `finalStatus === 'SUCCEEDED'`, run the dataset-items fetch and a `wait(10000)` + re-fetch of `/acts/{actorId}/runs/{runId}` (no `waitForFinish`) concurrently via `Promise.all`; build `runStats` from the re-fetched (settled) response, not the original `waitForFinish` response
- [x] 2.3 Thread an optional `deps` third parameter through `executeActor`, `executePeopleActor`, `executeTermsActor` down to `runActor`
- [x] 2.4 Run the tests from Section 1 and confirm they pass (green) — 10/10 passed in ~65ms (no accidental real waits)

## 3. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 3.1 Reviewed all tests in `tests/unit/executeTermsActor.test.js` — every success-path test now passes `{ delay: noDelay }`, confirmed by the fast (~65ms) run
- [x] 3.2 Grepped all test files importing `lib/apify.js` — only `executeTermsActor.test.js` exercises the real `runActor` path (`detectContentType.test.js`/`mapPost.test.js` only import pure functions); `lib/orchestrator.js`'s tests mock `executeActor`/`executePeopleActor`/`executeTermsActor` entirely as test doubles, so they never reach the real `runActor` and are unaffected. Production call sites (no `deps` passed) correctly get the real default wait.

## 4. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 4.1 Capture pre-test baseline: confirmed 71 pre-existing tests passed before this change's edits
- [x] 4.2 Run targeted tests: `node --test tests/unit/executeTermsActor.test.js` — 10 passed
- [x] 4.3 Run full unit suite: `node --test tests/unit/*.test.js` — 72 passed, 0 failed, ~1.3s total (confirmed via `time`, no accidental real waits)
- [x] 4.4 Database state note: pure `node:test` unit tests with mocked `fetch` — no live database or network calls
- [x] 4.5 Create report `openspec/changes/apify-cost-settlement-delay/reports/2026-08-02-step-4-unit-test-and-db-verification.md`
- [x] 4.6 Mark this step complete only after tests pass and the report exists

## 5. Manual Endpoint Testing with curl (MANDATORY if applicable)

- [x] 5.1 N/A — no HTTP endpoint contract changes; the affected endpoints trigger real, paid Apify runs. Correctness verified via unit tests. The user already reported (and will re-verify) the real-world discrepancy this change fixes, via their own manual run comparison against Apify's console.

## 6. E2E Testing with Playwright MCP (MANDATORY if applicable)

- [x] 6.1 N/A — no frontend affected

## 7. Commit

- [x] 7.1 Commit, push, PR, and merge
