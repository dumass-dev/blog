-- Create table for Now Playing status
CREATE TABLE IF NOT EXISTS public.now_playing (
    id integer PRIMARY KEY CHECK (id = 1) DEFAULT 1,
    title text,
    artist text,
    album text,
    is_paused boolean DEFAULT false,
    progress bigint DEFAULT 0,
    cover_url text,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Insert initial row
INSERT INTO public.now_playing (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.now_playing ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on now_playing" 
    ON public.now_playing FOR SELECT 
    USING (true);

-- Allow service role to update (backend API will use service role key)
CREATE POLICY "Allow service role update on now_playing" 
    ON public.now_playing FOR UPDATE 
    USING (true);
