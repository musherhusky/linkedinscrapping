## Why

The Claude model used for post categorization/topic analysis (`lib/claude.js`) is hardcoded as `'claude-opus-4-5'`. As scraping volume grows, this is the single biggest AI cost lever in the pipeline (categorization is a structured-classification task run in batches of 20 posts, not a task that requires the most capable tier), but today changing it requires a code edit and redeploy.

## What Changes

- Read the model used by `analyzeBatch()` in `lib/claude.js` from a new environment variable, `ANTHROPIC_MODEL_ANALYSIS`, defaulting to the current model (`'claude-opus-4-5'`) so behavior is unchanged until the operator sets the env var.
- Extract model resolution into a small pure, exported function (`getAnalysisModel()`) so it's independently testable without mocking the Anthropic SDK client.

## Capabilities

### New Capabilities
- `configurable-analysis-model`: Defines how the Claude model used for post analysis is resolved from environment configuration, with a safe default.

### Modified Capabilities
(none — no existing spec constrains the analysis model)

## Impact

- **Code**: `lib/claude.js` — `analyzeBatch()`'s model selection changes from a hardcoded string to `getAnalysisModel()`, a new exported function. No other function signatures change.
- **Config/env**: new optional env var `ANTHROPIC_MODEL_ANALYSIS`; unset behaves identically to today.
- **Docs**: `.env.example` and `docs/backend-standards.md` § Anthropic API Usage updated to reflect the env-var-driven model.
- **Out of scope**: this change only makes the model configurable — it does not change the default model, add per-user/per-plan model tiering, or touch the categorization prompt/logic, Apify, or any other part of the pipeline.
