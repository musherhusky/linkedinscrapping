-- Allow 'term' as a valid posts.source_type value (search-term scraping).
-- Previously the check constraint only allowed 'company'/'person', so
-- term-sourced posts failed to insert with:
--   new row for relation "posts" violates check constraint "posts_source_type_check"

ALTER TABLE posts
  DROP CONSTRAINT IF EXISTS posts_source_type_check;

ALTER TABLE posts
  ADD CONSTRAINT posts_source_type_check
  CHECK (source_type IN ('company', 'person', 'term'));
