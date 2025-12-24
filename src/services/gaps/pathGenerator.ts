import Instructor from '@instructor-ai/instructor';
import { z } from 'zod';
import { openai, MODELS } from '../../lib/llm/openai.js';
import { supabase } from '../../lib/db/supabase.js';
import logger from '../../utils/logger.js';
import type { SkillGap } from './analyzer.js';

// Zod schema for structured learning path output
const LearningResourceSchema = z.object({
  type: z.enum(['course', 'docs', 'video', 'tutorial', 'book', 'project']),
  title: z.string(),
  url: z.string().url().optional(),
  free: z.boolean().default(true),
});

const LearningStepSchema = z.object({
  step_number: z.number(),
  title: z.string(),
  description: z.string(),
  skills_covered: z.array(z.string()),
  estimated_weeks: z.number(),
  resources: z.array(LearningResourceSchema),
  project_idea: z.string().optional(),
});

const LearningPathSchema = z.object({
  total_estimated_weeks: z.number(),
  steps: z.array(LearningStepSchema),
  key_milestones: z.array(z.string()),
});

const instructor = Instructor({
  client: openai,
  mode: 'TOOLS',
});

/**
 * Generate personalized learning path using LLM
 * Orders steps by prerequisites, recommends free resources, includes projects
 */
export async function generateLearningPath(
  userId: string,
  goalId: string,
  gaps: SkillGap[],
  strengths: SkillGap[],
  version: number = 1
): Promise<any> {
  try {
    // 1. Fetch user context
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('display_name, experience_level')
      .eq('user_id', userId)
      .single();
    
    const { data: goal } = await supabase
      .from('learning_goals')
      .select('original_goal, refined_goal, target_role, target_timeline')
      .eq('id', goalId)
      .single();
    
    if (!goal) {
      throw new Error('Goal not found');
    }
    
    // 2. Format prompt data
    const gapsList = gaps
      .slice(0, 10) // Top 10 gaps
      .map(g => `- ${g.skill} (${Math.round(g.required_frequency * 100)}% of jobs, Priority: ${g.priority})`)
      .join('\n');
    
    const strengthsList = strengths
      .slice(0, 5) // Top 5 strengths
      .map(s => `- ${s.skill} (${s.user_level || 'known'})`)
      .join('\n');
    
    const prompt = `Generate a personalized learning path for a software developer:

**User Profile:**
- Experience Level: ${profile?.experience_level || 'entry'}
- Current Strengths:
${strengthsList || '  (Building foundation skills)'}

**Goal:** ${goal.refined_goal || goal.original_goal}
**Target Role:** ${goal.target_role || 'Not specified'}
**Target Timeline:** ${goal.target_timeline || '3-6 months'}

**Priority Skills to Learn:**
${gapsList}

**Requirements:**
1. Order steps by prerequisites (e.g., learn HTML before React)
2. Include hands-on projects for each major skill
3. Recommend FREE resources (official docs, freeCodeCamp, YouTube, MDN)
4. Be realistic about time estimates
5. Build on user's existing strengths where possible
6. Each step should take 1-4 weeks max

Generate a step-by-step learning path.`;
    
    logger.info({  userId, goalId, gapCount: gaps.length  }, 'Generating learning path with LLM');
    
    // 3. Generate with LLM (deterministic for consistency)
    const path = await instructor.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are an experienced career coach creating personalized learning roadmaps for software developers. Focus on practical, achievable paths with free resources.',
        },
        { role: 'user', content: prompt },
      ],
      model: MODELS.STRUCTURED_OUTPUT,
      temperature: 0.3, // Slight creativity for resource variety
      seed: 42,
      response_model: {
        schema: LearningPathSchema,
        name: 'LearningPath',
      },
      max_retries: 3,
    });
    
    logger.info({ 
      userId,
      goalId,
      steps: path.steps.length,
      weeks: path.total_estimated_weeks,
     }, 'Learning path generated');
    
    // 4. Store in database
    const { data: savedPath, error } = await supabase
      .from('learning_paths')
      .insert({
        user_id: userId,
        goal_id: goalId,
        path_data: path,
        version: version,
      })
      .select()
      .single();
    
    if (error) {
      logger.error({  
        error: error.message, 
        userId, 
        goalId 
       }, 'Failed to save learning path to database');
      // Return generated path anyway
      return path;
    }
    
    logger.info({  
      userId, 
      goalId, 
      pathId: savedPath.id 
     }, 'Learning path saved to database');
    
    return savedPath;
  } catch (error) {
    const err = error as Error;
    logger.error({  
      error: err.message, 
      userId, 
      goalId 
     }, 'Learning path generation failed');
    throw error;
  }
}
