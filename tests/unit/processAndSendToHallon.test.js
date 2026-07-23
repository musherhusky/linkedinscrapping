import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processAndSendToHallon } from '../../lib/hallon.js';

function makePost(overrides = {}) {
  return {
    url: 'https://www.linkedin.com/feed/update/urn:li:activity:1',
    title: 'Great news',
    authorName: 'Acme Corp',
    description: 'Some content',
    publishedDate: '2026-07-23T10:00:00Z',
    ...overrides,
  };
}

test('processAndSendToHallon skips the Hallon call for posts with an empty title', async () => {
  const dispatchCalls = [];
  const persistPostCalls = [];
  const persistLogCalls = [];

  const result = await processAndSendToHallon(
    [makePost({ title: '' })],
    'user-1',
    {},
    'company',
    {
      dispatch: async (...args) => { dispatchCalls.push(args); return {}; },
      persistPost: async (...args) => { persistPostCalls.push(args); },
      persistLog: async (...args) => { persistLogCalls.push(args); },
    }
  );

  assert.equal(dispatchCalls.length, 0, 'Hallon dispatch must not be called');
  assert.equal(persistPostCalls.length, 1);
  assert.equal(persistPostCalls[0][2], 'extracted', 'post must be saved with status extracted');
  assert.equal(persistLogCalls.length, 1);
  assert.equal(persistLogCalls[0][2], 'extracted');
  assert.deepEqual(result, { sent: 0, failed: 0, skipped: 1 });
});

test('processAndSendToHallon dispatches posts with a non-empty title using the formatted titular', async () => {
  const dispatchCalls = [];
  const persistPostCalls = [];

  const result = await processAndSendToHallon(
    [makePost()],
    'user-1',
    {},
    'company',
    {
      dispatch: async (post) => { dispatchCalls.push(post); return { id: 'hallon-1' }; },
      persistPost: async (...args) => { persistPostCalls.push(args); },
      persistLog: async () => {},
    }
  );

  assert.equal(dispatchCalls.length, 1);
  assert.equal(dispatchCalls[0].title, 'Great news');
  assert.equal(persistPostCalls[0][2], 'sent');
  assert.deepEqual(result, { sent: 1, failed: 0, skipped: 0 });
});
