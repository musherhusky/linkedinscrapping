## Context

`runActor(actorId, token, input)` polls `GET /acts/{actorId}/runs/{runId}?waitForFinish=120` until `status !== 'RUNNING'`/`'READY'`, then immediately reads `usageTotalUsd`/`stats.computeUnits` from that same response for `runStats`. Confirmed via a real production comparison (user-reported) and Apify's own API docs: this is the *preliminary* figure — cost/event counts can still be settling for a few seconds after the run reaches a terminal status, especially on pay-per-event pricing (which the harvestapi actors used here are on, per the actor metadata fetched during `target-terms-scraping`).

## Goals / Non-Goals

**Goals:**
- Record Apify's settled, accurate cost in `api_usage_logs`/`api_run_logs`, not the preliminary figure.
- Keep the added latency minimal by overlapping the settlement wait with the dataset-items fetch rather than serializing it.
- Keep unit tests fast — the wait must be mockable.

**Non-Goals:**
- Retroactively correcting already-written `api_usage_logs`/`api_run_logs` rows with the (permanently lost) preliminary figures — out of scope; only new runs going forward get the corrected figure.
- Tuning the exact wait duration beyond Apify's documented "~10 seconds" recommendation — no env var, no adaptive backoff.

## Decisions

### 1. Wait ~10s, then re-fetch the run object without `waitForFinish`, concurrently with the dataset-items fetch

```js
const [datasetData, finalRunData] = await Promise.all([
  fetchDatasetItems(datasetId, token),
  (async () => { await wait(10000); return fetchRun(actorId, runId, token); })(),
]);
```

`runStats` is built from `finalRunData` (the settled re-fetch), not the original `waitData` from the `waitForFinish` poll. The dataset-items fetch and the 10-second settlement wait run in parallel, so the added wall-clock cost is `max(datasetFetchDuration, 10s) - datasetFetchDuration` in the common case (i.e., near-zero when the dataset fetch itself takes close to or longer than 10s; the full ~10s only when the dataset fetch is very fast).

**Alternative considered**: serialize the wait after the dataset fetch. Rejected — no reason to pay the full 10s on top of the dataset fetch when they don't depend on each other.

### 2. Injectable `delay` via `deps`, threaded from `executeActor`/`executePeopleActor`/`executeTermsActor` down to `runActor`

```js
export async function executeActor(targetUrls, settings, deps = {}) { ... return runActor(actorId, token, input, deps); }
async function runActor(actorId, token, input, deps = {}) {
  const { delay: wait = (ms) => new Promise(r => setTimeout(r, ms)) } = deps;
  ...
}
```

Existing callers (`lib/orchestrator.js`) don't pass a third argument — they get the real 10-second wait unchanged. Unit tests pass `{ delay: async () => {} }` to skip it. This mirrors the `deps = {}` convention already used throughout `lib/orchestrator.js`/`lib/claude.js`, extended into `lib/apify.js` for the first time (previously apify.js had zero DI — this is the minimal amount needed to make the new timing-dependent code testable).

## Risks / Trade-offs

- **[Every Apify call is now ~10s slower in the worst case]** → Acceptable: this is a cron/batch job and a manual debug endpoint, not a latency-sensitive user-facing request. Mitigated by running the wait concurrently with the dataset fetch (Decision 1).
- **[Apify's own docs say "about 10 seconds" — not a hard guarantee]** → There's a residual chance the figure is still not fully settled even after 10s in rare cases. Not solved here; if this recurs, a documented follow-up would be a second re-check or a longer wait, not a design defect requiring rework now.
