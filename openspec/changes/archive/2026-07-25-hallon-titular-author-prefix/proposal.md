## Why

Hallon receives the raw post title (`titular`) with no indication of which LinkedIn company or person authored the post. Editors reviewing content in Hallon need that context inline in the headline to quickly identify the source, in the format `[Author Name] - "Title"`. This must only affect what is sent to Hallon — `posts.titulo` and `activity_log.titulo` must keep storing the original, unprefixed title.

## What Changes

- A new pure function `formatHallonTitular(title, authorName)` in `lib/hallon.js` builds the Hallon-bound headline as `[authorName] - "title"`. If `authorName` is empty/null, it returns `title` unprefixed.
- `sendPostToHallon()` uses `formatHallonTitular(post.title, post.authorName)` for the `titular` field instead of `post.title` directly.
- `processAndSendToHallon()` skips the Hallon API call entirely for posts with an empty `title`: the post is still persisted via `savePost(..., 'extracted', ...)` and logged via `savelog(..., 'extracted', ..., 'Empty title - not sent to Hallon', 'config')`, deduplicating normally so it isn't retried daily. The function's return value gains a `skipped` counter alongside `sent`/`failed`.
- `savePost()` / `savelog()` / `posts.titulo` / `activity_log.titulo` are unaffected — they keep storing `post.title` exactly as scraped, with no author prefix.

## Capabilities

### New Capabilities
- `hallon-dispatch`: Defines how posts are formatted and dispatched to the Hallon API, including the author-prefixed `titular` format and the empty-title skip behavior.

### Modified Capabilities
(none)

## Impact

- **Code**: `lib/hallon.js` (`sendPostToHallon`, `processAndSendToHallon`, new `formatHallonTitular`), `lib/orchestrator.js` (surface the new `skipped` count in summaries, no behavior change).
- **Tests**: new unit tests for `formatHallonTitular` and for the empty-title skip path in `processAndSendToHallon`.
- **Downstream**: Hallon receives a different `titular` string for future dispatches; `posts`/`activity_log` data shape is unchanged (same columns, same source value).
- **No schema/migration changes.**
