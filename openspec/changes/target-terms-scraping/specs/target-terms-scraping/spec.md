## ADDED Requirements

### Requirement: Active search terms are fetched per user
The system SHALL provide `getActiveTerms(userId)`, which returns the list of active `term` values from `target_search_terms` for the given user, following the same active-row filtering as `getActiveCompanies` and `getActivePeople`.

#### Scenario: User has active terms
- **WHEN** `getActiveTerms(userId)` is called and `target_search_terms` has rows for that user with `active = true`
- **THEN** the function returns an array containing each row's `term` value

#### Scenario: User has no active terms
- **WHEN** `getActiveTerms(userId)` is called and the user has no rows with `active = true` in `target_search_terms`
- **THEN** the function returns an empty array

### Requirement: Search terms are sent to a dedicated Apify actor
The system SHALL provide `executeTermsActor(terms, settings)` in `lib/apify.js`, which runs the Apify actor identified by the `APIFY_TERMS_ACTOR_ID` environment variable with the given terms, and maps each resulting item via `mapPost(item, 'term')`.

#### Scenario: Terms actor runs successfully
- **WHEN** `executeTermsActor(terms, settings)` is called with a non-empty `terms` array and `APIFY_TERMS_ACTOR_ID` / `APIFY_TOKEN` are configured
- **THEN** the Apify actor identified by `APIFY_TERMS_ACTOR_ID` is invoked with the terms as input
- **AND** each returned dataset item is mapped with `mapPost(item, 'term')`, producing posts with `sourceType = 'term'`

#### Scenario: Terms actor env vars missing
- **WHEN** `executeTermsActor` is called and `APIFY_TERMS_ACTOR_ID` or `APIFY_TOKEN` is not set
- **THEN** the function throws an error identifying the missing configuration, without calling the Apify API

### Requirement: Batched processing includes active terms per hour
`processAllUsersBatched(hourUtc)` SHALL collect each scheduled user's active terms (via `getActiveTerms`), deduplicate terms globally across all users being processed in that batch, and — when any Apify-enabled user in the batch has terms to search — call `executeTermsActor` exactly once for the deduplicated set, mirroring how company and people URLs are batched.

#### Scenario: Batch includes users with active terms
- **WHEN** `processAllUsersBatched(hourUtc)` runs and one or more scheduled users have active terms and `apify_enabled = true`
- **THEN** `executeTermsActor` is called exactly once with the deduplicated set of all active terms across those users

#### Scenario: No user in the batch has active terms
- **WHEN** `processAllUsersBatched(hourUtc)` runs and no scheduled user has any active term
- **THEN** `executeTermsActor` is not called

### Requirement: Term-sourced posts are distributed back to their tracking user(s)
After `executeTermsActor` returns results for a batch, the system SHALL distribute each resulting post back to the user(s) who track the term that produced it, then process those posts through the same dedupe and Hallon-dispatch (or plain-save) pipeline used for company and people posts, with `sourceType = 'term'`.

#### Scenario: Term post distributed to tracking user
- **WHEN** a batch run returns posts for a term tracked by a specific user
- **THEN** that user's result set includes those posts processed via the existing dedupe/dispatch pipeline (`processUserPosts`) with `sourceType = 'term'`

#### Scenario: Manual single-user term processing
- **WHEN** `processTerms(userId)` is called directly for a user with active terms and `apify_enabled = true`
- **THEN** the function fetches that user's active terms, calls `executeTermsActor`, deduplicates against previously-sent posts, and dispatches new posts exactly as `processUser`/`processPeople` do for their respective source types

### Requirement: Term-sourced posts do not trigger target-profile enrichment
Posts sourced from a search term SHALL NOT be included in target-profile enrichment (`enrichProfilesFromBatch`, `upsertTargetProfile`, `insertFollowerHistory`), since a search term has no corresponding tracked profile to enrich.

#### Scenario: Term batch does not enrich profiles
- **WHEN** `processAllUsersBatched(hourUtc)` processes a batch that includes term-sourced posts
- **THEN** `upsertTargetProfile` and `insertFollowerHistory` are not called for any term-sourced post's author
