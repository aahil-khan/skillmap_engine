import { openai, qdrant } from "./config.js";
import "dotenv/config";
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { skill_taxonomy } from "./skill_taxonomy.js";

const app = express();
const PORT = process.env.PORT || 5002;

// Middleware
app.use(cors());
app.use(express.json());

const COLLECTION_NAME = 'user_profiles';

// Fixed: Extract the vector from the user profile
async function findSkillGaps() {
    try {
        const userProfile = await fetchUserProfileByName('Anoushka Awasthi');
        
        if (!userProfile) {
            console.log('User not found');
            return;
        }

        // Debug: Check what we got
        console.log('User profile structure:', Object.keys(userProfile));
        console.log('Has vector:', !!userProfile.vector);
        console.log('Vector length:', userProfile.vector?.length);

        // Extract the vector from the user profile
        const userVector = userProfile.vector;
        const userSkillListWithLevels = userProfile.payload.skills_list_with_level || {};
        console.log('User skill list with levels:', userSkillListWithLevels);

        const userGoal = userProfile.payload.learning_goal || '';
        console.log('User goal:', userGoal);

        const categories = await findTaxonomyCategory(userGoal);
        console.log('Matching categories:', categories);

        // Analyze skill gaps for each category
        const skillGaps = await analyzeSkillGaps(categories, userSkillListWithLevels);
        console.log('Skill gaps analysis:', JSON.stringify(skillGaps, null, 2));

        // Save results to a file
        fs.writeFileSync('skill_gaps_analysis.json', JSON.stringify(skillGaps, null, 2));
        console.log('Skill gaps analysis saved to skill_gaps_analysis.json');
    } catch (error) {
        console.error('Error finding skill gaps:', error);
    }
}

async function fetchUserProfileByName(name) {
    try {
        const existing = await qdrant.search(COLLECTION_NAME, {
            vector: new Array(1536).fill(0), // dummy vector of dimension 1536
            filter: {
                must: [
                    {
                        key: "user_name",
                        match: { value: name }
                    }
                ]
            },
            limit: 1,
            with_vector: true, // Important: This ensures vectors are returned
            with_payload: true
        });

        if (existing && existing.length > 0) {
            return existing[0];
        } else {
            console.log(`No user profile found for name: ${name}`);
            return null;
        }
    } catch (error) {
        console.error('Error fetching user profile:', error);
        throw error;
    }
}

async function findTaxonomyCategory(userGoal){
    //find all categories that match the user goal(text) by searching the taxonomy embeddings

    try {
        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: userGoal
        });
        const results = await qdrant.search('skill_embeddings', {
            vector: embeddingResponse.data[0].embedding,
            limit: 10,
            score_threshold: 0.4,
            with_payload: true
        });

        if (results.length > 0) {
            // Return distinct category names with their highest confidence (score)
            const categoryScores = {};
            results.forEach(result => {
            const category = result.payload.category;
            const score = result.score;
            if (!categoryScores[category] || score > categoryScores[category]) {
                categoryScores[category] = score;
            }
            });
            // Convert to array of objects: [{ category, confidence }]
            const distinctCategoriesWithConfidence = Object.entries(categoryScores).map(([category, confidence]) => ({
            category,
            confidence
            }));
            return distinctCategoriesWithConfidence;
        } else {
            console.log('No matching categories found for the user goal');
            return [];
        }
    } catch (error) {
        console.error('Error finding taxonomy category:', error);
        throw error;
    }

}

async function findMatchingTaxonomyCategory(categoryName) {
    // Use simple string similarity instead of expensive embeddings
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

function calculateStringSimilarity(str1, str2) {
    // Simple similarity based on common words and partial matches
    const s1 = str1.toLowerCase().replace(/[^\w\s]/g, '');
    const s2 = str2.toLowerCase().replace(/[^\w\s]/g, '');
    
    // Direct match
    if (s1 === s2) return 1.0;
    
    // Check if one contains the other
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;
    
    // Calculate Jaccard similarity using words
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
}


async function analyzeSkillGaps(categories, userSkillListWithLevels) {
    const analysis = [];
    
    for (const categoryInfo of categories) {
        console.log(`\nAnalyzing category: ${categoryInfo.category}`);
        
        // Find matching taxonomy category
        const matchResult = await findMatchingTaxonomyCategory(categoryInfo.category);
        
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
            console.log(skillFound ? `Found skill: ${skillFound.name} (level: ${skillFound.level})` : `Skill not found: ${skill.name}`);
            
            if (!skillFound) {
                // Skill is missing - add to gaps
                categoryAnalysis.skills.gaps.push({
                    name: skill.name,
                    description: skill.description,
                    priority: 'high' // Could be calculated based on various factors
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

function findUserSkill(skillName, userSkillListWithLevels) {

    //remove any punctuation, special characters from skillName
    skillName = skillName.replace(/[^\w\s]/gi, '');

    // Direct match first
    if (userSkillListWithLevels[skillName]) {
        return { name: skillName, level: userSkillListWithLevels[skillName] };
    }
    
    // Try fuzzy matching for similar skill names
    const skillNameLower = skillName.toLowerCase();
    
    for (const [userSkill, level] of Object.entries(userSkillListWithLevels)) {
        const userSkillLower = userSkill.toLowerCase();
        
        // Calculate similarity score
        let similarityScore = 0;
        
        // Check for exact substring matches (higher weight)
        if (userSkillLower.includes(skillNameLower) || skillNameLower.includes(userSkillLower)) {
            // Only if the match is substantial (not just single characters)
            const minLength = Math.min(skillNameLower.length, userSkillLower.length);
            const maxLength = Math.max(skillNameLower.length, userSkillLower.length);
            
            // Require at least 2 characters and reasonable length ratio
            if (minLength >= 2 && (minLength / maxLength) >= 0.3) {
                similarityScore = 0.8;
            }
        }
        
        // Check predefined variations (highest weight)
        if (areSkillsSimilar(skillNameLower, userSkillLower)) {
            similarityScore = 0.9;
        }
        
        // Only return if similarity is above threshold
        if (similarityScore >= 0.7) {
            return { name: userSkill, level: level };
        }
    }
    
    return null;
}

function areSkillsSimilar(skill1, skill2) {
    // Handle common skill name variations
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

// Run the function
findSkillGaps();
