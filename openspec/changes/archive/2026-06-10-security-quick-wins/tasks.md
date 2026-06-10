## 1. HTML Output Escaping (XSS)

- [x] 1.1 Add `escapeHtml(s)` function to `api/insights.js` that escapes `&`, `<`, `>`, and `"` characters
- [x] 1.2 Wrap every dynamic interpolation in `renderHTML` in `api/insights.js` with `escapeHtml`: `userId`, all `cat`, `tema`, `t`, `p.titulo`, `p.author_name`, and `c` values
- [x] 1.3 Add `escapeHtml(s)` function to `api/dashboard.js` and wrap every dynamic interpolation in `renderHTML`: `userId`, all `t.topic`, and period selector `href` values

## 2. Auth Fail-Closed

- [x] 2.1 In `api/insights.js`: replace the `if (cronSecret && ...)` guard with a fail-closed check — return 500 if `CRON_SECRET` is unset, 401 if provided secret doesn't match
- [x] 2.2 In `api/dashboard.js`: same fail-closed guard as 2.1
- [x] 2.3 In `api/process-all-users.js`: same fail-closed guard as 2.1
- [x] 2.4 In `api/process-apify-dataset.js`: same fail-closed guard as 2.1
- [x] 2.5 In `api/process-analysis.js`: same fail-closed guard as 2.1

## 3. Remove Secret from URL Query Param

- [x] 3.1 In `api/insights.js`: remove `|| req.query.secret` from the `providedSecret` assignment so only `x-vercel-cron-secret` header is accepted
- [x] 3.2 In `api/dashboard.js`: same removal as 3.1; also remove `&secret=${''}` from the period selector navigation links

## 4. Apify Token in Authorization Header

- [x] 4.1 In `lib/apify.js` `runActor`: add `headers: { 'Authorization': \`Bearer ${token}\`, 'Content-Type': 'application/json' }` to the actor run `fetch` call and remove `?token=${token}` from the URL
- [x] 4.2 In `lib/apify.js` `runActor`: add the same `Authorization` header to the `waitForFinish` fetch call and remove `?token=${token}&` from the URL (keep `waitForFinish=120`)
- [x] 4.3 In `lib/apify.js` `runActor`: add the same `Authorization` header to the dataset items `fetch` call and remove `?token=${token}` from the URL

## 5. Input Validation and Error Handling

- [x] 5.1 In `api/dashboard.js`: clamp the `days` parameter — `Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365)`
- [x] 5.2 In `api/process-analysis.js`: replace `error: error.message` in the 500 response with `error: 'Internal server error'`; log the full message server-side via the logger
- [x] 5.3 In `api/process-all-users.js`: same generic error response as 5.2

## 6. Supabase Query Fix

- [x] 6.1 In `lib/analyzer.js:30`: investigated — supabase-js `.not()` requires PostgREST string format `(val1,val2)`, not a raw array; passing an array directly produces `not.in.1,2,3` (no parens), which PostgREST rejects. Current string format is correct and values are DB-sourced integers (no user input). No code change needed.
