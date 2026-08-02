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

const noDelay = async () => {};

// Apify's own docs: the response right at run completion (the `waitForFinish`
// poll) can show preliminary cost/event figures — a later re-fetch without
// `waitForFinish` returns the settled ones. Tests use distinct values for
// each so a bug reading the wrong response is caught.
const PRELIMINARY_RUN_RESPONSE = {
  data: { status: 'SUCCEEDED', usageTotalUsd: 0.00005, stats: { computeUnits: 0.0001 } },
};
const SETTLED_RUN_RESPONSE = {
  data: { status: 'SUCCEEDED', usageTotalUsd: 0.042, stats: { computeUnits: 0.015 } },
};

function routeRunStatus(urlStr) {
  if (urlStr.includes('waitForFinish')) return PRELIMINARY_RUN_RESPONSE;
  return SETTLED_RUN_RESPONSE;
}

test('executeTermsActor throws when APIFY_TERMS_ACTOR_ID is missing', async (t) => {
  await withEnv({ APIFY_TERMS_ACTOR_ID: undefined, APIFY_TOKEN: 'fake-token' }, async () => {
    await assert.rejects(
      () => executeTermsActor(['b2b sales'], {}, { delay: noDelay }),
      /APIFY_TERMS_ACTOR_ID/
    );
  });
});

test('executeTermsActor throws when APIFY_TOKEN is missing', async (t) => {
  await withEnv({ APIFY_TERMS_ACTOR_ID: 'buIWk2uOUzTmcLsuB', APIFY_TOKEN: undefined }, async () => {
    await assert.rejects(
      () => executeTermsActor(['b2b sales'], {}, { delay: noDelay }),
      /APIFY_TOKEN/
    );
  });
});

test('executeTermsActor sends searchQueries (not targetUrls), maps results, and returns runStats', async (t) => {
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
      return { ok: true, json: async () => routeRunStatus(urlStr) };
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
    const result = await executeTermsActor(
      ['Vidrala'],
      { max_posts_per_company: 5, posted_limit: '24h' },
      { delay: noDelay }
    );

    assert.equal(requestBodies.length, 1);
    assert.deepEqual(requestBodies[0].searchQueries, ['Vidrala']);
    assert.equal(requestBodies[0].targetUrls, undefined, 'input must not include targetUrls');

    assert.equal(result.posts.length, 1);
    assert.equal(result.posts[0].sourceType, 'term');
    assert.equal(result.posts[0].queryTargetUrl, 'Vidrala');

    assert.equal(result.runStats.actorId, 'buIWk2uOUzTmcLsuB');
  });
});

test('executeTermsActor waits and re-fetches for settled cost figures, not the preliminary ones', async (t) => {
  t.mock.method(global, 'fetch', async (url) => {
    const urlStr = url.toString();

    if (urlStr.endsWith('/runs')) {
      return { ok: true, json: async () => ({ data: { id: 'run-1', defaultDatasetId: 'dataset-1' } }) };
    }
    if (urlStr.includes('/runs/run-1')) {
      return { ok: true, json: async () => routeRunStatus(urlStr) };
    }
    if (urlStr.includes('/datasets/dataset-1/items')) {
      return { ok: true, json: async () => [] };
    }
    throw new Error(`Unexpected fetch call: ${urlStr}`);
  });

  const delayCalls = [];

  await withEnv({ APIFY_TERMS_ACTOR_ID: 'buIWk2uOUzTmcLsuB', APIFY_TOKEN: 'fake-token' }, async () => {
    const result = await executeTermsActor(['Vidrala'], {}, {
      delay: async (ms) => { delayCalls.push(ms); },
    });

    assert.equal(delayCalls.length, 1, 'must wait once before re-fetching for settled figures');
    assert.ok(delayCalls[0] >= 10000, 'must wait at least ~10 seconds per Apify\'s documented settlement window');

    assert.equal(result.runStats.usageTotalUsd, 0.042, 'must use the settled value, not the preliminary 0.00005');
    assert.equal(result.runStats.computeUnits, 0.015, 'must use the settled value, not the preliminary 0.0001');
  });
});

function mockDatasetRun(t, items) {
  t.mock.method(global, 'fetch', async (url) => {
    const urlStr = url.toString();

    if (urlStr.endsWith('/runs')) {
      return { ok: true, json: async () => ({ data: { id: 'run-1', defaultDatasetId: 'dataset-1' } }) };
    }
    if (urlStr.includes('/runs/run-1')) {
      return { ok: true, json: async () => routeRunStatus(urlStr) };
    }
    if (urlStr.includes('/datasets/dataset-1/items')) {
      return { ok: true, json: async () => items };
    }
    throw new Error(`Unexpected fetch call: ${urlStr}`);
  });
}

function baseItem(overrides = {}) {
  return {
    linkedinUrl: 'https://www.linkedin.com/posts/example',
    content: '',
    postedAt: { date: '2026-07-30T14:53:15.718Z' },
    author: { name: 'Someone', type: 'company', publicIdentifier: 'someone' },
    engagement: { likes: 0, comments: 0, shares: 0, reactions: [] },
    query: { sortBy: 'date', page: 1, search: 'Vidrala', postedLimit: '24h' },
    ...overrides,
  };
}

test('executeTermsActor discards items where the search term does not appear anywhere relevant', async (t) => {
  mockDatasetRun(t, [baseItem({ content: 'Totally unrelated content' })]);

  await withEnv({ APIFY_TERMS_ACTOR_ID: 'buIWk2uOUzTmcLsuB', APIFY_TOKEN: 'fake-token' }, async () => {
    const result = await executeTermsActor(['Vidrala'], {}, { delay: noDelay });
    assert.equal(result.posts.length, 0);
  });
});

test('executeTermsActor keeps items where the search term appears in content', async (t) => {
  mockDatasetRun(t, [baseItem({ content: 'Great news from Vidrala today' })]);

  await withEnv({ APIFY_TERMS_ACTOR_ID: 'buIWk2uOUzTmcLsuB', APIFY_TOKEN: 'fake-token' }, async () => {
    const result = await executeTermsActor(['Vidrala'], {}, { delay: noDelay });
    assert.equal(result.posts.length, 1);
  });
});

test('executeTermsActor keeps items where the search term appears in article.title', async (t) => {
  mockDatasetRun(t, [baseItem({ content: 'Check this out', article: { title: 'Vidrala expands its factory' } })]);

  await withEnv({ APIFY_TERMS_ACTOR_ID: 'buIWk2uOUzTmcLsuB', APIFY_TOKEN: 'fake-token' }, async () => {
    const result = await executeTermsActor(['Vidrala'], {}, { delay: noDelay });
    assert.equal(result.posts.length, 1);
  });
});

test('executeTermsActor keeps items where the search term appears in article.description', async (t) => {
  mockDatasetRun(t, [baseItem({ content: 'Check this out', article: { description: 'All about Vidrala expansion' } })]);

  await withEnv({ APIFY_TERMS_ACTOR_ID: 'buIWk2uOUzTmcLsuB', APIFY_TOKEN: 'fake-token' }, async () => {
    const result = await executeTermsActor(['Vidrala'], {}, { delay: noDelay });
    assert.equal(result.posts.length, 1);
  });
});

test('executeTermsActor keeps items where the search term appears in repost.content', async (t) => {
  mockDatasetRun(t, [baseItem({ content: 'Sharing this', repost: { content: 'Big news at Vidrala' } })]);

  await withEnv({ APIFY_TERMS_ACTOR_ID: 'buIWk2uOUzTmcLsuB', APIFY_TOKEN: 'fake-token' }, async () => {
    const result = await executeTermsActor(['Vidrala'], {}, { delay: noDelay });
    assert.equal(result.posts.length, 1);
  });
});

test('executeTermsActor matches the search term case-insensitively', async (t) => {
  mockDatasetRun(t, [baseItem({ content: 'VIDRALA is hiring', query: { search: 'vidrala' } })]);

  await withEnv({ APIFY_TERMS_ACTOR_ID: 'buIWk2uOUzTmcLsuB', APIFY_TOKEN: 'fake-token' }, async () => {
    const result = await executeTermsActor(['vidrala'], {}, { delay: noDelay });
    assert.equal(result.posts.length, 1);
  });
});
