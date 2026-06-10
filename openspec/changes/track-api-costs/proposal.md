## Why

The platform calls two paid external APIs — Anthropic (Claude) and Apify — on every scraping run, but currently logs zero cost or usage data. As the user base grows, there is no visibility into per-user, per-run, or aggregate spend, making it impossible to enforce plan limits, detect runaway consumption, or bill accurately.

## What Changes

- Capture Claude API token usage (`input_tokens`, `output_tokens`) from every `analyzeBatch` call and persist it.
- Capture Apify actor run metadata (compute units, run duration) from every actor execution and persist it.
- Introduce a new `api_usage_logs` table in Supabase to store all external API usage events.
- Expose aggregated cost data through the insights/dashboard API so operators can monitor spend.

## Capabilities

### New Capabilities

- `api-usage-logging`: Record every external API call (Claude and Apify) with provider, model/actor, token/compute-unit counts, estimated cost in USD, and associated user and run context. Each entry links to the triggering batch run.

### Modified Capabilities

<!-- No existing spec-level behavior changes — this is additive instrumentation. -->

## Impact

- `lib/claude.js`: Read `message.usage` after each `client.messages.create` call and emit a usage record.
- `lib/apify.js`: Read actor run stats from the Apify API response after each run completes and emit a usage record.
- `lib/database.js`: New `saveApiUsage` function to insert into `api_usage_logs`.
- Supabase: New `api_usage_logs` table (migration required).
- `api/insights.js` / `api/dashboard.js`: New aggregation queries to surface cost totals.
