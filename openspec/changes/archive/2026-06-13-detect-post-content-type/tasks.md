## 1. Database Migration

- [x] 1.1 Create `docs/migrations/alter_posts_content_type_array.sql` with the ALTER TABLE statement converting `content_type` from `TEXT` to `text[]` using the USING CASE expression (NULL → `'{}'::text[]`, existing scalar → `ARRAY[content_type]`), and set default to `'{}'::text[]`
- [x] 1.2 Run the migration in Supabase SQL editor and verify existing rows have been converted correctly

## 2. Unit Tests (TDD — write before implementation)

- [x] 2.1 Create `tests/unit/detectContentType.test.js` with failing tests covering: image-only, video-only, document-only, article-only, link-only (URL in content), repost-only (header.text contains "reposted"), plain text fallback, image+link combined, video+repost combined, and "text" never appears alongside other types

## 3. Core Implementation

- [x] 3.1 Replace `detectContentType(src)` in `lib/apify.js` with the multi-type implementation that returns `string[]`, checking in order: image, video, document, article, link (regex on `src.content`), repost (`src.header?.text` case-insensitive), falling back to `["text"]`
- [x] 3.2 Verify unit tests from 2.1 now pass

## 4. Integration Verification

- [x] 4.1 Add or update an integration test (or manual smoke test) confirming that `mapPost()` returns `contentType` as `string[]` and that `savePost()` stores it correctly in Supabase as a `text[]` column value

## 5. Documentation Update

- [x] 5.1 Update `docs/data-model.md` to reflect that `posts.content_type` is now `text[]` and document the possible values and query pattern (`content_type @> ARRAY['video']::text[]`)
