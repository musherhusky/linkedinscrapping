## Why

Categories and topics extracted from LinkedIn posts are stored in the language of the post, causing "Sostenibilidad", "Sustainability", and "Durabilité" to be treated as three separate values. This fragments counts and makes cross-language analytics impossible.

## What Changes

- The Claude analysis prompt is updated to return a `canonical` field (English) alongside the existing `display` field (original post language) for each category and topic.
- `post_categories` and `post_topics` tables gain a `canonical` column (TEXT, NOT NULL) to store the English-normalized value.
- All analytics queries group and count by `canonical`; the UI displays `display` (the language-native label).
- Historical rows (without `canonical`) are backfilled by running a one-off analysis pass that sets `canonical = display` as a safe default, or left as-is with a NULL sentinel that analytics queries handle gracefully.

## Capabilities

### New Capabilities

- `post-analysis-canonical`: Bilingual storage of extracted categories and topics — canonical English key for grouping, display value in the post's original language.

### Modified Capabilities

- `post-categories`: `post_categories` table gains a `canonical` column; insert and query logic changes.
- `post-topics`: `post_topics` table gains a `canonical` column; insert and query logic changes.

## Impact

- **Database**: `ALTER TABLE post_categories ADD COLUMN canonical TEXT`, same for `post_topics`. Migration required.
- **`lib/claude.js`**: `buildPrompt()` updated to request `canonical` (English) + `display` (original language) per result item.
- **`lib/analyzer.js`**: `saveAnalysisResults()` maps new fields into the canonical/display columns.
- **No new npm dependencies.**
- **Frontend**: Any analytics query grouping by `category` or `topic` must switch to grouping by `canonical`. Display layer shows `display` value.
- **Historical data**: Existing rows have no `canonical`; backfill strategy needed (see design).
