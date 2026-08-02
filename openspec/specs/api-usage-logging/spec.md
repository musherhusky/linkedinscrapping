# Capability: API Usage Logging

## Purpose

Record every paid external API call (Claude, Apify) so spend is visible per user, per day, per provider — enabling plan-limit enforcement, runaway-consumption detection, and accurate billing insight as usage scales.

## Requirements

### Requirement: Log Claude API usage on every batch analysis call
After each call to `analyzeBatch`, the system SHALL record the Anthropic model used, input token count, output token count, and estimated cost in USD to `api_usage_logs`, associated with the triggering user.

#### Scenario: Successful Claude batch analysis
- **WHEN** `analyzeBatch` completes successfully
- **THEN** a row is inserted into `api_usage_logs` with `provider = 'claude'`, the model name, `input_tokens`, `output_tokens`, and `estimated_cost_usd` calculated from the response's `usage` object

#### Scenario: Claude API call fails
- **WHEN** `analyzeBatch` throws an error before receiving a response
- **THEN** no usage row is inserted (nothing to record)

#### Scenario: Usage logging fails after successful Claude call
- **WHEN** `analyzeBatch` returns successfully but inserting the usage row fails
- **THEN** the error is caught and logged without rethrowing, and the caller receives the analysis results normally

#### Scenario: Model has no verified cost rate
- **WHEN** `analyzeBatch` completes successfully using a model absent from `CLAUDE_RATE_TABLE_PER_1K`
- **THEN** a row is still inserted with the exact `input_tokens`/`output_tokens`, but `estimated_cost_usd = NULL` and `rate_snapshot` notes no verified rate was available — a cost is never fabricated for an unrated model

### Requirement: Log Apify actor run usage on every execution
After each Apify actor run completes successfully, the system SHALL record the actor ID, compute units consumed, and estimated cost in USD to `api_usage_logs`, associated with the triggering user (or, for the batched cron path, split proportionally across the users whose posts the run returned).

#### Scenario: Successful Apify actor run
- **WHEN** an actor run finishes with status `SUCCEEDED`
- **THEN** a row is inserted into `api_usage_logs` with `provider = 'apify'`, the actor ID, `compute_units`, and `estimated_cost_usd`

#### Scenario: Apify actor run fails
- **WHEN** an actor run finishes with a non-`SUCCEEDED` status
- **THEN** `runActor` throws before any run stats are returned, so no usage row is inserted for that run — mirrors the Claude "API call fails" behavior

#### Scenario: Apify usage logging fails after successful run
- **WHEN** the actor run completes but inserting the usage row fails
- **THEN** the error is caught and logged without rethrowing, and the caller receives the scraped posts normally

### Requirement: Batched Apify runs split cost proportionally by each user's share of returned posts
One Apify run in the batched cron path (`processAllUsersBatched`) covers all users scheduled for that hour. Its cost SHALL be split proportionally across those users by each user's share of the run's total returned posts for that source type (company, person, or term), not by URL/term count.

#### Scenario: Two users share one batched run
- **WHEN** a batched run returns 3 posts, 2 matching user A's tracked URLs and 1 matching user B's
- **THEN** user A's `api_usage_logs` row gets `2/3` of the run's `estimated_cost_usd`/`compute_units`, and user B's gets `1/3`

#### Scenario: A user's tracked URLs produce no posts in a given run
- **WHEN** a user's active companies/people/terms are included in a batched run but the run returns zero posts matching them
- **THEN** no usage row is written for that user for that run (no cost attributed for zero content received)

### Requirement: API usage data is queryable by user and date range
The system SHALL provide `getApiCostSummary(userId, from, to)`, which aggregates total estimated cost per provider (`claude`, `apify`) from `api_usage_logs`, filterable by `user_id` and date range. The `/api/insights` dashboard (`Content-Type: text/html` — not a JSON endpoint) SHALL render this summary as a "Costes" card alongside its existing cards.

#### Scenario: Aggregating cost summary for a user
- **WHEN** `getApiCostSummary(userId, from, to)` is called for a user with usage rows in the period
- **THEN** it returns total estimated cost broken down by provider (`claude`, `apify`) for the requested period

#### Scenario: No usage data exists for the period
- **WHEN** `getApiCostSummary` is called for a user with no API usage in the requested period
- **THEN** it returns zero values per provider (not absent or null)

### Requirement: Cost estimates use versioned rate snapshots
Each `api_usage_logs` row SHALL store a `rate_snapshot` JSON object capturing the per-unit rates (or cost source) used to compute `estimated_cost_usd` at write time.

#### Scenario: Rate constants are applied at write time
- **WHEN** a Claude usage row is inserted with a verified rate
- **THEN** `rate_snapshot` contains the current values of the rate constants used (`input_cost_per_1k`, `output_cost_per_1k`)

#### Scenario: Apify cost is Apify's own reported total, not a computed rate
- **WHEN** an Apify usage row is inserted
- **THEN** `rate_snapshot` records the cost source (Apify's own `usageTotalUsd`, optionally proportionally split — see the batched-run requirement above) rather than a locally-computed per-unit rate, since Apify reports the actual charge for the run directly
