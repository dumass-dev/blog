-- ============================================================================
-- SCHEMAS & POLICIES FOR BLOG APPLICATION (TEST & PRODUCTION COMPATIBLE)
-- ============================================================================

-- Enable pgcrypto for UUID generation & password hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ENTRIES TABLE
CREATE TABLE IF NOT EXISTS public.entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'journal' CHECK (type IN ('journal', 'writing', 'update')),
    status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft', 'unlisted')),
    category TEXT NOT NULL DEFAULT 'General',
    tags TEXT NOT NULL DEFAULT '',
    cover_image TEXT NOT NULL DEFAULT '',
    excerpt TEXT NOT NULL DEFAULT '',
    date TIMESTAMPTZ NOT NULL DEFAULT now(),
    location TEXT,
    weather TEXT,
    mood TEXT,
    passcode TEXT,             -- Plaintext legacy field
    passcode_hash TEXT,        -- Secure hashed passcode field
    views INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for entries query performance
CREATE INDEX IF NOT EXISTS idx_entries_slug ON public.entries(slug);
CREATE INDEX IF NOT EXISTS idx_entries_status ON public.entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_type ON public.entries(type);
CREATE INDEX IF NOT EXISTS idx_entries_date ON public.entries(date DESC);

-- 2. COMMENTS TABLE
CREATE TABLE IF NOT EXISTS public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL DEFAULT 'Anonymous Reader',
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments(post_id);

-- 3. REACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
    reaction_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reactions_post_id ON public.reactions(post_id);

-- 4. MEDIA TABLE
CREATE TABLE IF NOT EXISTS public.media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    size BIGINT,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Realtime Publication Enablement
ALTER PUBLICATION supabase_realtime ADD TABLE public.entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;

-- Storage bucket reference note:
-- Use bucket 'test-media' for isolated testing, 'blog-media' for production.
