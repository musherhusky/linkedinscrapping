## Why

A security audit identified several high-severity vulnerabilities across the API layer and library code: XSS in HTML-rendered endpoints, auth bypass when `CRON_SECRET` is unset, secret exposure in URL query parameters, and the Apify token embedded in logged request URLs. All are S-effort fixes with no architectural changes required. They should be addressed before new features land on top of them.

## What Changes

- **XSS mitigation**: All dynamic values interpolated into `api/insights.js` and `api/dashboard.js` HTML templates are escaped through a shared `escapeHtml` utility.
- **Auth fail-closed**: All five API handlers return a 500 (server misconfiguration) instead of being fully public when `CRON_SECRET` is not set in the environment.
- **Remove secret-in-URL fallback**: `req.query.secret` is removed from `api/insights.js` and `api/dashboard.js`; only the `x-vercel-cron-secret` header is accepted.
- **Apify token in Authorization header**: The `?token=` query parameter is replaced with an `Authorization: Bearer` header in all three Apify fetch calls in `lib/apify.js`.
- **Validate `days` parameter**: The `?days=` value in `api/dashboard.js` is clamped to `[1, 365]` to prevent unbounded queries.
- **Generic error responses**: Internal `error.message` is no longer returned to API callers in `api/process-analysis.js` and `api/process-all-users.js`; errors are logged server-side only.
- **Fix Supabase `.not()` string interpolation**: `lib/analyzer.js` passes the array directly instead of hand-building a SQL-like string.

## Capabilities

### New Capabilities

- `html-output-escaping`: A shared `escapeHtml` utility that sanitizes all dynamic values before HTML interpolation in server-rendered endpoints.

### Modified Capabilities

<!-- No spec-level behavior changes — these are security hardening fixes to existing behavior. -->

## Impact

- `api/insights.js`: escapeHtml on all dynamic values; remove `req.query.secret` fallback; fail closed on missing CRON_SECRET.
- `api/dashboard.js`: escapeHtml on all dynamic values; remove `req.query.secret` fallback; fail closed on missing CRON_SECRET; clamp `days` parameter.
- `api/process-all-users.js`, `api/process-apify-dataset.js`, `api/process-analysis.js`: fail closed on missing CRON_SECRET; return generic error messages.
- `lib/apify.js`: move Apify token from URL query param to `Authorization: Bearer` header.
- `lib/analyzer.js`: pass array directly to `.not()` instead of string interpolation.
