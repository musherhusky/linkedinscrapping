## MODIFIED Requirements

### Requirement: post_categories stores display and canonical columns
The `post_categories` table SHALL have a `display` column (renamed from `category`) containing the label in the post's original language, and a `canonical` column (TEXT, NOT NULL) containing the English-normalized label. Existing rows SHALL be backfilled with `canonical = display` as a default. The `canonical` column SHALL be used for all grouping and counting queries.

#### Scenario: New row inserted with both columns populated
- **WHEN** an analysis result is saved for a Spanish post
- **THEN** `post_categories` row has `display = "Sostenibilidad"` and `canonical = "Sustainability"`

#### Scenario: Historical row backfilled
- **WHEN** the migration runs on a row where `category = "Sustainability"` (English, pre-migration)
- **THEN** that row has `display = "Sustainability"` and `canonical = "Sustainability"`

#### Scenario: Grouping by canonical aggregates multilingual rows
- **WHEN** rows exist with `display = "Sostenibilidad", canonical = "Sustainability"` and `display = "Sustainability", canonical = "Sustainability"`
- **THEN** `SELECT canonical, COUNT(*) FROM post_categories GROUP BY canonical` returns a single row for "Sustainability" with count 2
