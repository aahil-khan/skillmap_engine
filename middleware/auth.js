/**
 * Authentication Middleware
 * 
 * Handles Supabase JWT token authentication
 */

import { supabase } from '../config/supabase.js';
import { AuthenticationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Supabase Auth middleware
 * 
 * Validates Bearer token from Authorization header
 * Attaches user data to req.user if valid
 * 
 * @throws {AuthenticationError} If token is missing, invalid, or expired
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    
    // Debug logging
    logger.debug('Authentication attempt', { 
      hasAuthHeader: !!authHeader,
      authHeaderPreview: authHeader ? authHeader.substring(0, 20) + '...' : 'none',
      requestId: req.id,
      path: req.path
    });
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid Authorization header');
    }
    
    const token = authHeader.split(' ')[1];
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data?.user) {
      logger.warn('Authentication failed', { 
        error: error?.message, 
        requestId: req.id 
      });
      throw new AuthenticationError('Invalid or expired token');
    }
    
    req.user = data.user;
    logger.debug('User authenticated', { userId: data.user.id, requestId: req.id });
    next();
  } catch (err) {
    next(err);
  }
}
