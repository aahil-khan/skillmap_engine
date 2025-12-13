import Instructor from '@instructor-ai/instructor';
import { openai, MODELS } from '../../lib/llm/openai.js';
import { ResumeExtractionSchema, type ResumeExtraction } from '../../schemas/resume.js';
import logger from '../../utils/logger.js';

const instructor = Instructor({
  client: openai,
  mode: 'TOOLS',
});

/**
 * Pass 1: Extract structured data from resume text using LLM.
 * CRITICAL: temperature=0 for determinism (same input = same output)
 * 
 * WHY NOT NORMALIZE IN LLM?
 * - LLM might hallucinate skills not in resume
 * - Inconsistent normalization (same input → different output)
 * - Vector search is deterministic and confidence-scored
 */
export async function extractResumeData(resumeText: string): Promise<ResumeExtraction> {
  try {
    const extraction = await instructor.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a resume parser. Extract structured information from the resume text.

Rules:
- Extract skills EXACTLY as written (don't normalize yet)
- For dates, prefer ISO format (YYYY-MM) but keep original if unclear
- Include ALL technologies mentioned in work experience and projects
- Be precise - only extract information explicitly stated
- If proficiency level is not mentioned, omit it`,
        },
        {
          role: 'user',
          content: resumeText,
        },
      ],
      model: MODELS.STRUCTURED_OUTPUT,
      temperature: 0, // CRITICAL: Deterministic
      response_model: {
        schema: ResumeExtractionSchema,
        name: 'ResumeExtraction',
      },
      max_retries: 3,
    });

    logger.info('Resume extraction successful', {
      skillsCount: extraction.skills.length,
      experienceCount: extraction.work_experience.length,
      projectsCount: extraction.projects.length,
    });

    return extraction;
  } catch (error) {
    logger.error('Resume extraction failed', { error });
    throw error;
  }
}
