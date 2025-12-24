import Instructor from '@instructor-ai/instructor';
import { z } from 'zod';
import { openai, MODELS } from '../../lib/llm/openai.js';
import logger from '../../utils/logger.js';

const JobSkillsSchema = z.object({
  required_skills: z.array(z.object({
    skill: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
  })),
  nice_to_have_skills: z.array(z.string()),
  experience_years: z.number().optional(),
});

const instructor = Instructor({
  client: openai,
  mode: 'TOOLS',
});

export async function extractSkillsFromJob(jobDescription: string) {
  try {
    const extraction = await instructor.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Extract technical skills from job description. 
Focus on: programming languages, frameworks, tools, platforms, databases, cloud services.
Ignore soft skills and general requirements.
Be precise - only extract skills explicitly mentioned.`
        },
        { role: 'user', content: jobDescription }
      ],
      model: MODELS.STRUCTURED_OUTPUT,
      temperature: 0, // CRITICAL: Deterministic
      seed: 42,
      response_model: {
        schema: JobSkillsSchema,
        name: 'JobSkills',
      },
      max_retries: 2,
    });
    
    logger.debug({ 
      requiredCount: extraction.required_skills.length,
      niceToHaveCount: extraction.nice_to_have_skills.length
     }, 'Skills extracted from job');
    
    return extraction;
  } catch (error) {
    logger.error({  error  }, 'Skill extraction failed');
    return null;
  }
}

export async function extractSkillsFromJobDescriptions(
  jobDescriptions: string[]
): Promise<string[]> {
  if (!jobDescriptions || jobDescriptions.length === 0) {
    logger.warn('No job descriptions provided, will use taxonomy fallback');
    return [];
  }
  
  // Batch process to manage LLM costs
  const BATCH_SIZE = 5;
  const allSkills: string[] = [];
  
  for (let i = 0; i < jobDescriptions.length; i += BATCH_SIZE) {
    const batch = jobDescriptions.slice(i, i + BATCH_SIZE);
    const promises = batch.map(description => 
      extractSkillsFromJob(description)
    );
    
    const results = await Promise.all(promises);
    
    for (const result of results) {
      if (result) {
        allSkills.push(...result.required_skills.map(s => s.skill));
        allSkills.push(...result.nice_to_have_skills);
      }
    }
    
    // Small delay between batches for rate limiting
    if (i + BATCH_SIZE < jobDescriptions.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  logger.info({  
    jobCount: jobDescriptions.length,
    skillCount: allSkills.length 
   }, 'Skills extracted from job descriptions');
  
  return allSkills;
}
