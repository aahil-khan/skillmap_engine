import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import { supabase } from '../lib/db/supabase.js';
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

/**
 * GET /profile/skills - Get all user skills with proficiency levels
 * Used for Step 1 of profile creation flow
 */
app.get('/skills', authenticate, async (c) => {
  const userId = c.get('userId');
  
  const { data: skills, error } = await supabase
    .from('user_skills')
    .select(`
      skill_id,
      skill_level,
      years_experience,
      source,
      skill:skills_taxonomy (
        canonical_name,
        category
      )
    `)
    .eq('user_id', userId)
    .order('skill_level', { ascending: false });
  
  if (error) {
    logger.error('Failed to fetch user skills', { userId, error: error.message });
    throw error;
  }
  
  return c.json({
    success: true,
    skills: skills || [],
  });
});

/**
 * PATCH /profile/skills - Update skill proficiency levels
 * Step 1 of profile creation: Define proficiency for each skill
 */
app.patch('/skills', authenticate, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  
  const { skills } = body;
  
  if (!Array.isArray(skills) || skills.length === 0) {
    throw new ValidationError('Skills array is required');
  }
  
  // Validate each skill
  for (const skill of skills) {
    if (!skill.skill_id || !skill.skill_level) {
      throw new ValidationError('Each skill must have skill_id and skill_level');
    }
    
    if (!['beginner', 'intermediate', 'advanced', 'expert'].includes(skill.skill_level)) {
      throw new ValidationError('Invalid skill_level. Must be: beginner, intermediate, advanced, or expert');
    }
  }
  
  // Upsert all skills with updated proficiency levels
  const skillsToUpdate = skills.map((s: any) => ({
    user_id: userId,
    skill_id: s.skill_id,
    skill_level: s.skill_level,
    years_experience: s.years_experience || null,
  }));
  
  const { error } = await supabase
    .from('user_skills')
    .upsert(skillsToUpdate, {
      onConflict: 'user_id,skill_id',
    });
  
  if (error) {
    logger.error('Failed to update skill proficiency', { userId, error: error.message });
    throw error;
  }
  
  logger.info('Skill proficiency levels updated', {
    userId,
    skillCount: skills.length,
  });
  
  return c.json({
    success: true,
    message: 'Skill proficiency levels updated',
  });
});

export default app;
