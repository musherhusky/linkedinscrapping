# Step 6 Report - Unit Tests and Database Verification

- Date: 2026-08-03
- Change: fix-batch-url-dedup-normalization
- Agent: Claude Code

## Commands Executed
- `node --test tests/unit/batchUrlDedup.test.js` (dedup fix, red then green)
- `node --test tests/unit/sendPostToHallon.test.js` (diagnostic logging, red then green)
- `node --test tests/unit/*.test.js` (full suite)

## Unit Test Results
- Pre-existing baseline: 72 tests passed (confirmed via the prior `apify-cost-settlement-delay` change's report)
- Targeted: `batchUrlDedup.test.js` (3 tests) and `sendPostToHallon.test.js` (2 tests) — all 5 passed
- Full suite (`tests/unit/*.test.js`): 77 passed, 0 failed, 0 skipped, ~1.3s total

## Database State Verification
- N/A — pure `node:test` unit tests with mocked Supabase clients and mocked `fetch`/`Response`. No live database or network calls.

## Root cause summary
- **Error 2** (`posts_source_type_check` violation): root-caused to a resolved deploy/migration-ordering gap on 2026-07-31 (see design.md Context) — no code fix required, confirmed non-recurring for 3+ days.
- **Confirmed bug fixed in this change**: `processAllUsersBatched`'s batch-wide URL dedup (`allCompanyUrls`/`allPeopleUrls`) didn't normalize trailing slash/casing before deduplicating, unlike the per-user matching logic — causing duplicate Apify queries and duplicate post delivery whenever two users in the same batch registered the same company/person with differently-formatted URLs (confirmed in production data for "Mahou San Miguel").
- **Error 1** (`Unexpected token '<'`): root cause still unconfirmed. Diagnostic logging (status/content-type/body snippet before JSON parsing) added in this change to capture real evidence on the next occurrence.

## Outcome
- Step 6 status: PASS
- Blocking issues: none
