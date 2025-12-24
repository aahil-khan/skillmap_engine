import { qdrant, COLLECTIONS } from '../../lib/vector/qdrant.js';
import { createEmbedding } from '../../lib/llm/openai.js';
import { CacheKeys, CacheTTL, getJSON, setJSON } from '../../lib/cache/redis.js';
import logger from '../../utils/logger.js';

export interface NormalizedSkill {
  original: string;
  canonical: string;
  confidence: number;
  skill_id?: string;
}

/**
 * Normalizes skill names using vector similarity search.
 * Example: "ReactJS" → "React" (0.95 confidence)
 * Example: "ML" → "Machine Learning" (0.91 confidence)
 */
export async function normalizeSkills(rawSkills: string[]): Promise<NormalizedSkill[]> {
  const normalized: NormalizedSkill[] = [];

  for (const rawSkill of rawSkills) {
    const trimmed = rawSkill.trim();
    if (!trimmed) continue;

    // Check cache first
    const cacheKey = CacheKeys.skillNormalization(trimmed.toLowerCase());
    const cached = await getJSON<NormalizedSkill>(cacheKey);
    
    if (cached) {
      normalized.push(cached);
      continue;
    }

    try {
      // Generate embedding for the raw skill
      const embedding = await createEmbedding(trimmed);

      // Search for similar skills in Qdrant (no threshold yet, we'll check after exact matches)
      const results = await qdrant.search(COLLECTIONS.SKILL_TAXONOMY, {
        vector: embedding,
        limit: 5, // Get top 5 to increase chances of finding exact matches
      });

      if (results.length === 0) {
        // No results at all
        normalized.push({
          original: trimmed,
          canonical: trimmed,
          confidence: 0,
        });
        logger.warn({  skill: trimmed  }, 'No similar skills found');
        continue;
      }

      // Check for exact alias match first (case-insensitive)
      let bestMatch = null;
      const lowerInput = trimmed.toLowerCase();
      
      for (const result of results) {
        const aliases = (result.payload?.aliases as string[]) || [];
        const canonical = (result.payload?.canonical_name as string) || '';
        
        // Exact match with canonical or alias - take it regardless of score
        if (
          canonical.toLowerCase() === lowerInput ||
          aliases.some(alias => alias.toLowerCase() === lowerInput)
        ) {
          bestMatch = result;
          logger.info({ 
            input: trimmed,
            canonical: canonical,
            score: result.score,
           }, 'Exact alias match found');
          break;
        }
      }

      // If no exact match, use top result only if score is acceptable
      if (!bestMatch && results[0].score >= 0.70) {
        bestMatch = results[0];
        logger.debug({ 
          input: trimmed,
          canonical: results[0].payload?.canonical_name,
          score: results[0].score,
         }, 'Fuzzy match accepted');
      } else if (!bestMatch) {
        logger.debug({ 
          input: trimmed,
          topScore: results[0].score,
          threshold: 0.70,
         }, 'No match above threshold');
      }

      if (bestMatch) {
        const match = bestMatch;
        const result: NormalizedSkill = {
          original: trimmed,
          canonical: match.payload?.canonical_name as string,
          confidence: match.score,
          skill_id: match.payload?.skill_id as string,
        };

        // Cache the normalization
        await setJSON(cacheKey, result, CacheTTL.SKILL);
        normalized.push(result);

        logger.debug({ 
          original: trimmed,
          canonical: result.canonical,
          confidence: result.confidence,
         }, 'Skill normalized');
      } else {
        // No match found, keep original
        const result: NormalizedSkill = {
          original: trimmed,
          canonical: trimmed,
          confidence: 0,
        };

        normalized.push(result);
        logger.warn({  skill: trimmed  }, 'Skill not found in taxonomy');
      }
    } catch (error) {
      logger.error({  skill: trimmed, error  }, 'Skill normalization failed');
      // Fallback to original on error
      normalized.push({
        original: trimmed,
        canonical: trimmed,
        confidence: 0,
      });
    }
  }

  return normalized;
}

/**
 * Normalize a single skill (convenience method)
 */
export async function normalizeSkill(rawSkill: string): Promise<NormalizedSkill> {
  const results = await normalizeSkills([rawSkill]);
  return results[0];
}
