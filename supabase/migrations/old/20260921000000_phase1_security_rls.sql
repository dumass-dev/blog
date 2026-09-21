-- ==============================================================================
-- PHASE 1: DATA & SECRET SECURITY MIGRATION (RLS, VIEWS, RPC & POLICIES)
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Enable pgcrypto extension for secure passcode hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create Passcode Attempts Table for Brute-Force Rate Limiting (15 min lockout after 5 fails)
CREATE TABLE IF NOT EXISTS public.passcode_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id TEXT NOT NULL,
  attempt_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_passcode_attempts_entry_time 
  ON public.passcode_attempts(entry_id, attempt_time);

-- Enable RLS on passcode_attempts table
ALTER TABLE public.passcode_attempts ENABLE ROW LEVEL SECURITY;

-- Deny all public access to passcode_attempts by default
DROP POLICY IF EXISTS "No public access to passcode_attempts" ON public.passcode_attempts;
CREATE POLICY "No public access to passcode_attempts" ON public.passcode_attempts
  FOR ALL USING (false);

-- 3. Enable Row Level Security (RLS) on all public tables
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES FOR 'entries' TABLE
-- Drop existing policies if any
DROP POLICY IF EXISTS "Public can view published entries without passcode" ON public.entries;
DROP POLICY IF EXISTS "Admin full CRUD on entries" ON public.entries;

-- Public Anon SELECT Policy: Allow viewing published non-draft entries
CREATE POLICY "Public can view published entries" ON public.entries
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

-- Admin Full Access Policy for entries
CREATE POLICY "Admin full CRUD on entries" ON public.entries
  FOR ALL
  TO authenticated
  USING (
    auth.role() = 'authenticated' AND 
    (auth.jwt() ->> 'email' IS NOT NULL OR auth.uid() IS NOT NULL)
  )
  WITH CHECK (
    auth.role() = 'authenticated' AND 
    (auth.jwt() ->> 'email' IS NOT NULL OR auth.uid() IS NOT NULL)
  );

-- 5. CREATE SAFE PUBLIC VIEW FOR ENTRIES (Redacts passcode & protected content)
CREATE OR REPLACE VIEW public.public_published_entries AS
SELECT
  id,
  title,
  slug,
  type,
  category,
  tags,
  date,
  location,
  weather,
  mood,
  views,
  show_in_feed,
  created_at,
  updated_at,
  CASE 
    WHEN passcode IS NOT NULL AND TRIM(passcode) != '' THEN true 
    ELSE false 
  END AS is_protected,
  CASE 
    WHEN passcode IS NOT NULL AND TRIM(passcode) != '' THEN '' 
    ELSE cover_image 
  END AS cover_image,
  CASE 
    WHEN passcode IS NOT NULL AND TRIM(passcode) != '' THEN '🔒 Protected entry' 
    ELSE excerpt 
  END AS excerpt,
  CASE 
    WHEN passcode IS NOT NULL AND TRIM(passcode) != '' THEN '🔒 This entry is passcode-protected.' 
    ELSE content 
  END AS content
FROM public.entries
WHERE status = 'published';

-- Grant SELECT permissions on the public view
GRANT SELECT ON public.public_published_entries TO anon, authenticated;

-- 6. SECURITY DEFINER RPC FOR VERIFYING PASSCODES & UNLOCKING CONTENT
CREATE OR REPLACE FUNCTION public.get_protected_entry(target_identifier TEXT, code TEXT)
RETURNS TABLE (
  unlocked BOOLEAN,
  content TEXT,
  cover_image TEXT,
  excerpt TEXT,
  error_message TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.entries%ROWTYPE;
  v_recent_fails INT;
  v_is_valid BOOLEAN := FALSE;
  v_clean_code TEXT := TRIM(code);
BEGIN
  -- Find target entry by UUID or Slug
  IF target_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO v_entry FROM public.entries WHERE id = target_identifier::UUID AND status = 'published';
  ELSE
    SELECT * INTO v_entry FROM public.entries WHERE slug = target_identifier AND status = 'published';
  END IF;

  IF v_entry.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, NULL::TEXT, 'Entry not found'::TEXT;
    RETURN;
  END IF;

  -- Check if entry has a passcode set
  IF v_entry.passcode IS NULL OR TRIM(v_entry.passcode) = '' THEN
    RETURN QUERY SELECT true, v_entry.content, v_entry.cover_image, v_entry.excerpt, NULL::TEXT;
    RETURN;
  END IF;

  -- Rate limit check: Count failed attempts in last 15 minutes
  SELECT COUNT(*) INTO v_recent_fails
  FROM public.passcode_attempts
  WHERE entry_id = v_entry.id::TEXT
    AND attempt_time > NOW() - INTERVAL '15 minutes'
    AND success = false;

  IF v_recent_fails >= 5 THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, NULL::TEXT, 'Too many failed attempts. Locked for 15 minutes.'::TEXT;
    RETURN;
  END IF;

  -- Verify passcode (supports bcrypt hash or exact match)
  IF v_entry.passcode LIKE '$2a$%' OR v_entry.passcode LIKE '$2b$%' THEN
    v_is_valid := (v_entry.passcode = crypt(v_clean_code, v_entry.passcode));
  ELSE
    v_is_valid := (TRIM(v_entry.passcode) = v_clean_code);
  END IF;

  -- Record attempt
  INSERT INTO public.passcode_attempts (entry_id, attempt_time, success)
  VALUES (v_entry.id::TEXT, NOW(), v_is_valid);

  IF v_is_valid THEN
    RETURN QUERY SELECT true, v_entry.content, v_entry.cover_image, v_entry.excerpt, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, NULL::TEXT, 'Incorrect passcode'::TEXT;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_protected_entry(TEXT, TEXT) TO anon, authenticated;

-- 7. POLICIES FOR 'comments' TABLE
DROP POLICY IF EXISTS "Public can view comments" ON public.comments;
DROP POLICY IF EXISTS "Public can submit comments" ON public.comments;
DROP POLICY IF EXISTS "Admin can delete comments" ON public.comments;

-- Public Anon SELECT: Anyone can read comments
CREATE POLICY "Public can view comments" ON public.comments
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Public Anon INSERT: Validate length constraints (max 2000 chars content, max 100 chars name)
CREATE POLICY "Public can submit comments" ON public.comments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(content) > 0 AND 
    char_length(content) <= 2000 AND 
    (author_name IS NULL OR char_length(author_name) <= 100)
  );

-- Admin ONLY Delete Policy (Denies anonymous deletions)
CREATE POLICY "Admin can delete comments" ON public.comments
  FOR DELETE
  TO authenticated
  USING (auth.role() = 'authenticated');

-- Admin FULL CRUD Policy for comments
CREATE POLICY "Admin full CRUD on comments" ON public.comments
  FOR ALL
  TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 8. POLICIES FOR 'reactions' TABLE
DROP POLICY IF EXISTS "Public can view reactions" ON public.reactions;
DROP POLICY IF EXISTS "Public can add reactions" ON public.reactions;

CREATE POLICY "Public can view reactions" ON public.reactions
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can add reactions" ON public.reactions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    reaction_type IN ('thoughtful', 'cozy', 'loved', 'inspiring')
  );

CREATE POLICY "Admin full CRUD on reactions" ON public.reactions
  FOR ALL
  TO authenticated
  USING (auth.role() = 'authenticated');

-- 9. POLICIES FOR 'media' TABLE (Admin Only Access)
DROP POLICY IF EXISTS "Admin only media access" ON public.media;

CREATE POLICY "Admin only media access" ON public.media
  FOR ALL
  TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
