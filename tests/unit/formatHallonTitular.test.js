import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatHallonTitular } from '../../lib/hallon.js';

test('formatHallonTitular prefixes title with author name', () => {
  const result = formatHallonTitular('Great news', 'Acme Corp');

  assert.equal(result, '[Acme Corp] - "Great news"');
});

test('formatHallonTitular returns title unprefixed when authorName is null', () => {
  const result = formatHallonTitular('Great news', null);

  assert.equal(result, 'Great news');
});

test('formatHallonTitular returns title unprefixed when authorName is empty string', () => {
  const result = formatHallonTitular('Great news', '');

  assert.equal(result, 'Great news');
});

test('formatHallonTitular returns empty string when title is empty, regardless of authorName', () => {
  assert.equal(formatHallonTitular('', 'Acme Corp'), '');
  assert.equal(formatHallonTitular('', null), '');
});
