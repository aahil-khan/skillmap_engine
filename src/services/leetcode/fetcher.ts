/**
 * LeetCode Profile Fetcher
 * Manages LeetCode profile sync with smart caching
 */

import { supabase } from '../../lib/db/supabase.js';
import logger from '../../utils/logger.js';
import { fetchProfile, fetchStats } from './apiClient.js';

export interface LeetCodeProfileData {
  username: string;
  realName: string;
  ranking: number;
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  acceptanceRate: number;
  avatar: string;
  reputation: number;
  skillTags: string[];
  about: string;
}

/**
 * Fetch complete LeetCode profile from API
 */
export async function fetchLeetCodeProfile(username: string): Promise<LeetCodeProfileData> {
  try {
    // Fetch profile and stats in parallel
    const [profile, stats] = await Promise.all([
      fetchProfile(username),
      fetchStats(username),
    ]);
    
    if (!profile || !stats) {
      throw new Error(`LeetCode user '${username}' not found`);
    }
    
    logger.info({  
      username,
      profileKeys: Object.keys(profile),
      statsKeys: Object.keys(stats),
      profileUsername: profile.username,
      profileHasUsername: !!profile.username,
      statsHasSolved: !!stats.solvedProblem
     }, 'Processing LeetCode profile data');
    
    // Calculate acceptance rate from stats
    // API returns: acSubmissionNum: [{difficulty: 'All', submissions: 119}, ...]
    const acSubmissions =
      stats.acSubmissionNum?.find(
        (item: any) => item.difficulty === 'All'
      )?.submissions || 0;
    const totalSubmissions =
      stats.totalSubmissionNum?.find(
        (item: any) => item.difficulty === 'All'
      )?.submissions || 0;
    const acceptanceRate =
      totalSubmissions > 0
        ? parseFloat(((acSubmissions / totalSubmissions) * 100).toFixed(2))
        : 0;
    
    const result = {
      username: profile.username,
      realName: profile.name || '',
      ranking: profile.ranking || 0,
      totalSolved: stats.solvedProblem || 0,
      easySolved: stats.easySolved || 0,
      mediumSolved: stats.mediumSolved || 0,
      hardSolved: stats.hardSolved || 0,
      acceptanceRate,
      avatar: profile.avatar || '',
      reputation: profile.reputation || 0,
      skillTags: profile.skillTags || [],
      about: profile.about || '',
    };
    
    logger.info({ 
      username: result.username,
      hasUsername: !!result.username,
      totalSolved: result.totalSolved,
      ranking: result.ranking
     }, 'LeetCode profile processed successfully');
    
    return result;
  } catch (error) {
    const err = error as Error;
    logger.error({  error: err.message, username  }, 'LeetCode fetch failed');
    throw error;
  }
}

/**
 * Save LeetCode profile to database
 */
export async function saveLeetCodeProfile(
  userId: string,
  profileData: LeetCodeProfileData
): Promise<void> {
  logger.info({  
    userId, 
    username: profileData.username,
    hasUsername: !!profileData.username,
    totalSolved: profileData.totalSolved
   }, 'Saving LeetCode profile to database');
  
  if (!profileData.username) {
    throw new Error('LeetCode username is missing from profile data');
  }
  
  const { error } = await supabase
    .from('leetcode_profiles')
    .upsert(
      {
        user_id: userId,
        leetcode_username: profileData.username,
        total_solved: profileData.totalSolved,
        easy_solved: profileData.easySolved,
        medium_solved: profileData.mediumSolved,
        hard_solved: profileData.hardSolved,
        ranking: profileData.ranking,
        reputation: profileData.reputation,
        acceptance_rate: profileData.acceptanceRate,
        profile_data: profileData,
        last_synced_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      }
    );
  
  if (error) {
    logger.error({ 
      error: error.message,
      errorCode: error.code,
      errorDetails: error.details,
      errorHint: error.hint,
      userId,
      username: profileData.username,
     }, 'Failed to save LeetCode profile');
    throw error;
  }
  
  logger.info({ 
    userId,
    username: profileData.username,
   }, 'LeetCode profile saved');
}

/**
 * Check if profile needs re-sync (>24 hours since last sync)
 */
export async function shouldResync(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('leetcode_profiles')
    .select('last_synced_at')
    .eq('user_id', userId)
    .single();
  
  if (!data || !data.last_synced_at) return true;
  
  const lastSync = new Date(data.last_synced_at);
  const now = new Date();
  const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
  
  return hoursSinceSync > 24; // Re-sync if >24 hours
}

/**
 * Get LeetCode profile from database
 */
export async function getLeetCodeProfileFromDB(userId: string): Promise<any> {
  const { data, error } = await supabase
    .from('leetcode_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      // No profile found
      return null;
    }
    logger.error({ 
      error: error.message,
      userId,
     }, 'Failed to fetch LeetCode profile from DB');
    throw error;
  }
  
  return data;
}

/**
 * Update pattern analysis in database
 */
export async function savePatternAnalysis(
  userId: string,
  patternAnalysis: any
): Promise<void> {
  logger.info({  
    userId, 
    hasData: !!patternAnalysis,
    keys: patternAnalysis ? Object.keys(patternAnalysis) : []
   }, 'Saving pattern analysis to database');
  
  const { error } = await supabase
    .from('leetcode_profiles')
    .update({
      pattern_analysis: patternAnalysis,
    })
    .eq('user_id', userId);
  
  if (error) {
    logger.error({ 
      error: error.message,
      errorCode: error.code,
      errorDetails: error.details,
      errorHint: error.hint,
      userId,
      patternAnalysisKeys: patternAnalysis ? Object.keys(patternAnalysis) : []
     }, 'Failed to save pattern analysis');
    throw error;
  }
  
  logger.info({  userId  }, 'Pattern analysis saved successfully');
}
