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
 * GET /peer/matches?page=1&limit=20
 * Find and rank peer matches for current user
 * Supports pagination: page (default 1) and limit (default 20, max 100)
 */
app.get('/', authenticate, async (c) => {
  const userId = c.get('userId');
  
  // Parse pagination params
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));
  const offset = (page - 1) * limit;
  
  console.log('=== MATCHING REQUEST DEBUG ===');
  console.log('User ID:', userId);
  console.log('Pagination:', { page, limit, offset });
  
  logger.info('Finding peer matches', { userId, page, limit });
  
  try {
    // Check cache (cache ALL scored candidates, not just first page)
    const cacheKey = CacheKeys.matchCandidates(userId);
    let allScoredCandidates = await getJSON<Array<{
      user_id: string;
      similarity_score: number;
      total_score: number;
      factors: any;
    }>>(cacheKey);
    
    if (!allScoredCandidates) {
      console.log('Cache miss, searching for candidates...');
      
      // 1. Vector similarity search (top 100 candidates)
      const candidates = await findMatchCandidates(userId, 100);
      
      console.log('Found candidates:', candidates.length);
      
      if (candidates.length === 0) {
        return c.json({
          success: true,
          matches: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
            hasMore: false,
          },
          message: 'No matches found. Try updating your profile or skills.',
        });
      }
      
      // 2. Multi-factor scoring for all candidates
      allScoredCandidates = await Promise.all(
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
                domain_alignment_score: 0,
              },
            };
          }
        })
      );
      
      // 3. Sort by total score (descending)
      allScoredCandidates.sort((a, b) => b.total_score - a.total_score);
      
      // Cache ALL scored candidates for 15 minutes
      await setJSON(cacheKey, allScoredCandidates, CacheTTL.MATCHES);
      
      logger.info('All candidates scored and cached', {
        userId,
        totalCandidates: allScoredCandidates.length,
      });
    } else {
      logger.info('Using cached scored candidates', {
        userId,
        totalCandidates: allScoredCandidates.length,
      });
    }
    
    // 4. Calculate pagination
    const totalMatches = allScoredCandidates.length;
    const totalPages = Math.ceil(totalMatches / limit);
    const hasMore = page < totalPages;
    
    // 5. Slice for current page
    const pageMatches = allScoredCandidates.slice(offset, offset + limit);
    
    if (pageMatches.length === 0) {
      return c.json({
        success: true,
        matches: [],
        pagination: {
          page,
          limit,
          total: totalMatches,
          totalPages,
          hasMore: false,
        },
        message: 'No matches on this page.',
      });
    }
    
    // 6. Enrich with profile preview data
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select(`
        user_id,
        display_name,
        bio,
        avatar_url,
        experience_level
      `)
      .in('user_id', pageMatches.map(m => m.user_id));
    
    // 7. Get top 5 skills for each match
    const { data: skillsData } = await supabase
      .from('user_skills')
      .select(`
        user_id,
        skill:skills_taxonomy(canonical_name, category)
      `)
      .in('user_id', pageMatches.map(m => m.user_id))
      .order('skill_level', { ascending: false })
      .limit(pageMatches.length * 5); // Get top 5 per user
    
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
    
    // 8. Assemble final response
    const matches = pageMatches.map(match => {
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
    
    logger.info('Matches returned for page', {
      userId,
      page,
      matchCount: matches.length,
      totalMatches,
      topScore: matches[0]?.total_score || 0,
    });
    
    return c.json({
      success: true,
      matches,
      pagination: {
        page,
        limit,
        total: totalMatches,
        totalPages,
        hasMore,
      },
      cached: !!allScoredCandidates,
    });
  
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
