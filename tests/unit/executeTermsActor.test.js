import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeTermsActor } from '../../lib/apify.js';

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

test('executeTermsActor throws when APIFY_TERMS_ACTOR_ID is missing', async (t) => {
  await withEnv({ APIFY_TERMS_ACTOR_ID: undefined, APIFY_TOKEN: 'fake-token' }, async () => {
    await assert.rejects(
      () => executeTermsActor(['b2b sales'], {}),
      /APIFY_TERMS_ACTOR_ID/
    );
  });
});

test('executeTermsActor throws when APIFY_TOKEN is missing', async (t) => {
  await withEnv({ APIFY_TERMS_ACTOR_ID: 'buIWk2uOUzTmcLsuB', APIFY_TOKEN: undefined }, async () => {
    await assert.rejects(
      () => executeTermsActor(['b2b sales'], {}),
      /APIFY_TOKEN/
    );
  });
});

test('executeTermsActor sends searchQueries (not targetUrls) and maps results with sourceType "term"', async (t) => {
  const requestBodies = [];

  t.mock.method(global, 'fetch', async (url, options) => {
    const urlStr = url.toString();

    if (urlStr.endsWith('/runs')) {
      requestBodies.push(JSON.parse(options.body));
      return {
        ok: true,
        json: async () => ({ data: { id: 'run-1', defaultDatasetId: 'dataset-1' } }),
      };
    }

    if (urlStr.includes('/runs/run-1')) {
      return { ok: true, json: async () => ({ data: { status: 'SUCCEEDED' } }) };
    }

    if (urlStr.includes('/datasets/dataset-1/items')) {
      return {
        ok: true,
        json: async () => ([
          {
            linkedinUrl: 'https://www.linkedin.com/posts/example_activity-1',
            content: 'A post about Vidrala',
            postedAt: { date: '2026-07-30T14:53:15.718Z' },
            author: { name: 'Someone', type: 'company', publicIdentifier: 'someone' },
            engagement: { likes: 1, comments: 0, shares: 0, reactions: [] },
            query: { sortBy: 'date', page: 1, search: 'Vidrala', postedLimit: '24h' },
          },
        ]),
      };
    }

    throw new Error(`Unexpected fetch call: ${urlStr}`);
  });

  await withEnv({ APIFY_TERMS_ACTOR_ID: 'buIWk2uOUzTmcLsuB', APIFY_TOKEN: 'fake-token' }, async () => {
    const posts = await executeTermsActor(['Vidrala'], { max_posts_per_company: 5, posted_limit: '24h' });

    assert.equal(requestBodies.length, 1);
    assert.deepEqual(requestBodies[0].searchQueries, ['Vidrala']);
    assert.equal(requestBodies[0].targetUrls, undefined, 'input must not include targetUrls');

    assert.equal(posts.length, 1);
    assert.equal(posts[0].sourceType, 'term');
    assert.equal(posts[0].queryTargetUrl, 'Vidrala');
  });
});
