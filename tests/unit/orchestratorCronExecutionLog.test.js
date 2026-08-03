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
    saveCronExecution: async () => 'cron-log-id',
    ...overrides,
  };
}

test('processAllUsersBatched records a success cron execution row with aggregated totals', async () => {
  const saveCronExecutionCalls = [];

  await processAllUsersBatched(10, {
    getAllUsersForHour: async () => ['user-1'],
    getUserSettings: async () => baseSettings({ send_to_hallon: true }),
    getUserPlan: async () => basePlan(),
    getActiveCompanies: async () => ['https://www.linkedin.com/company/acme'],
    getActivePeople: async () => [],
    getActiveTerms: async () => [],
    executeActor: async () => actorResult([{
      url: 'https://www.linkedin.com/posts/1', title: 't', description: 'd',
      authorName: 'a', sourceType: 'company', queryTargetUrl: 'https://www.linkedin.com/company/acme',
    }]),
    executePeopleActor: async () => actorResult([]),
    executeTermsActor: async () => actorResult([]),
    ...noopDeps({
      processAndSendToHallon: async (posts) => ({ sent: posts.length, failed: 0, skipped: 0 }),
      saveCronExecution: async (stats) => { saveCronExecutionCalls.push(stats); return 'cron-log-id'; },
    }),
  });

  assert.equal(saveCronExecutionCalls.length, 1);
  const stats = saveCronExecutionCalls[0];
  assert.equal(stats.hourUtc, 10);
  assert.equal(stats.status, 'success');
  assert.equal(stats.usersProcessed, 1);
  assert.equal(stats.postsSent, 1);
  assert.equal(stats.postsFailed, 0);
  assert.equal(typeof stats.durationMs, 'number');
  assert.equal(typeof stats.startedAt, 'string');
});

test('processAllUsersBatched records a no_users cron execution row when no user is scheduled for the hour', async () => {
  const saveCronExecutionCalls = [];

  await processAllUsersBatched(3, {
    getAllUsersForHour: async () => [],
    ...noopDeps({
      saveCronExecution: async (stats) => { saveCronExecutionCalls.push(stats); return 'cron-log-id'; },
    }),
  });

  assert.equal(saveCronExecutionCalls.length, 1);
  const stats = saveCronExecutionCalls[0];
  assert.equal(stats.hourUtc, 3);
  assert.equal(stats.status, 'no_users');
  assert.equal(stats.usersProcessed, 0);
});

test('processAllUsersBatched still returns its normal result when saveCronExecution fails', async () => {
  const result = await processAllUsersBatched(10, {
    getAllUsersForHour: async () => ['user-1'],
    getUserSettings: async () => baseSettings(),
    getUserPlan: async () => basePlan(),
    getActiveCompanies: async () => [],
    getActivePeople: async () => [],
    getActiveTerms: async () => [],
    executeActor: async () => actorResult([]),
    executePeopleActor: async () => actorResult([]),
    executeTermsActor: async () => actorResult([]),
    ...noopDeps({
      saveCronExecution: async () => { throw new Error('db down'); },
    }),
  });

  assert.equal(result.success, true);
  assert.equal(result.processed, 1);
});
