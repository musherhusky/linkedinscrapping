## ADDED Requirements

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

### Requirement: Log Apify actor run usage on every execution
After each Apify actor run completes, the system SHALL record the actor ID, compute units consumed, and estimated cost in USD to `api_usage_logs`, associated with the triggering user.

#### Scenario: Successful Apify actor run
- **WHEN** an actor run finishes with status `SUCCEEDED`
- **THEN** a row is inserted into `api_usage_logs` with `provider = 'apify'`, the actor ID, `compute_units`, and `estimated_cost_usd`

#### Scenario: Apify actor run fails
- **WHEN** an actor run finishes with a non-`SUCCEEDED` status
- **THEN** a row is still inserted with whatever stats are available and `estimated_cost_usd = 0`

#### Scenario: Apify usage logging fails after successful run
- **WHEN** the actor run completes but inserting the usage row fails
- **THEN** the error is caught and logged without rethrowing, and the caller receives the scraped posts normally

### Requirement: API usage data is queryable by user and date range
The system SHALL expose aggregate API usage (total tokens, total compute units, total estimated cost) per provider, filterable by `user_id` and date range, through the insights API.

#### Scenario: Operator queries cost summary for a user
- **WHEN** the insights endpoint is called with a valid `user_id` and optional `from`/`to` date parameters
- **THEN** the response includes a `api_costs` section with total estimated cost broken down by provider (`claude`, `apify`) for the requested period

#### Scenario: No usage data exists for the period
- **WHEN** the insights endpoint is called for a user with no API usage in the requested period
- **THEN** `api_costs` is returned with zero values (not absent or null)

### Requirement: Cost estimates use versioned rate snapshots
Each `api_usage_logs` row SHALL store a `rate_snapshot` JSON object capturing the per-unit rates used to compute `estimated_cost_usd` at write time.

#### Scenario: Rate constants are applied at write time
- **WHEN** a usage row is inserted
- **THEN** `rate_snapshot` contains the current values of all rate constants used (e.g., `input_cost_per_1k`, `output_cost_per_1k` for Claude; `cost_per_cu` for Apify)
