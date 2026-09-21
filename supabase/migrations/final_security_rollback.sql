-- ==============================================================================
-- EMERGENCY ROLLBACK SCRIPT FOR final_security.sql
-- Run this in the Supabase SQL Editor if you need to revert security policies
-- ==============================================================================

BEGIN;

-- 1. Restore Direct SELECT Access to anon on base entries table
GRANT SELECT ON public.entries TO anon, authenticated;

-- 2. Restore Public View Access
GRANT SELECT ON public.public_published_entries TO anon, authenticated;

-- 3. Drop Triggers
DROP TRIGGER IF EXISTS trg_entries_hash_passcode ON public.entries;
DROP TRIGGER IF EXISTS trg_comments_rate_limit ON public.comments;
DROP TRIGGER IF EXISTS trg_reactions_rate_limit ON public.reactions;

-- 4. Drop Security Functions & RPCs
DROP FUNCTION IF EXISTS public.trg_before_entry_save_hash_passcode();
DROP FUNCTION IF EXISTS public.trg_before_comment_insert();
DROP FUNCTION IF EXISTS public.trg_before_reaction_insert();
DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT, TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.get_protected_entry(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.increment_views(TEXT);
DROP FUNCTION IF EXISTS public.is_admin();

-- 5. Drop Policies
DROP POLICY IF EXISTS "Admin strict write delete entries" ON public.entries;
DROP POLICY IF EXISTS "Public can view comments" ON public.comments;
DROP POLICY IF EXISTS "Public can submit comments" ON public.comments;
DROP POLICY IF EXISTS "Admin strict write delete comments" ON public.comments;
DROP POLICY IF EXISTS "Public can view reactions" ON public.reactions;
DROP POLICY IF EXISTS "Public can add reactions" ON public.reactions;
DROP POLICY IF EXISTS "Admin strict write delete reactions" ON public.reactions;
DROP POLICY IF EXISTS "Admin strict media access" ON public.media;
DROP POLICY IF EXISTS "Public read about" ON public.about;
DROP POLICY IF EXISTS "Admin strict about write" ON public.about;
DROP POLICY IF EXISTS "Public read updates" ON public.updates;
DROP POLICY IF EXISTS "Admin strict updates write" ON public.updates;
DROP POLICY IF EXISTS "No public access to passcode_attempts" ON public.passcode_attempts;
DROP POLICY IF EXISTS "No public access to rate_limit_counters" ON public.rate_limit_counters;

-- 6. Disable Row Level Security (RLS) on public tables
ALTER TABLE IF EXISTS public.entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.media DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.about DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.updates DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.passcode_attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rate_limit_counters DISABLE ROW LEVEL SECURITY;

-- WARNING: Passcode bcrypt hashes CANNOT be un-hashed by rollback as bcrypt is a one-way hash.
RAISE NOTICE 'ROLLBACK COMPLETE. NOTE: Passcodes previously hashed with bcrypt remain hashed as bcrypt is one-way.';

COMMIT;
