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
After each Apify actor run completes successfully, the system SHALL record the actor ID, compute units consumed, and estimated cost in USD to `api_usage_logs`, associated with the triggering user (or, for the batched cron path, split proportionally across the users whose posts the run returned). The recorded `compute_units`/`estimated_cost_usd` SHALL reflect Apify's settled figures — obtained by waiting briefly after the run reaches `SUCCEEDED` and re-fetching the run object — not the preliminary figures available immediately at completion.

#### Scenario: Successful Apify actor run
- **WHEN** an actor run finishes with status `SUCCEEDED`
- **THEN** a row is inserted into `api_usage_logs` with `provider = 'apify'`, the actor ID, `compute_units`, and `estimated_cost_usd`

#### Scenario: Apify actor run fails
- **WHEN** an actor run finishes with a non-`SUCCEEDED` status
- **THEN** `runActor` throws before any run stats are returned, so no usage row is inserted for that run — mirrors the Claude "API call fails" behavior

#### Scenario: Apify usage logging fails after successful run
- **WHEN** the actor run completes but inserting the usage row fails
- **THEN** the error is caught and logged without rethrowing, and the caller receives the scraped posts normally

#### Scenario: Recorded cost reflects settled figures, not the preliminary ones available at completion
- **WHEN** a run's `usageTotalUsd` differs between the moment `status` first becomes `SUCCEEDED` and a re-fetch ~10 seconds later (Apify's own documented settlement window)
- **THEN** `runActor` returns `runStats` built from the later, re-fetched values — the preliminary figures at the moment of completion are never used

### Requirement: Every external API call is recorded as a raw run, independent of user attribution
The system SHALL provide `saveApiRun(provider, stats)`, which inserts one row into a new `api_run_logs` table per actual external API call (a Claude `messages.create` call, or an Apify actor run), recording the call's raw provider, model/actor, usage (tokens or compute units), total items returned, and total unsplit cost. This is independent of `api_usage_logs`, which records the cost as attributed (and possibly split) per user.

#### Scenario: Claude call is recorded as a raw run
- **WHEN** `analyzeBatch` completes successfully
- **THEN** a row is inserted into `api_run_logs` with `provider = 'claude'`, the model, `input_tokens`, `output_tokens`, `total_items` (posts analyzed), and `total_cost_usd`

#### Scenario: Apify run is recorded as a raw run
- **WHEN** an Apify actor run (company, person, or term) completes successfully
- **THEN** a row is inserted into `api_run_logs` with `provider = 'apify'`, the actor ID, `source_type`, `compute_units`, `total_items` (posts returned), and `total_cost_usd` (the run's full, unsplit `usageTotalUsd`)

#### Scenario: Raw run logging failure does not block the pipeline
- **WHEN** the `api_run_logs` insert fails
- **THEN** `saveApiRun` logs a warning and returns `null` rather than throwing, and the caller's per-user `saveApiUsage` call still proceeds (with `run_id = NULL`)

### Requirement: Per-user usage rows correlate back to their originating raw run
`api_usage_logs` SHALL have a nullable `run_id` column referencing `api_run_logs.id`. Every `saveApiUsage` call made as a direct or proportionally-split consequence of a given API call SHALL include that call's `run_id`.

#### Scenario: Single-user Apify call correlates to its run
- **WHEN** `processTerms` (or `processUser`/`processPeople`) completes a single-user Apify run
- **THEN** the `api_usage_logs` row written for that user has `run_id` equal to the `api_run_logs` row created for that run

#### Scenario: Batched Apify run's per-user shares all correlate to the same run
- **WHEN** a batched run (`processAllUsersBatched`) splits its cost across multiple users
- **THEN** every `api_usage_logs` row written for that run (one per user that received posts) shares the same `run_id`, allowing the sum of those rows' `estimated_cost_usd` to be reconciled against the single `api_run_logs.total_cost_usd` for that run

#### Scenario: Pre-existing rows and run-logging failures have a null run_id
- **WHEN** an `api_usage_logs` row was written before this change shipped, or `saveApiRun` failed for its run
- **THEN** `run_id` is `NULL` — this is expected and does not block cost tracking for that row

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
