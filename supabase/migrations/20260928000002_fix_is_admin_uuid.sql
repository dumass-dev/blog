-- ==============================================================================
-- SECURITY PATCH: Fix is_admin() RLS function — hardcoded UUID approach
-- (Supabase blocks ALTER DATABASE SET for custom app.* parameters)
--
-- ⚠️  VERIFY YOUR UUID BEFORE RUNNING:
--     The UUID below should be exactly 36 characters:
--     xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  (8-4-4-4-12)
--     The UUID you provided has 11 chars in the last segment (should be 12).
--     Please confirm the full UUID in:
--     Supabase → Authentication → Users → your account → User UID
--
-- Run this entire block in: Supabase Dashboard → SQL Editor
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT auth.uid() = '5aae74c6-2828-4f3f-9e2d-fff720dee224'::uuid;
$$;

-- Verify the function was updated and no longer references the all-zeros placeholder
DO $$
DECLARE
  fn_body TEXT;
BEGIN
  SELECT prosrc INTO fn_body
  FROM pg_proc
  WHERE proname = 'is_admin'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

  IF fn_body LIKE '%00000000-0000-0000-0000-000000000000%' THEN
    RAISE EXCEPTION 'PATCH FAILED: is_admin() still references the placeholder UUID.';
  END IF;

  IF fn_body NOT LIKE '%5aae74c6%' THEN
    RAISE EXCEPTION 'PATCH FAILED: is_admin() does not contain the expected admin UUID.';
  END IF;

  RAISE NOTICE 'SUCCESS: is_admin() is now hardcoded to the real admin UUID.';
END $$;

COMMIT;
