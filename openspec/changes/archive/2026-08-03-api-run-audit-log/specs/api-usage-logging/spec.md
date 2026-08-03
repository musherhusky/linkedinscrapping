## ADDED Requirements

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
