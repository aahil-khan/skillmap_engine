import { supabase } from '../../lib/db/supabase.js';
import { CacheKeys, getJSON } from '../../lib/cache/redis.js';
import logger from '../../utils/logger.js';

export interface SkillGap {
  skill: string;
  required_frequency: number; // How often market needs it (0-1)
  user_has: boolean;
  user_level?: string; // 'beginner' | 'intermediate' | 'advanced' | 'expert'
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface GapAnalysis {
  gaps: SkillGap[]; // Skills user lacks
  strengths: SkillGap[]; // Skills user is strong in
  improvements: SkillGap[]; // Skills user has but needs to improve
}

/**
 * Analyze skill gaps between user profile and job market demands
 * Uses job market data from Feature 1 (cached in Redis + Supabase)
 */
export async function analyzeGaps(
  userId: string,
  goalId: string
): Promise<GapAnalysis> {
  // 1. Fetch user's current skills
  const { data: userSkills } = await supabase
    .from('user_skills')
    .select(`
      skill_id,
      skill_level,
      skills_taxonomy!inner(canonical_name, category)
    `)
    .eq('user_id', userId);
  
  const userSkillMap = new Map<string, string>();
  if (userSkills) {
    for (const s of userSkills) {
      userSkillMap.set(s.skills_taxonomy.canonical_name, s.skill_level);
    }
  }
  
  logger.info('Fetched user skills', { userId, skillCount: userSkillMap.size });
  
  // 2. Fetch job market skills (from Feature 1)
  // First try Redis cache
  const cacheKey = CacheKeys.jobSkills(userId, goalId);
  let jobMarketData = await getJSON<{ frequencies: any[], totalJobs: number, source: string }>(cacheKey);
  
  // Fallback to Supabase if not in Redis
  if (!jobMarketData) {
    const { data: dbData } = await supabase
      .from('job_market_skills')
      .select('skill_frequencies, total_jobs_analyzed, data_source')
      .eq('user_id', userId)
      .eq('goal_id', goalId)
      .single();
    
    if (dbData) {
      // Convert JSONB format to array format
      const frequencies = Object.entries(dbData.skill_frequencies as Record<string, number>).map(
        ([skill, frequency]) => ({
          skill,
          canonical_name: skill,
          frequency,
          occurrences: Math.round(frequency * dbData.total_jobs_analyzed),
          source: dbData.data_source,
        })
      );
      
      jobMarketData = {
        frequencies,
        totalJobs: dbData.total_jobs_analyzed,
        source: dbData.data_source,
      };
    }
  }
  
  if (!jobMarketData || !jobMarketData.frequencies || jobMarketData.frequencies.length === 0) {
    throw new Error(
      'Job market data not available. Run /api/jobs/analyze first with your goal ID.'
    );
  }
  
  logger.info('Loaded job market data', {
    userId,
    goalId,
    skillCount: jobMarketData.frequencies.length,
    source: jobMarketData.source,
  });
  
  // 3. Classify skills into gaps, strengths, improvements
  const gaps: SkillGap[] = [];
  const strengths: SkillGap[] = [];
  const improvements: SkillGap[] = [];
  
  for (const { canonical_name, frequency } of jobMarketData.frequencies) {
    const userLevel = userSkillMap.get(canonical_name);
    const gap: SkillGap = {
      skill: canonical_name,
      required_frequency: frequency,
      user_has: !!userLevel,
      user_level: userLevel,
      priority: getPriority(frequency, userLevel),
    };
    
    // High-demand skill user doesn't have → GAP
    if (!userLevel && frequency > 0.5) {
      gaps.push(gap);
    } 
    // User has skill but it's beginner/intermediate and market demands it → IMPROVEMENT
    else if (userLevel && ['beginner', 'intermediate'].includes(userLevel) && frequency > 0.3) {
      improvements.push(gap);
    } 
    // User is advanced/expert in this skill → STRENGTH
    else if (userLevel && ['advanced', 'expert'].includes(userLevel)) {
      strengths.push(gap);
    }
  }
  
  // Sort by priority/frequency
  gaps.sort((a, b) => {
    const priorityDiff = priorityScore(b.priority) - priorityScore(a.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return b.required_frequency - a.required_frequency;
  });
  
  improvements.sort((a, b) => b.required_frequency - a.required_frequency);
  strengths.sort((a, b) => b.required_frequency - a.required_frequency);
  
  logger.info('Gap analysis complete', {
    userId,
    goalId,
    gaps: gaps.length,
    improvements: improvements.length,
    strengths: strengths.length,
    criticalGaps: gaps.filter(g => g.priority === 'critical').length,
  });
  
  return { gaps, strengths, improvements };
}

/**
 * Determine priority based on market demand and user's current level
 */
function getPriority(frequency: number, userLevel?: string): 'critical' | 'high' | 'medium' | 'low' {
  // User doesn't have skill
  if (!userLevel) {
    if (frequency > 0.7) return 'critical'; // >70% of jobs need it
    if (frequency > 0.5) return 'high'; // >50% of jobs need it
    if (frequency > 0.3) return 'medium'; // >30% of jobs need it
    return 'low';
  }
  
  // User has skill but needs improvement
  if (userLevel === 'beginner' && frequency > 0.5) return 'high';
  if (userLevel === 'intermediate' && frequency > 0.6) return 'medium';
  
  return 'low';
}

/**
 * Convert priority string to numeric score for sorting
 */
function priorityScore(priority: string): number {
  const scores: Record<string, number> = { 
    critical: 4, 
    high: 3, 
    medium: 2, 
    low: 1 
  };
  return scores[priority] || 0;
}
