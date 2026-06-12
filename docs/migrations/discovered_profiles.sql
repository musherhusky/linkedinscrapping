-- Migration: create discovered_profiles and discovered_profile_relations tables
-- Run in Supabase SQL Editor (once)

-- Global profile catalog — one row per unique LinkedIn URL
CREATE TABLE IF NOT EXISTS discovered_profiles (
  id                UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  linkedin_url      TEXT  NOT NULL,
  linkedin_id       TEXT,
  universal_name    TEXT,
  public_identifier TEXT,
  name              TEXT,
  type              TEXT  CHECK (type IN ('company', 'person')),
  headline          TEXT,
  avatar_url        TEXT,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_discovered_profiles_url UNIQUE (linkedin_url)
);

-- Tracks which tracked source URL led to a discovered profile
CREATE TABLE IF NOT EXISTS discovered_profile_relations (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  discovered_profile_id UUID    NOT NULL REFERENCES discovered_profiles(id) ON DELETE CASCADE,
  source_url            TEXT    NOT NULL,
  source_type           TEXT    NOT NULL CHECK (source_type IN ('reposter', 'mention')),
  relation_count        INTEGER NOT NULL DEFAULT 1,
  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_discovered_profile_relations UNIQUE (discovered_profile_id, source_url, source_type)
);

-- RLS: read-only for authenticated users; no writes from client
ALTER TABLE discovered_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovered_profile_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read discovered profiles"
  ON discovered_profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read discovered profile relations"
  ON discovered_profile_relations
  FOR SELECT
  TO authenticated
  USING (true);

-- RPC used by backend to atomically upsert + increment relation_count
CREATE OR REPLACE FUNCTION increment_discovered_relation(
  p_discovered_profile_id UUID,
  p_source_url            TEXT,
  p_source_type           TEXT,
  p_now                   TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO discovered_profile_relations
    (discovered_profile_id, source_url, source_type, relation_count, first_seen_at, last_seen_at)
  VALUES
    (p_discovered_profile_id, p_source_url, p_source_type, 1, p_now, p_now)
  ON CONFLICT (discovered_profile_id, source_url, source_type)
  DO UPDATE SET
    relation_count = discovered_profile_relations.relation_count + 1,
    last_seen_at   = p_now;
END;
$$;
