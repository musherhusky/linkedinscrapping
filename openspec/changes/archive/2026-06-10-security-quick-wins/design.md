## Context

The platform serves HTML dashboards from `api/insights.js` and `api/dashboard.js` using string template literals. Dynamic data — including `userId` from query params and topic/category/title strings from Apify-scraped LinkedIn content — is interpolated without escaping. The same endpoints accept the shared `CRON_SECRET` via a URL query param as a convenience fallback, which causes it to appear in Vercel logs and browser history.

`lib/apify.js` similarly embeds the Apify API token in all three request URLs, making it visible in any HTTP logging layer. All five API handlers silently become fully public if `CRON_SECRET` is absent from the environment.

These are independent, localized fixes. No new dependencies or architectural changes are required.

## Goals / Non-Goals

**Goals:**
- Eliminate XSS surface in the two HTML-rendering endpoints.
- Make auth fail closed (deny by default) when `CRON_SECRET` is unset.
- Stop placing secrets in URL positions that get logged.
- Prevent unbounded database queries via the `?days=` parameter.
- Stop leaking internal error messages to API callers.
- Remove the hand-built SQL string in `lib/analyzer.js`.

**Non-Goals:**
- Per-user authentication or authorization (separate architectural concern).
- Row Level Security or Supabase key strategy changes.
- Adding rate limiting or abuse protection.
- Fixing the broken navigation links in `dashboard.js` (separate UX issue).

## Decisions

### 1. Inline `escapeHtml` utility, not a new dependency

A minimal 4-replacement function handles `&`, `<`, `>`, `"`. It lives as a module-level function in each file that needs it, or in a small shared `lib/html.js` if both files import it.

**Rationale**: No new npm dependency for a 4-line function. Keeps the fix self-contained and auditable. DOMPurify and similar libraries are for browser contexts.

### 2. `CRON_SECRET` must be set — no fallback, no silent pass-through

If `process.env.CRON_SECRET` is falsy, return `500 { error: 'Server misconfiguration' }` immediately. This makes missing config visible as an operational failure rather than a silent security bypass.

**Rationale**: Fail-open defaults are the root cause of this class of vulnerability. A 500 in staging will be caught; an open endpoint in prod may not.

### 3. Accept secret only via `x-vercel-cron-secret` header

Remove `|| req.query.secret` from `insights.js` and `dashboard.js`. Vercel's own cron runner sends the header natively; there is no legitimate use case for URL-based secrets.

### 4. Apify token via `Authorization: Bearer` header

All three `fetch` calls in `runActor` get `headers: { 'Authorization': 'Bearer ${token}', 'Content-Type': 'application/json' }`. The `?token=` suffix is removed from all three URL strings. Apify's REST API accepts both; Bearer header is the documented secure method.

### 5. `days` clamped with `Math.min / Math.max`

```js
const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
```

Single line, no library, no separate validation function.

## Risks / Trade-offs

- **`escapeHtml` misses a callsite** → Any unescaped interpolation remains vulnerable. Mitigation: after implementing, grep for all `${` in `renderHTML` functions to verify completeness.
- **Removing query secret breaks existing bookmarks** → Anyone who bookmarked `/api/insights?userId=x&secret=y` loses access. Mitigation: acceptable for a security fix; these URLs should never have been shared.
- **Apify API compatibility** → Apify has supported Bearer auth for years; this is not a behavioral risk.

## Migration Plan

1. Deploy updated files — no DB migration, no data changes.
2. Verify `CRON_SECRET` is set in all environments before deploying (will return 500 if not).
3. Update any bookmarks or integrations using `?secret=` query params.
4. Rollback: revert the file changes — no persistent side effects.

## Open Questions

- Should `escapeHtml` live in a shared `lib/html.js` or be duplicated in each endpoint file? (Two files total — inline duplication is acceptable here.)
