-- Record which search term produced a term-sourced post, so the frontend can
-- show "where it came from" for posts.source_type = 'term' rows (company/person
-- posts already have this implicitly via their own author).

ALTER TABLE posts
  ADD COLUMN search_term TEXT;
