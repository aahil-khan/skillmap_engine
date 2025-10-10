import { openai } from '../config/openai.js';
import { qdrant } from '../config/qdrant.js';
import { skill_taxonomy } from '../taxonomy/skill_taxonomy.js';
import { getModelConfig } from '../config/ai-models.js';
import { validateAIResponse, extractJSON, skillGapAnalysisSchema, extractOpenAIContent } from '../schemas/ai-response-schemas.js';
import fs from 'fs';

// Logger helper
const logger = {
  info: (msg, data = {}) => console.log(`[INFO] ${msg}`, JSON.stringify(data)),
  warn: (msg, data = {}) => console.warn(`[WARN] ${msg}`, JSON.stringify(data)),
  error: (msg, data = {}) => console.error(`[ERROR] ${msg}`, JSON.stringify(data)),
  debug: (msg, data = {}) => console.debug(`[DEBUG] ${msg}`, JSON.stringify(data))
};

const USER_PROFILES_COLLECTION = 'user_profiles';
const SKILL_EMBEDDINGS_COLLECTION = 'skill_embeddings';

/**
 * Analyze skill gaps for a given user
 * @param {string} name - User name
 * @returns {Object} Skill gap analysis with AI summary
 */
export async function analyzeSkillGaps(user_id) {
  const startTime = Date.now();
  
  try {
    logger.info('Starting skill gap analysis', { userId: user_id });
    
    // Fetch user profile
    const userProfile = await fetchUserProfileById(user_id);

    if (!userProfile) {
      logger.warn('User profile not found', { userId: user_id });
      return null;
    }

    const userSkillListWithLevels = userProfile.payload.skills_list_with_level || {};
    const userGoal = userProfile.payload.learning_goal || '';
    const userName = userProfile.payload.user_name || 'User';
    
    logger.info('User profile loaded', { 
      userId: user_id,
      goal: userGoal,
      skillCount: Object.keys(userSkillListWithLevels).length 
    });

    // Find relevant categories based on user goal
    const categories = await findTaxonomyCategories(userGoal);
    logger.info('Matching categories found', { count: categories.length, categories: categories.map(c => c.category) });

    // Analyze skill gaps for each category
    const skillGaps = await analyzeSkillGapsForCategories(categories, userSkillListWithLevels);
    
    // Generate AI summary
    const summary = await generateSkillGapSummary(userGoal, skillGaps, userName);
    
    const duration = Date.now() - startTime;
    logger.info('Skill gap analysis completed', {
      duration: `${duration}ms`,
      userId: user_id,
      categoriesAnalyzed: categories.length,
      totalGaps: skillGaps.reduce((sum, cat) => sum + cat.skills.gaps.length, 0),
      totalPresent: skillGaps.reduce((sum, cat) => sum + cat.skills.present.length, 0)
    });
    
    return {
      success: true,
      user_id: user_id,
      user: userName,
      analysis: skillGaps,
      summary: summary,
      categories_analyzed: categories.length,
      user_goal: userGoal
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Skill gap analysis failed', {
      error: error.message,
      errorType: error.constructor.name,
      duration: `${duration}ms`,
      userId: user_id,
      stack: error.stack
    });
    throw new Error(`Failed to analyze skill gaps: ${error.message}`);
  }
}

/**
 * Fetch user profile by name from vector database
 * @param {string} name - User name
 * @returns {Object} User profile data
 */
async function fetchUserProfileById(user_id) {
  try {
    const existing = await qdrant.search(USER_PROFILES_COLLECTION, {
      vector: new Array(1536).fill(0), // dummy vector
      filter: {
        must: [{ key: "user_id", match: { value: user_id } }]
      },
      limit: 1,
      with_vector: true,
      with_payload: true
    });

    if (existing && existing.length > 0) {
      return existing[0];
    }

    logger.warn('No user profile found', { userId: user_id });
    return null;
    
  } catch (error) {
    logger.error('Error fetching user profile', { error: error.message, userId: user_id });
    throw error;
  }
}

/**
 * Find taxonomy categories that match user goal
 * @param {string} userGoal - User's learning goal
 * @returns {Array} Matching categories with confidence scores
 */
async function findTaxonomyCategories(userGoal) {
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: userGoal
    });
    
    const results = await qdrant.search(SKILL_EMBEDDINGS_COLLECTION, {
      vector: embeddingResponse.data[0].embedding,
      limit: 5,
      score_threshold: 0.45,
      with_payload: true
    });

    if (results.length > 0) {
      // Return distinct category names with their highest confidence
      const categoryScores = {};
      results.forEach(result => {
        const category = result.payload.category;
        const score = result.score;
        if (!categoryScores[category] || score > categoryScores[category]) {
          categoryScores[category] = score;
        }
      });
      
      return Object.entries(categoryScores).map(([category, confidence]) => ({
        category,
        confidence
      }));
    }
    
    logger.info('No matching categories found for user goal', { goal: userGoal });
    return [];
    
  } catch (error) {
    logger.error('Error finding taxonomy categories', { error: error.message });
    throw error;
  }
}

/**
 * Analyze skill gaps for given categories
 * @param {Array} categories - Categories to analyze
 * @param {Object} userSkillListWithLevels - User's current skills with levels
 * @returns {Array} Detailed skill gap analysis
 */
async function analyzeSkillGapsForCategories(categories, userSkillListWithLevels) {
  const analysis = [];
  
  for (const categoryInfo of categories) {
    logger.debug('Analyzing category', { category: categoryInfo.category });
    
    // Find matching taxonomy category
    const matchResult = findMatchingTaxonomyCategory(categoryInfo.category);
    
    if (matchResult.similarity < 0.7) {
      logger.debug('Low similarity, skipping category', { 
        category: categoryInfo.category,
        similarity: matchResult.similarity 
      });
      continue;
    }
    
    const taxonomyCategory = matchResult.category;
    logger.debug('Matched with taxonomy category', { 
      detectedCategory: categoryInfo.category,
      taxonomyCategory: taxonomyCategory.category,
      similarity: matchResult.similarity 
    });
    
    const categoryAnalysis = {
      detected_category: categoryInfo.category,
      matched_taxonomy_category: taxonomyCategory.category,
      confidence: categoryInfo.confidence,
      similarity: matchResult.similarity,
      skills: {
        gaps: [],
        present: [],
        needs_improvement: []
      }
    };
    
    // Analyze each skill in the taxonomy category
    for (const skill of taxonomyCategory.skills) {
      const skillFound = findUserSkill(skill.name, userSkillListWithLevels);
      
      if (!skillFound) {
        // Skill is missing - add to gaps
        categoryAnalysis.skills.gaps.push({
          name: skill.name,
          description: skill.description,
          priority: 'high'
        });
      } else {
        const userLevel = skillFound.level;
        const skillAnalysis = {
          name: skill.name,
          user_level: userLevel,
          description: skill.description
        };
        
        // Categorize based on skill level
        if (userLevel === 'beginner') {
          categoryAnalysis.skills.needs_improvement.push({
            ...skillAnalysis,
            recommendation: 'Focus on intermediate concepts and practice'
          });
        } else if (userLevel === 'intermediate') {
          categoryAnalysis.skills.present.push({
            ...skillAnalysis,
            recommendation: 'Consider advancing to expert level'
          });
        } else {
          categoryAnalysis.skills.present.push({
            ...skillAnalysis,
            recommendation: 'Strong skill - can mentor others'
          });
        }
      }
    }
    
    analysis.push(categoryAnalysis);
  }
  
  return analysis;
}

/**
 * Find matching taxonomy category using string similarity
 * @param {string} categoryName - Category name to match
 * @returns {Object} Best matching category with similarity score
 */
function findMatchingTaxonomyCategory(categoryName) {
  let bestMatch = null;
  let bestScore = 0;
  
  for (const taxonomyCategory of skill_taxonomy) {
    const similarity = calculateStringSimilarity(categoryName, taxonomyCategory.category);
    
    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatch = taxonomyCategory;
    }
  }
  
  return { category: bestMatch, similarity: bestScore };
}

/**
 * Calculate string similarity between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
function calculateStringSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().replace(/[^\w\s]/g, '');
  const s2 = str2.toLowerCase().replace(/[^\w\s]/g, '');
  
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  
  // Calculate Jaccard similarity using words
  const words1 = new Set(s1.split(/\s+/));
  const words2 = new Set(s2.split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Find user skill with fuzzy matching
 * @param {string} skillName - Skill name to find
 * @param {Object} userSkillListWithLevels - User's skills with levels
 * @returns {Object|null} Found skill with level or null
 */
function findUserSkill(skillName, userSkillListWithLevels) {
  // Remove punctuation from skill name
  skillName = skillName.replace(/[^\w\s]/gi, '');

  // Direct match first
  if (userSkillListWithLevels[skillName]) {
    return { name: skillName, level: userSkillListWithLevels[skillName] };
  }
  
  // Try fuzzy matching
  const skillNameLower = skillName.toLowerCase();
  
  for (const [userSkill, level] of Object.entries(userSkillListWithLevels)) {
    const userSkillLower = userSkill.toLowerCase();
    
    let similarityScore = 0;
    
    // Check for substantial substring matches
    if (userSkillLower.includes(skillNameLower) || skillNameLower.includes(userSkillLower)) {
      const minLength = Math.min(skillNameLower.length, userSkillLower.length);
      const maxLength = Math.max(skillNameLower.length, userSkillLower.length);
      
      if (minLength >= 2 && (minLength / maxLength) >= 0.3) {
        similarityScore = 0.8;
      }
    }
    
    // Check predefined variations
    if (areSkillsSimilar(skillNameLower, userSkillLower)) {
      similarityScore = 0.9;
    }
    
    if (similarityScore >= 0.7) {
      return { name: userSkill, level: level };
    }
  }
  
  return null;
}

/**
 * Check if two skills are similar based on predefined variations
 * @param {string} skill1 - First skill name
 * @param {string} skill2 - Second skill name
 * @returns {boolean} Whether skills are similar
 */
function areSkillsSimilar(skill1, skill2) {
  const variations = {
    'javascript': ['js', 'node.js', 'nodejs'],
    'python': ['py'],
    'html/css': ['html', 'css'],
    'react': ['react.js', 'reactjs'],
    'backend (node/express)': ['node.js', 'express.js', 'express', 'backend'],
    'sql': ['postgresql', 'mysql', 'sqlite'],
    'git & github': ['git', 'github'],
    'docker': ['containerization'],
    'linux/bash': ['linux', 'bash', 'shell']
  };
  
  for (const [key, variants] of Object.entries(variations)) {
    if ((key === skill1 && variants.includes(skill2)) ||
        (key === skill2 && variants.includes(skill1)) ||
        (variants.includes(skill1) && variants.includes(skill2))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Generate AI summary of skill gap findings
 * @param {string} userGoal - User's learning goal
 * @param {Array} skillGaps - Skill gap analysis data
 * @param {string} userName - User's name
 * @returns {string} AI-generated summary
 */
async function generateSkillGapSummary(userGoal, skillGaps, userName) {
  const startTime = Date.now();
  const modelConfig = getModelConfig('skillGapAnalysis');
  
  try {
    logger.info('Generating skill gap summary', { userName, goal: userGoal });
    
    // Prepare analysis data for the prompt
    let analysisText = `User: ${userName}\nGoal: ${userGoal}\n\nSkill Analysis:\n`;
    
    for (const category of skillGaps) {
      analysisText += `\nCategory: ${category.matched_taxonomy_category}\n`;
      
      if (category.skills.present.length > 0) {
        analysisText += `Strong Skills:\n`;
        category.skills.present.forEach(skill => {
          analysisText += `• ${skill.name} (${skill.user_level})\n`;
        });
      }
      
      if (category.skills.needs_improvement.length > 0) {
        analysisText += `Needs Improvement:\n`;
        category.skills.needs_improvement.forEach(skill => {
          analysisText += `• ${skill.name} (${skill.user_level})\n`;
        });
      }
      
      if (category.skills.gaps.length > 0) {
        analysisText += `Missing Skills:\n`;
        category.skills.gaps.forEach(skill => {
          analysisText += `• ${skill.name}\n`;
        });
      }
    }

    let response = null;
    let lastError = null;
    const maxAttempts = modelConfig.retry?.maxRetries || 3;
    
    for (let attempts = 1; attempts <= maxAttempts; attempts++) {
      try {
        logger.info(`Calling OpenAI API (attempt ${attempts}/${maxAttempts})`, { 
          model: modelConfig.model,
          temperature: modelConfig.temperature 
        });
        
        response = await openai.chat.completions.create({
          model: modelConfig.model,
          messages: [
            {
              role: "system",
              content: `You are a skilled career advisor specializing in technical skill development. Generate a personalized, encouraging, and actionable summary for someone looking to improve their skills. 

You MUST respond with ONLY valid JSON in this EXACT format:
{
  "goal_category": "string - main category they're targeting",
  "strengths": ["skill1", "skill2"],
  "strengths_summary": "string - encouraging summary of their strong skills",
  "missing_skills": [
    {"skill": "string", "reason": "string - why it's important"}
  ],
  "skills_to_improve": [
    {"skill": "string", "current_level": "string", "advice": "string - specific advice"}
  ],
  "learning_path": [
    "string - step 1",
    "string - step 2",
    "string - step 3"
  ],
  "next_steps": "string - practical advice for building portfolio/projects"
}

Be encouraging, specific, and actionable. Do not include any markdown, explanations, or text outside the JSON.`
            },
            {
              role: "user",
              content: analysisText
            }
          ],
          max_tokens: 800,
          temperature: modelConfig.temperature,
          response_format: modelConfig.response_format
        });
        
        break; // Success, exit retry loop
        
      } catch (error) {
        lastError = error;
        logger.warn(`OpenAI API call failed (attempt ${attempts}/${maxAttempts})`, {
          error: error.message,
          errorType: error.constructor.name
        });
        
        if (error.message?.includes('timeout') && attempts < maxAttempts) {
          const delay = 2000 * attempts;
          logger.info(`Retrying after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (attempts >= maxAttempts) {
          throw error;
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    if (!response) {
      throw lastError || new Error('Failed to get response from OpenAI');
    }

    // Safely extract content from response
    const jsonText = extractOpenAIContent(response);
    logger.debug('OpenAI response received', { responseLength: jsonText.length });
    
    // Extract and validate JSON
    const extracted = extractJSON(jsonText);
    const validated = validateAIResponse(extracted, skillGapAnalysisSchema, 'skill gap analysis');
    
    // Convert validated JSON to HTML format for display
    const htmlSummary = formatSkillGapSummaryAsHTML(validated);
    
    const duration = Date.now() - startTime;
    logger.info('Skill gap summary generated successfully', {
      duration: `${duration}ms`,
      missingSkillsCount: validated.missing_skills?.length || 0,
      strengthsCount: validated.strengths?.length || 0
    });

    return htmlSummary;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Failed to generate skill gap summary', {
      error: error.message,
      duration: `${duration}ms`,
      userName
    });
    return "Unable to generate summary at this time. Please review the detailed analysis above.";
  }
}

/**
 * Format validated skill gap data as HTML
 * @param {Object} data - Validated skill gap data
 * @returns {string} HTML formatted summary
 */
function formatSkillGapSummaryAsHTML(data) {
  let html = `<p>Based on your goal, I can see you're targeting <strong>${data.goal_category}</strong>.</p>\n\n`;
  
  if (data.strengths && data.strengths.length > 0) {
    html += `<p><strong>Your Strengths:</strong><br>\n`;
    html += `${data.strengths_summary || 'You have a solid foundation in: ' + data.strengths.join(', ')}</p>\n\n`;
  }
  
  html += `<p><strong>Areas to Focus On:</strong></p>\n\n`;
  
  if (data.missing_skills && data.missing_skills.length > 0) {
    html += `<p><strong>Missing Skills (Priority):</strong></p>\n<ul>\n`;
    data.missing_skills.forEach(item => {
      html += `<li><strong>${item.skill}</strong> - ${item.reason}</li>\n`;
    });
    html += `</ul>\n\n`;
  }
  
  if (data.skills_to_improve && data.skills_to_improve.length > 0) {
    html += `<p><strong>Skills to Improve:</strong></p>\n<ul>\n`;
    data.skills_to_improve.forEach(item => {
      html += `<li><strong>${item.skill}</strong> - Currently at ${item.current_level}, ${item.advice}</li>\n`;
    });
    html += `</ul>\n\n`;
  }
  
  if (data.learning_path && data.learning_path.length > 0) {
    html += `<p><strong>Recommended Learning Path:</strong></p>\n<ol>\n`;
    data.learning_path.forEach(step => {
      html += `<li>${step}</li>\n`;
    });
    html += `</ol>\n\n`;
  }
  
  if (data.next_steps) {
    html += `<p><strong>Next Steps:</strong><br>\n${data.next_steps}</p>`;
  }
  
  return html;
}
