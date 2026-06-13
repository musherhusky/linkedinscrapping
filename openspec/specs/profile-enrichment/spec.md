## ADDED Requirements

### Requirement: Profile metadata is upserted on every scrape run
After each Apify actor run, the system SHALL upsert profile metadata for every unique author encountered in the batch into the corresponding `target_companies` or `target_people` row (matched by `query.targetUrl`). Fields updated: `linkedin_id`, `avatar_url`, `last_enriched_at`, and — depending on author type — `followers_count` (companies) or `headline` + `website` (people).

#### Scenario: Company profile data is enriched after scrape
- **WHEN** an Apify company actor run completes and returns posts with `author.type = "company"`
- **THEN** the system SHALL upsert `linkedin_id`, `avatar_url`, `followers_count` (parsed from `author.info`), and `last_enriched_at` into the matching `target_companies` row

#### Scenario: Person profile data is enriched after scrape
- **WHEN** an Apify people actor run completes and returns posts with `author.type = "profile"`
- **THEN** the system SHALL upsert `linkedin_id`, `avatar_url`, `headline` (from `author.info`), `website`, and `last_enriched_at` into the matching `target_people` row

#### Scenario: Follower count is null for person profiles
- **WHEN** enriching a person profile
- **THEN** no follower count SHALL be stored (Apify does not return follower counts for individuals)

#### Scenario: Unparseable followers string is handled gracefully
- **WHEN** `author.info` is non-null for a company author but does not match the pattern `"<number> followers"`
- **THEN** the system SHALL store `null` for `followers_count` and emit a warning log

### Requirement: Daily follower snapshot is recorded per tracked URL per user
After enriching a company profile, the system SHALL insert one row into `source_follower_history` per `(user_id, target_url, UTC calendar day)`. If a row already exists for that combination on the same day, the insert SHALL be skipped (ON CONFLICT DO NOTHING).

#### Scenario: First scrape of the day records a snapshot
- **WHEN** a company URL is scraped for the first time on a given UTC day for a given user
- **THEN** a new row is inserted into `source_follower_history` with the current `followers_count` and `scraped_at`

#### Scenario: Second scrape on the same day does not duplicate
- **WHEN** the same company URL is scraped a second time on the same UTC day for the same user
- **THEN** no new row is inserted into `source_follower_history`

#### Scenario: People profiles are included in history with null followers
- **WHEN** a person profile URL is scraped
- **THEN** a row SHALL be inserted into `source_follower_history` with `followers_count = null`

### Requirement: Enrichment is deduplicated per unique author within a batch
The system SHALL upsert each unique `author.id` only once per batch run, regardless of how many posts that author has in the batch.

#### Scenario: Author appears in multiple posts in the same batch
- **WHEN** a single batch contains 10 posts all from the same author
- **THEN** exactly one upsert is performed for that author's profile data
