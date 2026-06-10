# Spec: HTML Output Escaping & API Security

## Purpose

Defines security requirements for API handlers in this project, covering XSS prevention through HTML escaping, fail-closed authentication, secure secret transport, safe external API token handling, input clamping, and generic error responses.

## Requirements

### Requirement: All dynamic values in HTML responses are HTML-escaped
Any value interpolated into an HTML response by `api/insights.js` or `api/dashboard.js` SHALL be passed through an `escapeHtml` function before insertion. This includes values from query parameters, database records, and any derived data.

#### Scenario: userId from query param is rendered in HTML
- **WHEN** a request includes a `userId` query parameter containing `<script>alert(1)</script>`
- **THEN** the HTML response contains `&lt;script&gt;alert(1)&lt;/script&gt;` and no script executes

#### Scenario: Post title from database contains HTML characters
- **WHEN** a scraped post title contains `<b>hello</b>` and is rendered in the dashboard table
- **THEN** the response contains `&lt;b&gt;hello&lt;/b&gt;` as literal text, not rendered HTML

#### Scenario: Topic name from database contains a double-quote
- **WHEN** a topic name contains `AI "hype"` and is rendered in a tag span
- **THEN** the response contains `AI &quot;hype&quot;` and no attribute injection occurs

### Requirement: API handlers fail closed when CRON_SECRET is not configured
Every API handler that checks `CRON_SECRET` SHALL return HTTP 500 with `{ "error": "Server misconfiguration" }` if `process.env.CRON_SECRET` is falsy, rather than allowing unauthenticated access.

#### Scenario: CRON_SECRET env var is not set
- **WHEN** any API endpoint is called and `process.env.CRON_SECRET` is undefined or empty
- **THEN** the response is HTTP 500 with body `{ "error": "Server misconfiguration" }` regardless of the request's credentials

#### Scenario: CRON_SECRET env var is set and correct secret is provided
- **WHEN** `process.env.CRON_SECRET` is set and the request provides the matching value in `x-vercel-cron-secret`
- **THEN** the request proceeds normally

#### Scenario: CRON_SECRET env var is set and wrong secret is provided
- **WHEN** `process.env.CRON_SECRET` is set and the request provides a non-matching value
- **THEN** the response is HTTP 401

### Requirement: CRON_SECRET is accepted only via request header
The `api/insights.js` and `api/dashboard.js` endpoints SHALL NOT accept `CRON_SECRET` via the `secret` query parameter. Only the `x-vercel-cron-secret` request header is a valid secret carrier.

#### Scenario: Secret provided via query parameter is rejected
- **WHEN** a request to `/api/insights` includes `?secret=<valid-secret>` but no `x-vercel-cron-secret` header
- **THEN** the response is HTTP 401

#### Scenario: Secret provided via header is accepted
- **WHEN** a request includes a valid `x-vercel-cron-secret` header
- **THEN** the request proceeds normally

### Requirement: Apify API token is sent in Authorization header, not URL
All HTTP requests made by `lib/apify.js` to the Apify REST API SHALL include the token as `Authorization: Bearer <token>` and SHALL NOT include `?token=` in the request URL.

#### Scenario: Apify actor run is initiated
- **WHEN** `executeActor` or `executePeopleActor` is called
- **THEN** the outgoing fetch request to Apify includes `Authorization: Bearer <token>` header and the URL contains no `token=` parameter

### Requirement: The `days` query parameter is clamped to a safe range
The `api/dashboard.js` endpoint SHALL clamp the `days` parameter to the range `[1, 365]`. Values outside this range are silently adjusted to the nearest bound.

#### Scenario: days=0 is requested
- **WHEN** `/api/dashboard?days=0` is called
- **THEN** the query uses `days=1`

#### Scenario: days=99999 is requested
- **WHEN** `/api/dashboard?days=99999` is called
- **THEN** the query uses `days=365`

### Requirement: Internal error details are not returned to API callers
API handlers that catch unhandled errors SHALL log the full error server-side and return a generic `{ "error": "Internal server error" }` message to the caller without including `error.message` or stack traces.

#### Scenario: An unhandled exception occurs during request processing
- **WHEN** an API handler catches an unexpected error
- **THEN** the response body contains `{ "success": false, "error": "Internal server error" }` and does not include the original exception message
