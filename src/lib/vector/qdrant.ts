import { QdrantClient } from '@qdrant/js-client-rest';
import logger from '../../utils/logger.js';

if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
  throw new Error('Missing Qdrant credentials');
}

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

// Collection names
export const COLLECTIONS = {
  USER_PROFILES: 'user_profiles',
  SKILL_TAXONOMY: 'skill_taxonomy',
  LEETCODE_PATTERNS: 'leetcode_patterns',
} as const;

// Initialize collections
export async function initQdrantCollections() {
  try {
    const collections = await qdrant.getCollections();
    const existingNames = collections.collections.map(c => c.name);

    // Create USER_PROFILES collection
    if (!existingNames.includes(COLLECTIONS.USER_PROFILES)) {
      await qdrant.createCollection(COLLECTIONS.USER_PROFILES, {
        vectors: {
          size: 1536,
          distance: 'Cosine',
        },
      });
      
      // Create payload indexes for filtering
      await qdrant.createPayloadIndex(COLLECTIONS.USER_PROFILES, {
        field_name: 'user_id',
        field_schema: 'keyword',
      });
      
      await qdrant.createPayloadIndex(COLLECTIONS.USER_PROFILES, {
        field_name: 'is_searchable',
        field_schema: 'bool',
      });
      
      await qdrant.createPayloadIndex(COLLECTIONS.USER_PROFILES, {
        field_name: 'experience_level',
        field_schema: 'keyword',
      });

      logger.info('Created USER_PROFILES collection');
    }

    // Create SKILL_TAXONOMY collection
    if (!existingNames.includes(COLLECTIONS.SKILL_TAXONOMY)) {
      await qdrant.createCollection(COLLECTIONS.SKILL_TAXONOMY, {
        vectors: {
          size: 1536,
          distance: 'Cosine',
        },
      });
      
      await qdrant.createPayloadIndex(COLLECTIONS.SKILL_TAXONOMY, {
        field_name: 'canonical_name',
        field_schema: 'keyword',
      });
      
      await qdrant.createPayloadIndex(COLLECTIONS.SKILL_TAXONOMY, {
        field_name: 'category',
        field_schema: 'keyword',
      });

      logger.info('Created SKILL_TAXONOMY collection');
    }

    // Create LEETCODE_PATTERNS collection
    if (!existingNames.includes(COLLECTIONS.LEETCODE_PATTERNS)) {
      await qdrant.createCollection(COLLECTIONS.LEETCODE_PATTERNS, {
        vectors: {
          size: 1536,
          distance: 'Cosine',
        },
      });
      
      await qdrant.createPayloadIndex(COLLECTIONS.LEETCODE_PATTERNS, {
        field_name: 'user_id',
        field_schema: 'keyword',
      });

      logger.info('Created LEETCODE_PATTERNS collection');
    }

    logger.info('All Qdrant collections initialized');
  } catch (error) {
    logger.error('Failed to initialize Qdrant collections', { error });
    throw error;
  }
}
