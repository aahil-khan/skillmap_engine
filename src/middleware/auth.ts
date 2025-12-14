import { Context, Next } from 'hono';
import { supabaseAuth } from '../lib/db/supabaseAuth.js';
import { AuthenticationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export async function authenticate(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

    if (error || !user) {
      throw new AuthenticationError('Invalid token');
    }

    // Attach user to context
    c.set('userId', user.id);
    c.set('user', user);

    await next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    logger.error('Authentication error', { error });
    throw new AuthenticationError('Authentication failed');
  }
}
