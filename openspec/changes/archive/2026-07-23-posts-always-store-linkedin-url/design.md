## Context

`mapPost()` (`lib/apify.js:129-204`) is the single place that shapes an Apify item into the object persisted by `savePost()` (`lib/database.js:162-209`) and later sent to Hallon (`lib/hallon.js`). Today:

```js
const url = src.article?.link || src.linkedinUrl || null;
```

This makes `url` hold the shared article's external link whenever one is present, and the LinkedIn permalink only otherwise. `posts.url` is also the dedup key (`deduplicatePosts`, `lib/database.js:133-160`) and is documented in `docs/data-model.md` as "Canonical post URL (dedup key)" — the intent was always for it to be a stable LinkedIn-identified URL, not a third-party link that could point anywhere (and could even collide across different posts/users sharing the same article).

A separate `linkedin_url` column already exists and is populated from `item.linkedinUrl` (the post's own permalink, not affected by this bug). This change does not touch `linkedin_url`.

## Goals / Non-Goals

**Goals:**
- `posts.url` always holds the LinkedIn permalink of the post, regardless of content type.
- The external article link, when present, is not silently dropped — it's preserved in a new dedicated column.
- Change is minimal and localized to the mapping/persistence layer; no changes to Apify actor input, Hallon dispatch shape, or content-type detection.

**Non-Goals:**
- Backfilling/migrating existing `posts` rows that already have an external link stored in `url`. Historical data is left as-is; only newly ingested posts are affected.
- Changing what is sent to Hallon (`lib/hallon.js`) — it keeps sending `post.url`, which will now consistently be a LinkedIn URL.
- Deduplicating or reconciling `url` vs `linkedin_url` into a single column — they remain separate columns with today's slightly different semantics (see Open Questions).

## Decisions

**1. Add `articleUrl` to `mapPost()`'s return value instead of overloading an existing field.**
`article_source` already exists but only stores the article's subtitle/domain text, not the link itself, so it can't carry the URL. Reusing `linkedin_url` for this would conflict with its existing meaning. A new field keeps each column single-purpose.
Alternative considered: drop the external link entirely (simplest, zero schema change) — rejected per product decision to keep that data available for future use.

**2. `url` becomes `src.linkedinUrl || null`, dropping the `src.article?.link` branch entirely.**
This is the minimal change that fixes the bug: same source value the code already had as its fallback, just no longer overridden by the article link.

**3. New Supabase column `posts.article_url TEXT`, nullable, no default.**
Follows the existing convention of nullable TEXT columns for optional post metadata (e.g. `article_source`, `repost_comment`). Migration SQL added under `docs/migrations/` following the existing `alter_posts_content_type_array.sql` pattern (plain `ALTER TABLE`, no ORM).

## Risks / Trade-offs

- **[Risk]** Any downstream code or dashboard query that (perhaps unknowingly) relies on `posts.url` sometimes containing an external article link will start seeing only LinkedIn URLs for new rows → **Mitigation**: none found in this codebase (`hallon.js` just forwards the value; no other reader was found besides dedup); flagged in proposal's Impact section for awareness.
- **[Risk]** Existing rows keep the old (inconsistent) `url` values, so historical data and new data won't be uniformly shaped → **Mitigation**: explicitly out of scope (Non-Goals); acceptable since the bug report is about ongoing ingestion, not historical cleanup.

## Migration Plan

1. Run `docs/migrations/add_posts_article_url.sql` against Supabase to add the `article_url` column.
2. Deploy the `mapPost()` / `savePost()` code change.
3. No rollback data concerns: the column is additive and nullable; reverting the code change is safe at any time (the column simply stops being written).

## Open Questions

None — `linkedin_url` vs `url` semantic overlap for repost cases is pre-existing behavior, unchanged by this fix, and out of scope.
