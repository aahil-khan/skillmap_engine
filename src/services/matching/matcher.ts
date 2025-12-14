import { qdrant, COLLECTIONS } from '../../lib/vector/qdrant.js';
import logger from '../../utils/logger.js';

export interface MatchCandidate {
  user_id: string;
  similarity_score: number;
  payload: Record<string, any>;
}

/**
 * Find match candidates using vector similarity search
 * Uses weighted_avg vector for fast retrieval
 */
export async function findMatchCandidates(
  userId: string,
  limit: number = 100
): Promise<MatchCandidate[]> {
  logger.info('Finding match candidates', { userId, limit });
  
  // Get user's vector profile from Qdrant
  const userPoints = await qdrant.retrieve(COLLECTIONS.USER_PROFILES, {
    ids: [userId],
    with_vectors: true,
  });
  
  if (!userPoints || userPoints.length === 0) {
    throw new Error('User profile embedding not found. Please update your profile first.');
  }
  
  const userVector = userPoints[0].vector as number[];
  
  // Search for similar profiles using weighted_avg vector
  const results = await qdrant.search(COLLECTIONS.USER_PROFILES, {
    vector: userVector,
    limit,
    filter: {
      must: [
        { key: 'is_active', match: { value: true } },
        { key: 'is_searchable', match: { value: true } },
      ],
      must_not: [
        { key: 'user_id', match: { value: userId } }, // Exclude self
      ],
    },
    with_payload: true,
    with_vectors: false,
  });
  
  logger.info('Found match candidates', {
    userId,
    count: results.length,
    topScore: results[0]?.score || 0,
  });
  
  return results.map(r => ({
    user_id: r.payload?.user_id as string,
    similarity_score: r.score,
    payload: r.payload || {},
  }));
}
