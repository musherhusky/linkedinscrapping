# Phase 2 Report - Unit Tests and Database Verification

- Date: 2026-08-02
- Change: track-api-costs (Phase 2 — Apify usage instrumentation: companies, people, terms)
- Agent: Claude Code

## Commands Executed
- `node --test tests/unit/executeTermsActor.test.js`
- `node --test tests/unit/orchestratorTerms.test.js`
- `node --test tests/unit/*.test.js`

## Unit Test Results
- `executeTermsActor.test.js`: 9 passed, 0 failed
- `orchestratorTerms.test.js`: 8 passed, 0 failed
- Full suite (`tests/unit/*.test.js`, 11 files): 64 passed, 0 failed, 0 skipped
- Runtime: ~1.2s
- Notes: no flaky behavior. Confirmed Apify's real `usageTotalUsd`/`stats.computeUnits` field names via a read-only WebFetch of Apify's public API docs (no cost) before implementing — matched `design.md` Decision 4's assumption exactly.

## Database State Verification
- N/A — pure `node:test` unit tests with mocked/injected dependencies throughout (`t.mock.method(global, 'fetch', ...)` for actor HTTP calls, injected `deps.saveApiUsage` for orchestrator tests). No live database or network calls.

## Notable design decision confirmed during implementation
`design.md` Decision 5's approach (change `executeActor`/`executePeopleActor`/`executeTermsActor` return shape to `{ posts, runStats }`, split cost proportionally in the batched path via a new `logApifyUsageShare()` helper in `distributeAndProcess`, log directly in the legacy single-user paths) worked cleanly with no unforeseen complications. `processUser` and `processPeople` gained a `deps = {}` parameter for the first time (previously only `processTerms` had one), bringing all three legacy functions to the same testability standard.

## Outcome
- Phase 2 status: PASS
- Blocking issues: none
