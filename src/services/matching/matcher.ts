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
    with_vector: true,
  });
  
  console.log('=== QDRANT RETRIEVE DEBUG ===');
  console.log('User ID:', userId);
  console.log('Points returned:', userPoints?.length);
  console.log('First point:', JSON.stringify(userPoints?.[0], null, 2));
  
  logger.info('Retrieved user points', { 
    userId, 
    found: userPoints?.length || 0,
    hasVector: userPoints?.[0]?.vector !== undefined,
    vectorType: typeof userPoints?.[0]?.vector,
    pointKeys: userPoints?.[0] ? Object.keys(userPoints[0]) : [],
  });
  
  if (!userPoints || userPoints.length === 0) {
    throw new Error('Profile embedding not found. Your profile is being processed. Please wait 10-15 seconds and try again.');
  }
  
  const vectorData = userPoints[0].vector;
  
  console.log('Vector data type:', typeof vectorData);
  console.log('Vector is array?', Array.isArray(vectorData));
  console.log('Vector is null?', vectorData === null);
  console.log('Vector is undefined?', vectorData === undefined);
  
  logger.info('Vector data details', {
    userId,
    isArray: Array.isArray(vectorData),
    isObject: vectorData && typeof vectorData === 'object',
    isUndefined: vectorData === undefined,
    isNull: vectorData === null,
  });
  
  // Handle both named and unnamed vectors
  let userVector: number[];
  if (Array.isArray(vectorData)) {
    userVector = vectorData;
  } else if (vectorData && typeof vectorData === 'object') {
    // Named vectors - try common names
    const namedVector = vectorData as Record<string, number[]>;
    userVector = namedVector.weighted_avg || namedVector.default || namedVector.vector;
    
    if (!userVector) {
      throw new Error(`User vector not found. Available vectors: ${Object.keys(namedVector).join(', ')}`);
    }
  } else {
    throw new Error(`Profile embedding is being generated. Vector format: ${typeof vectorData}. Please wait 10-15 seconds and try again.`);
  }
  
  if (!Array.isArray(userVector) || userVector.length === 0) {
    throw new Error('User vector is empty or invalid');
  }
  
  logger.info('Retrieved user vector', { userId, vectorLength: userVector.length });
  
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
