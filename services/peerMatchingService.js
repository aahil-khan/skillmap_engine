/**
 * Peer Matching Service
 * 
 * Calculates compatibility scores between users based on:
 * - Shared skills (30%)
 * - Complementary skills (25%)
 * - Goal alignment (20%)
 * - Experience compatibility (15%)
 * - Availability match (10%)
 */

import { supabase } from '../config/supabase.js';
import { qdrant } from '../config/qdrant.js';
import logger from '../utils/logger.js';
import { findSimilarLeetCodeUsers } from './leetcodeEmbedService.js';

const COLLECTION_NAME = 'user_profiles';
const LEETCODE_COLLECTION = 'user_leetcode_embeddings';

// Scoring weights
const WEIGHTS = {
  sharedSkills: 0.30,
  complementarySkills: 0.25,
  goalAlignment: 0.20,
  experienceLevel: 0.15,
  availability: 0.10
};

/**
 * Calculate overall match score between two users
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @param {string} matchType - 'project', 'dsa', or 'both'
 * @returns {Object} Match score and details
 */
export async function calculateMatchScore(userId1, userId2, matchType = 'both') {
  try {
    logger.info('[PeerMatching] Calculating match score', { userId1, userId2, matchType });

    // Fetch both user profiles
    const [user1Profile, user2Profile] = await Promise.all([
      getUserProfileData(userId1),
      getUserProfileData(userId2)
    ]);

    if (!user1Profile || !user2Profile) {
      throw new Error('One or both user profiles not found');
    }

    // Calculate individual score components
    const sharedSkillsResult = await findSharedSkills(userId1, userId2);
    const complementaryResult = await findComplementarySkills(userId1, userId2);
    const goalAlignment = await calculateGoalAlignment(userId1, userId2);
    const experienceCompat = calculateExperienceCompatibility(
      user1Profile.peer_profile?.experience_level,
      user2Profile.peer_profile?.experience_level
    );
    const availabilityMatch = calculateAvailabilityMatch(
      user1Profile.peer_profile?.availability,
      user2Profile.peer_profile?.availability
    );

    // Calculate weighted overall score
    const overallScore = Math.round(
      (sharedSkillsResult.score * WEIGHTS.sharedSkills) +
      (complementaryResult.score * WEIGHTS.complementarySkills) +
      (goalAlignment.score * WEIGHTS.goalAlignment) +
      (experienceCompat * WEIGHTS.experienceLevel) +
      (availabilityMatch * WEIGHTS.availability)
    );

    const matchData = {
      overall_score: overallScore,
      skill_overlap_score: sharedSkillsResult.score,
      complementary_score: complementaryResult.score,
      goal_alignment_score: goalAlignment.score,
      experience_compatibility: experienceCompat,
      availability_match: availabilityMatch,
      shared_skills: sharedSkillsResult.skills,
      complementary_skills: complementaryResult.skills,
      shared_interests: goalAlignment.sharedInterests,
      match_type: matchType
    };

    logger.info('[PeerMatching] Match score calculated', {
      userId1,
      userId2,
      overallScore,
      breakdown: matchData
    });

    return matchData;
  } catch (error) {
    logger.error('[PeerMatching] Error calculating match score', {
      userId1,
      userId2,
      error: error.message
    });
    throw error;
  }
}

/**
 * Find shared skills between two users
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {Object} Shared skills and score
 */
export async function findSharedSkills(userId1, userId2) {
  try {
    // Fetch skills for both users
    const { data: user1Skills, error: error1 } = await supabase
      .from('skills')
      .select('skill_name, skill_level, skill_category')
      .eq('userid', userId1);

    const { data: user2Skills, error: error2 } = await supabase
      .from('skills')
      .select('skill_name, skill_level, skill_category')
      .eq('userid', userId2);

    if (error1 || error2) {
      throw new Error('Error fetching skills');
    }

    if (!user1Skills || !user2Skills || user1Skills.length === 0 || user2Skills.length === 0) {
      return { skills: [], score: 0 };
    }

    // Find overlapping skills
    const user1SkillNames = new Set(user1Skills.map(s => s.skill_name.toLowerCase()));
    const sharedSkills = user2Skills
      .filter(s => user1SkillNames.has(s.skill_name.toLowerCase()))
      .map(s => s.skill_name);

    // Calculate score based on overlap percentage
    const totalUniqueSkills = new Set([
      ...user1Skills.map(s => s.skill_name.toLowerCase()),
      ...user2Skills.map(s => s.skill_name.toLowerCase())
    ]).size;

    const score = totalUniqueSkills > 0
      ? Math.round((sharedSkills.length / totalUniqueSkills) * 100)
      : 0;

    return {
      skills: sharedSkills,
      score: Math.min(score * 2, 100) // Boost score, cap at 100
    };
  } catch (error) {
    logger.error('[PeerMatching] Error finding shared skills', { error: error.message });
    return { skills: [], score: 0 };
  }
}

/**
 * Find complementary skills (skills that complement each other)
 * User2 has skills that User1 wants to learn, and vice versa
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {Object} Complementary skills and score
 */
export async function findComplementarySkills(userId1, userId2) {
  try {
    // Fetch skills and learning goals
    const [user1Skills, user2Skills, user1Goals, user2Goals] = await Promise.all([
      supabase.from('skills').select('skill_name').eq('userid', userId1),
      supabase.from('skills').select('skill_name').eq('userid', userId2),
      supabase.from('learning_goals').select('refined_goal').eq('userid', userId1).eq('status', 'active'),
      supabase.from('learning_goals').select('refined_goal').eq('userid', userId2).eq('status', 'active')
    ]);

    if (user1Skills.error || user2Skills.error || user1Goals.error || user2Goals.error) {
      throw new Error('Error fetching user data');
    }

    const user1SkillSet = new Set(user1Skills.data.map(s => s.skill_name.toLowerCase()));
    const user2SkillSet = new Set(user2Skills.data.map(s => s.skill_name.toLowerCase()));

    // Extract skill keywords from goals
    const user1GoalSkills = extractSkillsFromGoals(user1Goals.data);
    const user2GoalSkills = extractSkillsFromGoals(user2Goals.data);

    // Find complementary matches
    const complementary = [];

    // Skills user2 has that user1 wants to learn
    for (const goalSkill of user1GoalSkills) {
      if (user2SkillSet.has(goalSkill.toLowerCase())) {
        complementary.push(goalSkill);
      }
    }

    // Skills user1 has that user2 wants to learn
    for (const goalSkill of user2GoalSkills) {
      if (user1SkillSet.has(goalSkill.toLowerCase())) {
        if (!complementary.includes(goalSkill)) {
          complementary.push(goalSkill);
        }
      }
    }

    // Score based on complementary skills found
    const score = Math.min(complementary.length * 25, 100);

    return {
      skills: complementary,
      score
    };
  } catch (error) {
    logger.error('[PeerMatching] Error finding complementary skills', { error: error.message });
    return { skills: [], score: 0 };
  }
}

/**
 * Calculate goal alignment between two users
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {Object} Goal alignment score and shared interests
 */
export async function calculateGoalAlignment(userId1, userId2) {
  try {
    // Fetch learning goals for both users
    const { data: user1Goals, error: error1 } = await supabase
      .from('learning_goals')
      .select('refined_goal, goal_category')
      .eq('userid', userId1)
      .eq('status', 'active');

    const { data: user2Goals, error: error2 } = await supabase
      .from('learning_goals')
      .select('refined_goal, goal_category')
      .eq('userid', userId2)
      .eq('status', 'active');

    if (error1 || error2) {
      throw new Error('Error fetching goals');
    }

    if (!user1Goals || !user2Goals || user1Goals.length === 0 || user2Goals.length === 0) {
      return { score: 50, sharedInterests: [] }; // Neutral score if no goals
    }

    // Combine goals into text for similarity comparison
    const user1GoalText = user1Goals.map(g => g.refined_goal).join(' ').toLowerCase();
    const user2GoalText = user2Goals.map(g => g.refined_goal).join(' ').toLowerCase();

    // Simple keyword matching (can be enhanced with embeddings)
    const user1Keywords = extractKeywords(user1GoalText);
    const user2Keywords = extractKeywords(user2GoalText);

    const sharedKeywords = user1Keywords.filter(kw => user2Keywords.includes(kw));
    const totalKeywords = new Set([...user1Keywords, ...user2Keywords]).size;

    const score = totalKeywords > 0
      ? Math.round((sharedKeywords.length / totalKeywords) * 100)
      : 50;

    return {
      score: Math.min(score * 1.5, 100), // Boost and cap at 100
      sharedInterests: sharedKeywords
    };
  } catch (error) {
    logger.error('[PeerMatching] Error calculating goal alignment', { error: error.message });
    return { score: 50, sharedInterests: [] };
  }
}

/**
 * Calculate experience level compatibility
 * @param {string} level1 - First user's experience level
 * @param {string} level2 - Second user's experience level
 * @returns {number} Compatibility score (0-100)
 */
function calculateExperienceCompatibility(level1, level2) {
  if (!level1 || !level2) return 50; // Neutral if unknown

  const levels = {
    'Student': 0,
    'Entry Level': 1,
    '1-3 years': 2,
    '3-5 years': 3,
    '5+ years': 4
  };

  const l1 = levels[level1];
  const l2 = levels[level2];

  if (l1 === undefined || l2 === undefined) return 50;

  // Perfect match: same level
  if (l1 === l2) return 100;

  // Good match: adjacent levels
  if (Math.abs(l1 - l2) === 1) return 80;

  // Okay match: 2 levels apart
  if (Math.abs(l1 - l2) === 2) return 60;

  // Poor match: 3+ levels apart
  return 40;
}

/**
 * Calculate availability match
 * @param {string} avail1 - First user's availability
 * @param {string} avail2 - Second user's availability
 * @returns {number} Match score (0-100)
 */
function calculateAvailabilityMatch(avail1, avail2) {
  if (!avail1 || !avail2) return 50; // Neutral if unknown

  // Flexible matches with everything
  if (avail1 === 'Flexible' || avail2 === 'Flexible') return 100;

  // Exact match
  if (avail1 === avail2) return 100;

  // Partial overlaps
  const overlaps = {
    'Full-time': ['Part-time'],
    'Part-time': ['Full-time', 'Evenings', 'Weekends only'],
    'Evenings': ['Part-time'],
    'Weekends only': ['Part-time']
  };

  if (overlaps[avail1]?.includes(avail2)) return 70;

  // No overlap
  return 40;
}

/**
 * Get top N matches for a user using Qdrant semantic search
 * @param {string} userId - User ID
 * @param {string} matchType - 'project', 'dsa', or 'both'
 * @param {number} limit - Max matches to return
 * @returns {Array} Top matches
 */
export async function getTopMatches(userId, matchType = 'both', limit = 20) {
  try {
    logger.info('[PeerMatching] Getting top matches using Qdrant semantic search', { userId, matchType, limit });

    // Check for cached match scores first
    const { data: cachedScores } = await supabase
      .from('peer_match_scores')
      .select('*')
      .eq('user1_id', userId)
      .gt('expires_at', new Date().toISOString())
      .eq('match_type', matchType)
      .order('overall_score', { ascending: false })
      .limit(limit);

    if (cachedScores && cachedScores.length >= limit) {
      logger.info('[PeerMatching] Using cached match scores', { count: cachedScores.length });
      return cachedScores;
    }

    let semanticMatches = [];

    // Route to appropriate matching strategy based on match type
    if (matchType === 'dsa') {
      // Use LeetCode embeddings for DSA-based matching
      logger.info('[PeerMatching] Using LeetCode semantic search for DSA matching');
      semanticMatches = await getTopDSAMatches(userId, limit * 2); // Get extra for filtering
    } else if (matchType === 'project') {
      // Use project profile embeddings
      logger.info('[PeerMatching] Using project profile semantic search');
      semanticMatches = await getTopProjectMatches(userId, limit * 2);
    } else if (matchType === 'both') {
      // Combine both matching strategies
      logger.info('[PeerMatching] Using combined semantic search (DSA + Project)');
      const [dsaMatches, projectMatches] = await Promise.all([
        getTopDSAMatches(userId, limit).catch(err => {
          logger.warn('[PeerMatching] DSA matching failed, skipping', { error: err.message });
          return [];
        }),
        getTopProjectMatches(userId, limit).catch(err => {
          logger.warn('[PeerMatching] Project matching failed, skipping', { error: err.message });
          return [];
        })
      ]);
      
      // Merge and deduplicate matches
      const matchMap = new Map();
      [...dsaMatches, ...projectMatches].forEach(match => {
        const existing = matchMap.get(match.user2_id);
        if (!existing || match.overall_score > existing.overall_score) {
          matchMap.set(match.user2_id, match);
        }
      });
      semanticMatches = Array.from(matchMap.values());
    }

    if (semanticMatches.length === 0) {
      logger.info('[PeerMatching] No semantic matches found');
      return [];
    }

    // Filter by active peer profiles
    const { data: activePeers } = await supabase
      .from('peer_profiles')
      .select('userid')
      .eq('is_active', true)
      .eq('is_open_to_connections', true)
      .neq('userid', userId);

    const activePeerIds = new Set(activePeers?.map(p => p.userid) || []);
    const filteredMatches = semanticMatches.filter(match => activePeerIds.has(match.user2_id));

    // Sort by overall score and take top N
    filteredMatches.sort((a, b) => b.overall_score - a.overall_score);
    const topMatches = filteredMatches.slice(0, limit);

    // Cache top matches
    await cacheMatchScores(topMatches);

    logger.info('[PeerMatching] Calculated and cached matches', { count: topMatches.length });

    return topMatches;
  } catch (error) {
    logger.error('[PeerMatching] Error getting top matches', {
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Cache match scores in database
 * @param {Array} matches - Match scores to cache
 */
async function cacheMatchScores(matches) {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    const records = matches.map(match => ({
      user1_id: match.user1_id,
      user2_id: match.user2_id,
      overall_score: match.overall_score,
      skill_overlap_score: match.skill_overlap_score,
      complementary_score: match.complementary_score,
      goal_alignment_score: match.goal_alignment_score,
      experience_compatibility: match.experience_compatibility,
      shared_skills: match.shared_skills,
      complementary_skills: match.complementary_skills,
      shared_interests: match.shared_interests,
      match_type: match.match_type,
      expires_at: expiresAt.toISOString()
    }));

    const { error } = await supabase
      .from('peer_match_scores')
      .upsert(records, {
        onConflict: 'user1_id,user2_id',
        ignoreDuplicates: false
      });

    if (error) {
      logger.warn('[PeerMatching] Error caching match scores', { error: error.message });
    } else {
      logger.info('[PeerMatching] Successfully cached match scores', { count: records.length });
    }
  } catch (error) {
    logger.warn('[PeerMatching] Error in cacheMatchScores', { error: error.message });
  }
}

/**
 * Get user profile data from database
 * @param {string} userId - User ID
 * @returns {Object} User profile data
 */
async function getUserProfileData(userId) {
  try {
    const { data: peerProfile } = await supabase
      .from('peer_profiles')
      .select('*')
      .eq('userid', userId)
      .single();

    const { data: skills } = await supabase
      .from('skills')
      .select('skill_name, skill_level')
      .eq('userid', userId);

    const { data: goals } = await supabase
      .from('learning_goals')
      .select('refined_goal')
      .eq('userid', userId)
      .eq('status', 'active');

    return {
      peer_profile: peerProfile,
      skills: skills || [],
      goals: goals || []
    };
  } catch (error) {
    logger.error('[PeerMatching] Error fetching user profile data', {
      userId,
      error: error.message
    });
    return null;
  }
}

/**
 * Extract skill keywords from learning goals
 * @param {Array} goals - Learning goals
 * @returns {Array} Skill keywords
 */
function extractSkillsFromGoals(goals) {
  if (!goals || goals.length === 0) return [];

  const commonSkills = [
    'react', 'vue', 'angular', 'node', 'python', 'java', 'javascript', 'typescript',
    'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'mongodb', 'postgresql', 'mysql',
    'redis', 'graphql', 'rest', 'api', 'microservices', 'machine learning', 'ai',
    'data science', 'tensorflow', 'pytorch', 'flutter', 'react native', 'ios', 'android',
    'golang', 'rust', 'c++', 'c#', 'ruby', 'php', 'django', 'flask', 'express',
    'nextjs', 'nuxt', 'svelte', 'tailwind', 'css', 'html', 'sass', 'webpack'
  ];

  const skillsFound = [];
  const goalText = goals.map(g => g.refined_goal).join(' ').toLowerCase();

  for (const skill of commonSkills) {
    if (goalText.includes(skill)) {
      skillsFound.push(skill);
    }
  }

  return skillsFound;
}

/**
 * Extract keywords from text
 * @param {string} text - Text to extract keywords from
 * @returns {Array} Keywords
 */
function extractKeywords(text) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'should', 'could', 'may', 'might', 'must', 'can', 'i', 'you',
    'he', 'she', 'it', 'we', 'they', 'them', 'their', 'this', 'that'
  ]);

  return text
    .split(/\W+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 20); // Limit to top 20 keywords
}

/**
 * Get top DSA matches using LeetCode embeddings
 * @param {string} userId - User ID
 * @param {number} limit - Number of matches to return
 * @returns {Array} Top DSA matches with scores
 */
async function getTopDSAMatches(userId, limit = 20) {
  try {
    // Check if LeetCode collection exists first
    const collections = await qdrant.getCollections();
    const leetcodeCollectionExists = collections.collections.some(
      col => col.name === LEETCODE_COLLECTION
    );
    
    if (!leetcodeCollectionExists) {
      logger.info('[PeerMatching] LeetCode embeddings collection does not exist yet - no DSA matches available');
      return [];
    }
    
    // Use the LeetCode embedding service to find similar users
    const similarUsers = await findSimilarLeetCodeUsers(userId, limit);
    
    if (!similarUsers || similarUsers.length === 0) {
      logger.info('[PeerMatching] No LeetCode profiles found for DSA matching');
      return [];
    }

    // Convert LeetCode similarity results to match score format
    const matches = [];
    let skippedCount = 0;
    
    for (const similar of similarUsers) {
      try {
        // Get peer profile data for additional context
        const peerData = await getUserProfileData(similar.user_id);
        
        if (!peerData || !peerData.peer_profile) {
          // User has LeetCode embedding but hasn't created peer profile yet - skip silently
          skippedCount++;
          continue;
        }

        // Calculate comprehensive match score combining:
        // - LeetCode similarity (60%)
        // - Skill overlap from SQL (20%)
        // - Goal alignment (10%)
        // - Experience/availability (10%)
        const sharedSkillsResult = await findSharedSkills(userId, similar.user_id);
        const goalAlignment = await calculateGoalAlignment(userId, similar.user_id);
        const experienceCompat = calculateExperienceCompatibility(
          peerData.peer_profile.experience_level,
          peerData.peer_profile.experience_level
        );

        const overallScore = 
          (similar.similarity_score * 100 * 0.60) + // LeetCode semantic similarity
          (sharedSkillsResult.score * 0.20) +       // Shared technical skills
          (goalAlignment * 0.10) +                  // Goal alignment
          (experienceCompat * 0.10);                // Experience compatibility

        matches.push({
          user1_id: userId,
          user2_id: similar.user_id,
          overall_score: Math.round(overallScore),
          skill_overlap_score: sharedSkillsResult.score,
          complementary_score: 0, // Not applicable for DSA matching
          goal_alignment_score: goalAlignment,
          experience_compatibility: experienceCompat,
          availability_match: 0, // Not a primary factor for DSA matching
          shared_skills: sharedSkillsResult.shared || [],
          complementary_skills: [],
          match_type: 'dsa',
          leetcode_similarity: similar.similarity_score,
          leetcode_stats: {
            ranking: similar.ranking,
            total_solved: similar.total_solved,
            skills_summary: similar.skills_summary
          }
        });
      } catch (error) {
        logger.warn('[PeerMatching] Error processing DSA match', {
          userId: similar.user_id,
          error: error.message
        });
      }
    }

    // Log summary
    if (skippedCount > 0) {
      logger.info('[PeerMatching] Skipped LeetCode users without peer profiles', {
        skippedCount,
        matchesFound: matches.length,
        totalCandidates: similarUsers.length
      });
    }

    return matches;
  } catch (error) {
    logger.error('[PeerMatching] Error in getTopDSAMatches', {
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get top project matches using user profile embeddings
 * @param {string} userId - User ID
 * @param {number} limit - Number of matches to return
 * @returns {Array} Top project matches with scores
 */
async function getTopProjectMatches(userId, limit = 20) {
  try {
    // Get the user's embedding from Qdrant
    const userResult = await qdrant.search(COLLECTION_NAME, {
      vector: new Array(1536).fill(0), // dummy vector for filter search
      filter: {
        must: [{ key: "user_id", match: { value: userId } }]
      },
      limit: 1,
      with_vector: true,
      with_payload: true
    });

    if (!userResult || userResult.length === 0) {
      logger.warn('[PeerMatching] User profile embedding not found in Qdrant', { userId });
      throw new Error('User profile embedding not found. Please complete your profile with learning goals.');
    }

    const userVector = userResult[0].vector;
    const userPayload = userResult[0].payload;

    logger.info('[PeerMatching] Found user embedding', {
      userId,
      hasLearningGoal: userPayload.has_learning_goal,
      skillsCount: userPayload.skills_count
    });

    // Search for similar profiles in Qdrant
    const similarProfiles = await qdrant.search(COLLECTION_NAME, {
      vector: userVector,
      filter: {
        must: [
          { key: "has_learning_goal", match: { value: true } }
        ],
        must_not: [
          { key: "user_id", match: { value: userId } } // Exclude self
        ]
      },
      limit: limit,
      with_payload: true,
      score_threshold: 0.3 // Minimum similarity threshold
    });

    if (!similarProfiles || similarProfiles.length === 0) {
      logger.info('[PeerMatching] No similar profiles found in Qdrant');
      return [];
    }

    logger.info('[PeerMatching] Found similar profiles via Qdrant', {
      count: similarProfiles.length,
      topScore: similarProfiles[0]?.score
    });

    // Convert Qdrant similarity results to match score format
    const matches = [];
    let skippedCount = 0;
    
    for (const similar of similarProfiles) {
      try {
        const peerUserId = similar.payload.user_id;
        
        // Get peer profile data for additional context
        const peerData = await getUserProfileData(peerUserId);
        
        if (!peerData || !peerData.peer_profile) {
          // User has profile embedding but hasn't created peer profile yet - skip silently
          skippedCount++;
          continue;
        }

        // Calculate comprehensive match score combining:
        // - Qdrant semantic similarity (50%)
        // - Shared skills (20%)
        // - Complementary skills (15%)
        // - Goal alignment (10%)
        // - Experience/availability (5%)
        const sharedSkillsResult = await findSharedSkills(userId, peerUserId);
        const complementaryResult = await findComplementarySkills(userId, peerUserId);
        const goalAlignment = await calculateGoalAlignment(userId, peerUserId);
        const experienceCompat = calculateExperienceCompatibility(
          peerData.peer_profile.experience_level,
          peerData.peer_profile.experience_level
        );
        const availabilityMatch = calculateAvailabilityMatch(
          peerData.peer_profile.availability,
          peerData.peer_profile.availability
        );

        const overallScore = 
          (similar.score * 100 * 0.50) +           // Qdrant semantic similarity
          (sharedSkillsResult.score * 0.20) +      // Shared technical skills
          (complementaryResult.score * 0.15) +     // Complementary skills
          (goalAlignment * 0.10) +                 // Goal alignment
          (experienceCompat * 0.03) +              // Experience compatibility
          (availabilityMatch * 0.02);              // Availability match

        matches.push({
          user1_id: userId,
          user2_id: peerUserId,
          overall_score: Math.round(overallScore),
          skill_overlap_score: sharedSkillsResult.score,
          complementary_score: complementaryResult.score,
          goal_alignment_score: goalAlignment,
          experience_compatibility: experienceCompat,
          availability_match: availabilityMatch,
          shared_skills: sharedSkillsResult.shared || [],
          complementary_skills: complementaryResult.complementary || [],
          match_type: 'project',
          semantic_similarity: similar.score,
          peer_profile_summary: {
            learning_goal: similar.payload.learning_goal,
            skills_count: similar.payload.skills_count,
            projects_count: similar.payload.projects_count
          }
        });
      } catch (error) {
        logger.warn('[PeerMatching] Error processing project match', {
          userId: similar.payload.user_id,
          error: error.message
        });
      }
    }

    // Log summary
    if (skippedCount > 0) {
      logger.info('[PeerMatching] Skipped users without peer profiles', {
        skippedCount,
        matchesFound: matches.length,
        totalCandidates: similarProfiles.length
      });
    }

    return matches;
  } catch (error) {
    logger.error('[PeerMatching] Error in getTopProjectMatches', {
      userId,
      error: error.message
    });
    throw error;
  }
}
