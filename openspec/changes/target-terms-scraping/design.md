## Context

The scraping pipeline currently has two parallel tracks that share the same shape:

- `target_companies` / `target_people` → `getActiveCompanies` / `getActivePeople` → `executeActor` / `executePeopleActor` (each POSTs to a distinct Apify actor keyed by `targetUrls`) → `mapPost(item, 'company' | 'person')` → `processUserPosts` (dedupe + Hallon dispatch or plain save).

`processAllUsersBatched(hourUtc)` runs this once per cron hour across *all* users scheduled for that hour: it gathers every active URL across users, deduplicates URLs globally, calls each Apify actor exactly once for the whole batch, then re-distributes the returned posts back to the user(s) that track each URL (`distributeAndProcess`).

A third table, `target_terms` (`id`, `user_id`, `term`, `active`, `created_at`), now exists for users to track free-text search terms instead of profile URLs. This design adds a third track — terms — that mirrors the company/person shape as closely as the underlying data allows.

The key structural difference: companies/people are *tracked profiles* — every scraped post has a `query.targetUrl` that matches exactly one row the user configured, and profile metadata (followers, avatar, headline) is enriched back onto that same tracked entity. A search term has no such 1:1 "profile" — a term search returns posts from arbitrary, previously-unknown authors. So term-sourced posts flow through the same dedupe/dispatch pipeline, but do **not** participate in target-profile enrichment (`enrichProfilesFromBatch`).

## Goals / Non-Goals

**Goals:**
- Add `getActiveTerms`, `executeTermsActor`, and orchestrator wiring so that on every scheduled run, each user's active terms are searched via Apify and matching posts flow through the existing dedupe → Hallon dispatch pipeline, exactly like companies/people.
- Keep the same batching strategy: one Apify call per term batch per cron hour, not one call per user.
- Add a `processTerms(userId)` legacy function for manual/debug parity with `processUser` / `processPeople`.

**Non-Goals:**
- Determining or hardcoding the specific Apify actor used for term/keyword search — the actor ID comes from a new env var (`APIFY_TERMS_ACTOR_ID`); its exact input schema is confirmed during implementation against the actor's documentation/test run, not assumed here.
- Target-profile enrichment (follower counts, avatar, headline) for term results — terms have no single "owning" profile to enrich.
- Any UI/API work to create/manage `target_terms` rows — the table already exists; this change only covers the scraping/dispatch side.

## Decisions

### 1. Distribution key: term string instead of URL

**Confirmed** via a real (minimal-cost) test run against `buIWk2uOUzTmcLsuB`: each dataset item includes a `query` object shaped like `{ "sortBy": "date", "page": 1, "search": "Vidrala", "postedLimit": "24h" }`. The field that identifies which search term produced the item is `query.search` — a single string, not an array — analogous to but differently named from `query.targetUrl` on company/person items.

To keep `distributeAndProcess`'s existing generic matching pattern working uniformly across all three source types (rather than adding a parallel, differently-shaped code path just for terms), `mapPost()`'s shared `queryTargetUrl` extraction is extended to fall back to `query.search` when `query.targetUrl` is absent:

```js
const queryTargetUrl = item.query?.targetUrl || item.query?.search || null;
```

This way, `distributeAndProcess` gains a third `Set` (`termSet`, built from the user's own active terms) and filters `termPostsAll` by `termSet.has(normalizeTerm(p.queryTargetUrl))`, exactly mirroring how `companySet`/`peopleSet` filter `companyPostsAll`/`peoplePostsAll` — no separate distribution branch, no new field threaded through the pipeline.

Terms are compared case-sensitively but whitespace-trimmed (`term.trim()`), not lowercased like URLs, since search terms may be case-meaningful (e.g. an acronym). No trailing-slash normalization applies (terms aren't URLs) — a separate `normalizeTerm(term) => term?.trim() ?? null` helper is used instead of reusing `normalizeUrl`.

**Alternative considered**: normalize terms the same way as URLs (lowercase). Rejected — collapsing case would silently merge deliberately distinct terms (e.g. "AI" vs "ai" as a company name).

### 2. New `buildTermsActorInput` — the terms actor has a different input shape

**Confirmed** (via `GET https://api.apify.com/v2/acts/buIWk2uOUzTmcLsuB` — a read-only, no-cost lookup of the public actor's input schema, not a run): actor `buIWk2uOUzTmcLsuB` is `harvestapi/linkedin-post-search` ("Linkedin Post Search Scraper (No Cookies)"). Its input schema takes search keywords as `searchQueries: string[]` — **not** `targetUrls`. It also exposes `maxPosts`, `postedLimit` (enum: `any, 1h, 24h, week, month, 3months, 6months, year`), `sortBy`, `scrapeComments`, `maxComments`, `scrapeReactions`, `maxReactions`, `postNestedComments`, `postNestedReactions` — the same field *names* already used by `buildActorInput` for `scrapeComments`/`scrapeReactions`/`maxComments`/`maxReactions`/`postNestedComments`/`postNestedReactions`, confirming this is the same actor vendor (harvestapi) family as the existing company/person actors. It has no `includeQuotePosts`/`includeReposts` fields.

Since `settings.posted_limit` in production only ever takes the value `'1h'` or `'24h'` (per `plans.posted_limit` in `data-model.md` — Free/Basic/Pro use `'24h'`, Corporate uses `'1h'`), and both of those are valid values in this actor's enum, **no value translation is needed** even though `VALID_POSTED_LIMITS` in `lib/config.js` also allows `'7d'/'30d'/'all'` (which this actor would reject) — those values are validated but never actually assigned by any plan today.

Because the input shape genuinely differs (`searchQueries` vs `targetUrls`, no `includeQuotePosts`/`includeReposts`), add a **new** `buildTermsActorInput(terms, settings)` in `lib/apify.js` rather than reusing `buildActorInput`:

```js
function buildTermsActorInput(terms, settings) {
  return {
    searchQueries: terms,
    maxPosts: settings.max_posts_per_company ?? 5,
    postedLimit: settings.posted_limit || '24h',
    scrapeComments: false,
    scrapeReactions: false,
    maxComments: 5,
    maxReactions: 5,
    postNestedComments: false,
    postNestedReactions: false,
  };
}
```

`mapPost(item, 'term')` is still reused as-is for output mapping — the actor's description ("extracts full post content, author profile metadata, timestamps, social engagement metrics, media, repost content...") indicates the same harvestapi post-record shape (`author`, `content`, `postedAt`, `engagement`, `repost`, `repostedBy`, `article`, `contentAttributes`) that `mapPost` already parses, so no new mapping function is needed for the output side — only for the input side.

**Alternative considered**: reuse `buildActorInput` unchanged and just pass terms in the `targetUrls` field. Rejected once the real schema was confirmed — this actor has no `targetUrls` field at all, so that input would be silently ignored by the actor.

### 3. Terms excluded from profile enrichment

`enrichProfilesFromBatch` builds `urlToUsers` only from each user's `companies` and `people` arrays. Term posts are simply not added to that map, so `mapProfileEnrichment` results for term-sourced authors have no matching `urlToUsers` entry and are naturally skipped (empty `userIds` array — no upsert call, no error). This requires no special-casing in `enrichProfilesFromBatch`, only that terms are never mixed into the `companies`/`people` arrays passed to it.

`mapDiscoveredProfiles` (reposter/mention discovery) is independent of that map — it keys only on `item.query?.targetUrl` as a loose `source_url` text with no FK. Term-sourced posts flow through it unchanged, using the term string as `source_url`. This is consistent with `discovered_profile_relations.source_url` already being documented as a loose, unconstrained reference.

### 4. Batching and settings

`processAllUsersBatched` gains a third parallel array, `allTermsAll` (deduplicated across users the same way `allCompanyUrls`/`allPeopleUrls` are), and a third `Promise.all` branch calling `executeTermsActor` when `allTerms.length > 0`. The existing `apifyEnabledUser` / `postedLimit` logic is reused unchanged — terms are gated by the same `settings.apify_enabled` flag as companies/people (no separate toggle).

## Risks / Trade-offs

- **[Search terms can return posts from authors the user never explicitly tracks]** → This is intended behavior (that's the point of term search), but downstream consumers assuming `posts.author_id` always maps to a `target_companies`/`target_people` row (e.g. `list_items` filtering, per `data-model.md`) will simply not match term-sourced posts, which is correct — they're not part of any list.
- **[Case-sensitive term matching could cause duplicate Apify searches if the same term is entered with different casing by different users]** → Acceptable trade-off per Decision 1; documented, not silently "fixed" by normalization that could break intentional case-sensitive terms.
- **[The confirmed live sample shows a nested repost author with `type: "profile"`, not `"person"`]** → `mapPost`'s `authorType` field will store whatever the actor returns verbatim (`"profile"` in that case) for term-sourced reposts. No current production code branches on `authorType === 'person'` (grepped `lib/*.js` — only test fixtures assume `'person'`), so this doesn't break anything today, but it's noted here in case future code adds such a check. Not fixed as part of this change — out of scope, and may already affect the existing person actor too (unconfirmed, pre-existing behavior either way).

## Migration Plan

1. Confirm `target_terms` table already exists in Supabase (per user) — no migration needed for the table itself.
2. Add `APIFY_TERMS_ACTOR_ID` to environment configuration (`.env.example`, Vercel env vars) before merging.
3. Ship `getActiveTerms` + `executeTermsActor` + orchestrator wiring behind normal deploy — no feature flag, since `target_terms` starts empty for all users (zero active terms ⇒ zero behavior change, mirroring how `getActiveCompanies`/`getActivePeople` returning `[]` already short-circuits the pipeline).
4. Rollback: revert the deploy; no destructive schema change is introduced.

## Open Questions

None outstanding. Both prior open questions are resolved:
- Actor: `buIWk2uOUzTmcLsuB` (`harvestapi/linkedin-post-search`, env var `APIFY_TERMS_ACTOR_ID`), input takes `searchQueries: string[]` (see Decision 2).
- Correlation field: `item.query.search` (see Decision 1), confirmed via a real test run.
