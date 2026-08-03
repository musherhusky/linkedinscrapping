## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/target-terms-scraping` from `main`
- [x] 0.2 Verify branch creation and current branch status

## 1. Backend: Confirm Apify Terms Actor Contract (blocking, coordinate with user)

- [x] 1.1 Confirm with the user the real Apify actor ID to use for term/keyword search and its intended env var name — confirmed: actor `buIWk2uOUzTmcLsuB` (`harvestapi/linkedin-post-search`), env var `APIFY_TERMS_ACTOR_ID`
- [x] 1.2 Confirm the actor's expected input field for search terms — confirmed via the actor's public input schema (read-only Apify API lookup, no run executed): `searchQueries: string[]`, not `targetUrls`. See `design.md` Decision 2 for the full confirmed input shape (`buildTermsActorInput`)
- [x] 1.3 Confirm the field in each dataset item that correlates a result back to the term that produced it — confirmed via a real test run (user executed `run-sync-get-dataset-items` and shared the output): `item.query.search` (a single string), e.g. `"query": { "sortBy": "date", "page": 1, "search": "Vidrala", "postedLimit": "24h" }`
- [x] 1.4 Recorded the confirmed correlation field in `design.md` Decision 1 — all Open Questions resolved

## 2. Backend: Failing Tests First (TDD) — `getActiveTerms`

**Design note**: this codebase has no precedent for mocking Supabase in unit tests (`getActiveCompanies`/`getActivePeople` were never unit tested — `backend-standards.md` scopes tests to "pure logic functions"). Per user decision, `getActiveTerms` accepts a minimal optional injectable client param (`getActiveTerms(userId, supabase = getSupabaseClient())`), mirroring the `deps = {}` override pattern already used in `lib/hallon.js`, scoped only to this new function.

- [x] 2.1 Add tests in `tests/unit/getActiveTerms.test.js` asserting `getActiveTerms(userId, fakeSupabaseClient)` returns an array of `term` strings for active rows, using a fake client stub (`{ from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: [...], error: null }) }) }) }) }`)
- [x] 2.2 Add a test asserting `getActiveTerms(userId, fakeSupabaseClient)` returns `[]` when the fake client returns no active rows
- [x] 2.3 Run the new tests and confirm they fail (red) — function does not exist yet (confirmed: `SyntaxError: ... does not provide an export named 'getActiveTerms'`)

## 3. Backend: Implementation — `getActiveTerms`

- [x] 3.1 In `lib/database.js`, add `getActiveTerms(userId, supabase = getSupabaseClient())` querying `target_search_terms` for `active = true` rows belonging to the user, returning the `term` values — same query structure as `getActiveCompanies`/`getActivePeople`, with the added injectable `supabase` param for testability
- [x] 3.2 Run the tests from Section 2 and confirm they pass (green)

## 4. Backend: Failing Tests First (TDD) — `executeTermsActor`

- [x] 4.1 Add tests in `tests/unit/executeTermsActor.test.js` asserting `executeTermsActor(terms, settings)` throws when `APIFY_TERMS_ACTOR_ID` or `APIFY_TOKEN` is missing
- [x] 4.2 Add a test asserting the actor is called with input built via `buildTermsActorInput` — i.e. a `searchQueries` array (the terms), not `targetUrls` (mocked `global.fetch` via `t.mock.method`, no experimental flag needed since this mocks a global function reference, not an ES module)
- [x] 4.3 Add a test asserting `executeTermsActor` maps each returned dataset item via `mapPost(item, 'term')`, producing `sourceType: 'term'`
- [x] 4.4 Add a test in `tests/unit/mapPost.test.js` asserting that for an item shaped like the confirmed real sample (`query: { search: 'Vidrala', ... }`, no `query.targetUrl`), `mapPost(item, 'term')` returns `queryTargetUrl: 'Vidrala'` — plus a test confirming `query.targetUrl` still takes priority when both are present
- [x] 4.5 Run the new tests and confirm they fail (red) — confirmed: `executeTermsActor` export missing, and the `query.search` fallback test fails with `null !== 'Vidrala'`

## 5. Backend: Implementation — `executeTermsActor`

- [x] 5.1 In `lib/apify.js`, add a module-private `buildTermsActorInput(terms, settings)` per `design.md` Decision 2 (`searchQueries` instead of `targetUrls`, no `includeQuotePosts`/`includeReposts`)
- [x] 5.2 Add `executeTermsActor(terms, settings)` reusing `buildTermsActorInput` and the existing `runActor`, reading `APIFY_TERMS_ACTOR_ID` from env, and mapping results with `mapPost(item, 'term')`
- [x] 5.3 In `lib/apify.js` `mapPost()`, change `const queryTargetUrl = item.query?.targetUrl || null;` to `const queryTargetUrl = item.query?.targetUrl || item.query?.search || null;` per `design.md` Decision 1
- [x] 5.4 Run the tests from Section 4 and confirm they pass (green)

## 6. Backend: Failing Tests First (TDD) — Orchestrator Wiring

**Design note (user decision)**: `lib/orchestrator.js` had zero test coverage before this change (not even for companies/people). Per explicit user choice, this section introduces full dependency injection into `processAllUsersBatched`, `distributeAndProcess`, `processUserPosts`, and `enrichProfilesFromBatch` (each gains an optional `deps = {}` parameter overriding their real collaborators, defaulting to the real imports — same `deps` pattern as `lib/hallon.js`), enabling true end-to-end batching tests, not just isolated pure-function tests.

- [x] 6.1 Add tests in `tests/unit/orchestratorTerms.test.js` asserting `processAllUsersBatched(hourUtc, deps)` collects each scheduled user's active terms via injected `getActiveTerms`, deduplicates them globally (trimmed, case-sensitive), and calls injected `executeTermsActor` exactly once with the deduplicated set when any user in the batch has active terms and `apify_enabled = true`
- [x] 6.2 Add a test asserting injected `executeTermsActor` is NOT called when no scheduled user has active terms
- [x] 6.3 Add a test asserting term-sourced posts are distributed back to the correct tracking user(s), matched via a `termSet` against `normalizeTerm(p.queryTargetUrl)` (trimmed, case-sensitive — no lowercasing), mirroring `companySet`/`peopleSet` matching against `normalizeUrl(p.queryTargetUrl)` — verified by asserting the injected `processAndSendToHallon`/`processWithoutHallon` is called with the right posts and `sourceType: 'term'` for the right user
- [x] 6.4 Add a test asserting term-sourced posts do NOT trigger injected `upsertTargetProfile`/`insertFollowerHistory` (i.e., terms are excluded from `enrichProfilesFromBatch`'s `urlToUsers`/`allItems`)
- [x] 6.5 Add tests for legacy `processTerms(userId, deps)`, mirroring the structure of `processUser`/`processPeople`
- [x] 6.6 Run the new tests and confirm they fail (red) — confirmed: `processTerms` export missing

## 7. Backend: Implementation — Orchestrator Wiring

- [x] 7.1 In `lib/orchestrator.js`, add an optional `deps = {}` parameter to `processAllUsersBatched`, destructuring overridable collaborators (`getAllUsersForHour`, `getUserSettings`, `getUserPlan`, `getActiveCompanies`, `getActivePeople`, `getActiveTerms`, `executeActor`, `executePeopleActor`, `executeTermsActor`) each defaulting to the real imported function; fetch `getActiveTerms` per user alongside companies/people, deduplicate terms globally (trimmed, case-sensitive, per `design.md` Decision 1), and call `executeTermsActor` once when applicable; thread `deps` down to `distributeAndProcess` and `enrichProfilesFromBatch`
- [x] 7.2 Extend `distributeAndProcess` to accept `deps`, add a `normalizeTerm = term => term ? term.trim() : null` helper and a `termSet` built from the user's active terms, filtering `termPostsAll` via `termSet.has(normalizeTerm(p.queryTargetUrl))` (relies on the `mapPost` fallback from 5.3), then process matches via `processUserPosts(userId, settings, userTermPosts, terms.length, 'term', deps)`
- [x] 7.3 Extend `processUserPosts` to accept `deps`, destructuring overridable `deduplicatePosts`, `getTodayStats`, `processAndSendToHallon`, `processWithoutHallon`, each defaulting to the real imports
- [x] 7.4 Extend `enrichProfilesFromBatch` to accept `deps`, destructuring overridable `upsertTargetProfile`, `insertFollowerHistory`, `upsertDiscoveredProfile`, `upsertDiscoveredProfileRelation`; keep its `allItems`/`urlToUsers` built only from `companies`/`people` (unchanged), so term-sourced authors are naturally excluded from target-profile enrichment
- [x] 7.5 Add legacy `processTerms(userId, deps = {})` function mirroring `processUser`/`processPeople`'s structure, with the same overridable collaborators
- [x] 7.6 Run the tests from Section 6 and confirm they pass (green)

## 8. Configuration & Documentation

- [x] 8.1 Add `APIFY_TERMS_ACTOR_ID` to `.env.example` (value for reference, not committed as a real secret: `buIWk2uOUzTmcLsuB`)
- [x] 8.2 Coordinate with the user to set `APIFY_TERMS_ACTOR_ID=buIWk2uOUzTmcLsuB` in the live Vercel environment variables — user confirmed configured
- [x] 8.3 Update `docs/data-model.md`: document `target_search_terms` table (columns: `id`, `user_id`, `term`, `active`, `created_at`) and extend `posts.source_type` description to `'company', 'person', or 'term'`
- [x] 8.4 Update `docs/backend-standards.md` section 4 (Apify Integration) to list the third actor (`APIFY_TERMS_ACTOR_ID`) and the `executeTermsActor` function alongside the existing two

## 9. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 9.1 Reviewed `tests/unit/mapPost.test.js` — no assertion assumes only `'company'`/`'person'` are valid; `sourceType` is passed through as an opaque string, extended with new term-specific tests (Section 4.4)
- [x] 9.2 Reviewed `tests/unit/processAndSendToHallon.test.js` and `tests/unit/analyzeBatch.test.js`, and grepped all `sourceType` usages in `lib/*.js` — confirmed it is threaded through verbatim everywhere (`savePost`, `processAndSendToHallon`, `processWithoutHallon`, `mapPost`) with no exhaustive `'company'|'person'` branching; `'term'` posts flow through unaffected

## 10. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 10.1 Capture pre-test baseline: confirmed full unit suite passed before this change's edits (37 pre-existing tests, all green — verified incrementally throughout implementation)
- [x] 10.2 Run targeted tests: `node --test tests/unit/getActiveTerms.test.js tests/unit/executeTermsActor.test.js` — 5 passed
- [x] 10.3 Run full unit suite: `node --test tests/unit/*.test.js` — 43 passed, 0 failed
- [x] 10.4 Database state note: this repository's unit tests are pure `node:test` unit tests with mocked Supabase/Apify clients — no live database mutation occurs from running the suite, so no pre/post DB comparison or restoration is applicable
- [x] 10.5 Create report `openspec/changes/target-terms-scraping/reports/2026-07-31-step-10-unit-test-and-db-verification.md` documenting commands run and results
- [x] 10.6 Mark this step complete only after tests pass and the report exists

## 11. Manual Endpoint Testing with curl (MANDATORY if applicable)

- [x] 11.1 N/A — this change adds no new HTTP endpoint. The existing cron endpoint that triggers `processAllUsersBatched` would invoke real, paid Apify actor runs and real Hallon webhook dispatches for real users; invoking it for manual verification would create production side effects and is out of scope. Correctness is verified via the unit tests in Sections 2–7 and 10.

## 12. E2E Testing with Playwright MCP (MANDATORY if applicable)

- [x] 12.1 N/A — no frontend or user-facing workflow is affected by this change

## 13. Commit

- [x] 13.1 Commit the code, spec, and doc changes with a conventional commit message

## 14. Backend: Wire terms into the per-user manual endpoint (found post-merge)

**Gap found**: `api/process-apify-dataset.js` is a per-user, on-demand endpoint (not the cron path — `vercel.json` only schedules `/api/process-all-users`, which correctly uses `processAllUsersBatched`) that calls `processUser`/`processPeople` directly but was never updated to also call `processTerms`. The user ran it manually after deploy and got a response with only `companies`/`people` keys, no `terms`. This endpoint wasn't in scope during planning because `api/` wasn't searched at proposal time.

- [x] 14.1 Update `api/process-apify-dataset.js` to also call `processTerms(userId)` in parallel with `processUser`/`processPeople`, and include `terms` in the JSON response
- [x] 14.2 Run the full unit suite to confirm no regressions
- [x] 14.3 Commit and ship the fix (this change was already merged to `main`, so this is a follow-up commit/PR, not an amendment)

## 15. Backend: Correct the real table name (found post-merge)

**Gap found**: after fixing Section 14, a manual run returned `"terms":{"success":false,"error":"Could not find the table 'public.target_terms' in the schema cache"}`. During planning the user confirmed the table name as `target_terms` (via clarifying question), but the table actually created in Supabase is named `target_search_terms`. All references to `target_terms` in code, tests, and docs were renamed accordingly.

- [x] 15.1 Update `lib/database.js` `getActiveTerms()` to query `.from('target_search_terms')` instead of `.from('target_terms')`
- [x] 15.2 Update `tests/unit/getActiveTerms.test.js`'s fake Supabase client assertion to expect `target_search_terms`
- [x] 15.3 Update `docs/data-model.md`, `design.md`, `specs/target-terms-scraping/spec.md`, `proposal.md`, and this `tasks.md` file to reference `target_search_terms` instead of `target_terms`
- [x] 15.4 Run the full unit suite to confirm no regressions
- [x] 15.5 Commit and ship the fix

## 16. Database: Allow 'term' in the posts.source_type check constraint (found post-merge)

**Gap found**: after fixing Section 15, a manual run returned `terms: { success: true, newPosts: 5, sent: 0, failed: 5 }`. Querying `activity_log` (`error_message`) surfaced the real cause: `new row for relation "posts" violates check constraint "posts_source_type_check"`. The production `posts` table has a check constraint restricting `source_type` to `'company'`/`'person'` only — this wasn't visible from `docs/data-model.md` (which just says `TEXT`) or from the OpenSpec proposal's assumption that "`posts` spec doesn't constrain `source_type` to a fixed enum" (true of the *spec*, not true of the *live database schema*, which the agent has no direct access to inspect).

- [x] 16.1 Create `docs/migrations/allow_term_source_type.sql`: drop and recreate `posts_source_type_check` to allow `'company', 'person', 'term'`
- [x] 16.2 Coordinate with the user to apply `docs/migrations/allow_term_source_type.sql` against the live Supabase project (agent has no direct Supabase admin/SQL access) — user applied it and confirmed via `pg_constraint` that the live definition is now `CHECK (source_type = ANY (ARRAY['company', 'person', 'term']))`. Manual runs no longer hit this error (subsequent runs returned `terms.success: true` with no failures)
- [x] 16.3 Note for future changes: any new `source_type`-like value must be checked against live DB constraints, not just the OpenSpec `posts` capability spec, since constraints can exist in the database without being mirrored in the spec

## 17. Backend: Filter term-search results to actual term matches (found post-merge, user request)

**Problem reported by user**: the Apify term-search actor sometimes returns posts that don't actually contain the searched term — it backfills with other "interesting" content when it finds few/no strong matches. The user only wants posts where the term genuinely appears in `content`, `article.title`, `article.description`, or `repost.content` (case-insensitive). This filter must apply only to term-search results, not company/person.

- [x] 17.1 Add failing tests in `tests/unit/executeTermsActor.test.js` asserting `executeTermsActor` discards raw items where the term (`item.query.search`) doesn't case-insensitively appear in any of `content`/`article.title`/`article.description`/`repost.content`, and keeps items where it does (covering each of the four fields individually, plus a case-insensitivity check)
- [x] 17.2 Run the new tests and confirm they fail (red) — confirmed: the "discards unrelated item" test failed (`1 !== 0`) before the filter existed
- [x] 17.3 In `lib/apify.js`, add a module-private `itemMatchesSearchTerm(item, term)` pure function per `design.md` Decision 4a, and apply it as a filter in `executeTermsActor` between `runActor` and `mapPost`
- [x] 17.4 Run the tests from 17.1 and confirm they pass (green) — 9/9 passed
- [x] 17.5 Run the full unit suite to confirm no regressions — 49/49 passed
- [x] 17.6 Commit and ship the fix

## 18. Backend: Persist which search term produced each term-sourced post (found post-merge, user request)

**Problem reported by user**: the frontend shows a company/person tag from `posts.source_type`, but nothing records which specific search term produced a term-sourced post, so the user can't tell "where it came from" for those rows.

- [x] 18.1 Create `docs/migrations/add_posts_search_term.sql`: `ALTER TABLE posts ADD COLUMN search_term TEXT;`
- [x] 18.2 Coordinate with the user to apply the migration against the live Supabase project — user confirmed applied
- [x] 18.3 Add a test in `tests/unit/savePost.test.js` (new file, following the existing "savePost content_type mapping" simulation-style test in `mapPost.test.js` — no DI added to `savePost`, consistent with that precedent) asserting the `search_term` insert value: `post.queryTargetUrl` when `sourceType === 'term'`, `null` otherwise
- [x] 18.4 Note: like its precedent in `mapPost.test.js`, this test simulates the mapping expression inline rather than calling the real `savePost` (which has no DI), so it cannot meaningfully fail red before implementation — ran and passed trivially, consistent with the existing pattern's known limitation
- [x] 18.5 In `lib/database.js` `savePost()`, add `search_term: sourceType === 'term' ? (post.queryTargetUrl || null) : null` to the insert payload
- [x] 18.6 Verified the test in 18.3 still passes (green) and matches the implemented expression exactly
- [x] 18.7 Update `docs/data-model.md` `posts` table: add `search_term | TEXT | Search term that produced this post when source_type = 'term'; NULL otherwise`
- [x] 18.8 Run the full unit suite to confirm no regressions — 53/53 passed
- [x] 18.9 Commit and ship the fix
