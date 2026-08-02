-- Record the raw, unsplit cost of every external API call (Claude, Apify),
-- independent of how many users its cost ends up attributed to in
-- api_usage_logs. See openspec/changes/api-run-audit-log/.

CREATE TABLE api_run_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            TEXT NOT NULL CHECK (provider IN ('claude', 'apify')),
  model_or_actor      TEXT,
  source_type         TEXT,
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  compute_units       NUMERIC,
  total_items         INTEGER,
  total_cost_usd      NUMERIC(10, 6),
  rate_snapshot       JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE api_usage_logs
  ADD COLUMN run_id UUID REFERENCES api_run_logs(id) ON DELETE SET NULL;

CREATE INDEX idx_api_usage_logs_run_id ON api_usage_logs (run_id);
