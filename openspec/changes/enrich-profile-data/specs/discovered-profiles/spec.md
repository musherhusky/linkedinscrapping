## ADDED Requirements

### Requirement: Reposters are cataloged as discovered profiles
After each Apify actor run, the system SHALL upsert any `repostedBy` object found in scraped posts into `discovered_profiles` (global, keyed by normalized `linkedinUrl`). A corresponding row in `discovered_profile_relations` SHALL link the discovered profile to the tracked source URL (`query.targetUrl`) with `source_type = 'reposter'`. On repeated encounters, `relation_count` SHALL be incremented and `last_seen_at` updated.

#### Scenario: New reposter is cataloged on first encounter
- **WHEN** a post has a `repostedBy` object with a `linkedinUrl`
- **THEN** the system SHALL upsert a row into `discovered_profiles` with `name`, `universal_name`, `public_identifier`, `type`, and `linkedin_url`
- **THEN** the system SHALL upsert a row into `discovered_profile_relations` with `source_url = query.targetUrl`, `source_type = 'reposter'`, `relation_count = 1`

#### Scenario: Known reposter increments relation count
- **WHEN** the same reposter appears again linked to the same source URL
- **THEN** `discovered_profile_relations.relation_count` SHALL be incremented by 1 and `last_seen_at` updated

#### Scenario: Reposter with no linkedinUrl is skipped
- **WHEN** `repostedBy` is present but has no `linkedinUrl` or `universalName`
- **THEN** no row is inserted into `discovered_profiles`

### Requirement: Content-attribute mentions are cataloged as discovered profiles
After each Apify actor run, the system SHALL upsert any `contentAttributes` entries of type `COMPANY_NAME` or `PROFILE_MENTION` that include a `linkedinUrl` into `discovered_profiles`. A corresponding row in `discovered_profile_relations` SHALL link each to the post's tracked source URL with `source_type = 'mention'`. On repeated encounters, `relation_count` SHALL be incremented.

#### Scenario: Company mentioned in post content is cataloged
- **WHEN** a post's `contentAttributes` contains an entry with `type = "COMPANY_NAME"` and a non-null `company.linkedinUrl`
- **THEN** the system SHALL upsert the company into `discovered_profiles` with `type = 'company'`
- **THEN** a `discovered_profile_relations` row SHALL be created or updated with `source_type = 'mention'`

#### Scenario: Person mentioned in post content is cataloged
- **WHEN** a post's `contentAttributes` contains an entry with `type = "PROFILE_MENTION"` and a non-null `profile.linkedinUrl`
- **THEN** the system SHALL upsert the person into `discovered_profiles` with `type = 'person'`
- **THEN** a `discovered_profile_relations` row SHALL be created or updated with `source_type = 'mention'`

#### Scenario: Already-tracked profile appearing as a mention is still cataloged
- **WHEN** a profile in `target_companies` or `target_people` appears as a content mention in another tracked profile's post
- **THEN** it SHALL still be upserted into `discovered_profiles` (the tables serve different purposes)

### Requirement: Discovered profiles are deduplicated globally by LinkedIn URL
`discovered_profiles` SHALL maintain a unique constraint on `linkedin_url` (normalized: lowercase, trailing slash removed). A profile discovered by multiple users or through multiple source URLs MUST result in a single row in `discovered_profiles`.

#### Scenario: Same profile discovered via two different tracked sources
- **WHEN** profile X is mentioned in posts from both tracked company A and tracked company B
- **THEN** `discovered_profiles` SHALL contain exactly one row for profile X
- **THEN** `discovered_profile_relations` SHALL contain two rows — one for source A and one for source B

### Requirement: Discovered profiles table is read-only from the client
`discovered_profiles` and `discovered_profile_relations` SHALL have no `user_id` column and SHALL NOT be writable by the Supabase anon key. The backend service role key is the only writer. Authenticated users MAY read both tables.

#### Scenario: Client attempts to insert a discovered profile
- **WHEN** a browser client with an anon key attempts an INSERT into `discovered_profiles`
- **THEN** Supabase RLS SHALL reject the operation with a permission error
