## MODIFIED Requirements

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
