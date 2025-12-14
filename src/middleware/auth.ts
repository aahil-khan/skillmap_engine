import { Context, Next } from 'hono';
import { supabaseAuth } from '../lib/db/supabaseAuth.js';
import { AuthenticationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export async function authenticate(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  console.log('=== AUTH MIDDLEWARE DEBUG ===');
  console.log('Auth header:', authHeader);
  console.log('Auth header exists:', !!authHeader);
  console.log('Starts with Bearer:', authHeader?.startsWith('Bearer '));
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ Missing or invalid authorization header');
    throw new AuthenticationError('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);
  console.log('Token (first 20 chars):', token.substring(0, 20));
  console.log('Token length:', token.length);

  try {
    console.log('Calling supabaseAuth.auth.getUser()...');
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

    console.log('GetUser response - error:', error);
    console.log('GetUser response - user:', user ? `User ID: ${user.id}` : 'null');

    if (error || !user) {
      console.log('❌ Invalid token:', error?.message);
      throw new AuthenticationError('Invalid token');
    }

    // Attach user to context
    c.set('userId', user.id);
    c.set('user', user);

    console.log('✅ Authentication successful, userId:', user.id);
    await next();
  } catch (error) {
    console.log('❌ Exception in auth middleware:', error);
    if (error instanceof AuthenticationError) {
      throw error;
    }
    logger.error('Authentication error', { error });
    throw new AuthenticationError('Authentication failed');
  }
}
