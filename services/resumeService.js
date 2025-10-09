import { openai } from '../config/openai.js';
import { parseResume } from '../utils/pdfParser.js';
import { skill_taxonomy } from '../taxonomy/skill_taxonomy.js';
import { supabase } from '../config/supabase.js';
import { getModelConfig } from '../config/ai-models.js';
import { validateAIResponse, resumeAnalysisSchema, extractJSON } from '../schemas/ai-response-schemas.js';
import logger from '../utils/logger.js';

/**
 * Process uploaded resume file and extract structured profile data
 * @param {string} filePath - Path to the uploaded PDF file
 * @param {string} userId - User ID from authentication
 * @returns {Object} Structured profile data
 */
export async function processResume(filePath, userId = null) {
  const startTime = Date.now();
  
  try {
    // Extract text from PDF
    const resumeText = await parseResume(filePath);
    
    if (!resumeText) {
      throw new Error('Failed to extract text from PDF');
    }

    logger.info('Resume text extracted', { textLength: resumeText.length, userId });

    // Get optimized model configuration for resume analysis
    const modelConfig = getModelConfig('resumeAnalysis');
    
    // Use OpenAI to structure the resume data with retry logic
    let response;
    let attempts = 0;
    const maxAttempts = 3;
    let lastError;
    
    while (attempts < maxAttempts) {
      try {
        attempts++;
        logger.info('Calling OpenAI for resume analysis', { 
          attempt: attempts, 
          maxAttempts,
          model: modelConfig.model
        });
        
        response = await openai.chat.completions.create({
          ...modelConfig,
          messages: [
            {
              role: 'system',
              content: 'You are an AI assistant that converts resume text into structured JSON profiles. You MUST respond with valid JSON only, no markdown, no explanations. Be accurate and do not hallucinate information not present in the resume.'
            },
            {
              role: 'user',
              content: `Analyze this resume and return ONLY valid JSON.

Resume text:
${resumeText}

Required JSON structure:
{
  "name": "string",
  "technical_skills": [{"category": "string", "skills": ["string"], "level": "Beginner|Intermediate|Advanced"}],
  "inferred_areas_of_strength": ["string"],
  "experience": {"total_years": number, "recent_roles": [{"title": "string", "company": "string", "duration": "string"}]},
  "projects": [{"name": "string", "description": "string", "technologies": ["string"]}],
  "education": [{"degree": "string", "institution": "string", "year": "string"}]
}

Skill taxonomy: ${JSON.stringify(skill_taxonomy)}

IMPORTANT:
- Return ONLY valid JSON
- Do not hallucinate
- Map skills to taxonomy categories
- Use empty arrays if information is missing`
            }
          ],
        });
        break; // Success, exit retry loop
      } catch (error) {
        lastError = error;
        logger.warn('OpenAI request failed', {
          attempt: attempts,
          maxAttempts,
          error: error.message,
          errorType: error.name
        });
        
        if (error.name === 'APIConnectionTimeoutError' && attempts < maxAttempts) {
          const delay = 2000 * attempts;
          logger.info(`Request timed out, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (attempts >= maxAttempts) {
          throw error; // Max attempts reached
        } else {
          // For other errors, wait a bit and retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    if (!response) {
      throw lastError || new Error('Failed to get response from OpenAI');
    }

    const jsonText = response.choices[0].message.content;
    logger.debug('OpenAI response received', { responseLength: jsonText.length });
    
    // Extract and parse JSON (handles markdown code blocks)
    const extracted = extractJSON(jsonText);
    
    // Validate the response against schema
    const validated = validateAIResponse(extracted, resumeAnalysisSchema, 'resume analysis');
    
    const duration = Date.now() - startTime;
    logger.info('Resume analysis completed successfully', {
      duration: `${duration}ms`,
      userId,
      skillsCount: validated.technical_skills?.length || 0,
      projectsCount: validated.projects?.length || 0
    });
    
    // Store resume data in Supabase if userId is provided
    if (userId && validated) {
      try {
        logger.info('Storing resume in database', { userId });
        
        const { data, error } = await supabase
          .from('resumes')
          .upsert(
            {
              userid: userId,
              resume_text: validated,
            },
            { onConflict: ['userid'] }
          );
        
        if (error) {
          logger.error('Error storing resume in database', { 
            error: error.message,
            userId 
          });
        } else {
          logger.info('Resume successfully stored in database', { userId });
        }
      } catch (dbError) {
        logger.error('Database operation failed', { 
          error: dbError.message,
          userId 
        });
        // Continue processing even if DB storage fails
      }
    } else if (!userId) {
      logger.warn('No user ID provided, skipping database storage');
    }

    return validated;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Resume analysis failed', {
      error: error.message,
      errorType: error.constructor.name,
      duration: `${duration}ms`,
      userId,
      stack: error.stack
    });
    throw new Error(`Failed to process resume: ${error.message}`);
  }
}
