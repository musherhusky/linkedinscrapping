import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveCronExecution } from '../../lib/database.js';

function makeFakeSupabaseClient(onInsert, returnedId = 'cron-run-abc-123') {
  return {
    from(table) {
      assert.equal(table, 'cron_execution_logs');
      return {
        insert: (payload) => {
          onInsert(payload);
          return {
            select: () => ({
              single: async () => ({ data: { id: returnedId }, error: null }),
            }),
          };
        },
      };
    },
  };
}

test('saveCronExecution inserts a row with correct field mapping and returns the inserted id', async () => {
  let inserted;
  const fakeClient = makeFakeSupabaseClient((payload) => { inserted = payload; });

  const startedAt = new Date('2026-08-03T22:00:00.000Z').toISOString();

  const id = await saveCronExecution({
    hourUtc: 22,
    status: 'success',
    usersProcessed: 5,
    postsSent: 12,
    postsFailed: 1,
    durationMs: 3400,
    startedAt,
  }, fakeClient);

  assert.equal(inserted.hour_utc, 22);
  assert.equal(inserted.status, 'success');
  assert.equal(inserted.users_processed, 5);
  assert.equal(inserted.posts_sent, 12);
  assert.equal(inserted.posts_failed, 1);
  assert.equal(inserted.duration_ms, 3400);
  assert.equal(inserted.started_at, startedAt);
  assert.equal(inserted.error_message, null);

  assert.equal(id, 'cron-run-abc-123');
});

test('saveCronExecution maps error_message and defaults counters when omitted', async () => {
  let inserted;
  const fakeClient = makeFakeSupabaseClient((payload) => { inserted = payload; });

  const startedAt = new Date('2026-08-03T22:00:00.000Z').toISOString();

  await saveCronExecution({
    hourUtc: 22,
    status: 'error',
    errorMessage: 'Something went wrong',
    startedAt,
  }, fakeClient);

  assert.equal(inserted.status, 'error');
  assert.equal(inserted.error_message, 'Something went wrong');
  assert.equal(inserted.users_processed, 0);
  assert.equal(inserted.posts_sent, 0);
  assert.equal(inserted.posts_failed, 0);
});

test('saveCronExecution returns null (not throw) when the insert fails', async () => {
  const fakeClient = {
    from() {
      return {
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: new Error('insert failed') }),
          }),
        }),
      };
    },
  };

  const id = await saveCronExecution({
    hourUtc: 22,
    status: 'success',
    startedAt: new Date().toISOString(),
  }, fakeClient);

  assert.equal(id, null);
});

test('saveCronExecution returns null (not throw) when the client itself throws', async () => {
  const fakeClient = {
    from() {
      throw new Error('connection refused');
    },
  };

  const id = await saveCronExecution({
    hourUtc: 22,
    status: 'success',
    startedAt: new Date().toISOString(),
  }, fakeClient);

  assert.equal(id, null);
});
