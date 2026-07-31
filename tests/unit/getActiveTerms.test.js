import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getActiveTerms } from '../../lib/database.js';

function makeFakeSupabaseClient(rows) {
  return {
    from(table) {
      assert.equal(table, 'target_search_terms');
      return {
        select(columns) {
          assert.equal(columns, 'term');
          return {
            eq(key1, value1) {
              assert.equal(key1, 'user_id');
              return {
                eq: async (key2, value2) => {
                  assert.equal(key2, 'active');
                  assert.equal(value2, true);
                  return { data: rows, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

test('getActiveTerms returns an array of term strings for active rows', async () => {
  const fakeClient = makeFakeSupabaseClient([{ term: 'b2b sales' }, { term: 'Vidrala' }]);

  const terms = await getActiveTerms('user-1', fakeClient);

  assert.deepEqual(terms, ['b2b sales', 'Vidrala']);
});

test('getActiveTerms returns [] when the user has no active terms', async () => {
  const fakeClient = makeFakeSupabaseClient([]);

  const terms = await getActiveTerms('user-1', fakeClient);

  assert.deepEqual(terms, []);
});
