# Step 4 Report - Unit Tests and Database Verification

- Date: 2026-08-02
- Change: apify-cost-settlement-delay
- Agent: Claude Code

## Commands Executed
- `node --test tests/unit/executeTermsActor.test.js`
- `node --test tests/unit/*.test.js`

## Unit Test Results
- Targeted (`executeTermsActor.test.js`): 10 passed, 0 failed, ~65ms
- Full suite (`tests/unit/*.test.js`, 13 files): 72 passed, 0 failed, 0 skipped, ~1.3s total (`time` confirms no accidental real 10-second waits — every test passes a no-op `delay`)

## Database State Verification
- N/A — pure `node:test` unit tests with mocked `fetch`/injected `delay`. No live database or network calls.

## Root cause confirmed
Verified via a read-only WebFetch of Apify's own API docs (no cost): "the first response after completion can still show preliminary stats, costs, and event counts. For stable figures, wait about 10 seconds and call the endpoint again." This matches the user's real production discrepancy report (saved cost consistently lower than Apify's console — e.g. term actor `$0.00005` saved vs `$0.01` shown; company actor `$0.03505` saved vs `$0.05` shown).

## Outcome
- Step 4 status: PASS
- Blocking issues: none
