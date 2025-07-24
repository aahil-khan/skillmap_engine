import { openai } from '../config/openai.js';
import { qdrant } from '../config/qdrant.js';
import { skill_taxonomy } from '../taxonomy/skill_taxonomy.js';
import fs from 'fs';

const USER_PROFILES_COLLECTION = 'user_profiles';
const SKILL_EMBEDDINGS_COLLECTION = 'skill_embeddings';

/**
 * Analyze skill gaps for a given user
 * @param {string} name - User name
 * @returns {Object} Skill gap analysis with AI summary
 */
export async function analyzeSkillGaps(name) {
  try {
    // Fetch user profile
    const userProfile = await fetchUserProfileByName(name);
    
    if (!userProfile) {
      return null;
    }

    const userSkillListWithLevels = userProfile.payload.skills_list_with_level || {};
    const userGoal = userProfile.payload.learning_goal || '';
    
    console.log(`Analyzing skill gaps for: ${name}`);
    console.log(`User goal: ${userGoal}`);
    console.log(`User skills:`, userSkillListWithLevels);

    // Find relevant categories based on user goal
    const categories = await findTaxonomyCategories(userGoal);
    console.log('Matching categories:', categories);

    // Analyze skill gaps for each category
    const skillGaps = await analyzeSkillGapsForCategories(categories, userSkillListWithLevels);
    
    // Generate AI summary
    const summary = await generateSkillGapSummary(userGoal, skillGaps, name);
    
    // Save results to file (optional)
    // const filename = `skill_gaps_${name.replace(/\s+/g, '_').toLowerCase()}.json`;
    // const results = { skillGaps, summary };
    // fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    // console.log(`Skill gaps analysis saved to ${filename}`);
    
    return {
      success: true,
      user: name,
      analysis: skillGaps,
      summary: summary,
      categories_analyzed: categories.length,
      user_goal: userGoal
    };
    
  } catch (error) {
    console.error('Error analyzing skill gaps:', error);
    throw new Error(`Failed to analyze skill gaps: ${error.message}`);
  }
}

/**
 * Fetch user profile by name from vector database
 * @param {string} name - User name
 * @returns {Object} User profile data
 */
async function fetchUserProfileByName(name) {
  try {
    const existing = await qdrant.search(USER_PROFILES_COLLECTION, {
      vector: new Array(1536).fill(0), // dummy vector
      filter: {
        must: [{ key: "user_name", match: { value: name } }]
      },
      limit: 1,
      with_vector: true,
      with_payload: true
    });

    if (existing && existing.length > 0) {
      return existing[0];
    }
    
    console.log(`No user profile found for name: ${name}`);
    return null;
    
  } catch (error) {
    console.error('Error fetching user profile:', error);
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
    
    console.log('No matching categories found for the user goal');
    return [];
    
  } catch (error) {
    console.error('Error finding taxonomy categories:', error);
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
    console.log(`\nAnalyzing category: ${categoryInfo.category}`);
    
    // Find matching taxonomy category
    const matchResult = findMatchingTaxonomyCategory(categoryInfo.category);
    
    if (matchResult.similarity < 0.7) {
      console.log(`Low similarity (${matchResult.similarity.toFixed(2)}) for category: ${categoryInfo.category}`);
      continue;
    }
    
    const taxonomyCategory = matchResult.category;
    console.log(`Matched with taxonomy category: ${taxonomyCategory.category} (similarity: ${matchResult.similarity.toFixed(2)})`);
    
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
  try {
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

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a skilled career advisor specializing in technical skill development. Generate a personalized, encouraging, and actionable summary for someone looking to improve their skills. 

Format your response exactly like this:

Based on your goal, I can see you're targeting [category].

        Your Strengths:
        [Mention their strong skills and encourage them]

        Areas to Focus On:
        Missing Skills (Priority):
        • [skill] - [brief reason why it's important]
        • [skill] - [brief reason why it's important]

        Skills to Improve:
        • [skill] - Currently at [level], focus on [specific advice]

        Recommended Learning Path:
        1. [First step with specific skill]
        2. [Second step building on first]
        3. [Third step for practical application]

        Next Steps:
        [Practical advice for building portfolio/projects that combine their strengths with new skills]

        Keep it encouraging, specific, and actionable. Return the response in HTML format with appropriate tags for emphasis and structure. There should be double line breaks to separate sections and a readable font size. Use <strong> for emphasis where appropriate.`,
        },
        {
          role: "user",
          content: analysisText
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    return response.choices[0].message.content;
    
  } catch (error) {
    console.error('Error generating skill gap summary:', error);
    return "Unable to generate summary at this time. Please review the detailed analysis above.";
  }
}
