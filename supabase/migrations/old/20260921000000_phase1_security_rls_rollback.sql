-- ==============================================================================
-- PHASE 1: ROLLBACK SCRIPT FOR RLS, VIEWS & RPCs
-- Run this script in the Supabase SQL Editor if you need to revert Phase 1 changes
-- ==============================================================================

-- 1. Drop Security Definer RPC & View
DROP FUNCTION IF EXISTS public.get_protected_entry(TEXT, TEXT);
DROP VIEW IF EXISTS public.public_published_entries;

-- 2. Drop Passcode Attempts Table
DROP TABLE IF EXISTS public.passcode_attempts;

-- 3. Drop Table Policies
DROP POLICY IF EXISTS "Public can view published entries" ON public.entries;
DROP POLICY IF EXISTS "Admin full CRUD on entries" ON public.entries;
DROP POLICY IF EXISTS "Public can view comments" ON public.comments;
DROP POLICY IF EXISTS "Public can submit comments" ON public.comments;
DROP POLICY IF EXISTS "Admin can delete comments" ON public.comments;
DROP POLICY IF EXISTS "Admin full CRUD on comments" ON public.comments;
DROP POLICY IF EXISTS "Public can view reactions" ON public.reactions;
DROP POLICY IF EXISTS "Public can add reactions" ON public.reactions;
DROP POLICY IF EXISTS "Admin full CRUD on reactions" ON public.reactions;
DROP POLICY IF EXISTS "Admin only media access" ON public.media;

-- 4. Disable RLS
ALTER TABLE public.entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.media DISABLE ROW LEVEL SECURITY;
