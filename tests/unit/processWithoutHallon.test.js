import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processWithoutHallon } from '../../lib/hallon.js';

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

test('processWithoutHallon logs status extracted on successful save', async () => {
  const persistPostCalls = [];
  const persistLogCalls = [];

  const result = await processWithoutHallon(
    [makePost()],
    'user-1',
    'company',
    {
      persistPost: async (...args) => { persistPostCalls.push(args); },
      persistLog: async (...args) => { persistLogCalls.push(args); },
    }
  );

  assert.equal(persistPostCalls.length, 1);
  assert.equal(persistPostCalls[0][2], 'extracted');
  assert.equal(persistLogCalls.length, 1);
  assert.equal(persistLogCalls[0][2], 'extracted');
  assert.equal(persistLogCalls[0][4], 'Hallon sending disabled');
  assert.deepEqual(result, { sent: 1, failed: 0 });
});

test('processWithoutHallon logs status failed with error message and category when savePost throws', async () => {
  const persistLogCalls = [];

  const result = await processWithoutHallon(
    [makePost()],
    'user-1',
    'company',
    {
      persistPost: async () => { throw new Error('Supabase insert failed'); },
      persistLog: async (...args) => { persistLogCalls.push(args); },
    }
  );

  assert.equal(persistLogCalls.length, 1);
  const [userId, post, status, dispatchResponse, errorMessage, errorType] = persistLogCalls[0];
  assert.equal(userId, 'user-1');
  assert.equal(post.url, makePost().url);
  assert.equal(status, 'failed');
  assert.equal(dispatchResponse, null);
  assert.equal(errorMessage, 'Supabase insert failed');
  assert.equal(errorType, 'supabase');
  assert.deepEqual(result, { sent: 0, failed: 1 });
});

test('processWithoutHallon return shape is unchanged: { sent, failed }', async () => {
  const result = await processWithoutHallon(
    [makePost(), makePost({ url: 'https://www.linkedin.com/feed/update/urn:li:activity:2' })],
    'user-1',
    'company',
    {
      persistPost: async () => {},
      persistLog: async () => {},
    }
  );

  assert.deepEqual(Object.keys(result).sort(), ['failed', 'sent']);
  assert.deepEqual(result, { sent: 2, failed: 0 });
});
