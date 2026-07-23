## Why

`posts.url` is documented as the canonical post URL and dedup key, but `mapPost()` currently sets it to the shared article's external link (`src.article?.link`) whenever the LinkedIn post shares an article, falling back to the LinkedIn permalink only when no article is present. As a result, `posts.url` inconsistently holds either a LinkedIn URL or a third-party website URL depending on post content, and that same value is used for deduplication and sent to Hallon as "the post URL". `posts.url` must always be the LinkedIn URL.

## What Changes

- `mapPost()` in `lib/apify.js` no longer prioritizes `src.article?.link` when building the `url` field returned to callers; `url` is always the LinkedIn permalink (same source value as today's `linkedinUrl` fallback).
- The external article link (previously captured opportunistically in `url`) is preserved in a new `articleUrl` field on the object `mapPost()` returns, populated only when the post has an `article` with a `link`.
- `savePost()` in `lib/database.js` inserts the new `article_url` column value from `post.articleUrl`.
- **BREAKING**: `posts.url` for future article-type posts will store the LinkedIn permalink instead of the article's external link. Existing rows are not backfilled (out of scope — see Impact).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `posts`: `url` requirement is clarified/enforced to always be the LinkedIn permalink, never the shared article's external link; a new `article_url` column is added to hold that external link separately.

## Impact

- **Code**: `lib/apify.js` (`mapPost`), `lib/database.js` (`savePost`), `tests/unit/mapPost.test.js`.
- **Database**: Supabase `posts` table needs a new `article_url TEXT` column (migration SQL under `docs/migrations/`).
- **Downstream consumers**: `lib/hallon.js` continues to send `post.url` unchanged in shape, but the value for article-type posts will now be the LinkedIn permalink instead of the external link — any Hallon-side logic relying on receiving the external article link via `url` would need to switch to a future `article_url` field if that's ever exposed there (out of scope for this change; Hallon payload is unchanged here).
- **Existing data**: Rows already saved with an external link in `url` are not migrated/backfilled by this change.
- **Docs**: `docs/data-model.md` `posts` table description updated for `url` and the new `article_url` column.
