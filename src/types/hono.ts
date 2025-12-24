import { User } from '@supabase/supabase-js';

// Extend Hono's Context type to include our custom variables
declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
    user: User;
  }
}
