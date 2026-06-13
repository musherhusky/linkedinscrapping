## 1. Database Migrations

- [x] 1.1 Create migration `docs/migrations/alter_target_companies_enrich.sql` — add nullable columns `linkedin_id TEXT`, `avatar_url TEXT`, `followers_count INTEGER`, `last_enriched_at TIMESTAMPTZ` to `target_companies`
- [x] 1.2 Create migration `docs/migrations/alter_target_people_enrich.sql` — add nullable columns `linkedin_id TEXT`, `avatar_url TEXT`, `headline TEXT`, `website TEXT`, `last_enriched_at TIMESTAMPTZ` to `target_people`
- [x] 1.3 Create migration `docs/migrations/source_follower_history.sql` — create `source_follower_history` table with columns `id UUID PK`, `user_id UUID`, `target_url TEXT`, `followers_count INTEGER`, `scraped_at TIMESTAMPTZ`; add `UNIQUE(user_id, target_url, (scraped_at::DATE))`
- [x] 1.4 Create migration `docs/migrations/discovered_profiles.sql` — create `discovered_profiles` table (`id UUID PK`, `linkedin_url TEXT UNIQUE`, `linkedin_id TEXT`, `universal_name TEXT`, `public_identifier TEXT`, `name TEXT`, `type TEXT`, `headline TEXT`, `avatar_url TEXT`, `first_seen_at TIMESTAMPTZ`, `last_seen_at TIMESTAMPTZ`) and `discovered_profile_relations` table (`id UUID PK`, `discovered_profile_id UUID FK`, `source_url TEXT`, `source_type TEXT`, `relation_count INTEGER DEFAULT 1`, `first_seen_at TIMESTAMPTZ`, `last_seen_at TIMESTAMPTZ`; `UNIQUE(discovered_profile_id, source_url, source_type)`)
- [x] 1.5 Add RLS to `discovered_profiles` and `discovered_profile_relations`: SELECT granted to `authenticated`, no INSERT/UPDATE/DELETE from anon/authenticated roles

## 2. `lib/apify.js` — Mapping helpers

- [x] 2.1 Add `parseFollowers(info)` — extracts integer from strings like `"604,681 followers"` using regex; returns `null` if no match; emits warning log when `info` is non-null and unparseable for a company author
- [x] 2.2 Add `mapProfileEnrichment(item)` — returns `{ linkedinId, universalName, publicIdentifier, authorType, name, linkedinUrl, avatarUrl, followersCount, headline, website, queryTargetUrl }` extracted from `item.author` and `item.query.targetUrl`; deduplication by `linkedinId` should happen at the caller level
- [x] 2.3 Add `mapDiscoveredProfiles(item)` — returns array of discovered profile objects from `item.repostedBy` and `item.contentAttributes` (types `COMPANY_NAME` and `PROFILE_MENTION`); each object: `{ linkedinUrl, linkedinId, universalName, publicIdentifier, name, type, headline, source: 'reposter'|'mention', sourceUrl: query.targetUrl }`; skip entries with no `linkedinUrl`

## 3. `lib/database.js` — Persistence functions

- [x] 3.1 Add `upsertTargetProfile(userId, enrichment)` — upserts enrichment data into `target_companies` (for `type = 'company'`) or `target_people` (for `type = 'profile'`) matching on `user_id` + `url = queryTargetUrl`; only updates enrichment columns, never overwrites `url`, `active`, `created_at`
- [x] 3.2 Add `insertFollowerHistory(userId, targetUrl, followersCount, scrapedAt)` — inserts into `source_follower_history` with `ON CONFLICT (user_id, target_url, scraped_at::DATE) DO NOTHING`; accepts `null` for `followersCount` (people)
- [x] 3.3 Add `upsertDiscoveredProfile(profile)` — upserts into `discovered_profiles` on conflict `(linkedin_url)` updating `name`, `headline`, `avatar_url`, `last_seen_at`; returns the row `id`
- [x] 3.4 Add `upsertDiscoveredProfileRelation(discoveredProfileId, sourceUrl, sourceType)` — upserts into `discovered_profile_relations` on conflict `(discovered_profile_id, source_url, source_type)` performing atomic `relation_count = relation_count + 1` and updating `last_seen_at`

## 4. `lib/orchestrator.js` — Wire enrichment into the pipeline

- [x] 4.1 After `executeActor()` resolves, deduplicate `companyPostsAll` by `author.id`, call `mapProfileEnrichment()` for each unique author, then call `upsertTargetProfile()` + `insertFollowerHistory()` for each; do the same after `executePeopleActor()` for `peoplePostsAll`
- [x] 4.2 After dedup enrichment, call `mapDiscoveredProfiles()` on all items in `companyPostsAll` and `peoplePostsAll`, then call `upsertDiscoveredProfile()` + `upsertDiscoveredProfileRelation()` for each result; run via `Promise.all` batched to avoid overwhelming the DB

## 5. Update `docs/data-model.md`

- [x] 5.1 Add new columns to `target_companies` and `target_people` sections
- [x] 5.2 Add `source_follower_history` table documentation
- [x] 5.3 Add `discovered_profiles` and `discovered_profile_relations` table documentation
- [x] 5.4 Update the Relationships Summary diagram to include the new tables
