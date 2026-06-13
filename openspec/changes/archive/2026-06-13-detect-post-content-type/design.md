## Context

`posts.content_type` is currently `TEXT`, populated by `detectContentType()` in `lib/apify.js` which returns a single string (`'article'`, `'video'`, `'document'`, `'image'`, `'text'`). The function is called inside `mapPost()` and the result is stored via `savePost()` in `lib/database.js` as `content_type: post.contentType || null`.

The change must preserve backward-compatible storage semantics (existing rows must remain queryable) and must not break the scraping pipeline.

## Goals / Non-Goals

**Goals**
- Change `posts.content_type` to `text[]` to support multi-type classification.
- Add `"link"` and `"repost"` as detectable types.
- Keep detection pure and testable (no I/O, no side effects).
- Migrate existing scalar values to single-element arrays.

**Non-Goals**
- Backfilling `"link"` or `"repost"` for historical rows (no detection context available post-scrape).
- Modifying the Supabase client or auth setup.
- Adding npm dependencies.

## Decisions

### 1. Replace `detectContentType()` in-place in `lib/apify.js`

The function is already exported and called from a single location (`mapPost()`). Replacing it in-place avoids introducing a new file and keeps the detection co-located with the mapping logic.

**Alternative**: Extract to `lib/postUtils.js`. Rejected — unnecessary indirection for a pure function; the skill instructions say to place it "in an appropriate location… alongside the existing scraping helpers", and `lib/apify.js` is that location.

### 2. Detection order and `"text"` fallback

Detection checks in this order: `image`, `video`, `document`, `article`, `link`, `repost`. If none match, push `"text"`. `"text"` is never combined with other types per spec.

**Alternative**: Check `"repost"` via `item.repost || item.repostedBy` (same as `isRepost` flag). Rejected — the spec requires `header.text` containing `"reposted"` (case-insensitive), which is a distinct LinkedIn UI signal. `isRepost` is mapped separately as the `is_repost` boolean.

### 3. `"link"` detection via regex on `content`

Pattern: `/https?:\/\/\S+/` applied to `src.content`. LinkedIn shortens most URLs to `lnkd.in` but they still match `https://`. LinkedIn's own `shareUrl` and `linkedinUrl` fields are internal — only `content` text represents user-authored links.

### 4. Migration: ALTER COLUMN with USING cast

```sql
ALTER TABLE posts
  ALTER COLUMN content_type TYPE text[]
  USING CASE
    WHEN content_type IS NULL THEN '{}'::text[]
    ELSE ARRAY[content_type]
  END;
```

This converts existing scalar values to single-element arrays and `NULL` to empty arrays, preserving all current data. Default changes to `'{}'::text[]`.

**Risk**: Table lock during migration on large `posts` table. Mitigation: run during off-peak hours; migration is instant for column type change with a USING expression on Supabase Postgres (no row rewrite needed for text→text[] if rows are few enough; for large tables, consider a new column + backfill + rename pattern).

## Risks / Trade-offs

- **Frontend breakage**: Any frontend code doing `post.content_type === 'video'` will break — must change to `post.content_type?.includes('video')`. → Mitigation: document clearly; frontend is a separate concern.
- **`"repost"` detection depends on LinkedIn UI text**: `header.text` containing `"reposted"` is LinkedIn-controlled and may change. → Mitigation: the `is_repost` boolean remains the authoritative repost signal; `"repost"` in `content_type[]` is supplemental.

## Migration Plan

1. Run `docs/migrations/alter_posts_content_type_array.sql` in Supabase SQL editor.
2. Deploy updated backend (new `detectContentType` signature).
3. Verify next scrape run populates `content_type` as array.

Rollback: revert migration with `ALTER COLUMN content_type TYPE text USING content_type[1]` and redeploy previous backend.

## Open Questions

- None blocking implementation.
