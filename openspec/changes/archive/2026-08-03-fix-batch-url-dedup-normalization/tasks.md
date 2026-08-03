## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/fix-batch-url-dedup-normalization` from `main`
- [x] 0.2 Verify branch creation and current branch status

## 1. Backend: Failing Tests First (TDD) — batch-level URL dedup normalization

- [x] 1.1 Added `tests/unit/batchUrlDedup.test.js` asserting that when two users register the same company (or person) URL with different trailing-slash/casing, `processAllUsersBatched` calls `executeActor`/`executePeopleActor` with a deduplicated URL list containing it exactly once
- [x] 1.2 Added a test where the mocked `executeActor` returns one post per queried URL (mirroring real Apify behavior) — asserting a user with only one clean registration still receives that post exactly once, not duplicated, when another user in the batch uses a different URL format
- [x] 1.3 Ran the tests and confirmed they failed (red) — `executeActor`/`executePeopleActor` received 2 URLs instead of 1, and the affected user received the post 2 times instead of 1

## 2. Backend: Implementation — batch-level URL dedup normalization

- [x] 2.1 Extracted `normalizeUrl` to module scope in `lib/orchestrator.js` (shared between `processAllUsersBatched` and `distributeAndProcess`, removing the duplicate inline definition)
- [x] 2.2 Applied `normalizeUrl` before deduplicating into `allCompanyUrls` and `allPeopleUrls` in `processAllUsersBatched` (`allTerms` left unchanged — already consistently trimmed on both sides)
- [x] 2.3 Ran the tests from Section 1 and confirmed they passed (green)

## 3. Backend: Failing Tests First (TDD) — Hallon raw-response diagnostic logging

- [x] 3.1 Added `tests/unit/sendPostToHallon.test.js` with a mocked `fetch` (via `t.mock.method(global, 'fetch', ...)`) returning a non-JSON HTML body with a 504 status, asserting a warning is logged containing the status, content-type, and a body snippet, before the existing `Unexpected token` throw propagates
- [x] 3.2 Added a test asserting a normal JSON success response is completely unaffected — `sendPostToHallon` still returns the parsed data
- [x] 3.3 Ran the tests and confirmed they failed (red) — no such logging existed yet

## 4. Backend: Implementation — Hallon raw-response diagnostic logging

- [x] 4.1 In `lib/hallon.js`'s `sendPostToHallon`, added `response.clone().text()` right after the `fetch()` call, before `response.json()`
- [x] 4.2 Logs (via the existing `HALLON` logger, `warn` level) the response status, `content-type` header, and the first 300 characters of the body, only when the body doesn't look like JSON (regex test for a leading `{`/`[`) or `!response.ok`
- [x] 4.3 Ran the tests from Section 3 and confirmed they passed (green)

## 5. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Ran the full existing `orchestratorTerms.test.js` and `processAndSendToHallon.test.js` suites — all pre-existing company/person/term scenarios (non-duplicate case) still pass unchanged
- [x] 5.2 Grepped for any other test relying on the exact pre-normalization shape of `allCompanyUrls`/`allPeopleUrls` — none found (`grep -rn "allCompanyUrls\|allPeopleUrls" tests/unit/*.test.js` returns nothing)

## 6. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Captured pre-test baseline: 72 pre-existing tests passed (per the prior `apify-cost-settlement-delay` change's report)
- [x] 6.2 Ran targeted tests: `node --test tests/unit/batchUrlDedup.test.js tests/unit/sendPostToHallon.test.js` — 5/5 passed
- [x] 6.3 Ran full unit suite: `node --test tests/unit/*.test.js` — 77 passed, 0 failed
- [x] 6.4 Database state note: pure `node:test` unit tests with mocked Supabase clients/`fetch` — no live database mutation occurs from running the suite
- [x] 6.5 Created report `openspec/changes/fix-batch-url-dedup-normalization/reports/2026-08-03-step-6-unit-test-and-db-verification.md`
- [x] 6.6 Marked complete — tests pass and the report exists

## 7. Manual Endpoint Testing with curl (MANDATORY if applicable)

- [x] 7.1 N/A — no HTTP endpoint contract changes; both fixes are internal to the batched-cron orchestration and the Hallon dispatch flow, which trigger real, paid Apify/Hallon calls. Correctness verified via unit tests in Sections 1–4. Real-world confirmation will come from monitoring `activity_log` after deploy per design.md's Migration Plan.

## 8. E2E Testing with Playwright MCP (MANDATORY if applicable)

- [x] 8.1 N/A — no frontend affected

## 9. Commit

- [x] 9.1 Commit, push, PR, and merge (PR #14, merged to main)
