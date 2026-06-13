-- Migrate posts.content_type from TEXT to text[]
-- Existing scalar values become single-element arrays; NULL becomes empty array.

ALTER TABLE posts
  ALTER COLUMN content_type TYPE text[]
  USING CASE
    WHEN content_type IS NULL THEN '{}'::text[]
    ELSE ARRAY[content_type]
  END;

ALTER TABLE posts
  ALTER COLUMN content_type SET DEFAULT '{}'::text[];
