# cron-execution-logging Specification

## Purpose
Provide visibility into scheduled cron batch executions (`processAllUsersBatched`) by persisting an execution record for every run and exposing an authenticated endpoint to review recent executions without relying on Vercel's log stream.

## Requirements

### Requirement: Persist a batch execution record for every cron run
The system SHALL persist exactly one row to `cron_execution_logs` for every invocation of `processAllUsersBatched`, capturing the batch hour, outcome status, users processed, posts sent/failed, duration, and (when applicable) an error message.

#### Scenario: Batch completes successfully
- **WHEN** `processAllUsersBatched` finishes processing all scheduled users for the given hour without throwing
- **THEN** a `cron_execution_logs` row is inserted with `status = 'success'`, `hour_utc` equal to the processed hour, `users_processed` equal to the number of users processed, `posts_sent`/`posts_failed` equal to the aggregated totals across all users, and `duration_ms` reflecting the batch's elapsed time

#### Scenario: No users configured for the batch hour
- **WHEN** `processAllUsersBatched` finds zero users scheduled for the given hour and returns early
- **THEN** a `cron_execution_logs` row is inserted with `status = 'no_users'`, `hour_utc` equal to the requested hour, and `users_processed = 0`

#### Scenario: Batch throws an unexpected error
- **WHEN** `processAllUsersBatched` (or its caller in `api/process-all-users.js`) encounters an unhandled error before completing
- **THEN** a `cron_execution_logs` row is inserted with `status = 'error'`, `hour_utc` equal to the requested hour, and `error_message` containing the error's message

#### Scenario: Logging failure does not affect the batch outcome
- **WHEN** the insert into `cron_execution_logs` itself fails (e.g. a database error)
- **THEN** `processAllUsersBatched` and `/api/process-all-users` still return their normal result/response to the caller, and the logging failure is only recorded via a warning log, never re-thrown

### Requirement: Review recent cron executions via an authenticated endpoint
The system SHALL expose a `CRON_SECRET`-protected endpoint that lists the most recent cron executions in reverse-chronological order, so executions can be reviewed without accessing Vercel's log stream.

#### Scenario: Authorized request lists recent executions
- **WHEN** a GET request to `/api/cron-status` is made with a valid `CRON_SECRET` (via `Authorization: Bearer` or `x-vercel-cron-secret`, matching the existing auth pattern)
- **THEN** the response renders the most recent `cron_execution_logs` rows (default 30, ordered by `started_at` descending), showing hour, status, users processed, posts sent/failed, duration, and error message when present

#### Scenario: Unauthorized request is rejected
- **WHEN** a GET request to `/api/cron-status` is made without a valid `CRON_SECRET`
- **THEN** the response is `401 Unauthorized` and no execution data is returned

#### Scenario: No executions recorded yet
- **WHEN** an authorized request is made to `/api/cron-status` and `cron_execution_logs` has no rows
- **THEN** the response renders successfully with an empty-state message instead of an error
