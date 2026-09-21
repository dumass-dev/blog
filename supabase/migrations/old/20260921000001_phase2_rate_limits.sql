-- ==============================================================================
-- PHASE 2: SERVERLESS DB-BACKED RATE LIMITING TABLE & RPC
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Create Serverless-Persistent Rate Limits Table
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  count INT NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL
);

-- Enable RLS (Deny all direct anon/public table access)
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No public access to rate_limits" ON public.rate_limits;
CREATE POLICY "No public access to rate_limits" ON public.rate_limits
  FOR ALL USING (false);

-- 2. Create DB Rate Limit RPC Function (Atomically check & increment)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  rate_key TEXT,
  max_attempts INT DEFAULT 5,
  window_seconds INT DEFAULT 600
)
RETURNS TABLE (
  allowed BOOLEAN,
  current_count INT,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_reset_at TIMESTAMPTZ;
  v_count INT;
  v_row public.rate_limits%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.rate_limits WHERE key = rate_key FOR UPDATE;

  IF v_row.key IS NULL THEN
    v_reset_at := v_now + (window_seconds || ' seconds')::INTERVAL;
    v_count := 1;
    INSERT INTO public.rate_limits (key, count, reset_at)
    VALUES (rate_key, 1, v_reset_at);
  ELSIF v_row.reset_at <= v_now THEN
    v_reset_at := v_now + (window_seconds || ' seconds')::INTERVAL;
    v_count := 1;
    UPDATE public.rate_limits
    SET count = 1, reset_at = v_reset_at
    WHERE key = rate_key;
  ELSE
    v_reset_at := v_row.reset_at;
    v_count := v_row.count + 1;
    UPDATE public.rate_limits
    SET count = v_count
    WHERE key = rate_key;
  END IF;

  IF v_count <= max_attempts THEN
    RETURN QUERY SELECT true, v_count, v_reset_at;
  ELSE
    RETURN QUERY SELECT false, v_count, v_reset_at;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) TO anon, authenticated;
