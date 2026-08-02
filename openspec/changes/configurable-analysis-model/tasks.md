## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/configurable-analysis-model` from `main`
- [x] 0.2 Verify branch creation and current branch status

## 1. Backend: Failing Tests First (TDD)

- [x] 1.1 Add tests in `tests/unit/getAnalysisModel.test.js` (using the `withEnv` helper pattern from `tests/unit/executeTermsActor.test.js`) asserting `getAnalysisModel()` returns `process.env.ANTHROPIC_MODEL_ANALYSIS` when set
- [x] 1.2 Add a test asserting `getAnalysisModel()` returns `'claude-opus-4-5'` when `ANTHROPIC_MODEL_ANALYSIS` is unset
- [x] 1.3 Run the new tests and confirm they fail (red) — confirmed: `getAnalysisModel` export missing

## 2. Backend: Implementation

- [x] 2.1 In `lib/claude.js`, add and export `getAnalysisModel()` per `design.md` Decision 1
- [x] 2.2 In `analyzeBatch()`, replace the hardcoded `model: 'claude-opus-4-5'` with `model: getAnalysisModel()`
- [x] 2.3 Run the tests from Section 1 and confirm they pass (green)

## 3. Configuration & Documentation

- [x] 3.1 Add `ANTHROPIC_MODEL_ANALYSIS=` (empty, commented with its default) to `.env.example`, following the style of the existing `APIFY_*` lines (also added the previously-missing `ANTHROPIC_API_KEY` line, since it was absent despite being required by existing code)
- [x] 3.2 Update `docs/backend-standards.md` § 5 (Anthropic API Usage) to show the model read from `getAnalysisModel()` instead of the hardcoded string, and document the env var and its default

## 4. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 4.1 Reviewed `tests/unit/analyzeBatch.test.js` — grepped for `model`/`claude-opus`, no hits. Confirmed it tests `buildPrompt` content and `saveAnalysisResults` mapping logic only, not the model parameter

## 5. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 5.1 Capture pre-test baseline: confirmed full unit suite (53 pre-existing tests) passed before this change's edits
- [x] 5.2 Run targeted tests: `node --test tests/unit/getAnalysisModel.test.js` — 2 passed
- [x] 5.3 Run full unit suite: `node --test tests/unit/*.test.js` — 55 passed, 0 failed
- [x] 5.4 Database state note: this repository's unit tests are pure `node:test` unit tests — no live database mutation occurs from running the suite, so no pre/post DB comparison or restoration is applicable
- [x] 5.5 Create report `openspec/changes/configurable-analysis-model/reports/2026-08-02-step-5-unit-test-and-db-verification.md` documenting commands run and results
- [x] 5.6 Mark this step complete only after tests pass and the report exists

## 6. Manual Endpoint Testing with curl (MANDATORY if applicable)

- [x] 6.1 N/A — this change adds no new HTTP endpoint and does not alter any endpoint's request/response contract. The only endpoint that exercises `analyzeBatch()` (`api/process-analysis.js`) would trigger a real, paid Anthropic API call for real user data; invoking it for manual verification is out of scope and unnecessary — correctness is verified via the unit tests in Sections 1 and 5.

## 7. E2E Testing with Playwright MCP (MANDATORY if applicable)

- [x] 7.1 N/A — no frontend or user-facing workflow is affected by this change

## 8. Commit

- [x] 8.1 Commit the code, spec, and doc changes with a conventional commit message
