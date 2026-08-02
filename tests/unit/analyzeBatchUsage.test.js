import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBatch } from '../../lib/claude.js';

function withEnv(vars, fn) {
  const original = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return fn().finally(() => {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });
}

const SAMPLE_POST = { id: 1, titulo: 'Great news', descripcion: 'Some content' };

function fakeMessage(usage) {
  return {
    content: [{ text: JSON.stringify({ results: [{ post_id: 1, categories: [], topics: [], forced_topics: [] }] }) }],
    stop_reason: 'end_turn',
    usage,
  };
}

test('analyzeBatch logs Claude usage with a computed cost when the model has a verified rate', async () => {
  const saveUsageCalls = [];
  const saveRunCalls = [];

  await withEnv({ ANTHROPIC_API_KEY: 'fake-key', ANTHROPIC_MODEL_ANALYSIS: 'claude-haiku-4-5' }, async () => {
    await analyzeBatch([SAMPLE_POST], [], 'user-1', {
      createMessage: async () => fakeMessage({ input_tokens: 1000, output_tokens: 200 }),
      saveUsage: async (...args) => { saveUsageCalls.push(args); },
      saveRun: async (...args) => { saveRunCalls.push(args); return 'run-1'; },
    });
  });

  assert.equal(saveUsageCalls.length, 1);
  const [userId, provider, stats] = saveUsageCalls[0];
  assert.equal(userId, 'user-1');
  assert.equal(provider, 'claude');
  assert.equal(stats.modelOrActor, 'claude-haiku-4-5');
  assert.equal(stats.inputTokens, 1000);
  assert.equal(stats.outputTokens, 200);
  assert.equal(stats.postsReceived, 1);
  assert.ok(stats.estimatedCostUsd > 0);
  assert.deepEqual(stats.rateSnapshot, { input_cost_per_1k: 0.001, output_cost_per_1k: 0.005 });

  assert.equal(saveRunCalls.length, 1, 'saveRun must be called once for the raw run');
  const [runProvider, runStats] = saveRunCalls[0];
  assert.equal(runProvider, 'claude');
  assert.equal(runStats.totalItems, 1);
  assert.ok(runStats.totalCostUsd > 0);

  assert.equal(stats.runId, 'run-1', 'the per-user usage row must carry the run_id returned by saveRun');
});

test('analyzeBatch logs Claude usage with a null cost when the model has no verified rate', async () => {
  const saveUsageCalls = [];

  await withEnv({ ANTHROPIC_API_KEY: 'fake-key', ANTHROPIC_MODEL_ANALYSIS: 'some-future-model' }, async () => {
    await analyzeBatch([SAMPLE_POST], [], 'user-1', {
      createMessage: async () => fakeMessage({ input_tokens: 1000, output_tokens: 200 }),
      saveUsage: async (...args) => { saveUsageCalls.push(args); },
      saveRun: async () => 'run-2',
    });
  });

  assert.equal(saveUsageCalls.length, 1);
  const [, , stats] = saveUsageCalls[0];
  assert.equal(stats.inputTokens, 1000, 'tokens must still be recorded even without a rate');
  assert.equal(stats.outputTokens, 200);
  assert.equal(stats.estimatedCostUsd, null);
  assert.deepEqual(stats.rateSnapshot, { note: 'no verified rate for this model' });
  assert.equal(stats.runId, 'run-2');
});

test('analyzeBatch does not log usage or a run when the Anthropic call fails', async () => {
  const saveUsageCalls = [];
  const saveRunCalls = [];

  await withEnv({ ANTHROPIC_API_KEY: 'fake-key' }, async () => {
    await assert.rejects(() =>
      analyzeBatch([SAMPLE_POST], [], 'user-1', {
        createMessage: async () => { throw new Error('Anthropic API down'); },
        saveUsage: async (...args) => { saveUsageCalls.push(args); },
        saveRun: async (...args) => { saveRunCalls.push(args); return 'run-x'; },
      })
    );
  });

  assert.equal(saveUsageCalls.length, 0);
  assert.equal(saveRunCalls.length, 0);
});

test('analyzeBatch returns results normally even when usage logging fails', async () => {
  await withEnv({ ANTHROPIC_API_KEY: 'fake-key' }, async () => {
    const results = await analyzeBatch([SAMPLE_POST], [], 'user-1', {
      createMessage: async () => fakeMessage({ input_tokens: 1000, output_tokens: 200 }),
      saveUsage: async () => { throw new Error('DB unavailable'); },
      saveRun: async () => 'run-3',
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].post_id, 1);
  });
});

test('analyzeBatch returns results normally even when run logging fails', async () => {
  await withEnv({ ANTHROPIC_API_KEY: 'fake-key' }, async () => {
    const results = await analyzeBatch([SAMPLE_POST], [], 'user-1', {
      createMessage: async () => fakeMessage({ input_tokens: 1000, output_tokens: 200 }),
      saveUsage: async () => {},
      saveRun: async () => { throw new Error('DB unavailable'); },
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].post_id, 1);
  });
});

test('analyzeBatch does not log usage or a run when userId is not provided', async () => {
  const saveUsageCalls = [];
  const saveRunCalls = [];

  await withEnv({ ANTHROPIC_API_KEY: 'fake-key' }, async () => {
    await analyzeBatch([SAMPLE_POST], [], null, {
      createMessage: async () => fakeMessage({ input_tokens: 1000, output_tokens: 200 }),
      saveUsage: async (...args) => { saveUsageCalls.push(args); },
      saveRun: async (...args) => { saveRunCalls.push(args); return 'run-y'; },
    });
  });

  assert.equal(saveUsageCalls.length, 0);
  assert.equal(saveRunCalls.length, 0);
});
