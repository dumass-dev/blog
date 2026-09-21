-- ==============================================================================
-- PHASE 2: ROLLBACK SCRIPT FOR RATE LIMITS TABLE & RPC
-- Run this script in the Supabase SQL Editor if you need to revert Phase 2 DB rate limiting
-- ==============================================================================

DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT, INT, INT);
DROP TABLE IF EXISTS public.rate_limits;
