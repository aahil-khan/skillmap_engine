/**
 * LeetCode Embedder
 * Generates vector embeddings from pattern analysis for similarity matching
 */

import { createEmbedding } from '../../lib/llm/openai.js';
import { qdrant, COLLECTIONS } from '../../lib/vector/qdrant.js';
import { supabase } from '../../lib/db/supabase.js';
import logger from '../../utils/logger.js';

/**
 * Generate and store LeetCode embedding for pattern-based matching
 */
export async function generateLeetCodeEmbedding(
  userId: string,
  patternAnalysis: any
): Promise<void> {
  try {
    // 1. Format text for embedding
    const strengthsText = patternAnalysis.strength_patterns
      .map((p: any) => `${p.pattern} (${p.proficiency})`)
      .join(', ');
    
    const weaknessesText = patternAnalysis.weak_patterns
      .map((p: any) => `${p.pattern} (${p.proficiency})`)
      .join(', ');
    
    const embeddingText = `
Strengths: ${strengthsText}
Weaknesses: ${weaknessesText}
Comfort Level: ${patternAnalysis.comfort_level}
Consistency: ${patternAnalysis.consistency_score}
Trend: ${patternAnalysis.growth_trend}
Focus Areas: ${patternAnalysis.recommended_focus.join(', ')}
    `.trim();
    
    logger.debug('Generating LeetCode embedding', {
      userId,
      textLength: embeddingText.length,
    });
    
    // 2. Generate embedding
    const embedding = await createEmbedding(embeddingText);
    
    // 3. Upsert to Qdrant
    await qdrant.upsert(COLLECTIONS.LEETCODE_PATTERNS, {
      wait: true,
      points: [
        {
          id: userId,
          vector: embedding,
          payload: {
            user_id: userId,
            strength_patterns: patternAnalysis.strength_patterns.map(
              (p: any) => p.pattern
            ),
            weak_patterns: patternAnalysis.weak_patterns.map(
              (p: any) => p.pattern
            ),
            comfort_level: patternAnalysis.comfort_level,
            consistency_score: patternAnalysis.consistency_score,
            growth_trend: patternAnalysis.growth_trend,
            last_analyzed: new Date().toISOString(),
          },
        },
      ],
    });
    
    logger.info('LeetCode embedding generated', {
      userId,
      strengths: patternAnalysis.strength_patterns.length,
      weaknesses: patternAnalysis.weak_patterns.length,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to generate LeetCode embedding', {
      error: err.message,
      userId,
    });
    // Don't throw - embedding generation failure shouldn't block the response
  }
}

/**
 * Find similar LeetCode users for study partner matching
 * Returns users with complementary skills (my weaknesses = their strengths)
 */
export async function findSimilarLeetCodeUsers(
  userId: string,
  limit = 10
): Promise<Array<{ user_id: string; score: number; patterns: any }>> {
  try {
    // 1. Get user's pattern analysis
    const { data: userProfile } = await supabase
      .from('leetcode_profiles')
      .select('pattern_analysis')
      .eq('user_id', userId)
      .single();
    
    if (!userProfile || !userProfile.pattern_analysis) {
      logger.warn('No pattern analysis found for user', { userId });
      return [];
    }
    
    const { pattern_analysis } = userProfile;
    
    // 2. Build complementary search text
    // Focus on my weaknesses to find people strong in those areas
    const weaknessText = pattern_analysis.weak_patterns
      .map((p: any) => `Strong in ${p.pattern}`)
      .join(', ');
    
    const searchText = `
Looking for study partners who are:
${weaknessText}
Similar comfort level: ${pattern_analysis.comfort_level}
    `.trim();
    
    // 3. Generate search embedding
    const searchEmbedding = await createEmbedding(searchText);
    
    // 4. Search Qdrant for similar users
    const results = await qdrant.search(COLLECTIONS.LEETCODE_PATTERNS, {
      vector: searchEmbedding,
      filter: {
        must_not: [{ key: 'user_id', match: { value: userId } }],
      },
      limit,
      with_payload: true,
    });
    
    // 5. Format results
    const matches = results.map((result: any) => ({
      user_id: result.payload.user_id,
      score: result.score,
      patterns: {
        strengths: result.payload.strength_patterns,
        weaknesses: result.payload.weak_patterns,
        comfort_level: result.payload.comfort_level,
        consistency: result.payload.consistency_score,
        trend: result.payload.growth_trend,
      },
    }));
    
    logger.info('Found similar LeetCode users', {
      userId,
      matchCount: matches.length,
    });
    
    return matches;
  } catch (error) {
    const err = error as Error;
    logger.error('LeetCode similarity search failed', {
      error: err.message,
      userId,
    });
    return [];
  }
}

/**
 * Ensure Qdrant collection exists for LeetCode patterns
 */
export async function ensureLeetCodeCollection(): Promise<void> {
  try {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(
      (c: any) => c.name === COLLECTIONS.LEETCODE_PATTERNS
    );
    
    if (!exists) {
      logger.info('Creating LeetCode patterns collection');
      await qdrant.createCollection(COLLECTIONS.LEETCODE_PATTERNS, {
        vectors: {
          size: 1536, // text-embedding-3-small dimensions
          distance: 'Cosine',
        },
      });
      logger.info('LeetCode patterns collection created');
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to ensure LeetCode collection', {
      error: err.message,
    });
    throw error;
  }
}
