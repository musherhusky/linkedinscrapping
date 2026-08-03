import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRecentCronExecutions } from '../../lib/database.js';

function makeFakeSupabaseClient(rows) {
  return {
    from(table) {
      assert.equal(table, 'cron_execution_logs');
      return {
        select: () => ({
          order: (column, opts) => {
            assert.equal(column, 'started_at');
            assert.deepEqual(opts, { ascending: false });
            return {
              limit: async (n) => ({ data: rows.slice(0, n), error: null }),
            };
          },
        }),
      };
    },
  };
}

test('getRecentCronExecutions returns rows ordered by started_at desc, capped at the given limit', async () => {
  const rows = [
    { id: '1', hour_utc: 22, status: 'success', started_at: '2026-08-03T22:00:00Z' },
    { id: '2', hour_utc: 21, status: 'error', started_at: '2026-08-02T22:00:00Z' },
  ];
  const fakeClient = makeFakeSupabaseClient(rows);

  const result = await getRecentCronExecutions(30, fakeClient);

  assert.deepEqual(result, rows);
});

test('getRecentCronExecutions returns an empty array (not throw) when the query fails', async () => {
  const fakeClient = {
    from() {
      return {
        select: () => ({
          order: () => ({
            limit: async () => ({ data: null, error: new Error('query failed') }),
          }),
        }),
      };
    },
  };

  const result = await getRecentCronExecutions(30, fakeClient);

  assert.deepEqual(result, []);
});

test('getRecentCronExecutions returns an empty array (not throw) when the client itself throws', async () => {
  const fakeClient = {
    from() {
      throw new Error('connection refused');
    },
  };

  const result = await getRecentCronExecutions(30, fakeClient);

  assert.deepEqual(result, []);
});
