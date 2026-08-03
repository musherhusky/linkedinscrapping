-- Record the outcome of every processAllUsersBatched cron execution (one row
-- per invocation), independent of the per-provider api_run_logs/api_usage_logs
-- tables. See openspec/changes/cron-execution-visibility/.

CREATE TABLE cron_execution_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hour_utc          INTEGER NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('success', 'no_users', 'error')),
  users_processed   INTEGER NOT NULL DEFAULT 0,
  posts_sent        INTEGER NOT NULL DEFAULT 0,
  posts_failed      INTEGER NOT NULL DEFAULT 0,
  duration_ms       INTEGER,
  error_message     TEXT,
  started_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cron_execution_logs_started_at ON cron_execution_logs (started_at DESC);
