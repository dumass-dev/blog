import { createClient } from '@supabase/supabase-js';

const defaultUrl = 'https://aidajlxmfxhmsctmciaq.supabase.co';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || defaultUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let client;
try {
  client = createClient(supabaseUrl, supabaseAnonKey || 'placeholder-anon-key');
} catch (err) {
  console.warn('Supabase client fallback:', err.message);
  client = createClient(defaultUrl, 'placeholder-anon-key');
}

export const supabase = client;


