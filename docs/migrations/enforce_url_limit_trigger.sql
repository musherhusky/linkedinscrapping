-- Migration: enforce URL limit per plan
-- Run this in the Supabase SQL Editor (or via supabase db push if using CLI)
--
-- What it does:
--   Before any INSERT into target_companies or target_people, checks whether
--   the user has reached the max_urls limit defined in their active plan.
--   If the limit is reached, the insert is rejected with a clear error message.
--   If the user has no plan row or the plan has max_urls = NULL, the insert is allowed (unlimited).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Shared function used by both triggers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_user_url_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_urls   INTEGER;
  v_current    INTEGER;
BEGIN
  -- Get max_urls from the user's active plan (NULL = unlimited)
  SELECT p.max_urls
    INTO v_max_urls
    FROM user_plans up
    JOIN plans p ON p.id = up.plan_id
   WHERE up.user_id = NEW.user_id
     AND up.status IN ('trialing', 'active', 'past_due')
   LIMIT 1;

  -- No plan found or unlimited plan → allow
  IF v_max_urls IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count current active URLs across both tables
  SELECT
    COALESCE((SELECT COUNT(*) FROM target_companies WHERE user_id = NEW.user_id AND active = true), 0)
    +
    COALESCE((SELECT COUNT(*) FROM target_people   WHERE user_id = NEW.user_id AND active = true), 0)
  INTO v_current;

  IF v_current >= v_max_urls THEN
    RAISE EXCEPTION 'URL_LIMIT_REACHED: plan allows % URLs, you already have % active',
      v_max_urls, v_current
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger on target_companies
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_check_url_limit_companies ON target_companies;

CREATE TRIGGER trg_check_url_limit_companies
  BEFORE INSERT ON target_companies
  FOR EACH ROW
  EXECUTE FUNCTION check_user_url_limit();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger on target_people
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_check_url_limit_people ON target_people;

CREATE TRIGGER trg_check_url_limit_people
  BEFORE INSERT ON target_people
  FOR EACH ROW
  EXECUTE FUNCTION check_user_url_limit();
