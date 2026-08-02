import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveApiRun } from '../../lib/database.js';

function makeFakeSupabaseClient(onInsert, returnedId = 'run-abc-123') {
  return {
    from(table) {
      assert.equal(table, 'api_run_logs');
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

test('saveApiRun inserts a row with correct field mapping and returns the inserted id', async () => {
  let inserted;
  const fakeClient = makeFakeSupabaseClient((payload) => { inserted = payload; });

  const runId = await saveApiRun('apify', {
    modelOrActor: 'terms-actor-1',
    sourceType: 'term',
    computeUnits: 0.4,
    totalItems: 3,
    totalCostUsd: 0.06,
    rateSnapshot: { source: 'apify_usageTotalUsd' },
  }, fakeClient);

  assert.equal(inserted.provider, 'apify');
  assert.equal(inserted.model_or_actor, 'terms-actor-1');
  assert.equal(inserted.source_type, 'term');
  assert.equal(inserted.compute_units, 0.4);
  assert.equal(inserted.total_items, 3);
  assert.equal(inserted.total_cost_usd, 0.06);
  assert.deepEqual(inserted.rate_snapshot, { source: 'apify_usageTotalUsd' });

  assert.equal(runId, 'run-abc-123');
});

test('saveApiRun returns null (not throw) when the insert fails', async () => {
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

  const runId = await saveApiRun('claude', { modelOrActor: 'claude-haiku-4-5' }, fakeClient);

  assert.equal(runId, null);
});

test('saveApiRun returns null (not throw) when the client itself throws', async () => {
  const fakeClient = {
    from() {
      throw new Error('connection refused');
    },
  };

  const runId = await saveApiRun('claude', { modelOrActor: 'claude-haiku-4-5' }, fakeClient);

  assert.equal(runId, null);
});
