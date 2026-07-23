## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/hallon-titular-author-prefix` from `main`
- [x] 0.2 Verify branch creation and current branch status

## 1. Backend: Failing Tests First (TDD)

- [x] 1.1 Add tests in `tests/unit/formatHallonTitular.test.js` for `formatHallonTitular(title, authorName)`:
  - title + authorName present → `[authorName] - "title"`
  - authorName empty/null → returns title unprefixed
  - title empty → returns `''` regardless of authorName
- [x] 1.2 Add a test for `processAndSendToHallon()` with a post whose `title` is `''`: asserts Hallon is not called, `savePost` is called with `status: 'extracted'`, and the returned counters include `skipped: 1`
- [x] 1.3 Add a test for `processAndSendToHallon()` with a normal (non-empty title) post: asserts `sendPostToHallon`/Hallon is still called and `titular` sent equals `formatHallonTitular(post.title, post.authorName)`
- [x] 1.4 Run the new tests and confirm they fail against current `lib/hallon.js` (red)

## 2. Backend: Implementation

- [x] 2.1 In `lib/hallon.js`, add and export `formatHallonTitular(title, authorName)`
- [x] 2.2 In `sendPostToHallon()`, change `titular: post.title || ''` to `titular: formatHallonTitular(post.title, post.authorName)`
- [x] 2.3 In `processAndSendToHallon()`, add a check: if `!post.title`, skip the Hallon call, call `savePost(userId, post, 'extracted', null, sourceType)` and `savelog(userId, post, 'extracted', null, 'Empty title - not sent to Hallon', 'config')`, increment a new `skipped` counter, and `continue` to the next post — implemented via a lightweight `deps` parameter (`dispatch`/`persistPost`/`persistLog`, defaulting to the real functions) to keep the function unit-testable without live Supabase/Hallon calls
- [x] 2.4 Add `skipped` to the object returned by `processAndSendToHallon()` (alongside existing `sent`/`failed`)
- [x] 2.5 Run the tests from Section 1 and confirm they pass (green)

## 3. Observability

- [x] 3.1 In `lib/orchestrator.js`, surface `result.skipped` in the `summary`/return objects of `processUser`/`processPeople`/`processUserPosts` alongside `sent`/`failed` (no behavior change, just visibility)

## 4. Documentation

- [x] 4.1 No `docs/data-model.md` changes needed (no schema change) — confirmed, skipped

## 5. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Review any existing tests that exercise `lib/hallon.js` or `processAndSendToHallon`/`processWithoutHallon` for assumptions invalidated by the empty-title skip path; update as needed — no pre-existing tests touched `lib/hallon.js`, nothing to update
- [x] 5.2 Review `lib/orchestrator.js` callers of `processAndSendToHallon` to confirm the new `skipped` field doesn't break existing destructuring/usage — confirmed safe (`result.skipped || 0` handles `processWithoutHallon`'s result, which has no `skipped` key)

## 6. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture pre-test baseline: confirm full unit suite passes on the base branch before this change's edits
- [x] 6.2 Run targeted tests: `node --test tests/unit/formatHallonTitular.test.js tests/unit/processAndSendToHallon.test.js`
- [x] 6.3 Run full unit suite: `node --test tests/unit/*.test.js`
- [x] 6.4 Database state note: this repository's unit tests are pure `node:test` unit tests with dependency-injected fakes for Supabase/Hallon calls (no live DB or network I/O), so no pre/post DB comparison or restoration is applicable
- [x] 6.5 Create report `openspec/changes/hallon-titular-author-prefix/reports/2026-07-23-step-6-unit-test-and-db-verification.md` documenting commands run and results
- [x] 6.6 Mark this step complete only after tests pass and the report exists

## 7. Manual Endpoint Testing with curl (MANDATORY if applicable)

- [x] 7.1 N/A — this change adds no new endpoint and does not alter any endpoint's request/response contract. The only endpoint that exercises this code (`api/process-apify-dataset.js`) triggers real, paid Apify actor runs and real Hallon webhook dispatches for a real user; invoking it for manual verification would create production side effects (including real Hallon dispatches) and is out of scope here. Correctness is verified via the unit tests in Sections 1–2 and 6.

## 8. E2E Testing with Playwright MCP (MANDATORY if applicable)

- [x] 8.1 N/A — no frontend or user-facing workflow is affected by this change

## 9. Commit

- [x] 9.1 Commit the code, spec, and doc changes with a conventional commit message (commit `f015261`)
