import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
  console.warn('Warning: SUPABASE_URL or SUPABASE_ANON_KEY is missing from environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Get Supabase client authenticated as the calling user (if bearer token present in request header)
 */
export function getSupabaseClient(req) {
  if (process.env.NODE_ENV === 'test' && global.__mockSupabaseClient) {
    return global.__mockSupabaseClient(req);
  }
  const authHeader = req?.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ') && authHeader.split(' ')[1]) {
    const token = authHeader.split(' ')[1];
    return createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
  }
  return supabase;
}

