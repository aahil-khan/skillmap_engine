import { openai } from '../config/openai.js';
import { qdrant } from '../config/qdrant.js';
import { ensureCollection } from '../utils/vectorStore.js';

const COLLECTION_NAME = 'user_leetcode_embeddings';

/**
 * Create or update user LeetCode profile embedding in vector database
 * @param {string} userId - User ID
 * @param {Object} leetcodeData - LeetCode stats data from leetcodeService
 * @returns {Object} Result of the operation
 */
export async function createOrUpdateLeetCodeEmbedding(userId, leetcodeData) {
  try {
    await ensureCollection(COLLECTION_NAME);
    
    const { username, ranking, difficultyStats, categoryStats, totalSubmissions, hasDetailedStats } = leetcodeData;
    
    // Check if user embedding already exists
    const existing = await qdrant.search(COLLECTION_NAME, {
      vector: new Array(1536).fill(0), // dummy vector
      filter: {
        must: [{ key: "user_id", match: { value: userId } }]
      },
      limit: 1
    });
    
    let existingEmbeddingId = null;
    let isUpdate = false;
    
    if (existing && existing.length > 0) {
      existingEmbeddingId = existing[0].id;
      isUpdate = true;
      console.log(`Updating existing LeetCode embedding for user: ${userId} (${username})`);
    } else {
      console.log(`Creating new LeetCode embedding for user: ${userId} (${username})`);
    }

    // Build comprehensive LeetCode profile text for embedding
    const profileText = buildLeetCodeProfileText({
      username,
      ranking,
      difficultyStats,
      categoryStats,
      totalSubmissions,
      hasDetailedStats
    });

    // Create embedding for the profile
    const embedding = await embedText(profileText);
    
    // Calculate skill metrics for filtering
    const skillMetrics = calculateSkillMetrics(categoryStats, difficultyStats);
    
    const point = {
      id: existingEmbeddingId || Date.now(),
      vector: embedding,
      payload: {
        user_id: userId,
        leetcode_username: username,
        profile_text: profileText,
        ranking: ranking || 0,
        total_solved: difficultyStats.All?.solved || 0,
        easy_solved: difficultyStats.Easy?.solved || 0,
        medium_solved: difficultyStats.Medium?.solved || 0,
        hard_solved: difficultyStats.Hard?.solved || 0,
        total_submissions: totalSubmissions,
        has_detailed_stats: hasDetailedStats,
        ...skillMetrics,
        created_at: isUpdate ? existing[0].payload.created_at : new Date().toISOString(),
        updated_at: isUpdate ? new Date().toISOString() : undefined
      }
    };
    
    // Insert or update to Qdrant
    await qdrant.upsert(COLLECTION_NAME, {
      wait: true,
      points: [point]
    });
    
    console.log(`Successfully ${isUpdate ? 'updated' : 'stored'} LeetCode embedding for: ${username}`);
    
    return {
      success: true,
      message: `LeetCode profile ${isUpdate ? 'updated' : 'created'} successfully`,
      user_id: userId,
      username: username,
      profile_text: profileText,
      action: isUpdate ? 'updated' : 'created'
    };
    
  } catch (error) {
    console.error('Error in createOrUpdateLeetCodeEmbedding:', error);
    throw new Error(`Failed to create/update LeetCode embedding: ${error.message}`);
  }
}

/**
 * Find users with similar LeetCode skills
 * @param {string} userId - User ID to find similar users for
 * @param {number} limit - Number of similar users to return
 * @returns {Array} Similar users with similarity scores
 */
export async function findSimilarLeetCodeUsers(userId, limit = 5) {
  try {
    // Get the user's embedding
    const userResult = await qdrant.search(COLLECTION_NAME, {
      vector: new Array(1536).fill(0), // dummy vector
      filter: {
        must: [{ key: "user_id", match: { value: userId } }]
      },
      limit: 1,
      with_vector: true,
      with_payload: true
    });

    if (!userResult || userResult.length === 0) {
      throw new Error('User LeetCode profile not found');
    }

    const userVector = userResult[0].vector;
    
    // Find similar users
    const similarUsers = await qdrant.search(COLLECTION_NAME, {
      vector: userVector,
      limit: limit + 1, // +1 to exclude self
      with_payload: true,
      filter: {
        must_not: [{ key: "user_id", match: { value: userId } }]
      }
    });

    return similarUsers.map(user => ({
      user_id: user.payload.user_id,
      username: user.payload.leetcode_username,
      similarity_score: user.score,
      ranking: user.payload.ranking,
      total_solved: user.payload.total_solved,
      skills_summary: extractSkillsSummary(user.payload)
    }));
    
  } catch (error) {
    console.error('Error finding similar LeetCode users:', error);
    throw new Error(`Failed to find similar users: ${error.message}`);
  }
}

/**
 * Find users good in a specific category
 * @param {string} category - Category to search for (e.g., "Dynamic Programming")
 * @param {string} difficulty - Difficulty level ("Advanced", "Intermediate", "Fundamental")
 * @param {number} minSolved - Minimum problems solved in that category
 * @param {number} limit - Number of users to return
 * @returns {Array} Users good in the specified category
 */
export async function findUsersGoodInCategory(category, difficulty = "any", minSolved = 5, limit = 10) {
  try {
    const query = `${difficulty === "any" ? "" : difficulty} ${category} problems solved leetcode competitive programming`;
    
    // Create embedding for the category query
    const queryEmbedding = await embedText(query);
    
    // Search for users with similar skills
    const results = await qdrant.search(COLLECTION_NAME, {
      vector: queryEmbedding,
      limit: limit * 2, // Get more results to filter
      with_payload: true,
      score_threshold: 0.3
    });

    // Filter and sort by category-specific performance
    const filteredUsers = results
      .filter(user => {
        const categoryKey = `${category.toLowerCase().replace(/\s+/g, '_')}_problems`;
        const categoryCount = user.payload[categoryKey] || 0;
        return categoryCount >= minSolved;
      })
      .sort((a, b) => {
        const categoryKey = `${category.toLowerCase().replace(/\s+/g, '_')}_problems`;
        const aCount = a.payload[categoryKey] || 0;
        const bCount = b.payload[categoryKey] || 0;
        return bCount - aCount;
      })
      .slice(0, limit);

    return filteredUsers.map(user => ({
      user_id: user.payload.user_id,
      username: user.payload.leetcode_username,
      ranking: user.payload.ranking,
      total_solved: user.payload.total_solved,
      category_solved: user.payload[`${category.toLowerCase().replace(/\s+/g, '_')}_problems`] || 0,
      similarity_score: user.score
    }));
    
  } catch (error) {
    console.error('Error finding users good in category:', error);
    throw new Error(`Failed to find users in category: ${error.message}`);
  }
}

/**
 * Build semantic profile text for embedding
 * @param {Object} data - LeetCode profile data
 * @returns {string} Formatted profile text
 */
function buildLeetCodeProfileText({ username, ranking, difficultyStats, categoryStats, totalSubmissions, hasDetailedStats }) {
  let profileText = `LeetCode Profile: ${username}\n`;
  
  if (ranking) {
    profileText += `Global Ranking: ${ranking}\n`;
  }
  
  // Add difficulty stats
  if (difficultyStats) {
    profileText += `Problem Solving Stats:\n`;
    for (const [difficulty, stats] of Object.entries(difficultyStats)) {
      profileText += `${difficulty}: ${stats.solved} problems solved, ${stats.submissions} submissions\n`;
    }
  }
  
  // Add category expertise
  profileText += `\nSkill Categories:\n`;
  
  if (categoryStats.Advanced && Object.keys(categoryStats.Advanced).length > 0) {
    profileText += `Advanced (Hard) Expertise: `;
    const advancedSkills = Object.entries(categoryStats.Advanced).map(([cat, data]) => `${cat} (${data.totalSolved})`);
    profileText += advancedSkills.join(', ') + '\n';
  }
  
  if (categoryStats.Intermediate && Object.keys(categoryStats.Intermediate).length > 0) {
    profileText += `Intermediate (Medium) Skills: `;
    const intermediateSkills = Object.entries(categoryStats.Intermediate).map(([cat, data]) => `${cat} (${data.totalSolved})`);
    profileText += intermediateSkills.join(', ') + '\n';
  }
  
  if (categoryStats.Fundamental && Object.keys(categoryStats.Fundamental).length > 0) {
    profileText += `Fundamental (Easy) Skills: `;
    const fundamentalSkills = Object.entries(categoryStats.Fundamental).map(([cat, data]) => `${cat} (${data.totalSolved})`);
    profileText += fundamentalSkills.join(', ') + '\n';
  }
  
  // Add overall assessment
  const totalSolved = difficultyStats.All?.solved || 0;
  const hardSolved = difficultyStats.Hard?.solved || 0;
  const mediumSolved = difficultyStats.Medium?.solved || 0;
  
  if (hardSolved > 10) {
    profileText += `\nSkill Level: Advanced competitive programmer with ${hardSolved} hard problems solved\n`;
  } else if (mediumSolved > 20) {
    profileText += `\nSkill Level: Intermediate programmer with strong problem-solving skills\n`;
  } else if (totalSolved > 50) {
    profileText += `\nSkill Level: Developing programmer with solid foundation\n`;
  } else {
    profileText += `\nSkill Level: Beginner learning data structures and algorithms\n`;
  }

  return profileText;
}

/**
 * Calculate skill metrics for filtering and searching
 * @param {Object} categoryStats - Category statistics
 * @param {Object} difficultyStats - Difficulty statistics
 * @returns {Object} Calculated metrics
 */
function calculateSkillMetrics(categoryStats, difficultyStats) {
  const metrics = {};
  
  // Count problems by category
  const allCategories = [...Object.keys(categoryStats.Advanced || {}), 
                        ...Object.keys(categoryStats.Intermediate || {}), 
                        ...Object.keys(categoryStats.Fundamental || {})];
  
  for (const category of allCategories) {
    const categoryKey = category.toLowerCase().replace(/\s+/g, '_') + '_problems';
    const advanced = categoryStats.Advanced?.[category]?.totalSolved || 0;
    const intermediate = categoryStats.Intermediate?.[category]?.totalSolved || 0;
    const fundamental = categoryStats.Fundamental?.[category]?.totalSolved || 0;
    metrics[categoryKey] = advanced + intermediate + fundamental;
  }
  
  // Calculate skill level indicators
  const hardSolved = difficultyStats.Hard?.solved || 0;
  const mediumSolved = difficultyStats.Medium?.solved || 0;
  const totalSolved = difficultyStats.All?.solved || 0;
  
  metrics.skill_level = hardSolved > 10 ? 'advanced' : 
                       mediumSolved > 20 ? 'intermediate' : 
                       totalSolved > 50 ? 'developing' : 'beginner';
  
  metrics.advanced_categories_count = Object.keys(categoryStats.Advanced || {}).length;
  metrics.intermediate_categories_count = Object.keys(categoryStats.Intermediate || {}).length;
  metrics.fundamental_categories_count = Object.keys(categoryStats.Fundamental || {}).length;
  
  return metrics;
}

/**
 * Extract skills summary from payload
 * @param {Object} payload - User payload data
 * @returns {Object} Skills summary
 */
function extractSkillsSummary(payload) {
  return {
    skill_level: payload.skill_level,
    easy_solved: payload.easy_solved,
    medium_solved: payload.medium_solved,
    hard_solved: payload.hard_solved,
    top_categories: Object.keys(payload)
      .filter(key => key.endsWith('_problems'))
      .sort((a, b) => payload[b] - payload[a])
      .slice(0, 3)
      .map(key => ({
        category: key.replace('_problems', '').replace(/_/g, ' '),
        count: payload[key]
      }))
  };
}

/**
 * Create text embedding using OpenAI
 * @param {string} text - Text to embed
 * @returns {Array} Embedding vector
 */
async function embedText(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}
