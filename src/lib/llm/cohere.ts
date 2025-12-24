import { CohereClient } from 'cohere-ai';
import logger from '../../utils/logger.js';

if (!process.env.COHERE_API_KEY) {
  throw new Error('Missing Cohere API key');
}

export const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

// Rerank helper
export async function rerankDocuments(
  query: string,
  documents: string[],
  topN: number = 10
) {
  try {
    const response = await cohere.rerank({
      query,
      documents,
      topN,
      model: 'rerank-english-v3.0',
    });

    return response.results.map(result => ({
      index: result.index,
      relevance_score: result.relevanceScore,
    }));
  } catch (error) {
    logger.error({  error  }, 'Reranking failed');
    throw error;
  }
}
