This change is delivered in 3 separately-shippable phases (see `proposal.md` → Delivery Plan and `design.md` Decision 5). Each phase gets its own feature branch, PR, and verification — do not bundle them.

# Phase 1 — Table, saveApiUsage, Claude instrumentation

## 1.0 Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 1.0.1 Create feature branch `feature/track-api-costs-claude` from `main`
- [x] 1.0.2 Verify branch creation and current branch status

## 1.1 Database Migration

- [x] 1.1.1 Create `docs/migrations/create_api_usage_logs.sql`: `api_usage_logs` table with columns `id` (UUID PK), `user_id` (UUID, references auth.users), `provider` (TEXT, CHECK IN ('claude', 'apify')), `model_or_actor` (TEXT), `input_tokens` (INTEGER, nullable), `output_tokens` (INTEGER, nullable), `compute_units` (NUMERIC, nullable), `posts_received` (INTEGER NOT NULL DEFAULT 0), `estimated_cost_usd` (NUMERIC(10,6)), `rate_snapshot` (JSONB), `created_at` (TIMESTAMPTZ NOT NULL DEFAULT now()); added an index on `(user_id, created_at)` for the Phase 3 aggregation queries
- [ ] 1.1.2 Coordinate with the user to apply the migration against the live Supabase project (agent has no direct Supabase admin/SQL access)

## 1.2 Database Layer

- [x] 1.2.1 Add failing tests in `tests/unit/saveApiUsage.test.js` (fake Supabase client, following the `getActiveTerms.test.js` DI pattern) asserting `saveApiUsage(userId, provider, stats, supabase)` inserts a row into `api_usage_logs` with correct field mapping for a `'claude'` provider stats object
- [x] 1.2.2 Run the tests and confirm they fail (red) — confirmed: `saveApiUsage` export missing
- [x] 1.2.3 Add `saveApiUsage(userId, provider, stats, supabase = getSupabaseClient())` to `lib/database.js`, catching and logging insert errors without rethrowing (fire-and-forget, per `design.md` Decision 3)
- [x] 1.2.4 Run the tests and confirm they pass (green)

## 1.3 Claude Usage Instrumentation

- [x] 1.3.1 Add failing tests in `tests/unit/analyzeBatchUsage.test.js` asserting that after a successful `analyzeBatch` call, injected `saveUsage` is called with `provider: 'claude'`, `input_tokens`/`output_tokens` from `message.usage`, `posts_received`, and a computed `estimated_cost_usd` — via a `deps` parameter (`createMessage` override for the Anthropic call, `saveUsage` override), mirroring the `hallon.js` `deps = {}` pattern
- [x] 1.3.2 Add a test asserting a failed `createMessage` call does NOT call `saveUsage` (nothing to record), and a test asserting no `userId` means no usage call
- [x] 1.3.3 Add a test asserting a `saveUsage` failure does not propagate — `analyzeBatch` still returns its normal result
- [x] 1.3.4 Run the new tests and confirm they fail (red) — confirmed: all 4 new tests failed with `Could not resolve authentication method` (the real Anthropic client was still being called; no `deps` support existed)
- [x] 1.3.5 Define `CLAUDE_RATE_TABLE_PER_1K` in `lib/claude.js` — a per-model-ID rate lookup with only verified current rates (`claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-4-8`, etc.); models not in the table (including the `getAnalysisModel()` default, `claude-opus-4-5`, a legacy model with no verified current rate) get `estimated_cost_usd = null` and a logged warning rather than a guessed number (revised from the original single-constant plan — see `design.md` Decision 2)
- [x] 1.3.6 Add a `userId` parameter and optional `deps = {}` (`createMessage`, `saveUsage` overrides) to `analyzeBatch`; after the Anthropic call returns, compute cost from `message.usage` and call `saveUsage` (awaited, own try/catch so a logging failure never propagates, per Decision 3)
- [x] 1.3.7 Update `lib/analyzer.js`'s call to `analyzeBatch` to pass `userId` (already in scope in `analyzeNewPostsForUser`)
- [x] 1.3.8 Run the tests from 1.3.1–1.3.3 and confirm they pass (green) — 4/4 passed

## 1.4 Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 1.4.1 Reviewed `tests/unit/analyzeBatch.test.js` — grepped for `analyzeBatch(`/`userId`/`forcedTopics`, no hits. It only tests `buildPrompt` via source inspection and `saveAnalysisResults` mapping logic, never calls `analyzeBatch` directly, so no update needed

## 1.5 Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 1.5.1 Capture pre-test baseline: confirmed full unit suite (55 pre-existing tests) passed before this phase's edits
- [x] 1.5.2 Run targeted tests: `node --test tests/unit/saveApiUsage.test.js tests/unit/analyzeBatchUsage.test.js` — 7 passed
- [x] 1.5.3 Run full unit suite: `node --test tests/unit/*.test.js` — 62 passed, 0 failed
- [x] 1.5.4 Database state note: pure `node:test` unit tests with mocked Supabase clients — no live database mutation occurs from running the suite
- [x] 1.5.5 Create report `openspec/changes/track-api-costs/reports/2026-08-02-phase-1-unit-test-and-db-verification.md`
- [x] 1.5.6 Mark this step complete only after tests pass and the report exists

## 1.6 Manual Endpoint Testing with curl (MANDATORY if applicable)

- [x] 1.6.1 N/A — this phase adds no new HTTP endpoint. The endpoint that exercises `analyzeBatch` (`api/process-analysis.js`) would trigger a real, paid Anthropic API call for real user data; manual verification is out of scope. Correctness is verified via the unit tests above.

## 1.7 E2E Testing with Playwright MCP (MANDATORY if applicable)

- [x] 1.7.1 N/A — no frontend or user-facing workflow is affected by this phase

## 1.8 Commit

- [x] 1.8.1 Commit, push, PR, and merge Phase 1 before starting Phase 2

---

# Phase 2 — Apify usage instrumentation (companies, people, terms)

**Blocked on Phase 1** (needs `saveApiUsage` and the `api_usage_logs` table). Implements `design.md` Decision 5 — the breaking return-shape change and batched multi-user cost attribution.

## 2.0 Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 2.0.1 Create feature branch `feature/track-api-costs-apify` from `main` (after Phase 1 is merged)
- [x] 2.0.2 Verify branch creation and current branch status

## 2.1 Failing Tests First (TDD) — return shape change

- [x] 2.1.1 Confirmed via Apify's public API docs (read-only WebFetch, no cost): the run response has `usageTotalUsd` at the top level of `data` and `stats.computeUnits` — matches `design.md` Decision 4's assumption exactly
- [x] 2.1.2 Update tests in `tests/unit/executeTermsActor.test.js` asserting the return value is now `{ posts, runStats }` where `runStats` includes `actorId`, `computeUnits`, and `usageTotalUsd` read from the run response
- [x] 2.1.3 Run the tests and confirm they fail (red) — confirmed: `TypeError: Cannot read properties of undefined (reading 'length')` on `result.posts`

## 2.2 Implementation — runActor / executeActor / executePeopleActor / executeTermsActor

- [x] 2.2.1 In `lib/apify.js`, update `runActor()` to also return the raw run stats object (`waitData.data.stats` and `waitData.data.usageTotalUsd`) alongside `items`
- [x] 2.2.2 Update `executeActor`, `executePeopleActor`, `executeTermsActor` to return `{ posts, runStats: { actorId, computeUnits, usageTotalUsd } }` instead of a bare array
- [x] 2.2.3 Run the tests from 2.1 and confirm they pass (green) — 9/9 passed

## 2.3 Failing Tests First (TDD) — orchestrator call-site updates and cost attribution

- [x] 2.3.1 Update `tests/unit/orchestratorTerms.test.js` mocks (`executeActor`/`executePeopleActor`/`executeTermsActor`) for the new `{ posts, runStats }` shape
- [x] 2.3.2 Add a test asserting the batched path (`processAllUsersBatched`) calls `saveApiUsage` once per user for term posts, with `estimated_cost_usd`/`compute_units` split proportionally by that user's share of the batch's total posts (per `design.md` Decision 5)
- [x] 2.3.3 Add tests asserting the legacy single-user path (`processTerms`) calls `saveApiUsage` once with the full run's stats (no splitting needed — single user per call)
- [x] 2.3.4 Run the new/updated tests and confirm they fail (red) — confirmed: multiple assertion failures (`undefined !== 1`, etc.) since orchestrator.js still treats actor results as bare arrays

## 2.4 Implementation — orchestrator wiring

- [x] 2.4.1 Update all `lib/orchestrator.js` call sites (`processUser`, `processPeople`, `processTerms`, `processAllUsersBatched`) to destructure `{ posts, runStats }` from the actor calls instead of treating the result as a bare array
- [x] 2.4.2 In the legacy single-user functions (`processUser`, `processPeople`, `processTerms`), added a `deps = {}` param (`processUser`/`processPeople` didn't have one before) overriding the actor function and `saveApiUsage`; log usage right after a successful run (before the empty-posts early return, since Apify already billed regardless of new/relevant post count)
- [x] 2.4.3 In `distributeAndProcess` (called from `processAllUsersBatched`), added a `logApifyUsageShare()` helper called once per source type per user, splitting `compute_units`/`estimated_cost_usd` proportionally by that user's share of the batch's total posts for that source type (per `design.md` Decision 5)
- [x] 2.4.4 Run the tests from 2.3 and confirm they pass (green) — 8/8 passed

## 2.5 Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 2.5.1 Grepped all test files for `executeActor`/`executePeopleActor`/`executeTermsActor` — only `executeTermsActor.test.js` and `orchestratorTerms.test.js` reference them, both already updated in Sections 2.1/2.3

## 2.6 Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 2.6.1 Capture pre-test baseline: confirmed 62 pre-existing tests passed before this phase's edits
- [x] 2.6.2 Run targeted tests: `node --test tests/unit/executeTermsActor.test.js tests/unit/orchestratorTerms.test.js` — 17 passed
- [x] 2.6.3 Run full unit suite: `node --test tests/unit/*.test.js` — 64 passed, 0 failed
- [x] 2.6.4 Database state note: no live DB mutation from the suite (mocked clients throughout)
- [x] 2.6.5 Create report `openspec/changes/track-api-costs/reports/2026-08-02-phase-2-unit-test-and-db-verification.md`
- [x] 2.6.6 Mark complete only after tests pass and the report exists

## 2.7 Manual Endpoint Testing with curl (MANDATORY if applicable)

- [x] 2.7.1 N/A — no new endpoint; the affected endpoints (`api/process-apify-dataset.js`, `api/process-all-users.js`) trigger real, paid Apify runs. Correctness verified via unit tests. Also confirmed via grep that no other call sites (outside `lib/apify.js`, `lib/orchestrator.js`, and their tests) reference `executeActor`/`executePeopleActor`/`executeTermsActor` directly.

## 2.8 E2E Testing with Playwright MCP (MANDATORY if applicable)

- [x] 2.8.1 N/A — no frontend affected

## 2.9 Commit

- [x] 2.9.1 Commit, push, PR, and merge Phase 2 before starting Phase 3

---

# Phase 3 — Insights API exposure

**Blocked on Phase 1 and Phase 2** (needs usage data actually being logged for both providers).

## 3.0 Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 3.0.1 Create feature branch `feature/track-api-costs-insights` from `main` (after Phase 2 is merged)
- [ ] 3.0.2 Verify branch creation and current branch status

## 3.1 Failing Tests First (TDD)

- [ ] 3.1.1 Add tests in `tests/unit/getApiCostSummary.test.js` asserting `getApiCostSummary(userId, from, to, supabase)` aggregates `estimated_cost_usd` grouped by `provider`, filtered by `user_id` and date range
- [ ] 3.1.2 Add a test asserting zero-value output (not absent/null) when no usage rows exist for the period
- [ ] 3.1.3 Run the tests and confirm they fail (red)

## 3.2 Implementation

- [ ] 3.2.1 Add `getApiCostSummary(userId, from, to, supabase = getSupabaseClient())` to `lib/database.js`
- [ ] 3.2.2 Update `api/insights.js` to call `getApiCostSummary` and include an `api_costs` field in the response, per `design.md`'s resolved Open Question (extend `/api/insights`, no new route)
- [ ] 3.2.3 Run the tests from 3.1 and confirm they pass (green)

## 3.3 Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 3.3.1 Capture pre-test baseline
- [ ] 3.3.2 Run targeted tests: `node --test tests/unit/getApiCostSummary.test.js`
- [ ] 3.3.3 Run full unit suite: `node --test tests/unit/*.test.js`
- [ ] 3.3.4 Database state note: no live DB mutation from the suite
- [ ] 3.3.5 Create report `openspec/changes/track-api-costs/reports/YYYY-MM-DD-phase-3-unit-test-and-db-verification.md`
- [ ] 3.3.6 Mark complete only after tests pass and the report exists

## 3.4 Manual Endpoint Testing with curl (MANDATORY if applicable)

- [ ] 3.4.1 `/api/insights` is an existing endpoint whose response shape changes (new `api_costs` field) — MANDATORY. Agent must start the endpoint locally or against a safe environment, call it with a real/test `userId` that has `auto_execution_enabled` data, and verify `api_costs` appears with the expected shape. Document the curl command and response in the phase 3 report.

## 3.5 E2E Testing with Playwright MCP (MANDATORY if applicable)

- [ ] 3.5.1 N/A unless a frontend dashboard consumes `/api/insights` directly in this repo — confirm scope before marking N/A; if a frontend exists elsewhere, flag that a follow-up in that repo is needed but is out of scope here.

## 3.6 Commit

- [ ] 3.6.1 Commit, push, PR, and merge Phase 3
