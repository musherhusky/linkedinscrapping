## ADDED Requirements

### Requirement: Hallon titular is prefixed with the author name
When a post is sent to Hallon, the `titular` field SHALL be formatted as `[authorName] - "title"`, where `authorName` is the LinkedIn company or person that authored the post and `title` is the post's original title. If `authorName` is empty or null, `titular` SHALL be the title unprefixed. This formatting SHALL NOT affect `posts.titulo` or `activity_log.titulo`, which SHALL continue to store the original, unprefixed title.

#### Scenario: Post with author name and title
- **WHEN** a post has `title = "Great news"` and `authorName = "Acme Corp"`
- **THEN** the Hallon payload's `titular` is `[Acme Corp] - "Great news"`
- **AND** `posts.titulo` for that post remains `"Great news"`

#### Scenario: Post with title but no author name
- **WHEN** a post has `title = "Great news"` and `authorName = null`
- **THEN** the Hallon payload's `titular` is `"Great news"` (unprefixed)

### Requirement: Posts with an empty title are not sent to Hallon
When a post's `title` is empty, the system SHALL NOT call the Hallon API for that post. The post SHALL still be persisted via `savePost` with `status = 'extracted'` and logged via `savelog` with `status = 'extracted'`, so it is deduplicated normally on subsequent syncs.

#### Scenario: Post with empty title
- **WHEN** `processAndSendToHallon` processes a post with `title = ''`
- **THEN** the Hallon API is not called for that post
- **AND** the post is saved with `status = 'extracted'`
- **AND** the post is not reprocessed on the next sync (deduplicated by `url`)

#### Scenario: Post with non-empty title
- **WHEN** `processAndSendToHallon` processes a post with `title = "Great news"`
- **THEN** the Hallon API is called for that post as before
