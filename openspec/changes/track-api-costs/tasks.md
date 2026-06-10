## 1. Database Migration

- [ ] 1.1 Create Supabase migration SQL to add `api_usage_logs` table with columns: `id`, `user_id`, `provider` (enum: `claude` | `apify`), `model_or_actor`, `input_tokens`, `output_tokens`, `compute_units`, `estimated_cost_usd`, `rate_snapshot` (JSONB), `created_at`. Add posts_received INT NOT NULL DEFAULT 0 to the api_usage_logs table definition.
- [ ] 1.2 Apply migration to Supabase (dev/staging) and verify table is created

## 2. Database Layer

- [ ] 2.1 Add `saveApiUsage(userId, provider, stats)` function to `lib/database.js` that inserts a row into `api_usage_logs` with fire-and-forget error handling
- [ ] 2.2 Write unit test for `saveApiUsage` verifying correct mapping of all fields

## 3. Claude Usage Instrumentation

- [ ] 3.1 Define cost rate constants in `lib/claude.js` (`CLAUDE_INPUT_COST_PER_1K`, `CLAUDE_OUTPUT_COST_PER_1K`) and add `userId` parameter to `analyzeBatch`
- [ ] 3.2 After `client.messages.create` returns, read `message.usage.input_tokens` and `message.usage.output_tokens`, compute estimated cost, and call `saveApiUsage` (fire-and-forget)
- [ ] 3.3 Update all callers of `analyzeBatch` to pass `userId`

## 4. Apify Usage Instrumentation

- [ ] 4.1 Define cost rate constant in `lib/apify.js` (`APIFY_COST_PER_CU`) and add `userId` parameter to `runActor`
- [ ] 4.2 After the `waitForFinish` poll, read `waitData.data.stats.computeUnits` (and `usageTotalUsd` if available), compute estimated cost, and call `saveApiUsage` (fire-and-forget)
- [ ] 4.3 Update `executeActor` and `executePeopleActor` to accept and forward `userId`
- [ ] 4.4 Update all callers of `executeActor` / `executePeopleActor` in `lib/orchestrator.js` to pass `userId`
- [ ] 4.5 Resolve batch cost allocation per user: a single Apify actor run covers all users.
      After distributeAndProcess() assigns posts to each user, calculate each user's share
      as (user_posts_received / total_posts_in_batch). Apply that ratio to the run's
      total compute units and estimated_cost_usd before calling saveApiUsage per user.
      Add posts_received INT column to api_usage_logs to store the per-user post count.
## 5. Insights API

- [ ] 5.1 Add `getApiCostSummary(userId, from, to)` query to `lib/database.js` that aggregates `estimated_cost_usd` from `api_usage_logs` grouped by `provider`
- [ ] 5.2 Expose `api_costs` field in the `/api/insights` endpoint response, returning zero-value objects when no data exists for the period
- [ ] 5.3 Write integration test for the insights endpoint verifying `api_costs` is present and correctly aggregated
