import { openai } from '../../lib/llm/openai.js';
import { qdrant, COLLECTIONS } from '../../lib/vector/qdrant.js';
import { supabase } from '../../lib/db/supabase.js';
import logger from '../../utils/logger.js';

interface UserVectorProfile {
  skills_vector: number[];
  goals_vector: number[];
  experience_vector: number[];
  weighted_avg: number[];
}

/**
 * Create embeddings in batch for efficiency
 */
async function createBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  });
  
  return response.data.map(item => item.embedding);
}

/**
 * Generate multi-vector embeddings for a user profile
 * Separate vectors for skills, goals, and experience for targeted matching
 */
export async function generateProfileEmbeddings(userId: string): Promise<UserVectorProfile> {
  logger.info('Generating profile embeddings', { userId });
  
  // Fetch profile data
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  const { data: skills } = await supabase
    .from('user_skills')
    .select('*, skill:skills_taxonomy(canonical_name)')
    .eq('user_id', userId);
  
  const { data: goals } = await supabase
    .from('learning_goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');
  
  const { data: experience } = await supabase
    .from('work_experience')
    .select('*')
    .eq('user_id', userId);
  
  // Format text for embedding
  const skillsText = skills?.map(s => 
    `${s.skill.canonical_name} (${s.skill_level}${s.years_experience ? `, ${s.years_experience} years` : ''})`
  ).join(', ') || 'No skills listed';
  
  const goalsText = goals?.map(g => 
    g.refined_goal || g.original_goal
  ).join(', ') || 'No learning goals';
  
  const experienceText = experience?.map(e => 
    `${e.job_title} at ${e.company_name}: ${e.description || ''}`
  ).join(' ') || 'No work experience';
  
  // Generate embeddings (batch for efficiency)
  const [skillsVec, goalsVec, expVec] = await createBatchEmbeddings([
    skillsText,
    goalsText,
    experienceText,
  ]);
  
  // Weighted average (skills 40%, goals 30%, experience 30%)
  const weightedAvg = skillsVec.map((val, idx) => 
    val * 0.4 + goalsVec[idx] * 0.3 + expVec[idx] * 0.3
  );
  
  logger.info('Profile embeddings generated', { 
    userId, 
    skillsCount: skills?.length || 0,
    goalsCount: goals?.length || 0,
    experienceCount: experience?.length || 0,
  });
  
  return {
    skills_vector: skillsVec,
    goals_vector: goalsVec,
    experience_vector: expVec,
    weighted_avg: weightedAvg,
  };
}

/**
 * Extract top 3 skill categories from user skills
 * "Others" category is deprioritized to come after known categories
 */
async function extractPrimaryCategories(userId: string): Promise<string[]> {
  const { data: skills } = await supabase
    .from('user_skills')
    .select('skill:skills_taxonomy(category)')
    .eq('user_id', userId);
  
  if (!skills || skills.length === 0) return [];
  
  // Count occurrences
  const categoryCounts = skills.reduce((acc, s) => {
    const category = s.skill?.category;
    if (category) {
      acc[category] = (acc[category] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  
  // Separate "Others" from known categories
  const othersCount = categoryCounts['Others'] || 0;
  delete categoryCounts['Others'];
  
  // Sort known categories by count and take top 3
  const knownCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category]) => category);
  
  // Add "Others" only if we have less than 3 known categories
  if (knownCategories.length < 3 && othersCount > 0) {
    knownCategories.push('Others');
  }
  
  return knownCategories;
}

/**
 * Upsert user profile embedding to Qdrant
 * Stores multi-vector representation with metadata for filtering
 */
export async function upsertProfileEmbedding(userId: string) {
  logger.info('Upserting profile embedding', { userId });
  
  const vectors = await generateProfileEmbeddings(userId);
  
  // Get metadata
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  const { data: skills } = await supabase
    .from('user_skills')
    .select('*')
    .eq('user_id', userId);
  
  const { data: leetcode } = await supabase
    .from('leetcode_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  const primaryCategories = await extractPrimaryCategories(userId);
  
  await qdrant.upsert(COLLECTIONS.USER_PROFILES, {
    wait: true,
    points: [{
      id: userId,
      vector: vectors.weighted_avg,
      payload: {
        user_id: userId,
        skills_vector: vectors.skills_vector,
        goals_vector: vectors.goals_vector,
        experience_vector: vectors.experience_vector,
        skill_count: skills?.length || 0,
        experience_level: profile?.experience_level || 'entry',
        primary_categories: primaryCategories,
        has_leetcode: !!leetcode,
        is_active: profile?.is_active ?? false,
        is_searchable: profile?.is_searchable ?? true,
        last_active: profile?.last_active_at || new Date().toISOString(),
      },
    }],
  });
  
  logger.info('Profile embedding upserted', { 
    userId, 
    primaryCategories,
    skillCount: skills?.length || 0,
  });
}
