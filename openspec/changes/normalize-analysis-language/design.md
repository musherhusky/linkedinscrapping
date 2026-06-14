## Context

`lib/claude.js` returns categories and topics in the language of the post being analyzed. `lib/analyzer.js` saves these values directly into `post_categories.category` and `post_topics.topic`. When analytics queries group by these columns, multilingual equivalents ("Sostenibilidad", "Sustainability", "Durabilité") produce separate rows, fragmenting counts.

The fix requires changes at three layers: the Claude prompt (return two fields per item), the database schema (add a `canonical` column to both tables), and the save logic (populate `canonical` from the new field).

## Goals / Non-Goals

**Goals:**
- Every category and topic stored has a `canonical` (English) value for grouping.
- The original language label is preserved in a `display` column for UI rendering.
- Analytics queries use `canonical` for counting and grouping.
- Existing rows are backfilled with a safe default.

**Non-Goals:**
- Modifying frontend analytics queries (separate concern).
- Translating historical `display` values retroactively via Claude (cost/complexity).
- Supporting languages other than English as the canonical language.

## Decisions

### 1. Rename `category`/`topic` columns to `display`, add `canonical`

Rather than adding a new column alongside the existing one, rename `category` → `display` in `post_categories` and `topic` → `display` in `post_topics`. This makes the schema self-documenting and avoids a confusing dual-column naming (`category` + `canonical`).

**Alternative**: Keep `category`/`topic` as-is and add `canonical` alongside. Rejected — leaves an ambiguous schema where `category` means "display value" but is not named as such.

**Migration**: `ALTER TABLE post_categories RENAME COLUMN category TO display; ALTER TABLE post_categories ADD COLUMN canonical TEXT;` — same pattern for `post_topics`.

### 2. Claude returns `display` + `canonical` per item in the same JSON structure

Update `buildPrompt()` to request:
```json
{
  "categories": [{ "display": "Sostenibilidad", "canonical": "Sustainability" }],
  "topics": [{ "display": "Inteligencia Artificial", "canonical": "Artificial Intelligence" }],
  "forced_topics": [{ "topic": "...", "canonical": "...", "mentioned": true, "confidence": "high" }]
}
```

Claude already understands multilingual content; adding `canonical` as "always in English" is a low-effort prompt change with high reliability.

**Alternative**: Post-process topics through a second Claude call to normalize. Rejected — doubles API cost and latency per batch.

### 3. Backfill: set `canonical = display` for existing rows

Existing rows have no `canonical`. A migration sets `canonical = display` (or `canonical = topic` before rename) as a best-effort default. This is semantically wrong for non-English rows but avoids NULL-handling complexity and allows analytics to work immediately after deploy.

**Alternative**: Leave `canonical` NULL for historical rows and handle NULLs in queries. Rejected — complicates every analytics query with a COALESCE.

**Alternative**: Run a Claude backfill pass to translate historical rows. Deferred — valid but expensive; can be done as a follow-up task if historical accuracy matters.

### 4. `forced_topics` use `canonical` field too

`forced_topics` items already have a `topic` string (user-defined). Add `canonical` to the prompt response for consistency, but in `saveAnalysisResults` use the user-defined `topic` value as `canonical` (since forced topics are user-controlled and already in the user's preferred language). Store them with `forced: true` and `canonical = topic`.

## Risks / Trade-offs

- **Claude canonical accuracy**: Claude may occasionally return a non-English canonical or an inconsistent English form ("AI" vs "Artificial Intelligence"). → Mitigation: the prompt explicitly states canonical must be in English; inconsistency is an acceptable trade-off vs. a full translation layer.
- **Column rename breaks existing queries**: Any query referencing `post_categories.category` or `post_topics.topic` will break. → Mitigation: search codebase for all references and update before deploying migration.
- **Backfill is semantically wrong for non-English rows**: Historical rows will have `canonical = "Sostenibilidad"` instead of `"Sustainability"`. → Mitigation: document clearly; analytics accuracy improves from the deploy date forward.

## Migration Plan

1. Search codebase for all references to `post_categories.category` and `post_topics.topic` — update to `display`.
2. Run `docs/migrations/normalize_analysis_language.sql` in Supabase SQL editor (rename columns, add `canonical`, backfill).
3. Deploy updated `lib/claude.js` and `lib/analyzer.js`.
4. Verify next analysis run populates both `display` and `canonical`.

Rollback: revert column rename with `ALTER TABLE post_categories RENAME COLUMN display TO category; ALTER TABLE post_categories DROP COLUMN canonical;` — same for `post_topics`. Redeploy previous backend.

## Open Questions

- None blocking implementation.
