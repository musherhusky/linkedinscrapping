## MODIFIED Requirements

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
