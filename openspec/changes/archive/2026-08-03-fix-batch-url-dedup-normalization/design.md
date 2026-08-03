## Context

Two production errors were reported from the Hallon-dispatch flow, both surfacing through `activity_log.error_message`:

1. `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` — `lib/hallon.js:41` calls `response.json()` before checking `response.ok`; any non-JSON response body (HTML error/gateway page) throws this exact error.
2. `new row for relation "posts" violates check constraint "posts_source_type_check"` — Postgres rejecting an insert where `source_type` isn't `'company'`/`'person'`/`'term'`.

**Error 2 root-caused and resolved, no code fix needed**: querying `activity_log` showed all 8 occurrences clustered within a single 7-minute window on 2026-07-31 (12:42–12:49), exactly the window in which the `target-terms-scraping` change was being deployed and its `posts_source_type_check` migration (widening the constraint to allow `'term'`) applied. Every literal `sourceType` value in the current codebase (`lib/orchestrator.js`, `lib/hallon.js`, `lib/apify.js`) was traced and confirmed to be exactly `'company'`/`'person'`/`'term'` — no corruption path exists in the current code. It has not recurred in the 3+ days since, across multiple daily crons, consistent with a deploy-before-migrate ordering gap that has since closed itself.

**Error 1 investigation surfaced a separate, confirmed bug**: pulling the real Apify dataset for the day of a recurring error-1 failure (Mahou San Miguel, 5 occurrences across 5 different days) showed the *same underlying LinkedIn post* appearing twice in the raw dataset, under two different `query.targetUrl` values — `https://www.linkedin.com/company/mahou-san-miguel/` and `https://www.linkedin.com/company/mahou-san-miguel` (no trailing slash). Confirmed the affected user has only one, clean registration (`.../mahou-san-miguel/`) in their own `target_companies` — so the duplicate must come from a *different* user in the same hourly batch registering the same company with the other URL format.

Tracing `processAllUsersBatched`:
- `allCompanyUrls = [...new Set(usersData.flatMap(u => u.companies))]` (line 55) — deduplicates raw, unnormalized URL strings across *all* users in the batch.
- `distributeAndProcess`'s per-user filter (line 137) — `normalizeUrl = url => url.replace(/\/$/, '').toLowerCase()`, then matches posts against `companySet` built from *this user's own* normalized URLs.

Because the batch-level dedup doesn't normalize but the per-user filter does, two users' differently-formatted registrations for the same company cause Apify to be queried twice for that company, and *every* user tracking it — including ones who only registered one clean URL — receives the resulting post twice in their own `userCompanyPosts` (both raw copies normalize to the same string, so both pass the per-user filter). This results in the same post being dispatched to Hallon twice, ~500ms apart (the loop's `delay(500)`).

Whether this duplicate, near-simultaneous dispatch is what causes Hallon to respond with HTML instead of JSON is **not yet confirmed** — that requires seeing Hallon's actual raw response, which isn't currently logged anywhere. This change fixes the confirmed dedup bug and adds the diagnostic logging needed to close out that remaining question, without conflating the two as already-proven cause and effect.

## Goals / Non-Goals

**Goals:**
- Make the batch-level URL dedup normalization-consistent with the per-user matching logic, eliminating duplicate Apify queries and duplicate per-user post delivery for company/person URLs
- Capture Hallon's raw response (status, content-type, body snippet) before JSON parsing, so the next non-JSON response yields real diagnostic evidence

**Non-Goals:**
- Fixing/normalizing the underlying duplicate `target_companies`/`target_people` registrations across users (out of scope — the dedup fix makes this data inconsistency harmless rather than requiring data cleanup)
- Confirming or fixing the actual cause of Hallon's HTML response — that remains open pending evidence from the new logging
- Touching the `posts_source_type_check` constraint or any DB schema (error 2 needs no change)
- Term deduplication — `allTerms` already trims before deduping (`lib/orchestrator.js:57`) and `distributeAndProcess` trims consistently (`lib/orchestrator.js:141`); no inconsistency exists there

## Decisions

### 1. Normalize before the batch-level `Set`, reusing the existing normalize logic

Apply the same `url => url.replace(/\/$/, '').toLowerCase()` normalization (already defined inline in `distributeAndProcess`) to `allCompanyUrls` and `allPeopleUrls` construction in `processAllUsersBatched`, before deduplicating. This is the minimal fix: it doesn't change what gets matched per-user (already normalized), only ensures the *batch-wide* query list and the resulting `companyPostsAll`/`peoplePostsAll` never contain avoidable duplicates in the first place.

**Alternative considered**: normalize URLs at write-time when users register companies/people (`target_companies`/`target_people` INSERT/UPDATE). Rejected for this change — it doesn't fix the batch-level dedup gap for data already in the table, and is a larger, separate concern (input validation) better handled independently if ever needed.

### 2. Diagnostic logging placement and content

In `sendPostToHallon`, after the `fetch()` call and before `response.json()`, log `response.status`, the `content-type` response header, and the first 300 characters of the response body (via `response.clone().text()`, since a `Response` body can only be consumed once — cloning lets us read it as text for logging while the original is still parsed as JSON afterward). Log via the existing `logger` (context `HALLON`), at `warn` level only when `!response.ok` or the body doesn't look like JSON (starts with `{`/`[`), to avoid log noise on the successful path.

### 3. No behavior change

Neither fix alters what gets sent to Hallon, what gets persisted, or how errors are handled — the dedup fix only removes duplicate work, and the logging is additive. Both are safe to ship independently of resolving error 1's root cause.

## Risks / Trade-offs

- **The dedup fix might not actually resolve error 1**: as stated, the causal link between duplicate dispatch and Hallon's HTML response is unconfirmed. If error 1 keeps recurring after this ships, the new logging will show whether duplicate submission is involved or whether it's something else entirely (auth, rate limit, content length, downtime).
- **Cloning the response to log its body adds negligible overhead**: `response.clone()` doesn't re-fetch, just duplicates the readable stream; safe for the response sizes involved here.

## Migration Plan

1. Deploy the two code changes together (both are additive/corrective, no schema change, no rollback risk)
2. Monitor `activity_log` for the next few days: confirm no more Apify-cost duplication for companies/people with cross-user URL-format mismatches, and — if error 1 recurs — inspect the new raw-response log to determine its actual cause
