import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processAllUsersBatched } from '../../lib/orchestrator.js';

function baseSettings(overrides = {}) {
  return { apify_enabled: true, send_to_hallon: false, max_posts_per_company: 5, ...overrides };
}

function basePlan() {
  return { plans: { posted_limit: '24h' } };
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
    ...overrides,
  };
}

function makeCompanyPost(queryTargetUrl, overrides = {}) {
  return {
    url: `https://www.linkedin.com/posts/acme_announcement-${queryTargetUrl.includes('/') ? 'slash' : 'noslash'}`,
    title: 'Acme announcement',
    description: 'content',
    authorName: 'Acme Corp',
    sourceType: 'company',
    queryTargetUrl,
    ...overrides,
  };
}

test('processAllUsersBatched deduplicates company URLs across users regardless of trailing slash', async () => {
  const executeActorCalls = [];

  await processAllUsersBatched('10', {
    getAllUsersForHour: async () => ['user-1', 'user-2'],
    getUserSettings: async () => baseSettings(),
    getUserPlan: async () => basePlan(),
    getActiveCompanies: async (userId) => (userId === 'user-1'
      ? ['https://www.linkedin.com/company/acme/']
      : ['https://www.linkedin.com/company/acme']),
    getActivePeople: async () => [],
    getActiveTerms: async () => [],
    executeActor: async (urls) => { executeActorCalls.push(urls); return actorResult([]); },
    executePeopleActor: async () => actorResult([]),
    executeTermsActor: async () => actorResult([]),
    ...noopDeps(),
  });

  assert.equal(executeActorCalls.length, 1, 'executeActor must be called exactly once for the whole batch');
  assert.equal(executeActorCalls[0].length, 1, 'the same company registered with/without a trailing slash must be deduplicated into a single URL');
});

test('processAllUsersBatched deduplicates person URLs across users regardless of casing/trailing slash', async () => {
  const executePeopleActorCalls = [];

  await processAllUsersBatched('10', {
    getAllUsersForHour: async () => ['user-1', 'user-2'],
    getUserSettings: async () => baseSettings(),
    getUserPlan: async () => basePlan(),
    getActiveCompanies: async () => [],
    getActivePeople: async (userId) => (userId === 'user-1'
      ? ['https://www.linkedin.com/in/johndoe/']
      : ['https://www.linkedin.com/in/JohnDoe']),
    getActiveTerms: async () => [],
    executeActor: async () => actorResult([]),
    executePeopleActor: async (urls) => { executePeopleActorCalls.push(urls); return actorResult([]); },
    executeTermsActor: async () => actorResult([]),
    ...noopDeps(),
  });

  assert.equal(executePeopleActorCalls.length, 1);
  assert.equal(executePeopleActorCalls[0].length, 1, 'the same person registered with different casing/trailing slash must be deduplicated into a single URL');
});

test('a user whose own registration is clean does not receive a duplicated post when another user in the batch uses a different URL format', async () => {
  const dispatchCalls = [];

  await processAllUsersBatched('10', {
    getAllUsersForHour: async () => ['user-1', 'user-2'],
    getUserSettings: async () => baseSettings({ send_to_hallon: true }),
    getUserPlan: async () => basePlan(),
    // user-1 has the trailing-slash variant; user-2 has the bare variant —
    // simulates the real production case (two different users, one company).
    getActiveCompanies: async (userId) => (userId === 'user-1'
      ? ['https://www.linkedin.com/company/acme/']
      : ['https://www.linkedin.com/company/acme']),
    getActivePeople: async () => [],
    getActiveTerms: async () => [],
    // Real Apify behavior: one result item per queried URL, even when two
    // different URL strings resolve to the same underlying company/post.
    // If the batch-level dedup isn't normalized, this mock (like Apify)
    // returns the post once per URL variant queried.
    executeActor: async (urls) => actorResult(urls.map(url => makeCompanyPost(url))),
    executePeopleActor: async () => actorResult([]),
    executeTermsActor: async () => actorResult([]),
    ...noopDeps({
      processAndSendToHallon: async (posts, userId, settings, sourceType) => {
        dispatchCalls.push({ userId, sourceType, postsCount: posts.length });
        return { sent: posts.length, failed: 0, skipped: 0 };
      },
    }),
  });

  const user1Call = dispatchCalls.find(c => c.userId === 'user-1');
  assert.ok(user1Call, 'user-1 must receive a dispatch call');
  assert.equal(user1Call.postsCount, 1, 'user-1 must receive the post exactly once, not duplicated');
});
