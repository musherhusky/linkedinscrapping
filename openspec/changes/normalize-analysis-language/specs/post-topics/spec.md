## MODIFIED Requirements

### Requirement: post_topics stores display and canonical columns
The `post_topics` table SHALL have a `display` column (renamed from `topic`) containing the label in the post's original language, and a `canonical` column (TEXT, NOT NULL) containing the English-normalized label. Existing rows SHALL be backfilled with `canonical = display`. Forced topics SHALL use the user-defined topic string as both `display` and `canonical`. The `canonical` column SHALL be used for all grouping and counting queries.

#### Scenario: New free topic saved with both fields
- **WHEN** an analysis result contains `{ display: "Inteligencia Artificial", canonical: "Artificial Intelligence" }`
- **THEN** `post_topics` row has `display = "Inteligencia Artificial"`, `canonical = "Artificial Intelligence"`, `forced = false`

#### Scenario: Forced topic uses topic string as canonical
- **WHEN** a forced topic `{ topic: "Vidrio", mentioned: true, confidence: "high" }` is saved
- **THEN** `post_topics` row has `display = "Vidrio"`, `canonical = "Vidrio"`, `forced = true`

#### Scenario: Historical row backfilled
- **WHEN** the migration runs on a row where `topic = "Artificial Intelligence"`
- **THEN** that row has `display = "Artificial Intelligence"` and `canonical = "Artificial Intelligence"`

#### Scenario: Grouping by canonical aggregates multilingual rows
- **WHEN** rows exist with `display = "IA", canonical = "Artificial Intelligence"` and `display = "Artificial Intelligence", canonical = "Artificial Intelligence"`
- **THEN** `SELECT canonical, COUNT(*) FROM post_topics GROUP BY canonical` returns a single row for "Artificial Intelligence" with count 2
