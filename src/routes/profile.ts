import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import { getUserProfile, updateUserProfile, updatePeerPreferences, getPeerPreferences } from '../services/profile/index.js';
import { upsertProfileEmbedding } from '../services/profile/embedder.js';
import { ProfileUpdateSchema, PeerPreferencesSchema } from '../schemas/profile.js';
import { ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const app = new Hono();

/**
 * GET /profile - Get current user's complete profile
 */
app.get('/', authenticate, async (c) => {
  const userId = c.get('userId');
  const profile = await getUserProfile(userId);
  return c.json(profile);
});

/**
 * PATCH /profile - Update profile fields
 * Triggers async embedding regeneration
 */
app.patch('/', authenticate, async (c) => {
  const userId = c.get('userId');
  
  const body = await c.req.json();
  const parseResult = ProfileUpdateSchema.safeParse(body);
  
  if (!parseResult.success) {
    throw new ValidationError('Invalid profile data', parseResult.error.errors);
  }
  
  const updated = await updateUserProfile(userId, parseResult.data);
  
  // Regenerate embeddings asynchronously (don't block response)
  upsertProfileEmbedding(userId).catch(err => 
    logger.error('Failed to update profile embeddings', { userId, error: err.message })
  );
  
  return c.json(updated);
});

/**
 * GET /profile/preferences - Get peer preferences
 */
app.get('/preferences', authenticate, async (c) => {
  const userId = c.get('userId');
  const preferences = await getPeerPreferences(userId);
  return c.json(preferences);
});

/**
 * PATCH /profile/preferences - Update or create peer preferences
 */
app.patch('/preferences', authenticate, async (c) => {
  const userId = c.get('userId');
  
  const body = await c.req.json();
  const parseResult = PeerPreferencesSchema.safeParse(body);
  
  if (!parseResult.success) {
    throw new ValidationError('Invalid preferences data', parseResult.error.errors);
  }
  
  const updated = await updatePeerPreferences(userId, parseResult.data);
  return c.json(updated);
});

export default app;
