import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[SUPABASE] Configuration variables VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing from environment. Supabase client will not function properly.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
