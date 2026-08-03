import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendPostToHallon } from '../../lib/hallon.js';

function withEnv(vars, fn) {
  const original = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return fn().finally(() => {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });
}

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

test('sendPostToHallon logs status/content-type/body snippet before throwing on a non-JSON response', async (t) => {
  await withEnv({ HALLON_TOKEN: 'fake-token', HALLON_SID: '1', HALLON_TEMA_ID: '1' }, async () => {
    const htmlBody = '<!DOCTYPE html><html><body>Gateway Timeout</body></html>';

    t.mock.method(global, 'fetch', async () => new Response(htmlBody, {
      status: 504,
      headers: { 'content-type': 'text/html' },
    }));

    const warnCalls = [];
    t.mock.method(console, 'log', (...args) => { warnCalls.push(args.join(' ')); });

    await assert.rejects(
      () => sendPostToHallon(makePost(), {}),
      /Unexpected token/
    );

    const loggedText = warnCalls.join('\n');
    assert.match(loggedText, /504/, 'must log the HTTP status');
    assert.match(loggedText, /text\/html/, 'must log the content-type header');
    assert.match(loggedText, /Gateway Timeout/, 'must log a snippet of the raw body');
  });
});

test('sendPostToHallon is unaffected by the diagnostic logging on a normal JSON success response', async (t) => {
  await withEnv({ HALLON_TOKEN: 'fake-token', HALLON_SID: '1', HALLON_TEMA_ID: '1' }, async () => {
    t.mock.method(global, 'fetch', async () => new Response(JSON.stringify({ id: 'hallon-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const data = await sendPostToHallon(makePost(), {});

    assert.deepEqual(data, { id: 'hallon-1' });
  });
});
