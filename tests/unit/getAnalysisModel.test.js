import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAnalysisModel } from '../../lib/claude.js';

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

test('getAnalysisModel returns ANTHROPIC_MODEL_ANALYSIS when set', async () => {
  await withEnv({ ANTHROPIC_MODEL_ANALYSIS: 'claude-haiku-4-5' }, async () => {
    assert.equal(getAnalysisModel(), 'claude-haiku-4-5');
  });
});

test('getAnalysisModel returns the default when ANTHROPIC_MODEL_ANALYSIS is unset', async () => {
  await withEnv({ ANTHROPIC_MODEL_ANALYSIS: undefined }, async () => {
    assert.equal(getAnalysisModel(), 'claude-opus-4-5');
  });
});
