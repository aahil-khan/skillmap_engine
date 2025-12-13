import { supabase } from '../../lib/db/supabase.js';
import { NotFoundError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import type { ProfileUpdate, PeerPreferences } from '../../schemas/profile.js';

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
    { data: learningGoals }
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
    supabase.from('learning_goals').select('*').eq('user_id', userId)
  ]);
  
  logger.info('Profile retrieved', { userId });
  
  return {
    ...profile,
    skills: skills || [],
    work_experience: workExperience || [],
    projects: projects || [],
    education: education || [],
    learning_goals: learningGoals || []
  };
}

/**
 * Update user profile fields
 */
export async function updateUserProfile(userId: string, updates: ProfileUpdate) {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select()
    .single();
  
  if (error) {
    logger.error('Profile update failed', { userId, error: error.message });
    throw error;
  }
  
  logger.info('Profile updated', { userId, fields: Object.keys(updates) });
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
