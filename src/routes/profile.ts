import { Hono } from 'hono';
import '../types/hono.js'; // Type declarations for Hono context
import { authenticate } from '../middleware/auth.js';
import { supabase } from '../lib/db/supabase.js';
import { getUserProfile, updateUserProfile, updatePeerPreferences, getPeerPreferences } from '../services/profile/index.js';
import { upsertProfileEmbedding } from '../services/profile/embedder.js';
import { ProfileUpdateSchema, PeerPreferencesSchema } from '../schemas/profile.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { CacheKeys, CacheTTL, getJSON, setJSON } from '../lib/cache/redis.js';

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
    throw new ValidationError('Invalid profile data');
  }
  
  const updated = await updateUserProfile(userId, parseResult.data);
  
  // Regenerate embeddings asynchronously (don't block response)
  upsertProfileEmbedding(userId).catch(err => 
    logger.error({  userId, error: err.message  }, 'Failed to update profile embeddings')
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
    throw new ValidationError('Invalid preferences data');
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
    logger.error({  userId, error: error.message  }, 'Failed to fetch user skills');
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
    logger.error({  userId, error: error.message  }, 'Failed to update skill proficiency');
    throw error;
  }
  
  logger.info({ 
    userId,
    skillCount: skills.length,
   }, 'Skill proficiency levels updated');
  
  return c.json({
    success: true,
    message: 'Skill proficiency levels updated',
  });
});

/**
 * GET /profile/:userId - Get public profile of another user
 * Used for viewing match details or connection requests
 */
app.get('/:userId', authenticate, async (c) => {
  const currentUserId = c.get('userId');
  const targetUserId = c.req.param('userId');
  
  // Prevent viewing own profile via this endpoint (use GET / instead)
  if (currentUserId === targetUserId) {
    const profile = await getUserProfile(currentUserId);
    return c.json(profile);
  }
  
  // Check cache first
  const cacheKey = CacheKeys.userProfile(targetUserId);
  const cached = await getJSON<any>(cacheKey);
  if (cached) {
    logger.info({ currentUserId, targetUserId }, 'Public profile retrieved from cache');
    return c.json(cached);
  }
  
  // Get public profile data
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select(`
      user_id,
      display_name,
      bio,
      avatar_url,
      experience_level,
      created_at
    `)
    .eq('user_id', targetUserId)
    .single();
  
  if (profileError || !profile) {
    logger.error({ currentUserId, targetUserId, error: profileError?.message }, 'Public profile not found');
    throw new NotFoundError('User profile not found');
  }
  
  // Get public data in parallel
  const [
    { data: skills },
    { data: workExperience },
    { data: projects },
    { data: learningGoals },
    { data: preferences }
  ] = await Promise.all([
    supabase
      .from('user_skills')
      .select(`
        skill_level,
        years_experience,
        skill:skills_taxonomy(canonical_name, category)
      `)
      .eq('user_id', targetUserId)
      .order('skill_level', { ascending: false }),
    supabase
      .from('work_experience')
      .select('company_name, job_title, start_date, end_date, is_current')
      .eq('user_id', targetUserId)
      .order('start_date', { ascending: false }),
    supabase
      .from('projects')
      .select('title, description, technologies, start_date, end_date')
      .eq('user_id', targetUserId)
      .order('start_date', { ascending: false }),
    supabase
      .from('learning_goals')
      .select('refined_goal, target_timeline, status')
      .eq('user_id', targetUserId)
      .eq('status', 'active'),
    supabase
      .from('peer_preferences')
      .select('matching_preference, available_days, preferred_time_slots')
      .eq('user_id', targetUserId)
      .single()
  ]);
  
  logger.info({  currentUserId, targetUserId  }, 'Public profile retrieved');
  
  const publicProfile = {
    ...profile,
    skills: skills || [],
    work_experience: workExperience || [],
    projects: projects || [],
    learning_goals: learningGoals || [],
    preferences: preferences || null,
    // Explicitly exclude sensitive fields
    email: undefined,
    phone: undefined,
    is_searchable: undefined,
    is_active: undefined,
  };
  
  // Cache the result
  await setJSON(cacheKey, publicProfile, CacheTTL.PROFILE);
  
  return c.json(publicProfile);
});

export default app;
