-- Migration: enrich target_companies with profile metadata
-- Run in Supabase SQL Editor (once)

ALTER TABLE target_companies
  ADD COLUMN IF NOT EXISTS linkedin_id       TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url        TEXT,
  ADD COLUMN IF NOT EXISTS followers_count   INTEGER,
  ADD COLUMN IF NOT EXISTS last_enriched_at  TIMESTAMPTZ;
