## Why

Production investigation of two recurring Hallon-dispatch errors (`Unexpected token '<', "<!DOCTYPE "... is not valid JSON` and `posts_source_type_check` violation) traced the second error to a resolved deploy/migration-ordering issue (no code fix needed — see design.md Context). The first error remains unconfirmed, but investigation surfaced a real, confirmed bug along the way:

`processAllUsersBatched` builds the batch-wide deduplicated URL lists (`allCompanyUrls`, `allPeopleUrls`) by deduplicating raw URL strings without normalizing trailing slashes or casing (`lib/orchestrator.js:55-56`), while the per-user matching logic in `distributeAndProcess` *does* normalize (`lib/orchestrator.js:137`). When two different users in the same hourly batch track the same company/person with a URL that differs only by a trailing slash (confirmed in production: one user has `.../mahou-san-miguel/`, another `.../mahou-san-miguel`), the batch-level dedup treats them as two different targets, queries Apify twice for the same underlying content, and — because the per-user filter normalizes when matching — **every** user tracking that company receives the resulting post duplicated in their own post list, even users who only registered one clean URL variant. This causes duplicate Apify spend and duplicate back-to-back dispatch of the same post to Hallon.

Whether this duplicate dispatch is what triggers Hallon's HTML (non-JSON) response is still unconfirmed. To keep investigating that separately, this change also adds diagnostic logging (status, content-type, and a body snippet) of Hallon's raw response before it's parsed as JSON, so the next occurrence yields real evidence instead of a bare "Unexpected token" message.

## What Changes

- Normalize URLs (strip trailing slash, lowercase) before building the batch-wide deduplicated `allCompanyUrls` / `allPeopleUrls` sets in `processAllUsersBatched`, matching the normalization already used in `distributeAndProcess`'s per-user filtering
- Add diagnostic logging in `sendPostToHallon`: before calling `response.json()`, log `response.status`, the `content-type` header, and the first ~300 characters of the raw response body, without changing any existing behavior or error handling

## Capabilities

### New Capabilities

- `batch-scraping-dedup`: Deduplication of tracked company/person URLs across all users in a batched cron run is normalization-consistent, so cross-user URL-format differences never cause duplicate Apify queries or duplicate per-user post delivery

### Modified Capabilities

- `hallon-dispatch`: raw Hallon response is logged (status/content-type/body snippet) before JSON parsing, for diagnosing non-JSON responses

## Impact

- **`lib/orchestrator.js`**: `processAllUsersBatched` — normalize URLs before building `allCompanyUrls`/`allPeopleUrls`
- **`lib/hallon.js`**: `sendPostToHallon` — add pre-parse diagnostic logging (no behavior change)
- No new npm dependencies, no migration, no API contract changes
