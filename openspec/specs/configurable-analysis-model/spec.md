# Capability: Configurable Analysis Model

## Purpose

Let the Claude model used for post categorization/analysis be changed via environment variable, as an operational cost lever, without touching code or per-user/plan configuration.

## Requirements

### Requirement: Analysis model is configurable via environment variable
The system SHALL provide `getAnalysisModel()` in `lib/claude.js`, which returns the value of the `ANTHROPIC_MODEL_ANALYSIS` environment variable when set, and `'claude-opus-4-5'` otherwise. `analyzeBatch()` SHALL use this function to determine the `model` parameter passed to the Anthropic API.

#### Scenario: Environment variable is set
- **WHEN** `ANTHROPIC_MODEL_ANALYSIS` is set to `"claude-haiku-4-5"` and `getAnalysisModel()` is called
- **THEN** it returns `"claude-haiku-4-5"`

#### Scenario: Environment variable is unset
- **WHEN** `ANTHROPIC_MODEL_ANALYSIS` is not set and `getAnalysisModel()` is called
- **THEN** it returns `"claude-opus-4-5"`

#### Scenario: analyzeBatch uses the resolved model
- **WHEN** `analyzeBatch()` calls the Anthropic API
- **THEN** the `model` parameter passed to `client.messages.create()` equals the value returned by `getAnalysisModel()`
