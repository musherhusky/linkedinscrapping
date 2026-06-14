-- Normalize post_categories: rename category → display, add canonical
ALTER TABLE post_categories RENAME COLUMN category TO display;
ALTER TABLE post_categories ADD COLUMN canonical TEXT NOT NULL DEFAULT '';
UPDATE post_categories SET canonical = display WHERE canonical = '';

-- Normalize post_topics: rename topic → display, add canonical
ALTER TABLE post_topics RENAME COLUMN topic TO display;
ALTER TABLE post_topics ADD COLUMN canonical TEXT NOT NULL DEFAULT '';
UPDATE post_topics SET canonical = display WHERE canonical = '';
