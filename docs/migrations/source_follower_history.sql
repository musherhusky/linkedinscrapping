-- Migration: create source_follower_history table
-- Run in Supabase SQL Editor (once)

CREATE TABLE IF NOT EXISTS source_follower_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_url      TEXT        NOT NULL,
  followers_count INTEGER,
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  scraped_date    DATE        NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::DATE,

  -- One snapshot per user per URL per calendar day (UTC)
  CONSTRAINT uq_follower_history_day UNIQUE (user_id, target_url, scraped_date)
);

-- RLS: users can only read their own history
ALTER TABLE source_follower_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own follower history"
  ON source_follower_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
