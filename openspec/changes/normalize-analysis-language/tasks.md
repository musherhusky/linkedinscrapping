## 1. Database Migration

- [x] 1.1 Create `docs/migrations/normalize_analysis_language.sql`: rename `post_categories.category` → `display`, add `canonical TEXT NOT NULL DEFAULT ''`, backfill `canonical = display`; same for `post_topics.topic` → `display`
- [ ] 1.2 Run the migration in Supabase SQL editor and verify columns exist and backfill is correct

## 2. Unit Tests (TDD — write before implementation)

- [x] 2.1 Create `tests/unit/analyzeBatch.test.js` with failing tests: verify `buildPrompt()` output contains "canonical" and "display" instructions; verify `saveAnalysisResults()` maps `display` and `canonical` fields correctly for free topics, forced topics, and categories

## 3. Prompt Update

- [x] 3.1 Update `buildPrompt()` in `lib/claude.js` to request `{ display, canonical }` objects instead of plain strings for categories and topics, with explicit instruction that `canonical` must always be in English

## 4. Save Logic Update

- [x] 4.1 Update `saveAnalysisResults()` in `lib/analyzer.js` to map `result.categories` as `{ display, canonical }` objects into `post_categories` (columns: `display`, `canonical`)
- [x] 4.2 Update `saveAnalysisResults()` in `lib/analyzer.js` to map `result.topics` as `{ display, canonical }` objects into `post_topics` (columns: `display`, `canonical`)
- [x] 4.3 Update forced topics saving: use `ft.topic` as both `display` and `canonical` for `post_topics` rows with `forced = true`

## 5. Dashboard and Insights Query Updates

- [x] 5.1 Update `api/dashboard.js`: change `select('topic')` → `select('canonical, display')`, `map[t.topic]` → `map[t.canonical]`, and `escapeHtml(t.topic)` → `escapeHtml(t.display)` in the trending topics section
- [x] 5.2 Update `api/insights.js`: change all `select('..., category')` → `select('..., display, canonical')` and `select('topic, ...')` → `select('canonical, display, ...')` in the 5 parallel queries
- [x] 5.3 Update `api/insights.js`: change `countBy(categorias, 'category')` → `countBy(categorias, 'canonical')`, `countBy(temas, 'topic')` → `countBy(temas, 'canonical')`, `countBy(temasForzados, 'topic')` → `countBy(temasForzados, 'canonical')`
- [x] 5.4 Update `api/insights.js`: change `semanas[key][t.topic]` → `semanas[key][t.canonical]` for weekly trend counting
- [x] 5.5 Update `api/insights.js`: change `postsRicosMap[r.post_id].categorias.push(r.category)` → `push(r.display)` (display value for rendering)

## 6. Verification

- [x] 6.1 Verify unit tests from 2.1 now pass
- [ ] 6.2 Run `api/process-analysis.js` manually for one user and confirm `post_categories` and `post_topics` rows have both `display` and `canonical` populated correctly
- [ ] 6.3 Open dashboard and insights in browser and confirm topics and categories render correctly with no broken references

## 7. Documentation

- [x] 7.1 Update `docs/data-model.md` to document `display` and `canonical` columns in `post_categories` and `post_topics`
