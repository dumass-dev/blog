-- Proposed migration to add ON DELETE CASCADE to comments and reactions tables
-- DO NOT APPLY TO LIVE DB AUTOMATICALLY (FOR USER REVIEW ONLY)

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_post_id_fkey,
  ADD CONSTRAINT comments_post_id_fkey
    FOREIGN KEY (post_id)
    REFERENCES public.entries(id)
    ON DELETE CASCADE;

ALTER TABLE public.reactions
  DROP CONSTRAINT IF EXISTS reactions_post_id_fkey,
  ADD CONSTRAINT reactions_post_id_fkey
    FOREIGN KEY (post_id)
    REFERENCES public.entries(id)
    ON DELETE CASCADE;
