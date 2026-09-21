import { createClient } from '@supabase/supabase-js';

const defaultUrl = 'https://aidajlxmfxhmsctmciaq.supabase.co';

export function getSupabaseServerClient(_req) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || defaultUrl;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  return createClient(url, key || 'placeholder-anon-key');
}

/**
 * Verify Supabase JWT token server-side and ensure user.id matches ADMIN_USER_ID
 */
export async function verifyAdminUser(req) {
  const rawAdminId = process.env.ADMIN_USER_ID || process.env.VITE_ADMIN_USER_ID || '';
  const cleanAdminId = rawAdminId.trim().toLowerCase();

  if (!cleanAdminId) {
    return { authorized: false, status: 403, error: 'Server authentication unconfigured. Access denied.' };
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authorized: false, status: 401, error: 'Missing or malformed Authorization header.' };
  }

  const token = authHeader.split(' ')[1];
  if (!token || !token.trim()) {
    return { authorized: false, status: 401, error: 'Authentication token missing.' };
  }

  try {
    const supabase = getSupabaseServerClient(req);
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data || !data.user) {
      return { authorized: false, status: 401, error: 'Invalid or expired token.' };
    }

    const cleanUserId = (data.user.id || '').trim().toLowerCase();
    if (cleanUserId !== cleanAdminId) {
      return { authorized: false, status: 403, error: 'Forbidden: User is not authorized as admin.' };
    }

    return { authorized: true, user: data.user };
  } catch (err) {
    return { authorized: false, status: 500, error: err.message };
  }
}
