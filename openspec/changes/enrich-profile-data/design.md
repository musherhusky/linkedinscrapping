## Context

The Apify scraping pipeline already fetches rich profile metadata alongside each post (avatar URL, follower count embedded in `author.info`, headline, website). Today `mapPost()` discards all of it. Additionally, posts include `contentAttributes` arrays listing companies and people mentioned in the text, and `repostedBy` objects identifying the reposter — both valuable signals for a future profile recommendation engine.

Current data model: `target_companies` and `target_people` hold only `url`, `name`, `active`, `created_at`. There is no historical follower data anywhere in the schema.

## Goals / Non-Goals

**Goals:**
- Upsert profile metadata (avatar, followers, headline, website) into `target_companies` / `target_people` on every scrape — zero additional Apify cost.
- Record a daily follower snapshot per tracked URL per user in `source_follower_history` for KPI trend charts.
- Maintain a global `discovered_profiles` catalog of LinkedIn profiles surfaced as reposters or content mentions, with a `discovered_profile_relations` table tracking which tracked source URL led to each discovery.

**Non-Goals:**
- Fetching profile data for profiles that have never appeared in a scrape run.
- Exposing follower history or discovered profiles via a new API endpoint (frontend reads Supabase directly).
- Deduplicating follower snapshots beyond one-per-day-per-user-per-URL.
- Recommending profiles to users (future capability, seeds data only).

## Decisions

### 1. Parse followers from `author.info` string rather than adding a dedicated Apify field

`author.info` returns `"604,681 followers"` for companies and a free-text headline for people. We parse with `/^([\d,]+)\s+followers/i` and store `null` for people (no follower data available). Alternative: request a different Apify actor that returns structured follower counts. Rejected — current actor is working and adding a new one increases cost and maintenance.

### 2. Enrich existing `target_companies`/`target_people` tables instead of a new `source_profiles` table

Profile metadata belongs to the tracked URL, not to a separate entity. Enriching in-place keeps queries simple (no extra join to show avatar on the frontend). The `last_enriched_at` column signals staleness. Alternative: a separate `source_profiles` table. Rejected — adds a join everywhere and splits identity across two tables.

### 3. `discovered_profiles` is global (no `user_id`), `discovered_profile_relations` is per source URL

A discovered profile (e.g., Endesa appearing as a mention in Iberdrola's post) is the same entity regardless of which user triggered the scrape. Storing it globally avoids duplicates and allows cross-user affinity signals in the future. The `discovered_profile_relations` table records which tracked URL (company or person) co-occurred with the discovery, with `relation_count` for frequency. This table has no `user_id` either — the link to user context is via `source_url` → `target_companies/people.url`.

### 4. One follower snapshot per user per URL per calendar day (UTC)

Multiple scrape runs in a single day for the same URL (possible if two users track the same company and both have crons firing) yield one row per user per day — `UNIQUE(user_id, target_url, scraped_at::DATE)`. On conflict, we do nothing (keep the first reading of the day). Alternative: keep all readings and average. Rejected — daily granularity is sufficient for KPI trends and avoids unbounded growth.

### 5. Process enrichment after `mapPost()`, batched by unique `author.id`

Each batch run returns N posts, often many from the same author. We deduplicate by `author.id` before upserting — one upsert per unique author per batch. `contentAttributes` and `repostedBy` are processed post-dedup as well.

## Risks / Trade-offs

- **`author.info` format change** → If Apify changes the followers string format, `parseFollowers()` returns `null` silently. Mitigation: log a warning when `info` is non-null but unparseable for a company-type author.
- **Global `discovered_profiles` and RLS** → Since this table has no `user_id`, standard per-user RLS policies don't apply. It must be read-only from the client (anon key). Write access only via the serverless backend (service role key). Mitigation: grant SELECT to `authenticated`, no INSERT/UPDATE/DELETE from client.
- **Avatar URL expiry** → LinkedIn CDN URLs contain expiry tokens (`e=1782345600`). Stored avatar URLs will become invalid. Mitigation: acceptable for now; re-enriched on next scrape. Future: proxy or re-fetch on display.
- **`discovered_profile_relations.relation_count` race condition** → Two concurrent scrape runs could both try to upsert the same relation. Mitigation: use `ON CONFLICT DO UPDATE SET relation_count = relation_count + 1` (atomic increment in Postgres).

## Migration Plan

1. Run `alter_target_tables.sql` — adds nullable columns; zero downtime, no backfill needed.
2. Run `source_follower_history.sql` — new table, no impact on existing data.
3. Run `discovered_profiles.sql` — new tables, no impact on existing data.
4. Deploy backend code changes.
5. Rollback: columns are nullable and additive; dropping them or the new tables is safe at any point before the first scrape enrichment run.

## Open Questions

- Should `discovered_profile_relations.source_url` reference `target_companies.url` with a FK, or remain a loose TEXT reference? Current choice: loose TEXT (simpler, avoids FK across two tables with different schemas, and discovered profiles can be linked to URLs that were later deleted).
