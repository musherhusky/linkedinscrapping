import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processAllUsersBatched, processTerms } from '../../lib/orchestrator.js';

function baseSettings(overrides = {}) {
  return { apify_enabled: true, send_to_hallon: false, max_posts_per_company: 5, ...overrides };
}

function basePlan() {
  return { plans: { posted_limit: '24h' } };
}

function makeTermPost(term, overrides = {}) {
  return {
    url: `https://www.linkedin.com/posts/example_${term}`,
    title: `Post about ${term}`,
    description: 'content',
    authorName: 'Someone',
    sourceType: 'term',
    queryTargetUrl: term,
    ...overrides,
  };
}

function actorResult(posts, runStats = null) {
  return { posts, runStats };
}

function noopDeps(overrides = {}) {
  return {
    deduplicatePosts: async (posts) => ({ newPosts: posts, duplicates: 0 }),
    getTodayStats: async () => ({ sentToday: 0, failedToday: 0 }),
    processAndSendToHallon: async () => ({ sent: 0, failed: 0, skipped: 0 }),
    processWithoutHallon: async () => ({ sent: 0, failed: 0 }),
    upsertTargetProfile: async () => {},
    insertFollowerHistory: async () => {},
    upsertDiscoveredProfile: async () => null,
    upsertDiscoveredProfileRelation: async () => {},
    saveApiUsage: async () => {},
    saveApiRun: async () => 'default-run-id',
    saveCronExecution: async () => 'cron-log-id',
    ...overrides,
  };
}

test('processAllUsersBatched calls executeTermsActor once with deduplicated terms across users', async () => {
  const executeTermsActorCalls = [];

  await processAllUsersBatched('10', {
    getAllUsersForHour: async () => ['user-1', 'user-2'],
    getUserSettings: async () => baseSettings(),
    getUserPlan: async () => basePlan(),
    getActiveCompanies: async () => [],
    getActivePeople: async () => [],
    getActiveTerms: async (userId) => (userId === 'user-1' ? ['Vidrala', 'AI'] : ['Vidrala']),
    executeActor: async () => actorResult([]),
    executePeopleActor: async () => actorResult([]),
    executeTermsActor: async (terms) => {
      executeTermsActorCalls.push(terms);
      return actorResult([]);
    },
    ...noopDeps(),
  });

  assert.equal(executeTermsActorCalls.length, 1, 'executeTermsActor must be called exactly once for the whole batch');
  assert.deepEqual([...executeTermsActorCalls[0]].sort(), ['AI', 'Vidrala'], 'terms must be deduplicated across users');
});

test('processAllUsersBatched does not call executeTermsActor when no user has active terms', async () => {
  const executeTermsActorCalls = [];

  await processAllUsersBatched('10', {
    getAllUsersForHour: async () => ['user-1'],
    getUserSettings: async () => baseSettings(),
    getUserPlan: async () => basePlan(),
    getActiveCompanies: async () => [],
    getActivePeople: async () => [],
    getActiveTerms: async () => [],
    executeActor: async () => actorResult([]),
    executePeopleActor: async () => actorResult([]),
    executeTermsActor: async (terms) => { executeTermsActorCalls.push(terms); return actorResult([]); },
    ...noopDeps(),
  });

  assert.equal(executeTermsActorCalls.length, 0);
});

test('processAllUsersBatched distributes term-sourced posts to the correct tracking user with sourceType "term"', async () => {
  const dispatchCalls = [];

  await processAllUsersBatched('10', {
    getAllUsersForHour: async () => ['user-1', 'user-2'],
    getUserSettings: async () => baseSettings({ send_to_hallon: true }),
    getUserPlan: async () => basePlan(),
    getActiveCompanies: async () => [],
    getActivePeople: async () => [],
    getActiveTerms: async (userId) => (userId === 'user-1' ? ['Vidrala'] : ['AI']),
    executeActor: async () => actorResult([]),
    executePeopleActor: async () => actorResult([]),
    executeTermsActor: async () => actorResult([makeTermPost('Vidrala'), makeTermPost('AI')]),
    ...noopDeps({
      processAndSendToHallon: async (posts, userId, settings, sourceType) => {
        dispatchCalls.push({ userId, sourceType, posts });
        return { sent: posts.length, failed: 0, skipped: 0 };
      },
    }),
  });

  const user1Call = dispatchCalls.find(c => c.userId === 'user-1');
  const user2Call = dispatchCalls.find(c => c.userId === 'user-2');

  assert.ok(user1Call, 'user-1 must receive a dispatch call for its term posts');
  assert.equal(user1Call.sourceType, 'term');
  assert.equal(user1Call.posts.length, 1);
  assert.equal(user1Call.posts[0].queryTargetUrl, 'Vidrala');

  assert.ok(user2Call, 'user-2 must receive a dispatch call for its term posts');
  assert.equal(user2Call.posts.length, 1);
  assert.equal(user2Call.posts[0].queryTargetUrl, 'AI');
});

test('processAllUsersBatched does not enrich target profiles for term-sourced posts', async () => {
  const upsertTargetProfileCalls = [];
  const insertFollowerHistoryCalls = [];

  await processAllUsersBatched('10', {
    getAllUsersForHour: async () => ['user-1'],
    getUserSettings: async () => baseSettings(),
    getUserPlan: async () => basePlan(),
    getActiveCompanies: async () => [],
    getActivePeople: async () => [],
    getActiveTerms: async () => ['Vidrala'],
    executeActor: async () => actorResult([]),
    executePeopleActor: async () => actorResult([]),
    executeTermsActor: async () => actorResult([makeTermPost('Vidrala', {
      author: { id: 'author-1', type: 'company', name: 'Vidrala', linkedinUrl: 'https://www.linkedin.com/company/vidrala', info: '474 followers' },
    })]),
    ...noopDeps({
      upsertTargetProfile: async (...args) => { upsertTargetProfileCalls.push(args); },
      insertFollowerHistory: async (...args) => { insertFollowerHistoryCalls.push(args); },
    }),
  });

  assert.equal(upsertTargetProfileCalls.length, 0, 'term-sourced authors must not trigger target-profile enrichment');
  assert.equal(insertFollowerHistoryCalls.length, 0);
});

test('processAllUsersBatched logs proportional Apify usage cost per user for term posts', async () => {
  const saveApiUsageCalls = [];

  await processAllUsersBatched('10', {
    getAllUsersForHour: async () => ['user-1', 'user-2'],
    getUserSettings: async () => baseSettings(),
    getUserPlan: async () => basePlan(),
    getActiveCompanies: async () => [],
    getActivePeople: async () => [],
    getActiveTerms: async (userId) => (userId === 'user-1' ? ['Vidrala'] : ['AI']),
    executeActor: async () => actorResult([]),
    executePeopleActor: async () => actorResult([]),
    executeTermsActor: async () => actorResult(
      [makeTermPost('Vidrala'), makeTermPost('Vidrala'), makeTermPost('AI')],
      { actorId: 'terms-actor-1', computeUnits: 0.4, usageTotalUsd: 0.06 }
    ),
    ...noopDeps({
      saveApiUsage: async (userId, provider, stats) => { saveApiUsageCalls.push({ userId, provider, stats }); },
    }),
  });

  const user1Usage = saveApiUsageCalls.find(c => c.userId === 'user-1' && c.stats.postsReceived === 2);
  const user2Usage = saveApiUsageCalls.find(c => c.userId === 'user-2' && c.stats.postsReceived === 1);

  assert.ok(user1Usage, 'user-1 (2 of 3 posts) must get a proportional usage row');
  assert.equal(user1Usage.provider, 'apify');
  assert.equal(user1Usage.stats.modelOrActor, 'terms-actor-1');
  assert.ok(Math.abs(user1Usage.stats.estimatedCostUsd - 0.04) < 1e-9, 'user-1 share is 2/3 of 0.06 = 0.04');
  assert.ok(Math.abs(user1Usage.stats.computeUnits - (0.4 * 2 / 3)) < 1e-9);

  assert.ok(user2Usage, 'user-2 (1 of 3 posts) must get a proportional usage row');
  assert.ok(Math.abs(user2Usage.stats.estimatedCostUsd - 0.02) < 1e-9, 'user-2 share is 1/3 of 0.06 = 0.02');
});

test('processAllUsersBatched creates one raw run row per source type and shares its run_id across all per-user proportional shares', async () => {
  const saveApiUsageCalls = [];
  const saveApiRunCalls = [];

  await processAllUsersBatched('10', {
    getAllUsersForHour: async () => ['user-1', 'user-2'],
    getUserSettings: async () => baseSettings(),
    getUserPlan: async () => basePlan(),
    getActiveCompanies: async () => [],
    getActivePeople: async () => [],
    getActiveTerms: async (userId) => (userId === 'user-1' ? ['Vidrala'] : ['AI']),
    executeActor: async () => actorResult([]),
    executePeopleActor: async () => actorResult([]),
    executeTermsActor: async () => actorResult(
      [makeTermPost('Vidrala'), makeTermPost('AI')],
      { actorId: 'terms-actor-1', computeUnits: 0.4, usageTotalUsd: 0.06 }
    ),
    ...noopDeps({
      saveApiUsage: async (userId, provider, stats) => { saveApiUsageCalls.push({ userId, stats }); },
      saveApiRun: async (provider, stats) => { saveApiRunCalls.push({ provider, stats }); return 'batched-run-id'; },
    }),
  });

  assert.equal(saveApiRunCalls.length, 1, 'saveApiRun must be called once for the whole term run, not once per user');
  assert.equal(saveApiRunCalls[0].provider, 'apify');
  assert.equal(saveApiRunCalls[0].stats.sourceType, 'term');
  assert.equal(saveApiRunCalls[0].stats.totalItems, 2);
  assert.equal(saveApiRunCalls[0].stats.totalCostUsd, 0.06, 'the raw run row gets the full unsplit cost');

  assert.equal(saveApiUsageCalls.length, 2);
  for (const call of saveApiUsageCalls) {
    assert.equal(call.stats.runId, 'batched-run-id', 'every per-user share must correlate to the same run_id');
  }
});

test('processTerms fetches active terms, runs executeTermsActor, and dispatches new posts', async () => {
  const dispatchCalls = [];

  const result = await processTerms('user-1', {
    getUserSettings: async () => baseSettings({ send_to_hallon: true }),
    getUserPlan: async () => basePlan(),
    getActiveTerms: async () => ['Vidrala'],
    executeTermsActor: async (terms) => {
      assert.deepEqual(terms, ['Vidrala']);
      return actorResult([makeTermPost('Vidrala')], { actorId: 'terms-actor-1', computeUnits: 0.1, usageTotalUsd: 0.01 });
    },
    ...noopDeps({
      processAndSendToHallon: async (posts, userId, settings, sourceType) => {
        dispatchCalls.push({ userId, sourceType, posts });
        return { sent: posts.length, failed: 0, skipped: 0 };
      },
    }),
  });

  assert.equal(dispatchCalls.length, 1);
  assert.equal(dispatchCalls[0].sourceType, 'term');
  assert.equal(result.success, true);
  assert.equal(result.sent, 1);
});

test('processTerms logs full (non-split) Apify usage cost, correlated to its own raw run row', async () => {
  const saveApiUsageCalls = [];
  const saveApiRunCalls = [];

  await processTerms('user-1', {
    getUserSettings: async () => baseSettings({ send_to_hallon: true }),
    getUserPlan: async () => basePlan(),
    getActiveTerms: async () => ['Vidrala'],
    executeTermsActor: async () => actorResult(
      [makeTermPost('Vidrala')],
      { actorId: 'terms-actor-1', computeUnits: 0.1, usageTotalUsd: 0.01 }
    ),
    ...noopDeps({
      saveApiUsage: async (userId, provider, stats) => { saveApiUsageCalls.push({ userId, provider, stats }); },
      saveApiRun: async (provider, stats) => { saveApiRunCalls.push({ provider, stats }); return 'terms-run-id'; },
    }),
  });

  assert.equal(saveApiRunCalls.length, 1);
  assert.equal(saveApiRunCalls[0].stats.totalItems, 1);
  assert.equal(saveApiRunCalls[0].stats.totalCostUsd, 0.01);

  assert.equal(saveApiUsageCalls.length, 1);
  assert.equal(saveApiUsageCalls[0].userId, 'user-1');
  assert.equal(saveApiUsageCalls[0].provider, 'apify');
  assert.equal(saveApiUsageCalls[0].stats.modelOrActor, 'terms-actor-1');
  assert.equal(saveApiUsageCalls[0].stats.computeUnits, 0.1);
  assert.equal(saveApiUsageCalls[0].stats.estimatedCostUsd, 0.01);
  assert.equal(saveApiUsageCalls[0].stats.postsReceived, 1);
  assert.equal(saveApiUsageCalls[0].stats.runId, 'terms-run-id');
});

test('processTerms returns early when the user has no active terms', async () => {
  const executeTermsActorCalls = [];

  const result = await processTerms('user-1', {
    getUserSettings: async () => baseSettings(),
    getUserPlan: async () => basePlan(),
    getActiveTerms: async () => [],
    executeTermsActor: async (terms) => { executeTermsActorCalls.push(terms); return actorResult([]); },
    ...noopDeps(),
  });

  assert.equal(executeTermsActorCalls.length, 0);
  assert.equal(result.success, true);
  assert.equal(result.sent, 0);
});
