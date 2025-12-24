import { supabase } from '../../lib/db/supabase.js';
import { CacheKeys, CacheTTL, getJSON, setJSON, deleteKey } from '../../lib/cache/redis.js';
import { normalizeSkills } from '../taxonomy/normalizer.js';
import logger from '../../utils/logger.js';
import type { SkillFrequency } from './taxonomyFallback.js';

export async function analyzeSkillFrequencies(
  skills: string[],
  totalJobs: number
): Promise<SkillFrequency[]> {
  if (skills.length === 0) {
    logger.warn('No skills to analyze');
    return [];
  }

  // 1. Normalize all skills (reuse Phase 1 normalizer)
  const normalized = await normalizeSkills(skills);
  
  // 2. Count occurrences
  const counts = new Map<string, number>();
  for (const { canonical } of normalized) {
    if (canonical) {
      counts.set(canonical, (counts.get(canonical) || 0) + 1);
    }
  }
  
  // 3. Calculate frequencies
  const frequencies: SkillFrequency[] = [];
  for (const [canonical, count] of counts.entries()) {
    frequencies.push({
      skill: canonical,
      canonical_name: canonical,
      frequency: count / totalJobs,
      occurrences: count,
      source: 'jobs' as const,
    });
  }
  
  // 4. Sort by frequency DESC
  frequencies.sort((a, b) => b.frequency - a.frequency);
  
  logger.info('Skill frequencies calculated', {
    totalSkills: skills.length,
    uniqueSkills: frequencies.length,
    topSkill: frequencies[0]?.canonical_name,
    topFrequency: frequencies[0]?.frequency
  });
  
  return frequencies;
}

export async function cacheJobMarketSkills(
  userId: string,
  goalId: string,
  frequencies: SkillFrequency[],
  totalJobs: number,
  source: 'jobs' | 'taxonomy'
) {
  try {
    // Cache in Redis (7 days)
    const cacheKey = CacheKeys.jobSkills(userId, goalId);
    await setJSON(cacheKey, { frequencies, totalJobs, source }, CacheTTL.JOB_MARKET);
    
    // Store in Supabase for analytics
    const { error } = await supabase
      .from('job_market_skills')
      .upsert({
        user_id: userId,
        goal_id: goalId,
        skill_frequencies: frequencies.reduce((acc, f) => {
          acc[f.canonical_name] = f.frequency;
          return acc;
        }, {} as Record<string, number>),
        total_jobs_analyzed: totalJobs,
        data_source: source,
        expires_at: new Date(Date.now() + CacheTTL.JOB_MARKET * 1000).toISOString(),
      }, {
        onConflict: 'user_id,goal_id'
      });
    
    if (error) {
      logger.error('Failed to cache job market skills in Supabase', { error: error.message, code: error.code, userId, goalId });
      // Don't throw - Redis cache is still available
    } else {
      logger.info('Job market skills cached', { 
        userId, 
        goalId, 
        skillCount: frequencies.length,
        source 
      });
    }
  } catch (error) {
    logger.error('Cache operation failed', { error, userId, goalId });
    throw error;
  }
}

export async function clearJobMarketCache(userId: string, goalId: string) {
  try {
    // Clear Redis cache
    const cacheKey = CacheKeys.jobSkills(userId, goalId);
    await deleteKey(cacheKey);
    
    // Delete from Supabase
    const { error } = await supabase
      .from('job_market_skills')
      .delete()
      .eq('user_id', userId)
      .eq('goal_id', goalId);
    
    if (error) {
      logger.error('Failed to clear job market cache from Supabase', { error: error.message, userId, goalId });
      // Don't throw - Redis cleared successfully
    } else {
      logger.info('Job market cache cleared', { userId, goalId });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Clear cache operation failed', { error: err.message, userId, goalId });
    throw error;
  }
}
