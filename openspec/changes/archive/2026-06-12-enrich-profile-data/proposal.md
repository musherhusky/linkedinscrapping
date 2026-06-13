## Why

Each Apify scrape run already returns rich profile data (name, avatar, follower count, headline, website) for every tracked company and person, but this data is discarded after mapping posts. Storing it enables follower-growth KPIs, profile trend analytics, and a discovered-profiles catalog that seeds future "suggest similar profiles" functionality — all without any additional scraping cost.

## What Changes

- **Enrich `target_companies`**: add `linkedin_id`, `avatar_url`, `followers_count`, `last_enriched_at` columns; upsert on every scrape run.
- **Enrich `target_people`**: add `linkedin_id`, `avatar_url`, `headline`, `website`, `last_enriched_at` columns; upsert on every scrape run.
- **New `source_follower_history` table**: one row per tracked URL per day per user, capturing follower snapshots for KPI trends. People profiles will have `null` follower counts (Apify does not return follower counts for individuals).
- **New `discovered_profiles` table**: global catalog of LinkedIn profiles (companies and people) encountered as reposters or content-attribute mentions in scraped posts. One row per unique LinkedIn URL.
- **New `discovered_profile_relations` table**: tracks which tracked source URL (target company or person) led to each discovered profile, with a `relation_count` to support affinity scoring.
- **`lib/apify.js`**: add `parseFollowers()` helper and `mapProfileEnrichment()` / `mapDiscoveredProfiles()` functions to extract the new data from Apify items.
- **`lib/database.js`**: add `upsertTargetProfile()`, `insertFollowerHistory()`, `upsertDiscoveredProfiles()` functions.
- **`lib/orchestrator.js`**: call the new enrichment functions after each actor run.
- **SQL migrations**: three migration files for the new table and the two `ALTER TABLE` statements.

## Capabilities

### New Capabilities

- `profile-enrichment`: Upsert profile metadata (avatar, followers, headline, website) into `target_companies` / `target_people` on every scrape, and record a daily follower snapshot in `source_follower_history`.
- `discovered-profiles`: Detect and catalog LinkedIn profiles encountered as reposters or content-attribute mentions. Maintain a global profile catalog (`discovered_profiles`) and a per-source-URL relation log (`discovered_profile_relations`) for future recommendation use.

### Modified Capabilities

## Impact

- **Database**: Two `ALTER TABLE` migrations (`target_companies`, `target_people`) + two new tables (`source_follower_history`, `discovered_profiles`, `discovered_profile_relations`).
- **Backend**: `lib/apify.js`, `lib/database.js`, `lib/orchestrator.js`.
- **No API or frontend changes required** in this change.
- **No breaking changes** to existing post-scraping or analysis flows.
