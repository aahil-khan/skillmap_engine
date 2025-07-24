import { openai } from '../config/openai.js';
import { qdrant } from '../config/qdrant.js';

const SKILL_EMBEDDINGS_COLLECTION = 'skill_embeddings';

/**
 * Search for similar skills using semantic similarity
 * @param {string} query - Search query
 * @param {number} limit - Maximum number of results
 * @returns {Array} Similar skills with scores
 */
export async function searchSimilarSkills(query, limit = 10) {
  try {
    console.log(`Searching for skills similar to: "${query}"`);
    
    // Generate embedding for the query
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query
    });
    
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Search Qdrant for similar vectors
    const searchResult = await qdrant.search(SKILL_EMBEDDINGS_COLLECTION, {
      vector: queryEmbedding,
      limit: limit,
      with_payload: true,
      score_threshold: 0.3 // Minimum similarity score
    });

    console.log(`Found ${searchResult.length} similar skills`);
    
    // Format results
    const formattedResults = searchResult.map((result, index) => ({
      rank: index + 1,
      skill: result.payload.skill,
      category: result.payload.category,
      description: result.payload.description,
      similarity_score: result.score,
      content: result.payload.content
    }));
    
    return formattedResults;
    
  } catch (error) {
    console.error('Error in similarity search:', error);
    throw new Error(`Failed to search similar skills: ${error.message}`);
  }
}

/**
 * Search for skills within a specific category
 * @param {string} category - Category to search within
 * @param {string} query - Search query
 * @param {number} limit - Maximum number of results
 * @returns {Array} Skills in the category matching the query
 */
export async function searchSkillsInCategory(category, query, limit = 5) {
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query
    });
    
    const searchResult = await qdrant.search(SKILL_EMBEDDINGS_COLLECTION, {
      vector: embeddingResponse.data[0].embedding,
      filter: {
        must: [
          { key: "category", match: { value: category } }
        ]
      },
      limit: limit,
      with_payload: true
    });

    return searchResult.map(result => ({
      skill: result.payload.skill,
      description: result.payload.description,
      similarity_score: result.score
    }));
    
  } catch (error) {
    console.error('Error searching skills in category:', error);
    throw new Error(`Failed to search skills in category: ${error.message}`);
  }
}

/**
 * Get all available skill categories
 * @returns {Array} List of unique categories
 */
export async function getSkillCategories() {
  try {
    // This would ideally be a more efficient query, but for now we'll search and aggregate
    const allSkills = await qdrant.search(SKILL_EMBEDDINGS_COLLECTION, {
      vector: new Array(1536).fill(0), // dummy vector
      limit: 1000, // Get a large number to capture all categories
      with_payload: true
    });

    const categories = [...new Set(allSkills.map(skill => skill.payload.category))];
    
    return categories.sort();
    
  } catch (error) {
    console.error('Error getting skill categories:', error);
    throw new Error(`Failed to get skill categories: ${error.message}`);
  }
}
