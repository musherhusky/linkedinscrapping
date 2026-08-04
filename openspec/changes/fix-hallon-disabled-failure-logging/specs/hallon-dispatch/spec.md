## ADDED Requirements

### Requirement: Failed posts are logged to activity_log even when Hallon dispatch is disabled
When a user has `send_to_hallon = false`, `processWithoutHallon` SHALL log any post that fails to save via `savelog(userId, post, 'failed', null, error.message, categorizeError(error.message))`, matching the failure-logging behavior already present in `processAndSendToHallon`.

#### Scenario: A post fails to save when Hallon is disabled
- **WHEN** `processWithoutHallon` attempts to save a post and `savePost` throws an error
- **THEN** a row is inserted into `activity_log` with `status = 'failed'`, the post's `url`/`titulo`, the error's message, and a categorized `error_type`
- **AND** the function's `failed` counter is incremented, same as before this change

#### Scenario: A post saves successfully when Hallon is disabled
- **WHEN** `processWithoutHallon` successfully saves a post
- **THEN** behavior is unchanged: `savePost` and `savelog` are called with `status = 'extracted'`, and `sent` is incremented
