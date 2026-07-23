## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/posts-always-store-linkedin-url` from `v2`
- [x] 0.2 Verify branch creation and current branch status

## 1. Backend: Failing Tests First (TDD)

- [x] 1.1 Add a test in `tests/unit/mapPost.test.js` asserting that for an item with `article.link` set, `mapPost()` returns `url` equal to the LinkedIn permalink (not the article link)
- [x] 1.2 Add a test asserting `mapPost()` returns `articleUrl` equal to `article.link` when an article is present
- [x] 1.3 Add a test asserting `mapPost()` returns `articleUrl: null` when no article is present
- [x] 1.4 Run the new tests and confirm they fail against current `lib/apify.js` (red)

## 2. Backend: Implementation

- [x] 2.1 In `lib/apify.js` `mapPost()`, change `const url = src.article?.link || src.linkedinUrl || null;` to `const url = src.linkedinUrl || null;`
- [x] 2.2 In `lib/apify.js` `mapPost()`, add `const articleUrl = src.article?.link || null;`
- [x] 2.3 Add `articleUrl` to the object returned by `mapPost()`
- [x] 2.4 In `lib/database.js` `savePost()`, add `article_url: post.articleUrl || null` to the insert payload
- [x] 2.5 Run the tests from Section 1 and confirm they pass (green)

## 3. Database: Schema Migration

- [x] 3.1 Create `docs/migrations/add_posts_article_url.sql` with `ALTER TABLE posts ADD COLUMN article_url TEXT;`
- [ ] 3.2 Coordinate with the user to apply the migration against the live Supabase project (agent has no direct Supabase admin access in this environment; confirm before any production schema change) — user confirmed they will apply `docs/migrations/add_posts_article_url.sql` themselves; pending their execution

## 4. Documentation

- [x] 4.1 Update `docs/data-model.md` `posts` table: clarify `url` description as "LinkedIn post URL (always the permalink, dedup key)" and add the new `article_url | TEXT | External article link when post shares an article; NULL otherwise` row

## 5. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Review `tests/unit/mapPost.test.js`, `tests/unit/detectContentType.test.js` for any assertions that assumed the old `url` behavior; update as needed
- [x] 5.2 Review `lib/hallon.js` and `lib/orchestrator.js` usages of `post.url` to confirm no other logic depends on it sometimes containing an external link

## 6. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture pre-test baseline: full unit test suite result on current branch before this change's edits (already implicitly known: existing suite passes on `v2`)
- [x] 6.2 Run targeted tests: `node --test tests/unit/mapPost.test.js`
- [x] 6.3 Run full unit suite: `node --test tests/unit/*.test.js`
- [x] 6.4 Database state note: this repository has no DB-integration unit tests (pure `node:test` unit tests only, no Supabase calls) — no live database mutation occurs from running the suite, so no pre/post DB comparison or restoration is applicable here; DB verification for the schema change itself happens in 3.2 (migration) via a read-only check that `article_url` exists after the user applies it
- [x] 6.5 Create report `openspec/changes/posts-always-store-linkedin-url/reports/2026-07-23-step-6-unit-test-and-db-verification.md` documenting commands run and results
- [x] 6.6 Mark this step complete only after tests pass and the report exists

## 7. Manual Endpoint Testing with curl (MANDATORY if applicable)

- [x] 7.1 N/A — this change adds no new endpoint and does not alter any endpoint's request/response contract. The only endpoint that exercises `mapPost()`/`savePost()` (`api/process-apify-dataset.js`) triggers real, paid Apify actor runs and real Hallon webhook dispatches for a real user; invoking it for manual verification would create production side effects and is out of scope here. Correctness is verified via the unit tests in Sections 1–2 and 6.

## 8. E2E Testing with Playwright MCP (MANDATORY if applicable)

- [x] 8.1 N/A — no frontend or user-facing workflow is affected by this change

## 9. Commit

- [ ] 9.1 Commit the code, migration, spec, and doc changes with a conventional commit message
