-- ==============================================================================
-- ROLLBACK MIGRATION: 20260921000002_fix_pass_security_rollback.sql
-- Run this script in the Supabase SQL Editor to undo 20260921000002 changes if needed
-- ==============================================================================

DROP TRIGGER IF EXISTS trg_comments_rate_limit ON public.comments;
DROP TRIGGER IF EXISTS trg_reactions_rate_limit ON public.reactions;

DROP FUNCTION IF EXISTS public.trg_before_comment_insert();
DROP FUNCTION IF EXISTS public.trg_before_reaction_insert();
DROP FUNCTION IF EXISTS public.check_postgres_rate_limit(TEXT, TEXT, INT, INT);

GRANT SELECT(passcode) ON public.entries TO anon;
