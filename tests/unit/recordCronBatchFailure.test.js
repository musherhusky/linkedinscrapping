import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordCronBatchFailure } from '../../lib/orchestrator.js';

test('recordCronBatchFailure records a status: error row with hour_utc and error_message', async () => {
  const calls = [];
  const startedAt = new Date('2026-08-03T22:00:00.000Z').toISOString();

  await recordCronBatchFailure(22, new Error('Apify actor timed out'), startedAt, {
    saveCronExecution: async (stats) => { calls.push(stats); return 'cron-log-id'; },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].hourUtc, 22);
  assert.equal(calls[0].status, 'error');
  assert.equal(calls[0].errorMessage, 'Apify actor timed out');
  assert.equal(calls[0].startedAt, startedAt);
  assert.equal(typeof calls[0].durationMs, 'number');
});

test('recordCronBatchFailure does not throw when saveCronExecution itself fails', async () => {
  await assert.doesNotReject(
    recordCronBatchFailure(22, new Error('boom'), new Date().toISOString(), {
      saveCronExecution: async () => { throw new Error('db down'); },
    })
  );
});
