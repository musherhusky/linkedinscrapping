## ADDED Requirements

### Requirement: Claude returns canonical and display values per category and topic
The analysis prompt SHALL instruct Claude to return each category and topic as an object with two fields: `display` (the label in the post's original language) and `canonical` (the English-normalized label for grouping). Claude SHALL always return `canonical` in English regardless of the post language.

#### Scenario: Spanish post returns bilingual category
- **WHEN** a post in Spanish about sustainability is analyzed
- **THEN** the result includes a category with `display: "Sostenibilidad"` and `canonical: "Sustainability"`

#### Scenario: English post returns matching canonical and display
- **WHEN** a post in English about artificial intelligence is analyzed
- **THEN** the result includes a topic with `display: "Artificial Intelligence"` and `canonical: "Artificial Intelligence"`

#### Scenario: French post returns English canonical
- **WHEN** a post in French is analyzed
- **THEN** all topic and category `canonical` values are in English

#### Scenario: canonical is never empty
- **WHEN** Claude returns a category or topic
- **THEN** both `display` and `canonical` fields are non-empty strings

### Requirement: saveAnalysisResults stores display and canonical separately
The `saveAnalysisResults` function in `lib/analyzer.js` SHALL map `display` to the `display` column and `canonical` to the `canonical` column in both `post_categories` and `post_topics`.

#### Scenario: Category saved with both fields
- **WHEN** a batch result contains `{ display: "Sostenibilidad", canonical: "Sustainability" }`
- **THEN** `post_categories` row has `display = "Sostenibilidad"` and `canonical = "Sustainability"`

#### Scenario: Forced topic uses user-defined topic as canonical
- **WHEN** a forced topic `{ topic: "Vidrio", mentioned: true, confidence: "high" }` is saved
- **THEN** `post_topics` row has `canonical = "Vidrio"` and `forced = true`

### Requirement: Analytics group by canonical, display for UI
The system SHALL count and group categories and topics by `canonical`. The `display` value SHALL be used only for presentation in the UI.

#### Scenario: Cross-language topic grouping
- **WHEN** posts in Spanish and English both have canonical "Sustainability"
- **THEN** a query grouping by `canonical` returns a single row with the combined count
