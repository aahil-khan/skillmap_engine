import { createClient } from '@supabase/supabase-js';
import logger from '../../utils/logger.js';

// Use service role key to bypass RLS for server-side operations; fall back to secret key if service key missing
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!process.env.SUPABASE_URL || !supabaseKey) {
  throw new Error('Missing Supabase credentials');
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  supabaseKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    },
  }
);

// Health check helper
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('user_profiles').select('count').limit(1);
    if (error) {
      logger.error('Supabase health check failed', { error: error.message });
      return false;
    }
    logger.info('Supabase connection healthy');
    return true;
  } catch (error) {
    logger.error('Supabase connection error', { error });
    return false;
  }
}
