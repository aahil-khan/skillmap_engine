import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import { supabase } from '../lib/db/supabase.js';
import { ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const app = new Hono();

/**
 * GET /skills/search - Search skills taxonomy
 * Used to find skill IDs when manually adding skills to profile
 */
app.get('/search', authenticate, async (c) => {
  const query = c.req.query('query');
  const limit = parseInt(c.req.query('limit') || '20', 10);
  
  if (!query || query.trim().length === 0) {
    throw new ValidationError('Query parameter is required');
  }
  
  logger.info('Searching skills taxonomy', { query, limit });
  
  const { data: skills, error } = await supabase
    .from('skills_taxonomy')
    .select('id, canonical_name, category, aliases')
    .or(`canonical_name.ilike.%${query}%,aliases.cs.{${query}}`)
    .limit(limit);
  
  if (error) {
    logger.error('Skills search failed', { query, error: error.message });
    throw error;
  }
  
  logger.info('Skills search complete', { query, resultCount: skills?.length || 0 });
  
  return c.json({
    query,
    results: skills || [],
    count: skills?.length || 0,
  });
});

/**
 * GET /skills - Get all skills in taxonomy
 * Useful for dropdowns or full skill lists
 */
app.get('/', authenticate, async (c) => {
  const category = c.req.query('category');
  const limit = parseInt(c.req.query('limit') || '100', 10);
  
  let query = supabase
    .from('skills_taxonomy')
    .select('id, canonical_name, category, aliases')
    .order('canonical_name', { ascending: true })
    .limit(limit);
  
  if (category) {
    query = query.eq('category', category);
  }
  
  const { data: skills, error } = await query;
  
  if (error) {
    logger.error('Failed to fetch skills', { error: error.message });
    throw error;
  }
  
  return c.json({
    skills: skills || [],
    count: skills?.length || 0,
    category: category || 'all',
  });
});

export default app;
