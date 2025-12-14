import { supabase } from '../../lib/db/supabase.js';
import { createEmbedding } from '../../lib/llm/openai.js';
import logger from '../../utils/logger.js';

export interface ScoringFactors {
  shared_skills_score: number; // 30%
  complementary_skills_score: number; // 25%
  goal_alignment_score: number; // 20%
  experience_compatibility_score: number; // 15%
  availability_match_score: number; // 10%
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
  
  // Fetch user and candidate skills
  const { data: userSkills } = await supabase
    .from('user_skills')
    .select('skill_id, skill_level')
    .eq('user_id', userId);
  
  const { data: candidateSkills } = await supabase
    .from('user_skills')
    .select('skill_id, skill_level')
    .eq('user_id', candidateId);
  
  const userSkillIds = new Set(userSkills?.map(s => s.skill_id) || []);
  const candidateSkillIds = new Set(candidateSkills?.map(s => s.skill_id) || []);
  
  // ===== 1. SHARED SKILLS (30%) =====
  const sharedSkills = [...userSkillIds].filter(id => candidateSkillIds.has(id));
  const shared_skills_score = userSkillIds.size > 0
    ? Math.min((sharedSkills.length / userSkillIds.size) * 100, 100)
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
  
  // ===== CALCULATE WEIGHTED TOTAL =====
  const total_score =
    shared_skills_score * 0.30 +
    complementary_skills_score * 0.25 +
    goal_alignment_score * 0.20 +
    experience_compatibility_score * 0.15 +
    availability_match_score * 0.10;
  
  return {
    total_score: Math.round(total_score * 10) / 10, // Round to 1 decimal
    factors: {
      shared_skills_score: Math.round(shared_skills_score),
      complementary_skills_score: Math.round(complementary_skills_score),
      goal_alignment_score: Math.round(goal_alignment_score),
      experience_compatibility_score: Math.round(experience_compatibility_score),
      availability_match_score: Math.round(availability_match_score),
    },
  };
}
