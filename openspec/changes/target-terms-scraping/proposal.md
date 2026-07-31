## Why

Users can currently track LinkedIn companies and people, and every scrape run pulls posts for those tracked URLs via Apify. A new `target_terms` table lets users track free-text search terms instead of profile URLs, but nothing in the scraping pipeline reads it yet. Users need term-based monitoring (e.g. tracking a keyword or hashtag across LinkedIn) without waiting for a manually-triggered profile URL to exist for every topic they care about.

## What Changes

- Add `getActiveTerms(userId)` to `lib/database.js`, reading active rows from `target_terms` (mirrors `getActiveCompanies` / `getActivePeople`).
- Add `executeTermsActor(terms, settings)` to `lib/apify.js`, calling a new Apify actor (`APIFY_TERMS_ACTOR_ID` env var) dedicated to keyword/term search, reusing `runActor()` and `mapPost(item, 'term')`.
- Extend `posts.source_type` with a new value: `'term'`, alongside existing `'company'` / `'person'`.
- Wire terms into `processAllUsersBatched(hourUtc)` in `lib/orchestrator.js`: collect active terms per user, deduplicate across users, run `executeTermsActor` once per batch (same pattern as companies/people), then distribute results back per user and push through the existing dedupe → Hallon dispatch pipeline (`processUserPosts`) with `sourceType = 'term'`.
- Add a legacy `processTerms(userId)` function analogous to `processUser` / `processPeople`, for manual/debug use.
- Term-sourced posts are excluded from target-profile enrichment (`enrichProfilesFromBatch` / `upsertTargetProfile` / `insertFollowerHistory`) since a search term is not a trackable profile with followers — only company/person posts feed that path.

## Capabilities

### New Capabilities
- `target-terms-scraping`: Defines how search terms assigned to a user are read, sent to Apify, and their resulting posts processed through the existing dedupe/Hallon-dispatch pipeline with `sourceType = 'term'`.

### Modified Capabilities
(none — `posts` and `hallon-dispatch` specs don't constrain `source_type` to a fixed enum, so no delta spec is required there)

## Impact

- **Database**: new `target_terms` table (already created by the user); `posts.source_type` gains a third valid value, `'term'`.
- **Code**: `lib/database.js`, `lib/apify.js`, `lib/orchestrator.js` — new functions added alongside existing company/person equivalents, no existing function signatures change.
- **Config/env**: new required env var `APIFY_TERMS_ACTOR_ID` when term tracking is enabled for any user.
- **Tests**: new unit tests for `getActiveTerms`, `executeTermsActor`, and orchestrator batching/distribution of term posts, following the existing test patterns in `tests/unit/`.
- **Open question carried into design.md**: the exact input/output shape of the Apify actor used for term search (e.g. whether `item.query.targetUrl` is populated with the search term, or a different field is used to correlate results back to the originating term) is not yet confirmed and needs to be resolved before implementation.
