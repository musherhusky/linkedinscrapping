## Why

A user compared a manually-triggered run's saved cost against Apify's own console and found we're undercounting significantly (e.g. term actor: `$0.00005` saved vs `$0.01` shown in Apify; company actor: `$0.03505` saved vs `$0.05` shown). Apify's API documentation confirms the cause: "the first response after completion can still show preliminary stats, costs, and event counts. For stable figures, wait about 10 seconds and call the endpoint again." `runActor()` in `lib/apify.js` reads `usageTotalUsd`/`stats.computeUnits` from the exact same response that confirms the run reached `SUCCEEDED` — the preliminary figure, not the settled one.

## What Changes

- `runActor()` waits ~10 seconds after detecting `SUCCEEDED`, then re-fetches the run object (without `waitForFinish`) to read stabilized `usageTotalUsd`/`stats.computeUnits`, per Apify's documented guidance. The re-fetch runs concurrently with the dataset-items fetch (not serially) to minimize added latency.
- The wait is injectable (`deps.delay`) so unit tests don't incur a real 10-second wait.

## Capabilities

### Modified Capabilities
- `api-usage-logging`: the Apify cost figures recorded in `api_usage_logs`/`api_run_logs` now reflect Apify's settled cost, not the preliminary figure available immediately at run completion.

## Impact

- **Code**: `lib/apify.js` — `runActor()` gains a settlement delay + re-fetch; `executeActor`/`executePeopleActor`/`executeTermsActor` gain an optional `deps` parameter threaded through to it (default behavior unchanged for existing callers that don't pass one).
- **Latency**: every Apify actor call (batched and single-user paths alike) takes ~10 seconds longer (or less, since the settlement re-fetch runs in parallel with the dataset-items fetch — only the difference beyond that fetch's own duration is added).
- **No schema/migration changes** — this only affects which numbers get written to already-existing columns.
