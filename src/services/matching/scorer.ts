import { supabase } from '../../lib/db/supabase.js';
import { createEmbedding } from '../../lib/llm/openai.js';
import logger from '../../utils/logger.js';

export interface ScoringFactors {
  shared_skills_score: number; // 35% (adjusted for domain)
  complementary_skills_score: number; // 20%
  goal_alignment_score: number; // 20%
  experience_compatibility_score: number; // 15%
  availability_match_score: number; // 5%
  domain_alignment_score: number; // 10% (NEW: same domain preference)
}

export interface MatchScore {
  total_score: number;
  factors: ScoringFactors;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }
  
  return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

/**
 * Calculate multi-factor match score between two users
 */
export async function calculateMatchScore(
  userId: string,
  candidateId: string,
  candidatePayload: Record<string, any>
): Promise<MatchScore> {
  logger.debug('Calculating match score', { userId, candidateId });
  
  // Fetch user and candidate skills with value_weight from taxonomy
  const { data: userSkills } = await supabase
    .from('user_skills')
    .select('skill_id, skill_level, skills_taxonomy!inner(value_weight, category)')
    .eq('user_id', userId);
  
  const { data: candidateSkills } = await supabase
    .from('user_skills')
    .select('skill_id, skill_level, skills_taxonomy!inner(value_weight, category)')
    .eq('user_id', candidateId);
  
  // Create maps for skill level and weight comparison
  const userSkillMap = new Map(
    userSkills?.map(s => [
      s.skill_id,
      { level: s.skill_level, weight: s.skills_taxonomy.value_weight, category: s.skills_taxonomy.category }
    ]) || []
  );
  const candidateSkillMap = new Map(
    candidateSkills?.map(s => [
      s.skill_id,
      { level: s.skill_level, weight: s.skills_taxonomy.value_weight, category: s.skills_taxonomy.category }
    ]) || []
  );
  
  // ===== 1. SHARED SKILLS (40%) with level similarity =====
  const skillLevelValues: Record<string, number> = {
    'beginner': 1,
    'intermediate': 2,
    'advanced': 3,
  };
  
  let totalSkillScore = 0;
  let sharedSkillCount = 0;
  
  for (const [skillId, userSkillData] of userSkillMap.entries()) {
    if (candidateSkillMap.has(skillId)) {
      sharedSkillCount++;
      const candidateSkillData = candidateSkillMap.get(skillId)!;
      const userLevelNum = skillLevelValues[userSkillData.level] || 2;
      const candidateLevelNum = skillLevelValues[candidateSkillData.level] || 2;
      
      // Base score from level similarity
      const levelDiff = Math.abs(userLevelNum - candidateLevelNum);
      const levelSimilarity = 1 - (levelDiff * 0.25); // 0.75 for 1 level, 0.5 for 2 levels
      
      // Boost score for higher-level skills (advanced-advanced counts more)
      const avgLevel = (userLevelNum + candidateLevelNum) / 2;
      const levelBoost = 0.5 + (avgLevel / 6); // 0.67 for beginner-beginner, 1.0 for advanced-advanced
      
      // Apply skill value weight (high-value skills count more)
      const valueWeight = userSkillData.weight || 1.0;
      
      totalSkillScore += levelSimilarity * levelBoost * valueWeight;
    }
  }
  
  const shared_skills_score = userSkillMap.size > 0
    ? Math.min((totalSkillScore / userSkillMap.size) * 100, 100)
    : 0;
  
  // ===== 2. COMPLEMENTARY SKILLS (25%) =====
  // User wants to learn skills that candidate has
  let complementary_skills_score = 0;
  
  const { data: userGoals } = await supabase
    .from('learning_goals')
    .select('refined_goal, original_goal')
    .eq('user_id', userId)
    .eq('status', 'active');
  
  if (userGoals && userGoals.length > 0) {
    // Combine all user goals into single text
    const goalsText = userGoals
      .map(g => g.refined_goal || g.original_goal)
      .join(' ');
    
    // Generate embedding for user's learning goals
    const goalsEmbedding = await createEmbedding(goalsText);
    
    // Compare against candidate's skills vector (from payload)
    const candidateSkillsVector = candidatePayload.skills_vector as number[];
    
    if (candidateSkillsVector && candidateSkillsVector.length > 0) {
      const similarity = cosineSimilarity(goalsEmbedding, candidateSkillsVector);
      complementary_skills_score = Math.max(0, Math.min(similarity * 100, 100));
    }
  } else {
    // No learning goals - use vector similarity as fallback
    complementary_skills_score = 50; // Neutral score
  }
  
  // ===== 3. GOAL ALIGNMENT (20%) =====
  // Similar career aspirations (both want similar things)
  const candidateGoalsVector = candidatePayload.goals_vector as number[];
  let goal_alignment_score = 50; // Default neutral
  
  if (userGoals && userGoals.length > 0 && candidateGoalsVector) {
    const goalsText = userGoals
      .map(g => g.refined_goal || g.original_goal)
      .join(' ');
    const userGoalsEmbedding = await createEmbedding(goalsText);
    
    const similarity = cosineSimilarity(userGoalsEmbedding, candidateGoalsVector);
    goal_alignment_score = Math.max(0, Math.min(similarity * 100, 100));
  }
  
  // ===== 4. EXPERIENCE COMPATIBILITY (15%) =====
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('experience_level')
    .eq('user_id', userId)
    .single();
  
  const experienceLevels = ['entry', '1-3years', '3-5years', '5+years'];
  const userExpIdx = experienceLevels.indexOf(userProfile?.experience_level || 'entry');
  const candidateExpIdx = experienceLevels.indexOf(
    candidatePayload.experience_level || 'entry'
  );
  
  // Closer experience levels = better compatibility
  const experienceDiff = Math.abs(userExpIdx - candidateExpIdx);
  const experience_compatibility_score = Math.max(0, 100 - (experienceDiff * 25));
  
  // ===== 5. AVAILABILITY MATCH (10%) =====
  const { data: userPrefs } = await supabase
    .from('peer_preferences')
    .select('available_days, preferred_time_slots')
    .eq('user_id', userId)
    .single();
  
  const { data: candidatePrefs } = await supabase
    .from('peer_preferences')
    .select('available_days, preferred_time_slots')
    .eq('user_id', candidateId)
    .single();
  
  let availability_match_score = 50; // Default if no preferences set
  
  if (userPrefs?.available_days && candidatePrefs?.available_days) {
    const userDays = new Set(userPrefs.available_days);
    const candidateDays = new Set(candidatePrefs.available_days);
    const overlappingDays = [...userDays].filter(d => candidateDays.has(d));
    
    if (userDays.size > 0) {
      availability_match_score = (overlappingDays.length / userDays.size) * 100;
    }
  }
  
  // ===== 6. DOMAIN ALIGNMENT (10%) =====
  // Calculate domain/category alignment from skills
  const userCategories = new Set<string>();
  const candidateCategories = new Set<string>();
  
  for (const [_, skillData] of userSkillMap.entries()) {
    userCategories.add(skillData.category);
  }
  for (const [_, skillData] of candidateSkillMap.entries()) {
    candidateCategories.add(skillData.category);
  }
  
  // Calculate overlap in skill domains
  const categoryOverlap = [...userCategories].filter(c => candidateCategories.has(c)).length;
  const totalCategories = Math.max(userCategories.size, candidateCategories.size);
  
  // Check for complementary domains (e.g., Frontend + Backend, DevOps + Cloud)
  const complementaryPairs = [
    ['Frontend Frameworks', 'Backend Frameworks'],
    ['Frontend Frameworks', 'Databases'],
    ['Backend Frameworks', 'Databases'],
    ['DevOps & Cloud', 'Backend Frameworks'],
    ['Data Science & ML', 'Programming Languages'],
  ];
  
  let hasComplementaryDomain = false;
  for (const [cat1, cat2] of complementaryPairs) {
    if (
      (userCategories.has(cat1) && candidateCategories.has(cat2)) ||
      (userCategories.has(cat2) && candidateCategories.has(cat1))
    ) {
      hasComplementaryDomain = true;
      break;
    }
  }
  
  let domain_alignment_score = totalCategories > 0
    ? (categoryOverlap / totalCategories) * 100
    : 50;
  
  // Boost if complementary domains detected
  if (hasComplementaryDomain) {
    domain_alignment_score = Math.min(domain_alignment_score + 15, 100);
  }
  
  // ===== CALCULATE WEIGHTED TOTAL =====
  const total_score =
    shared_skills_score * 0.35 +           // Adjusted for domain factor
    complementary_skills_score * 0.20 +
    goal_alignment_score * 0.20 +
    experience_compatibility_score * 0.15 +
    availability_match_score * 0.05 +
    domain_alignment_score * 0.10;         // NEW: domain alignment bonus
  
  return {
    total_score: Math.round(total_score * 10) / 10, // Round to 1 decimal
    factors: {
      shared_skills_score: Math.round(shared_skills_score),
      complementary_skills_score: Math.round(complementary_skills_score),
      goal_alignment_score: Math.round(goal_alignment_score),
      experience_compatibility_score: Math.round(experience_compatibility_score),
      availability_match_score: Math.round(availability_match_score),
      domain_alignment_score: Math.round(domain_alignment_score),
    },
  };
}
