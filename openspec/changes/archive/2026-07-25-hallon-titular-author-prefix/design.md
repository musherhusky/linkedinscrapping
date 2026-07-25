## Context

`sendPostToHallon()` (`lib/hallon.js:8-42`) builds the payload sent to Hallon's `/companies/add` endpoint, currently setting `titular: post.title || ''`. `processAndSendToHallon()` (`lib/hallon.js:47-79`) loops over new posts, calls `sendPostToHallon()` for each, then persists the result via `savePost()`/`savelog()`. `post.title` and `post.authorName` both already come from `mapPost()` (`lib/apify.js`), so no upstream scraping change is needed.

## Goals / Non-Goals

**Goals:**
- Posts sent to Hallon carry `[Author Name] - "Title"` as their `titular`, when both an author name and a title are available.
- `posts.titulo` / `activity_log.titulo` keep storing the original, unprefixed title — this is a Hallon-delivery concern only.
- Posts with no title are never sent to Hallon, but are still saved and deduplicated like any other processed post.

**Non-Goals:**
- Backfilling/reformatting previously sent Hallon dispatches or previously stored `dispatch_response` payloads.
- Making this behavior configurable per user (confirmed: applies globally to all users).
- Changing what happens when a post has no author name but does have a title (it's still sent, unprefixed).

## Decisions

**1. `formatHallonTitular(title, authorName)` as a standalone, exported pure function in `lib/hallon.js`.**
Matches the existing project pattern of pure, independently unit-testable mapping functions (`mapPost`, `detectContentType`). Keeping it in `hallon.js` (not `apify.js`) scopes it correctly as a Hallon-delivery concern, not part of the LinkedIn data model — `post.title` remains the single source of truth for the original title everywhere else.
Alternative considered: compute the formatted title inside `mapPost()` and store it as a new field — rejected because it would leak a Hallon-specific concern into the core post-mapping layer and risk it leaking into `savePost()`/`savelog()` by mistake.

**2. Empty-title posts are skipped from the Hallon call but still saved with status `'extracted'`.**
Reuses the existing `'extracted'` status semantics (already used by `processWithoutHallon()` when `send_to_hallon` is off), so no schema or status-enum change is needed. Deduplication still keys off `posts.url`, so the post won't be reprocessed on the next sync.
Alternative considered: drop the post entirely without saving — rejected per explicit decision, since it would cause the post to be rescraped and reconsidered on every sync (no dedup record), wasting Apify calls.

**3. `formatHallonTitular` returns the title unchanged (no brackets) when `authorName` is empty, and returns `''` unchanged when `title` is empty.**
Symmetric handling: never wrap an empty/missing value in `[...]` or `"..."`. In practice `processAndSendToHallon()` guarantees `title` is non-empty before calling `sendPostToHallon()`, so the empty-title branch of `formatHallonTitular` is defensive/unreachable in production but keeps the function correct as a general-purpose utility and simplifies unit testing.

**4. `processAndSendToHallon()` return value gains a `skipped` counter.**
Cheap, backward-compatible addition (existing `sent`/`failed` keys unchanged) that makes the new skip path observable in orchestrator summaries/logs without requiring callers to change.

## Risks / Trade-offs

- **[Risk]** Any post that previously had an empty title and was still sent to Hallon (with `titular: ''`) will now be skipped instead → **Mitigation**: this is the explicitly requested behavior; the post is still saved (`status: 'extracted'`) so no data is lost, only the Hallon dispatch changes.
- **[Risk]** Downstream Hallon-side automation that parsed `titular` expecting the raw title (no brackets) would break → **Mitigation**: out of scope to verify from this codebase; flagged in proposal's Impact section for the user's awareness before shipping.
