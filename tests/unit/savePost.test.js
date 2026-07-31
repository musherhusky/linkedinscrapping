import { test } from 'node:test';
import assert from 'node:assert/strict';

// savePost() has no dependency injection (mirrors getActiveCompanies/getActivePeople,
// which also have no test coverage) — following the existing "savePost content_type
// mapping" simulation-style test in mapPost.test.js, we test the exact insert-mapping
// expression directly rather than mocking the whole Supabase insert call.

function simulateSearchTermMapping(post, sourceType) {
  return sourceType === 'term' ? (post.queryTargetUrl || null) : null;
}

test('savePost search_term mapping: term-sourced posts store the originating term', () => {
  const post = { queryTargetUrl: 'Vidrala' };
  assert.equal(simulateSearchTermMapping(post, 'term'), 'Vidrala');
});

test('savePost search_term mapping: company posts store null', () => {
  const post = { queryTargetUrl: 'https://www.linkedin.com/company/vidrala' };
  assert.equal(simulateSearchTermMapping(post, 'company'), null);
});

test('savePost search_term mapping: person posts store null', () => {
  const post = { queryTargetUrl: 'https://www.linkedin.com/in/someone' };
  assert.equal(simulateSearchTermMapping(post, 'person'), null);
});

test('savePost search_term mapping: term-sourced post with no queryTargetUrl stores null', () => {
  const post = {};
  assert.equal(simulateSearchTermMapping(post, 'term'), null);
});
