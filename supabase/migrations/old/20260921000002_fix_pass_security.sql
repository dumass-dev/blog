-- ==============================================================================
-- MIGRATION: 20260921000002_fix_pass_security.sql
-- FIX PASS: STRICT RLS, ADMIN UUID POLICIES, PASSCODE HASHING & RATE LIMIT TRIGGERS
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Enable pgcrypto extension for bcrypt passcode hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Audit Helper Query (run SELECT * FROM pg_policies to view all active policies)
-- SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public';

-- 3. Enable RLS on ALL public tables (Deny by default)
ALTER TABLE IF EXISTS public.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.about ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.passcode_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- 4. REVOKE Direct Grants on Sensitive Columns & Base Tables from anon
-- Anonymous readers must query public_published_entries view or get_protected_entry RPC
REVOKE SELECT(passcode) ON public.entries FROM anon;

-- 5. Migrate any existing plaintext passcodes to bcrypt hashes
UPDATE public.entries
SET passcode = crypt(passcode, gen_salt('bf'))
WHERE passcode IS NOT NULL
  AND TRIM(passcode) != ''
  AND passcode NOT LIKE '$2a$%'
  AND passcode NOT LIKE '$2b$%';

-- 6. STRICT POLICIES FOR 'entries' TABLE
DROP POLICY IF EXISTS "Public can view published entries" ON public.entries;
DROP POLICY IF EXISTS "Admin full CRUD on entries" ON public.entries;
DROP POLICY IF EXISTS "Admin write entries" ON public.entries;
DROP POLICY IF EXISTS "Admin delete entries" ON public.entries;

-- Public Anon SELECT: View published entries only
CREATE POLICY "Public can view published entries" ON public.entries
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

-- Admin Write/Delete/ALL Policy: Requires matching exact Admin UUID (NEVER auth.role() = 'authenticated')
-- Replace '00000000-0000-0000-0000-000000000000' with your actual VITE_ADMIN_USER_ID UUID if needed
CREATE POLICY "Admin strict write delete entries" ON public.entries
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      auth.uid() = '00000000-0000-0000-0000-000000000000'::uuid OR
      auth.uid()::text = COALESCE(current_setting('app.admin_user_id', true), '00000000-0000-0000-0000-000000000000')
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      auth.uid() = '00000000-0000-0000-0000-000000000000'::uuid OR
      auth.uid()::text = COALESCE(current_setting('app.admin_user_id', true), '00000000-0000-0000-0000-000000000000')
    )
  );

-- 7. STRICT POLICIES FOR 'comments' TABLE
DROP POLICY IF EXISTS "Public can view comments" ON public.comments;
DROP POLICY IF EXISTS "Public can submit comments" ON public.comments;
DROP POLICY IF EXISTS "Admin can delete comments" ON public.comments;
DROP POLICY IF EXISTS "Admin full CRUD on comments" ON public.comments;

CREATE POLICY "Public can view comments" ON public.comments
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can submit comments" ON public.comments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(content) > 0 AND 
    char_length(content) <= 2000 AND 
    (author_name IS NULL OR char_length(author_name) <= 100)
  );

CREATE POLICY "Admin strict write delete comments" ON public.comments
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      auth.uid() = '00000000-0000-0000-0000-000000000000'::uuid OR
      auth.uid()::text = COALESCE(current_setting('app.admin_user_id', true), '00000000-0000-0000-0000-000000000000')
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      auth.uid() = '00000000-0000-0000-0000-000000000000'::uuid OR
      auth.uid()::text = COALESCE(current_setting('app.admin_user_id', true), '00000000-0000-0000-0000-000000000000')
    )
  );

-- 8. STRICT POLICIES FOR 'reactions' TABLE
DROP POLICY IF EXISTS "Public can view reactions" ON public.reactions;
DROP POLICY IF EXISTS "Public can add reactions" ON public.reactions;
DROP POLICY IF EXISTS "Admin full CRUD on reactions" ON public.reactions;

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

CREATE POLICY "Admin strict write delete reactions" ON public.reactions
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      auth.uid() = '00000000-0000-0000-0000-000000000000'::uuid OR
      auth.uid()::text = COALESCE(current_setting('app.admin_user_id', true), '00000000-0000-0000-0000-000000000000')
    )
  );

-- 9. STRICT POLICIES FOR 'media' TABLE
DROP POLICY IF EXISTS "Admin only media access" ON public.media;

CREATE POLICY "Admin strict media access" ON public.media
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      auth.uid() = '00000000-0000-0000-0000-000000000000'::uuid OR
      auth.uid()::text = COALESCE(current_setting('app.admin_user_id', true), '00000000-0000-0000-0000-000000000000')
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      auth.uid() = '00000000-0000-0000-0000-000000000000'::uuid OR
      auth.uid()::text = COALESCE(current_setting('app.admin_user_id', true), '00000000-0000-0000-0000-000000000000')
    )
  );

-- 10. STRICT POLICIES FOR 'about' AND 'updates' TABLES
DROP POLICY IF EXISTS "Public read about" ON public.about;
DROP POLICY IF EXISTS "Admin strict about write" ON public.about;
DROP POLICY IF EXISTS "Public read updates" ON public.updates;
DROP POLICY IF EXISTS "Admin strict updates write" ON public.updates;

-- Public can read about and updates
CREATE POLICY "Public read about" ON public.about FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read updates" ON public.updates FOR SELECT TO anon, authenticated USING (true);

-- Admin strict write/delete policies
CREATE POLICY "Admin strict about write" ON public.about FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL AND (auth.uid() = '00000000-0000-0000-0000-000000000000'::uuid OR auth.uid()::text = COALESCE(current_setting('app.admin_user_id', true), '00000000-0000-0000-0000-000000000000')));

CREATE POLICY "Admin strict updates write" ON public.updates FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL AND (auth.uid() = '00000000-0000-0000-0000-000000000000'::uuid OR auth.uid()::text = COALESCE(current_setting('app.admin_user_id', true), '00000000-0000-0000-0000-000000000000')));

-- 11. POSTGRES TRIGGER RATE LIMITING FOR COMMENTS & REACTIONS
CREATE OR REPLACE FUNCTION public.check_postgres_rate_limit(
  p_ip TEXT,
  p_action TEXT,
  p_max_count INT,
  p_interval_minutes INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_window_start TIMESTAMPTZ := NOW() - (p_interval_minutes || ' minutes')::INTERVAL;
BEGIN
  -- Cleanup old records
  DELETE FROM public.rate_limit_counters WHERE window_start < NOW() - INTERVAL '1 day';

  -- Check count
  SELECT COALESCE(SUM(request_count), 0) INTO v_count
  FROM public.rate_limit_counters
  WHERE ip = p_ip AND action = p_action AND window_start >= v_window_start;

  IF v_count >= p_max_count THEN
    RETURN FALSE;
  END IF;

  -- Insert/update counter
  INSERT INTO public.rate_limit_counters (ip, action, request_count, window_start)
  VALUES (p_ip, p_action, 1, NOW())
  ON CONFLICT (ip, action) DO UPDATE
  SET request_count = public.rate_limit_counters.request_count + 1,
      window_start = NOW();

  RETURN TRUE;
END;
$$;

-- Trigger Function for Comments Insertion
CREATE OR REPLACE FUNCTION public.trg_before_comment_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_ip TEXT;
  v_headers JSON;
  v_allowed BOOLEAN;
BEGIN
  -- Validation checks
  IF NEW.content IS NULL OR TRIM(NEW.content) = '' THEN
    RAISE EXCEPTION 'Comment content cannot be empty.';
  END IF;

  IF char_length(NEW.content) > 2000 THEN
    RAISE EXCEPTION 'Comment content exceeds maximum allowed length of 2000 characters.';
  END IF;

  -- Extract IP from request headers setting or JWT claim
  BEGIN
    v_headers := current_setting('request.headers', true)::JSON;
    v_client_ip := COALESCE(
      v_headers->>'x-forwarded-for',
      v_headers->>'x-real-ip',
      current_setting('request.jwt.claims', true)::JSON->>'sub',
      'anon_client_session'
    );
  EXCEPTION WHEN OTHERS THEN
    v_client_ip := 'anon_client_session';
  END;

  -- Extract first IP if list
  IF v_client_ip LIKE '%,%' THEN
    v_client_ip := TRIM(split_part(v_client_ip, ',', 1));
  END IF;

  -- Rate limit: Max 5 comments per 10 minutes per IP
  v_allowed := public.check_postgres_rate_limit(v_client_ip, 'comment_insert', 5, 10);
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum 5 comments allowed per 10 minutes.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_rate_limit ON public.comments;
CREATE TRIGGER trg_comments_rate_limit
  BEFORE INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_before_comment_insert();

-- Trigger Function for Reactions Insertion
CREATE OR REPLACE FUNCTION public.trg_before_reaction_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_ip TEXT;
  v_headers JSON;
  v_allowed BOOLEAN;
BEGIN
  IF NEW.reaction_type NOT IN ('thoughtful', 'cozy', 'loved', 'inspiring') THEN
    RAISE EXCEPTION 'Invalid reaction type.';
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::JSON;
    v_client_ip := COALESCE(
      v_headers->>'x-forwarded-for',
      v_headers->>'x-real-ip',
      current_setting('request.jwt.claims', true)::JSON->>'sub',
      'anon_client_session'
    );
  EXCEPTION WHEN OTHERS THEN
    v_client_ip := 'anon_client_session';
  END;

  IF v_client_ip LIKE '%,%' THEN
    v_client_ip := TRIM(split_part(v_client_ip, ',', 1));
  END IF;

  -- Rate limit: Max 20 reactions per 5 minutes per IP
  v_allowed := public.check_postgres_rate_limit(v_client_ip, 'reaction_insert', 20, 5);
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum 20 reactions allowed per 5 minutes.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reactions_rate_limit ON public.reactions;
CREATE TRIGGER trg_reactions_rate_limit
  BEFORE INSERT ON public.reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_before_reaction_insert();

-- 12. Rollback Companion Script
-- Note: Rollback script is saved in 20260921000002_fix_pass_security_rollback.sql
