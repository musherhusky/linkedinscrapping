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
    executeActor: async () => [],
    executePeopleActor: async () => [],
    executeTermsActor: async (terms) => {
      executeTermsActorCalls.push(terms);
      return [];
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
    executeActor: async () => [],
    executePeopleActor: async () => [],
    executeTermsActor: async (terms) => { executeTermsActorCalls.push(terms); return []; },
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
    executeActor: async () => [],
    executePeopleActor: async () => [],
    executeTermsActor: async () => [makeTermPost('Vidrala'), makeTermPost('AI')],
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
    executeActor: async () => [],
    executePeopleActor: async () => [],
    executeTermsActor: async () => [makeTermPost('Vidrala', {
      author: { id: 'author-1', type: 'company', name: 'Vidrala', linkedinUrl: 'https://www.linkedin.com/company/vidrala', info: '474 followers' },
    })],
    ...noopDeps({
      upsertTargetProfile: async (...args) => { upsertTargetProfileCalls.push(args); },
      insertFollowerHistory: async (...args) => { insertFollowerHistoryCalls.push(args); },
    }),
  });

  assert.equal(upsertTargetProfileCalls.length, 0, 'term-sourced authors must not trigger target-profile enrichment');
  assert.equal(insertFollowerHistoryCalls.length, 0);
});

test('processTerms fetches active terms, runs executeTermsActor, and dispatches new posts', async () => {
  const dispatchCalls = [];

  const result = await processTerms('user-1', {
    getUserSettings: async () => baseSettings({ send_to_hallon: true }),
    getUserPlan: async () => basePlan(),
    getActiveTerms: async () => ['Vidrala'],
    executeTermsActor: async (terms) => {
      assert.deepEqual(terms, ['Vidrala']);
      return [makeTermPost('Vidrala')];
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

test('processTerms returns early when the user has no active terms', async () => {
  const executeTermsActorCalls = [];

  const result = await processTerms('user-1', {
    getUserSettings: async () => baseSettings(),
    getUserPlan: async () => basePlan(),
    getActiveTerms: async () => [],
    executeTermsActor: async (terms) => { executeTermsActorCalls.push(terms); return []; },
    ...noopDeps(),
  });

  assert.equal(executeTermsActorCalls.length, 0);
  assert.equal(result.success, true);
  assert.equal(result.sent, 0);
});
