-- Track every paid external API call (Claude, Apify) so spend is visible
-- per user, per day, per provider. See openspec/changes/track-api-costs/.

CREATE TABLE api_usage_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL CHECK (provider IN ('claude', 'apify')),
  model_or_actor      TEXT,
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  compute_units       NUMERIC,
  posts_received      INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd  NUMERIC(10, 6),
  rate_snapshot       JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_usage_logs_user_created ON api_usage_logs (user_id, created_at);
