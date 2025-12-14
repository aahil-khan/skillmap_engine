import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import { supabase } from '../lib/db/supabase.js';
import { CacheKeys, CacheTTL, getJSON, setJSON } from '../lib/cache/redis.js';
import { findMatchCandidates } from '../services/matching/matcher.js';
import { calculateMatchScore } from '../services/matching/scorer.js';
import logger from '../utils/logger.js';

const app = new Hono();

interface MatchResult {
  user_id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  experience_level: string | null;
  top_skills: Array<{ canonical_name: string; category: string }>;
  total_score: number;
  similarity_score: number;
  factors: {
    shared_skills_score: number;
    complementary_skills_score: number;
    goal_alignment_score: number;
    experience_compatibility_score: number;
    availability_match_score: number;
  };
}

/**
 * GET /peer/matches
 * Find and rank peer matches for current user
 */
app.get('/', authenticate, async (c) => {
  const userId = c.get('userId');
  
  console.log('=== MATCHING REQUEST DEBUG ===');
  console.log('User ID:', userId);
  
  logger.info('Finding peer matches', { userId });
  
  try {
    // Check cache
    const cacheKey = CacheKeys.matchCandidates(userId);
    let matches = await getJSON<MatchResult[]>(cacheKey);
    
    if (matches) {
      logger.info('Returning cached matches', { userId, count: matches.length });
      return c.json({ success: true, matches, cached: true });
    }
    
    console.log('Cache miss, searching for candidates...');
    
    // 1. Vector similarity search (top 100 candidates)
    const candidates = await findMatchCandidates(userId, 100);
    
    console.log('Found candidates:', candidates.length);
    
    if (candidates.length === 0) {
      return c.json({
        success: true,
        matches: [],
        message: 'No matches found. Try updating your profile or skills.',
      });
    }
    
    // 2. Multi-factor scoring for all candidates
    const scoredCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        try {
          const score = await calculateMatchScore(
            userId,
            candidate.user_id,
            candidate.payload
          );
          
          return {
            user_id: candidate.user_id,
            similarity_score: candidate.similarity_score,
            total_score: score.total_score,
            factors: score.factors,
          };
        } catch (error) {
          logger.error('Failed to score candidate', {
            userId,
            candidateId: candidate.user_id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          // Return with zero score if scoring fails
          return {
            user_id: candidate.user_id,
            similarity_score: candidate.similarity_score,
            total_score: 0,
            factors: {
              shared_skills_score: 0,
              complementary_skills_score: 0,
              goal_alignment_score: 0,
              experience_compatibility_score: 0,
              availability_match_score: 0,
            },
          };
        }
      })
    );
    
    // 3. Sort by total score (descending)
    scoredCandidates.sort((a, b) => b.total_score - a.total_score);
    
    // 4. Take top 10 matches
    const topMatches = scoredCandidates.slice(0, 10);
    
    // 5. Enrich with profile preview data
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select(`
        user_id,
        display_name,
        bio,
        avatar_url,
        experience_level
      `)
      .in('user_id', topMatches.map(m => m.user_id));
    
    // 6. Get top 5 skills for each match
    const { data: skillsData } = await supabase
      .from('user_skills')
      .select(`
        user_id,
        skill:skills_taxonomy(canonical_name, category)
      `)
      .in('user_id', topMatches.map(m => m.user_id))
      .order('skill_level', { ascending: false })
      .limit(50); // Get more to filter top 5 per user
    
    // Group skills by user_id
    const skillsByUser = skillsData?.reduce((acc, item) => {
      if (!acc[item.user_id]) {
        acc[item.user_id] = [];
      }
      if (acc[item.user_id].length < 5 && item.skill) {
        acc[item.user_id].push({
          canonical_name: item.skill.canonical_name,
          category: item.skill.category,
        });
      }
      return acc;
    }, {} as Record<string, Array<{ canonical_name: string; category: string }>>) || {};
    
    // 7. Assemble final response
    matches = topMatches.map(match => {
      const profile = profiles?.find(p => p.user_id === match.user_id);
      const topSkills = skillsByUser[match.user_id] || [];
      
      return {
        user_id: match.user_id,
        display_name: profile?.display_name || 'Unknown',
        bio: profile?.bio ? profile.bio.substring(0, 150) : null,
        avatar_url: profile?.avatar_url || null,
        experience_level: profile?.experience_level || null,
        top_skills: topSkills,
        total_score: match.total_score,
        similarity_score: match.similarity_score,
        factors: match.factors,
      };
    });
    
    // 8. Cache for 1 hour
    await setJSON(cacheKey, matches, CacheTTL.MATCHES);
    
    logger.info('Matches calculated and cached', {
      userId,
      matchCount: matches.length,
      topScore: matches[0]?.total_score || 0,
    });
    
    return c.json({ success: true, matches, cached: false });
  
  } catch (error) {
    console.error('=== MATCHING ERROR ===');
    console.error('Error details:', error);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    
    logger.error('Matching request failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    
    throw error;
  }
});

export default app;
