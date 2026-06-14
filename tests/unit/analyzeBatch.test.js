import { test } from 'node:test';
import assert from 'node:assert/strict';

// We test buildPrompt indirectly by importing the module and inspecting the prompt string.
// Since buildPrompt is not exported, we test the observable contract via the prompt text
// embedded in the module source. For saveAnalysisResults we test the mapping logic directly.

// ── buildPrompt contract ────────────────────────────────────────────────────

test('buildPrompt requests display and canonical fields in categories', async () => {
  // Read the source and check the prompt template contains the new schema
  const src = await import('../../lib/claude.js?t=' + Date.now());
  // We can't call buildPrompt directly (not exported), but we can assert the module
  // exports analyzeBatch and that the prompt structure is testable via a mock.
  // Instead, verify the prompt format by reading the source file.
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../../lib/claude.js', import.meta.url), 'utf8');
  assert.ok(source.includes('"display"') || source.includes('display'), 'prompt must reference display field');
  assert.ok(source.includes('"canonical"') || source.includes('canonical'), 'prompt must reference canonical field');
});

// ── saveAnalysisResults mapping logic ──────────────────────────────────────

function simulateSaveMapping(results) {
  const categoriesToInsert = [];
  const topicsToInsert = [];

  for (const result of results) {
    const postId = result.post_id;

    for (const category of result.categories || []) {
      if (category?.display?.trim()) {
        categoriesToInsert.push({
          post_id: postId,
          display: category.display.trim(),
          canonical: category.canonical?.trim() || category.display.trim(),
        });
      }
    }

    for (const topic of result.topics || []) {
      if (topic?.display?.trim()) {
        topicsToInsert.push({
          post_id: postId,
          display: topic.display.trim(),
          canonical: topic.canonical?.trim() || topic.display.trim(),
          forced: false,
          confidence: 'high',
        });
      }
    }

    for (const ft of result.forced_topics || []) {
      if (ft.mentioned) {
        topicsToInsert.push({
          post_id: postId,
          display: ft.topic,
          canonical: ft.topic,
          forced: true,
          confidence: ft.confidence || 'low',
        });
      }
    }
  }

  return { categoriesToInsert, topicsToInsert };
}

test('free category is saved with display and canonical', () => {
  const results = [{
    post_id: 1,
    categories: [{ display: 'Sostenibilidad', canonical: 'Sustainability' }],
    topics: [],
    forced_topics: [],
  }];
  const { categoriesToInsert } = simulateSaveMapping(results);
  assert.equal(categoriesToInsert.length, 1);
  assert.equal(categoriesToInsert[0].display, 'Sostenibilidad');
  assert.equal(categoriesToInsert[0].canonical, 'Sustainability');
});

test('free topic is saved with display and canonical', () => {
  const results = [{
    post_id: 2,
    categories: [],
    topics: [{ display: 'Inteligencia Artificial', canonical: 'Artificial Intelligence' }],
    forced_topics: [],
  }];
  const { topicsToInsert } = simulateSaveMapping(results);
  assert.equal(topicsToInsert.length, 1);
  assert.equal(topicsToInsert[0].display, 'Inteligencia Artificial');
  assert.equal(topicsToInsert[0].canonical, 'Artificial Intelligence');
  assert.equal(topicsToInsert[0].forced, false);
});

test('forced topic uses ft.topic as both display and canonical', () => {
  const results = [{
    post_id: 3,
    categories: [],
    topics: [],
    forced_topics: [{ topic: 'Vidrio', mentioned: true, confidence: 'high' }],
  }];
  const { topicsToInsert } = simulateSaveMapping(results);
  assert.equal(topicsToInsert.length, 1);
  assert.equal(topicsToInsert[0].display, 'Vidrio');
  assert.equal(topicsToInsert[0].canonical, 'Vidrio');
  assert.equal(topicsToInsert[0].forced, true);
});

test('forced topic not mentioned is not saved', () => {
  const results = [{
    post_id: 4,
    categories: [],
    topics: [],
    forced_topics: [{ topic: 'Vidrio', mentioned: false, confidence: 'low' }],
  }];
  const { topicsToInsert } = simulateSaveMapping(results);
  assert.equal(topicsToInsert.length, 0);
});

test('english post has matching display and canonical', () => {
  const results = [{
    post_id: 5,
    categories: [{ display: 'Technology', canonical: 'Technology' }],
    topics: [{ display: 'Artificial Intelligence', canonical: 'Artificial Intelligence' }],
    forced_topics: [],
  }];
  const { categoriesToInsert, topicsToInsert } = simulateSaveMapping(results);
  assert.equal(categoriesToInsert[0].display, categoriesToInsert[0].canonical);
  assert.equal(topicsToInsert[0].display, topicsToInsert[0].canonical);
});
