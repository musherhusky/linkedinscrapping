## Context

`lib/hallon.js` has two post-processing paths, chosen per-user by `settings.send_to_hallon`:
- `processAndSendToHallon` — dispatches to the Hallon API; on failure, calls `persistLog(userId, post, 'failed', null, error.message, categorizeError(error.message))` (defaults to `savelog`) before incrementing `failed`.
- `processWithoutHallon` — just calls `savePost` with `status: 'extracted'`; on failure, only `logger.error(...)` (console) before incrementing `failed` — no `activity_log` row.

Found via the new `cron_execution_logs` visibility feature: a batch reported `posts_failed: 4`, but `activity_log` had zero `status = 'failed'` rows for that window, because the affected users had `send_to_hallon = false`.

## Goals / Non-Goals

**Goals:**
- `processWithoutHallon`'s failure path logs to `activity_log` with the same shape (`status`, `error_message`, `error_type`) as `processAndSendToHallon`'s failure path, so failed posts are diagnosable regardless of the user's Hallon setting
- Add unit test coverage for `processWithoutHallon`, which currently has none (only mocked in orchestrator-level tests)

**Non-Goals:**
- Changing `processWithoutHallon`'s return shape (`{ sent, failed }`) or its success-path behavior
- Retrying or backfilling the 4 already-lost failures from the batch that surfaced this gap — no trace of their URLs exists to retry
- Touching `processAndSendToHallon` (already logs failures correctly)

## Decisions

### 1. Reuse `savelog`/`categorizeError`, mirroring `processAndSendToHallon` exactly

`processWithoutHallon`'s catch block gets one added line: `await savelog(userId, post, 'failed', null, error.message, categorizeError(error.message))`. `categorizeError` is already exported-in-module-scope in `lib/hallon.js` (not exported from the module, but usable directly since both functions live in the same file) — no new import needed. This keeps both failure paths structurally identical, so any future change to failure-logging shape only needs to happen in one place conceptually (both call sites use the same helper).

### 2. Log call failure is non-fatal, matching the rest of the codebase's logging convention

`savelog` already catches its own errors internally and returns `false` without throwing (see `lib/database.js`) — so adding this call cannot introduce a new failure mode into `processWithoutHallon`'s loop.

## Risks / Trade-offs

- **None identified** — this is a strictly additive logging call in an existing catch block, using an already-proven helper (`savelog`) and pattern (`processAndSendToHallon`'s identical catch block). No behavior change to `sent`/`failed` counts, no new dependencies, no migration.
