## Why

Discovered while reviewing the first `cron_execution_logs` row (`cron-execution-visibility`): a batch reported 4 failed posts, but `SELECT * FROM activity_log WHERE status = 'failed'` for that time window returned zero rows. Root cause: `processWithoutHallon` (used when a user has `send_to_hallon = false`) increments its `failed` counter on a `savePost` error but never calls `savelog`, unlike `processAndSendToHallon`'s failure path, which does. So for users with Hallon disabled, failed posts are invisible everywhere except the aggregate count — no URL, no error message, no way to diagnose or retry.

## What Changes

- `processWithoutHallon`'s catch block SHALL call `savelog(userId, post, 'failed', null, error.message, categorizeError(error.message))`, mirroring `processAndSendToHallon`'s existing failure-logging behavior
- No change to `processWithoutHallon`'s return shape (`{ sent, failed }`) or its success-path behavior

## Capabilities

### Modified Capabilities
- `hallon-dispatch`: failed posts are now logged to `activity_log` regardless of whether `send_to_hallon` is enabled or disabled for the user

## Impact

- **`lib/hallon.js`**: `processWithoutHallon`'s catch block
- **Tests**: new/updated unit test(s) for `processWithoutHallon`'s failure path (currently has zero direct unit test coverage — only mocked in orchestrator tests)
- No database migration, no API changes, no new dependencies
