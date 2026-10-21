import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const RECRUITER_APP_URL =
  (import.meta.env.VITE_RECRUITER_APP_URL as string) || 'https://hr.hubcredo.com';

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string) || '/api/jobpilot';

export const USE_MOCKS =
  String(import.meta.env.VITE_USE_MOCKS ?? 'true').toLowerCase() === 'true';

export const STORAGE_RESUME_BUCKET = 'jp-resumes';
export const STORAGE_PHOTO_BUCKET = 'jp-photos';
