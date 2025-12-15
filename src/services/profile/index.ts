import { supabase } from '../../lib/db/supabase.js';
import { NotFoundError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import type { ProfileUpdate, PeerPreferences } from '../../schemas/profile.js';
import { upsertProfileEmbedding } from './embedder.js';

/**
 * Get complete user profile with related data
 */
export async function getUserProfile(userId: string) {
  // First get the basic profile
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (profileError || !profile) {
    logger.error('Profile not found', { userId, error: profileError?.message });
    throw new NotFoundError('Profile not found');
  }
  
  // Get related data in parallel
  const [
    { data: skills },
    { data: workExperience },
    { data: projects },
    { data: education },
    { data: learningGoals },
    { data: preferences }
  ] = await Promise.all([
    supabase
      .from('user_skills')
      .select(`
        skill_id,
        skill_level,
        years_experience,
        source,
        skill:skills_taxonomy(canonical_name, category)
      `)
      .eq('user_id', userId),
    supabase.from('work_experience').select('*').eq('user_id', userId),
    supabase.from('projects').select('*').eq('user_id', userId),
    supabase.from('education').select('*').eq('user_id', userId),
    supabase.from('learning_goals').select('*').eq('user_id', userId),
    supabase.from('peer_preferences').select('*').eq('user_id', userId).single()
  ]);
  
  logger.info('Profile retrieved', { userId });
  
  return {
    ...profile,
    skills: skills || [],
    work_experience: workExperience || [],
    projects: projects || [],
    education: education || [],
    learning_goals: learningGoals || [],
    preferences: preferences || null
  };
}

/**
 * Update user profile fields
 */
export async function updateUserProfile(userId: string, email: string, updates: ProfileUpdate) {
  // Separate learning_goals and preferences from profile updates
  const { learning_goals, preferences, ...profileUpdates } = updates;
  
  // Check profile completion criteria
  const hasDisplayName = profileUpdates.display_name || (await supabase.from('user_profiles').select('display_name').eq('user_id', userId).single()).data?.display_name;
  const hasBio = profileUpdates.bio || (await supabase.from('user_profiles').select('bio').eq('user_id', userId).single()).data?.bio;
  const hasExperience = profileUpdates.experience_level || (await supabase.from('user_profiles').select('experience_level').eq('user_id', userId).single()).data?.experience_level;
  const hasGoals = learning_goals && learning_goals.length > 0;
  
  const profile_completed = !!(hasDisplayName && hasBio && hasExperience && hasGoals);
  
  // Upsert user profile
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({
      user_id: userId,
      email: email,
      ...profileUpdates,
      profile_completed,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    })
    .select()
    .single();
  
  if (error) {
    logger.error('Profile update failed', { userId, error: error.message });
    throw error;
  }
  
  // Handle learning goals if provided
  if (learning_goals) {
    // Delete existing goals
    await supabase.from('learning_goals').delete().eq('user_id', userId);
    
    // Insert new goals
    if (learning_goals.length > 0) {
      const goalsToInsert = learning_goals.map(goal => ({
        user_id: userId,
        original_goal: goal.original_goal,
        refined_goal: goal.refined_goal || goal.original_goal,
        target_timeline: goal.timeframe || 'ongoing',
        status: 'active' as const,
      }));
      
      const { error: goalsError } = await supabase
        .from('learning_goals')
        .insert(goalsToInsert);
      
      if (goalsError) {
        logger.error('Learning goals insert failed', { userId, error: goalsError.message });
        throw goalsError;
      }
    }
  }
  
  // Handle preferences if provided
  if (preferences) {
    await updatePeerPreferences(userId, preferences as any);
  }
  
  // Generate and store embeddings asynchronously (don't block response)
  upsertProfileEmbedding(userId).catch(error => {
    logger.error('Embedding generation failed (async)', { userId, error: error.message });
  });
  
  logger.info('Profile updated', { userId, fields: Object.keys(updates), profile_completed });
  return data;
}

/**
 * Update or create peer preferences
 */
export async function updatePeerPreferences(userId: string, preferences: PeerPreferences) {
  // Check if preferences exist
  const { data: existing } = await supabase
    .from('peer_preferences')
    .select('id')
    .eq('user_id', userId)
    .single();
  
  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from('peer_preferences')
      .update({
        ...preferences,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) {
      logger.error('Preferences update failed', { userId, error: error.message });
      throw error;
    }
    
    logger.info('Preferences updated', { userId });
    return data;
  } else {
    // Create new
    const { data, error } = await supabase
      .from('peer_preferences')
      .insert({ 
        user_id: userId, 
        ...preferences,
      })
      .select()
      .single();
    
    if (error) {
      logger.error('Preferences creation failed', { userId, error: error.message });
      throw error;
    }
    
    logger.info('Preferences created', { userId });
    return data;
  }
}

/**
 * Get peer preferences for a user
 */
export async function getPeerPreferences(userId: string) {
  const { data, error } = await supabase
    .from('peer_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
    logger.error('Failed to get preferences', { userId, error: error.message });
    throw error;
  }
  
  return data || null;
}
