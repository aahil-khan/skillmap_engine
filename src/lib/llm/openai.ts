import OpenAI from 'openai';
import logger from '../../utils/logger.js';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OpenAI API key');
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Model configurations
export const MODELS = {
  STRUCTURED_OUTPUT: 'gpt-4o-mini', // For resume parsing, skill extraction
  HIGH_QUALITY: 'gpt-4o', // For complex reasoning, high-stakes decisions
  EMBEDDINGS: 'text-embedding-3-small', // 1536 dimensions
} as const;

// Embedding helper with caching
export async function createEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: MODELS.EMBEDDINGS,
      input: text,
    });
    
    return response.data[0].embedding;
  } catch (error) {
    logger.error('Embedding creation failed', { error });
    throw error;
  }
}

// Batch embeddings (more efficient)
export async function createBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  
  try {
    const response = await openai.embeddings.create({
      model: MODELS.EMBEDDINGS,
      input: texts,
    });
    
    return response.data.map(item => item.embedding);
  } catch (error) {
    logger.error('Batch embedding creation failed', { error });
    throw error;
  }
}
