-- ==============================================================================
-- SUPABASE MIGRATION: Instant Cross-Device Realtime Sync for All Devices & Phones
-- Run this in your Supabase SQL Editor: Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Create a dedicated lightweight realtime_sync table for zero-latency CDC events
CREATE TABLE IF NOT EXISTS public.realtime_sync (
  id text PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  event text NOT NULL DEFAULT 'sync',
  payload jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Seed initial row
INSERT INTO public.realtime_sync (id, version, event, payload, updated_at)
VALUES ('latest', 1, 'init', '{}'::jsonb, now())
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security (RLS) and grant read access to everyone (readers on mobile & web)
ALTER TABLE public.realtime_sync ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.realtime_sync TO anon, authenticated;
GRANT ALL ON public.realtime_sync TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read realtime_sync" ON public.realtime_sync;
CREATE POLICY "Public can read realtime_sync" ON public.realtime_sync 
FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow sync updates" ON public.realtime_sync;
CREATE POLICY "Allow sync updates" ON public.realtime_sync 
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. Add realtime_sync, entries, about, comments, and reactions to Supabase Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'realtime_sync'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.realtime_sync;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.entries;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'about'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.about;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
  END IF;
END $$;

-- 3. Set REPLICA IDENTITY FULL so complete rows are emitted in change events
ALTER TABLE public.realtime_sync REPLICA IDENTITY FULL;
ALTER TABLE public.entries REPLICA IDENTITY FULL;
ALTER TABLE public.about REPLICA IDENTITY FULL;
ALTER TABLE public.comments REPLICA IDENTITY FULL;
ALTER TABLE public.reactions REPLICA IDENTITY FULL;

-- 4. Authorize anonymous and authenticated users for Supabase Realtime Broadcast & Presence
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'realtime' AND table_name = 'messages') THEN
    EXECUTE 'DROP POLICY IF EXISTS "allow_anon_broadcast" ON realtime.messages';
    EXECUTE 'CREATE POLICY "allow_anon_broadcast" ON realtime.messages FOR INSERT TO anon, authenticated WITH CHECK (true)';
    EXECUTE 'DROP POLICY IF EXISTS "allow_anon_listen" ON realtime.messages';
    EXECUTE 'CREATE POLICY "allow_anon_listen" ON realtime.messages FOR SELECT TO anon, authenticated USING (true)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignored if realtime schema permissions are locked
END $$;
