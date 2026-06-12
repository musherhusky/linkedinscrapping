# Data Model

All tables live in Supabase (PostgreSQL). `user_id` columns reference `auth.users(id)`.

---

## Core Tables

### `user_settings`
User configuration. One row per user.

| Column | Type | Default | Description |
|---|---|---|---|
| user_id | UUID PK | — | References auth.users |
| send_to_hallon | BOOLEAN | true | Whether to push posts to Hallon API |
| apify_enabled | BOOLEAN | true | Whether to run Apify scraping |
| auto_execution_enabled | BOOLEAN | true | Whether cron includes this user |
| max_posts_per_company | INTEGER | 0 | Max posts per source (0 = unlimited) |
| hallon_sid | INTEGER | — | Hallon service ID |
| hallon_tema_id | INTEGER | — | Hallon topic ID |
| timezone | TEXT | 'UTC' | User's IANA timezone (set by frontend) |

---

### `target_companies`
LinkedIn company URLs tracked per user. Enriched with profile metadata on every scrape run.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | — |
| user_id | UUID | References auth.users |
| url | TEXT | LinkedIn company URL |
| name | TEXT | Display name |
| active | BOOLEAN | Whether included in scraping |
| created_at | TIMESTAMPTZ | — |
| linkedin_id | TEXT | LinkedIn internal company ID (from Apify `author.id`) |
| avatar_url | TEXT | Company logo URL (LinkedIn CDN, may expire) |
| followers_count | INTEGER | Latest follower count parsed from `author.info` |
| last_enriched_at | TIMESTAMPTZ | When profile metadata was last updated |

---

### `target_people`
LinkedIn person profile URLs tracked per user. Enriched with profile metadata on every scrape run.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | — |
| user_id | UUID | References auth.users |
| url | TEXT | LinkedIn profile URL |
| name | TEXT | Display name |
| active | BOOLEAN | Whether included in scraping |
| created_at | TIMESTAMPTZ | — |
| linkedin_id | TEXT | LinkedIn internal profile ID (from Apify `author.id`) |
| avatar_url | TEXT | Profile photo URL (LinkedIn CDN, may expire) |
| headline | TEXT | Professional headline from `author.info` |
| website | TEXT | Personal website URL if set |
| last_enriched_at | TIMESTAMPTZ | When profile metadata was last updated |

---

### `posts`
Scraped LinkedIn posts. `id` is BIGINT (not UUID).

| Column | Type | Description |
|---|---|---|
| id | BIGINT PK | Auto-increment |
| user_id | UUID | References auth.users |
| url | TEXT | Canonical post URL (dedup key) |
| linkedin_url | TEXT | LinkedIn post URL |
| titulo | TEXT | Post title or first 200 chars |
| descripcion | TEXT | Full post content |
| article_source | TEXT | Article subtitle if article type |
| fecha_post | TIMESTAMPTZ | Original publish date |
| content_type | TEXT | 'article', 'video', 'document', 'image', 'text' |
| post_type | TEXT | Raw type from Apify |
| author_name | TEXT | Author display name |
| author_type | TEXT | Author entity type |
| author_id | TEXT | Author publicIdentifier (slug) — used for list filtering |
| entity_id | TEXT | Post entity ID from LinkedIn |
| is_repost | BOOLEAN | Whether this is a repost |
| repost_comment | TEXT | Comment added on repost |
| reposted_by | TEXT | Name of reposter (silent repost) |
| likes | INTEGER | Like count |
| comments | INTEGER | Comment count |
| shares | INTEGER | Share count |
| reactions | JSONB | Raw reactions array |
| reactions_like | INTEGER | LIKE reaction count |
| reactions_empathy | INTEGER | EMPATHY reaction count |
| reactions_praise | INTEGER | PRAISE reaction count |
| reactions_appreciation | INTEGER | APPRECIATION reaction count |
| reactions_interest | INTEGER | INTEREST reaction count |
| reactions_entertainment | INTEGER | ENTERTAINMENT reaction count |
| source_type | TEXT | 'company' or 'person' |
| external_id | TEXT | Hallon dispatch ID |
| dispatch_response | JSONB | Full Hallon response |
| status | TEXT | 'sent', 'extracted', 'failed' |
| sent_to_published_at | TIMESTAMPTZ | When sent to Hallon |

---

### `activity_log`
Execution log for every post processing attempt.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | — |
| user_id | UUID | References auth.users |
| url | TEXT | Post URL |
| titulo | TEXT | Post title |
| status | TEXT | 'sent', 'extracted', 'failed' |
| external_id | TEXT | Hallon ID |
| dispatch_response | JSONB | Full Hallon response |
| error_message | TEXT | Error description if failed |
| error_type | TEXT | 'hallon', 'apify', 'supabase', 'network', 'unknown' |
| attempted_at | TIMESTAMPTZ | — |
| attempt_number | INTEGER | — |

---

## Plan & Subscription Tables

### `plans`
Static catalog of available plans.

| Column | Type | Description |
|---|---|---|
| id | TEXT PK | 'free', 'basic', 'pro', 'corporate' |
| name | TEXT | Display name |
| syncs_per_day | INTEGER | Max cron executions per day |
| max_urls | INTEGER | Max active URLs (NULL = unlimited) |
| posted_limit | TEXT | '24h' or '1h' — passed to Apify |
| trial_days | INTEGER | Trial duration (15 for Free, NULL for others) |
| is_active | BOOLEAN | Whether plan is available |

Data:

| id | syncs_per_day | max_urls | posted_limit | trial_days |
|---|---|---|---|---|
| free | 1 | 5 | 24h | 15 |
| basic | 1 | 100 | 24h | NULL |
| pro | 3 | 500 | 24h | NULL |
| corporate | 24 | NULL | 1h | NULL |

---

### `user_plans`
User ↔ plan relationship with Stripe and trial tracking. Maintains full history.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | — |
| user_id | UUID | References auth.users |
| plan_id | TEXT | References plans.id |
| status | TEXT | 'trialing', 'active', 'past_due', 'cancelled', 'expired' |
| trial_start_date | TIMESTAMPTZ | When trial started |
| trial_end_date | TIMESTAMPTZ | When trial expires |
| current_period_start | TIMESTAMPTZ | Billing period start |
| current_period_end | TIMESTAMPTZ | Billing period end |
| stripe_customer_id | TEXT | Stripe customer ID |
| stripe_subscription_id | TEXT | Stripe subscription ID |
| created_at | TIMESTAMPTZ | — |
| updated_at | TIMESTAMPTZ | — |

**Constraint**: unique index on `user_id` where status IN ('trialing', 'active', 'past_due') — only one active plan per user.

---

### `user_sync_hours`
Hours (UTC) when the cron should process this user.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | — |
| user_id | UUID | References auth.users |
| hour_utc | SMALLINT | 0–23, hour in UTC |
| created_at | TIMESTAMPTZ | — |

**Constraint**: UNIQUE(user_id, hour_utc). Max rows per user = plan's `syncs_per_day`.

---

## List Tables

### `lists`
User-defined groups of URLs for filtering posts.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | — |
| user_id | UUID | References auth.users |
| name | TEXT | Free-form list name |
| created_at | TIMESTAMPTZ | — |
| updated_at | TIMESTAMPTZ | — |

---

### `list_items`
URLs belonging to a list. Links to `target_companies` or `target_people` by URL.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | — |
| list_id | UUID | References lists.id ON DELETE CASCADE |
| user_id | UUID | References auth.users |
| url | TEXT | Must match a URL in target_companies or target_people |
| source_type | TEXT | 'company' or 'person' |
| created_at | TIMESTAMPTZ | — |

**Constraint**: UNIQUE(list_id, url).

**Filtering posts via lists**: `list_items.url` → `target_companies/people.url` → `posts.author_id`

---

## AI Analysis Tables

### `user_topics`
Topics the user wants force-checked during AI analysis.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | — |
| user_id | UUID | References auth.users |
| topic | TEXT | Topic label |
| url | TEXT | If set, only checked for posts from this author URL. NULL = all posts |
| created_at | TIMESTAMPTZ | — |

---

### `post_categories`
High-level categories detected by Claude per post.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | — |
| post_id | BIGINT | References posts.id ON DELETE CASCADE |
| user_id | UUID | References auth.users |
| category | TEXT | e.g. 'Technology', 'Economy' |
| created_at | TIMESTAMPTZ | — |

---

### `post_topics`
Specific topics detected by Claude per post.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | — |
| post_id | BIGINT | References posts.id ON DELETE CASCADE |
| user_id | UUID | References auth.users |
| topic | TEXT | e.g. 'Artificial Intelligence' |
| forced | BOOLEAN | true if came from user_topics |
| confidence | TEXT | 'high', 'medium', 'low' |
| created_at | TIMESTAMPTZ | — |

---

## Profile Analytics Tables

### `source_follower_history`
Daily follower snapshots per tracked URL per user. Used for KPI trend charts.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | — |
| user_id | UUID | References auth.users ON DELETE CASCADE |
| target_url | TEXT | Tracked URL (matches `target_companies.url` or `target_people.url`) |
| followers_count | INTEGER | Follower count at scrape time. NULL for person profiles (not available) |
| scraped_at | TIMESTAMPTZ | When the snapshot was taken |

**Constraint**: `UNIQUE(user_id, target_url, scraped_at::DATE)` — one snapshot per URL per user per calendar day (UTC).

---

### `discovered_profiles`
Global catalog of LinkedIn profiles discovered as reposters or content mentions. No `user_id` — shared across all users. Read-only from client.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | — |
| linkedin_url | TEXT UNIQUE | Normalized LinkedIn URL (lowercase, no trailing slash) |
| linkedin_id | TEXT | LinkedIn internal ID |
| universal_name | TEXT | Company slug (e.g., `banco-santander`) |
| public_identifier | TEXT | Person slug (e.g., `anabotin`) |
| name | TEXT | Display name |
| type | TEXT | `'company'` or `'person'` |
| headline | TEXT | Company followers string or person headline from `author.info` |
| avatar_url | TEXT | Profile photo / logo URL (may expire) |
| first_seen_at | TIMESTAMPTZ | First time this profile was encountered |
| last_seen_at | TIMESTAMPTZ | Most recent encounter |

---

### `discovered_profile_relations`
Tracks which tracked source URL (company or person being followed) led to each discovered profile. Enables affinity scoring for future recommendation features.

| Column | Type | Description |
|---|---|---|
| id | UUID PK | — |
| discovered_profile_id | UUID FK | References `discovered_profiles.id` ON DELETE CASCADE |
| source_url | TEXT | Tracked URL that discovered this profile (loose reference — no FK) |
| source_type | TEXT | `'reposter'` — profile reposted a post from source_url; `'mention'` — profile was mentioned in content |
| relation_count | INTEGER | How many times this profile has been seen via this source (incremented atomically) |
| first_seen_at | TIMESTAMPTZ | First co-occurrence |
| last_seen_at | TIMESTAMPTZ | Most recent co-occurrence |

**Constraint**: `UNIQUE(discovered_profile_id, source_url, source_type)`.

---

## Relationships Summary

```
auth.users
  ├── user_settings (1:1)
  ├── user_plans (1:many, one active at a time)
  ├── user_sync_hours (1:many)
  ├── target_companies (1:many)
  ├── target_people (1:many)
  ├── posts (1:many)
  ├── activity_log (1:many)
  ├── lists (1:many)
  │     └── list_items (1:many) → target_companies/people via url
  ├── user_topics (1:many)
  ├── post_categories (1:many) → posts
  ├── post_topics (1:many) → posts
  └── source_follower_history (1:many)

plans (static catalog)
  └── user_plans → plans via plan_id

discovered_profiles (global catalog — no user_id)
  └── discovered_profile_relations (1:many) — source_url → target_companies/people.url (loose)
```
