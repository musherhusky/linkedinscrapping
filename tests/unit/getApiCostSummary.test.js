import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getApiCostSummary } from '../../lib/database.js';

function makeFakeSupabaseClient(rows) {
  return {
    from(table) {
      assert.equal(table, 'api_usage_logs');
      return {
        select() {
          return {
            eq(key, value) {
              assert.equal(key, 'user_id');
              return {
                gte(gteKey, from) {
                  return {
                    lte(lteKey, to) {
                      const filtered = rows.filter(r =>
                        (!from || r.created_at >= from) && (!to || r.created_at <= to)
                      );
                      return Promise.resolve({ data: filtered, error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

test('getApiCostSummary aggregates estimated_cost_usd grouped by provider', async () => {
  const fakeClient = makeFakeSupabaseClient([
    { provider: 'claude', estimated_cost_usd: 0.02, created_at: '2026-08-01T00:00:00Z' },
    { provider: 'claude', estimated_cost_usd: 0.03, created_at: '2026-08-02T00:00:00Z' },
    { provider: 'apify', estimated_cost_usd: 0.04, created_at: '2026-08-01T00:00:00Z' },
    { provider: 'apify', estimated_cost_usd: null, created_at: '2026-08-02T00:00:00Z' },
  ]);

  const summary = await getApiCostSummary('user-1', '2026-08-01T00:00:00Z', '2026-08-03T00:00:00Z', fakeClient);

  assert.ok(Math.abs(summary.claude - 0.05) < 1e-9);
  assert.ok(Math.abs(summary.apify - 0.04) < 1e-9);
});

test('getApiCostSummary returns zero values (not absent/null) when no usage exists for the period', async () => {
  const fakeClient = makeFakeSupabaseClient([]);

  const summary = await getApiCostSummary('user-1', '2026-08-01T00:00:00Z', '2026-08-03T00:00:00Z', fakeClient);

  assert.equal(summary.claude, 0);
  assert.equal(summary.apify, 0);
});
