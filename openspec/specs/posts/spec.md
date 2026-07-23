# Capability: Posts

## Purpose

Define the schema and storage requirements for LinkedIn posts persisted in the database.

## Requirements

### Requirement: posts table stores content_type as a PostgreSQL array
The `posts` table `content_type` column SHALL be of type `text[]` (PostgreSQL array). Existing scalar `TEXT` values SHALL be migrated to single-element arrays via `ALTER COLUMN ... USING ARRAY[content_type]`. `NULL` values SHALL become `'{}'::text[]`. The column default SHALL change from `NULL` to `'{}'::text[]`.

#### Scenario: Migration converts existing scalar value
- **WHEN** the migration SQL is executed on a row where `content_type = 'video'`
- **THEN** that row's `content_type` becomes `ARRAY['video']`

#### Scenario: Migration converts NULL to empty array
- **WHEN** the migration SQL is executed on a row where `content_type IS NULL`
- **THEN** that row's `content_type` becomes `'{}'::text[]`

#### Scenario: New posts stored with array type
- **WHEN** a post is saved after deployment with `contentType = ["image", "link"]`
- **THEN** the `content_type` column stores `ARRAY['image', 'link']`

#### Scenario: Querying by single type still works
- **WHEN** a query uses `content_type @> ARRAY['video']::text[]`
- **THEN** all posts that contain `"video"` in their array are returned

### Requirement: posts.url always stores the LinkedIn permalink
The `posts` table `url` column SHALL always store the LinkedIn permalink of the post (the same value the system would use for `linkedin_url`), regardless of whether the post shares an external article. `url` SHALL NOT store a third-party article link.

#### Scenario: Post without a shared article
- **WHEN** an Apify item has no `article` and `linkedinUrl = "https://www.linkedin.com/feed/update/urn:li:activity:1"`
- **THEN** `mapPost()` returns `url = "https://www.linkedin.com/feed/update/urn:li:activity:1"`

#### Scenario: Post sharing an external article
- **WHEN** an Apify item has `article.link = "https://example.com/blog-post"` and `linkedinUrl = "https://www.linkedin.com/feed/update/urn:li:activity:2"`
- **THEN** `mapPost()` returns `url = "https://www.linkedin.com/feed/update/urn:li:activity:2"` (the LinkedIn permalink, not the article link)

### Requirement: posts.article_url stores the shared article's external link
The `posts` table SHALL have an `article_url TEXT` column that stores the external link of a shared article when present, and `NULL` when the post has no article.

#### Scenario: Post sharing an external article
- **WHEN** an Apify item has `article.link = "https://example.com/blog-post"`
- **THEN** `mapPost()` returns `articleUrl = "https://example.com/blog-post"` and `savePost()` persists it in `posts.article_url`

#### Scenario: Post without a shared article
- **WHEN** an Apify item has no `article`
- **THEN** `mapPost()` returns `articleUrl = null` and `savePost()` persists `posts.article_url` as `NULL`
