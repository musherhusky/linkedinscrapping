## Context

`lib/claude.js`'s `analyzeBatch()` calls `client.messages.create({ model: 'claude-opus-4-5', ... })` with the model hardcoded inline. This project already has a precedent for making external-provider identifiers configurable via env vars with a code-level default: `lib/apify.js` reads `APIFY_ACTOR_ID` / `APIFY_PEOPLE_ACTOR_ID` / `APIFY_TERMS_ACTOR_ID` from `process.env`, each with no fallback (they throw if unset) since those have no sane default. The Claude model differs in one respect: it already has a known-good current value, so the env var should have a code-level default rather than being required.

## Goals / Non-Goals

**Goals:**
- Make the analysis model configurable via `ANTHROPIC_MODEL_ANALYSIS` without changing default behavior.
- Keep the change testable without mocking the Anthropic SDK, consistent with how `lib/apify.js`'s `buildTermsActorInput` and similar pure helpers are tested.

**Non-Goals:**
- Changing the default model or recommending a specific value — that's an operational decision the user makes afterward by setting the env var.
- Per-user or per-plan model selection (`user_settings`/`plans`) — explicitly rejected in favor of an operational env var, since this is a cost/ops lever, not a product feature.
- Any change to the categorization prompt, batching, or the report-generation capability discussed conceptually but not yet built.

## Decisions

### 1. Env var with a code-level default, not a required var

Unlike `APIFY_ACTOR_ID` (no sane default, throws if missing), `ANTHROPIC_MODEL_ANALYSIS` defaults to `'claude-opus-4-5'` — the current hardcoded value — so this change is a pure refactor with zero behavior change until the operator opts in by setting the env var.

```js
export function getAnalysisModel() {
  return process.env.ANTHROPIC_MODEL_ANALYSIS || 'claude-opus-4-5';
}
```

### 2. Extract a pure, exported function rather than inlining `process.env` access

`analyzeBatch()` has no dependency-injection pattern (unlike `lib/hallon.js`'s `deps = {}` convention) and this change doesn't warrant introducing one just to test a one-line env var read. Extracting `getAnalysisModel()` as its own exported function makes it directly unit-testable (call it, assert the return value, using the existing `withEnv` test helper pattern from `tests/unit/executeTermsActor.test.js`) without touching `analyzeBatch()`'s control flow or mocking `client.messages.create`.

**Alternative considered**: add a `deps`/model parameter to `analyzeBatch()` itself. Rejected as unnecessary scope — this change only needs the *resolution* of the model to be testable, not the whole function's Anthropic-calling behavior mocked.

## Risks / Trade-offs

- **[Operator sets an invalid/unsupported model string]** → Anthropic's API returns a 404 for an unknown model ID; this surfaces as a normal `analyzeBatch()` error (already handled — errors there are caught per-batch in `lib/analyzer.js` and logged, not fatal to the whole run). No new error handling needed.
- **[Switching to a much smaller model could reduce categorization quality]** → Explicitly out of scope for this change to judge; the default is unchanged, and quality tradeoffs of a specific model choice are the user's decision to make and evaluate separately.
