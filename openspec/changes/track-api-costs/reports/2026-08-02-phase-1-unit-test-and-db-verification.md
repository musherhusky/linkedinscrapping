# Phase 1 Report - Unit Tests and Database Verification

- Date: 2026-08-02
- Change: track-api-costs (Phase 1 — table, saveApiUsage, Claude instrumentation)
- Agent: Claude Code

## Commands Executed
- `node --test tests/unit/saveApiUsage.test.js tests/unit/analyzeBatchUsage.test.js`
- `node --test tests/unit/*.test.js`

## Unit Test Results
- Targeted tests (`saveApiUsage.test.js`, `analyzeBatchUsage.test.js`): 7 passed, 0 failed
- Full suite (`tests/unit/*.test.js`, 11 files): 62 passed, 0 failed, 0 skipped
- Runtime: ~1.2s
- Notes: no flaky behavior. All new tests use fake Supabase clients / injected `deps` (`createMessage`, `saveUsage`) — no real network or database calls.

## Database State Verification
- N/A — pure `node:test` unit tests with mocked Supabase clients. No live database mutation occurs from running the suite. The `api_usage_logs` table itself has not yet been created in the live Supabase project (task 1.1.2, pending user action).

## Notable finding during implementation
The originally-planned single cost-rate constant (`CLAUDE_INPUT_COST_PER_1K` / `CLAUDE_OUTPUT_COST_PER_1K`) was replaced with a per-model rate table (`CLAUDE_RATE_TABLE_PER_1K`) after discovering the initial constants were unverified placeholder values. The rate table only includes rates that could be verified at implementation time; models without a verified rate (including `getAnalysisModel()`'s own default, the legacy `claude-opus-4-5`) get `estimated_cost_usd = NULL` plus a logged warning rather than a fabricated cost. See `design.md` Decision 2 and the two new test cases covering both the verified-rate and unverified-rate paths.

## Outcome
- Phase 1 status: PASS
- Blocking issues: none (table creation in live Supabase still pending — see task 1.1.2)
