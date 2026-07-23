-- Add article_url column to preserve the external article link shared in a post,
-- now that posts.url always stores the LinkedIn permalink.

ALTER TABLE posts
  ADD COLUMN article_url TEXT;
