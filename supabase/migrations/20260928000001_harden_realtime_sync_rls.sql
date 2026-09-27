-- ==============================================================================
-- MIGRATION: Harden realtime_sync RLS — read-only for public users
-- Run in Supabase Dashboard → SQL Editor → New Query → Run
-- ==============================================================================

-- Revoke ALL write grants from anon and authenticated (public) roles.
-- The server writes via the service_role key (bypasses RLS), so reads-only
-- for the anon/authenticated roles is perfectly safe.
REVOKE INSERT, UPDATE, DELETE ON public.realtime_sync FROM anon, authenticated;

-- Ensure SELECT is still granted so the polling fallback can read version
GRANT SELECT ON public.realtime_sync TO anon, authenticated;

-- Drop the overly-permissive "Allow sync updates" policy
DROP POLICY IF EXISTS "Allow sync updates" ON public.realtime_sync;

-- Keep the read-only SELECT policy (re-create to be explicit)
DROP POLICY IF EXISTS "Public can read realtime_sync" ON public.realtime_sync;
CREATE POLICY "Public can read realtime_sync" ON public.realtime_sync
  FOR SELECT TO anon, authenticated USING (true);

-- Block all other DML from anon/authenticated via RLS (belt-and-suspenders)
DROP POLICY IF EXISTS "Deny public writes to realtime_sync" ON public.realtime_sync;
CREATE POLICY "Deny public writes to realtime_sync" ON public.realtime_sync
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
