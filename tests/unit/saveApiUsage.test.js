import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveApiUsage } from '../../lib/database.js';

function makeFakeSupabaseClient(onInsert) {
  return {
    from(table) {
      assert.equal(table, 'api_usage_logs');
      return {
        insert: async (payload) => {
          onInsert(payload);
          return { error: null };
        },
      };
    },
  };
}

test('saveApiUsage inserts a row with correct field mapping for a claude provider', async () => {
  let inserted;
  const fakeClient = makeFakeSupabaseClient((payload) => { inserted = payload; });

  await saveApiUsage('user-1', 'claude', {
    modelOrActor: 'claude-opus-4-5',
    inputTokens: 1200,
    outputTokens: 300,
    postsReceived: 20,
    estimatedCostUsd: 0.0234,
    rateSnapshot: { input_cost_per_1k: 0.015, output_cost_per_1k: 0.075 },
  }, fakeClient);

  assert.equal(inserted.user_id, 'user-1');
  assert.equal(inserted.provider, 'claude');
  assert.equal(inserted.model_or_actor, 'claude-opus-4-5');
  assert.equal(inserted.input_tokens, 1200);
  assert.equal(inserted.output_tokens, 300);
  assert.equal(inserted.compute_units, null);
  assert.equal(inserted.posts_received, 20);
  assert.equal(inserted.estimated_cost_usd, 0.0234);
  assert.deepEqual(inserted.rate_snapshot, { input_cost_per_1k: 0.015, output_cost_per_1k: 0.075 });
});

test('saveApiUsage does not throw when the insert fails', async () => {
  const fakeClient = {
    from() {
      return {
        insert: async () => ({ error: new Error('insert failed') }),
      };
    },
  };

  await assert.doesNotReject(() =>
    saveApiUsage('user-1', 'claude', { modelOrActor: 'claude-opus-4-5' }, fakeClient)
  );
});
