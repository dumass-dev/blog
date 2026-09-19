import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://aidajlxmfxhmsctmciaq.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZGFqbHhtZnhobXNjdG1jaWFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NDUxODksImV4cCI6MjEwNTMyMTE4OX0.uOCHp-o-ZvMRu-vcz_Sa9LwG573NtxEdz3G-NHvUcgE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
