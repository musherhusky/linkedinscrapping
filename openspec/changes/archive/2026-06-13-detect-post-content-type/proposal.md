## Why

The current `content_type` column in `posts` is a `TEXT` scalar that can only represent one type per post (e.g. `"image"` or `"video"`), but LinkedIn posts frequently combine types simultaneously — a post with an embedded video may also contain a URL, or a repost may include images. This single-value constraint prevents accurate filtering and analytics by content format.

## What Changes

- The `content_type` column in `posts` is changed from `TEXT` to `text[]` (PostgreSQL array).
- The existing `detectContentType()` function in `lib/apify.js` is replaced with a new multi-type implementation that returns `string[]`.
- Detection logic adds a `"repost"` type based on `header.text`, and a `"link"` type based on URL detection in post content. The existing `"article"`, `"document"`, `"image"`, `"video"`, and `"text"` types are preserved (with `"article"` and `"document"` remaining valid).
- `"text"` is only emitted when no other type is detected.
- The `savePost` function in `lib/database.js` already maps `post.contentType` → `content_type`; no change needed there beyond the value shape.

## Capabilities

### New Capabilities

- `post-content-type-detection`: Multi-type detection of LinkedIn post content format, stored as a PostgreSQL array column on `posts`.

### Modified Capabilities

- `posts`: The `content_type` column type changes from `TEXT` to `text[]`. Existing scalar values become single-element arrays after migration.

## Impact

- **Database**: `posts.content_type` column type migration from `TEXT` to `text[]`.
- **`lib/apify.js`**: `detectContentType()` return type changes from `string` to `string[]`.
- **Frontend**: Any frontend code reading `content_type` as a string must be updated to handle an array.
- **No new npm dependencies.**
