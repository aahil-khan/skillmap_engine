import { openai } from '../config/openai.js';
import { parseResume } from '../utils/pdfParser.js';
import { skill_taxonomy } from '../taxonomy/skill_taxonomy.js';
import { supabase } from '../config/supabase.js';
import { getModelConfig } from '../config/ai-models.js';
import { validateAIResponse, resumeAnalysisSchema, extractJSON, extractOpenAIContent } from '../schemas/ai-response-schemas.js';
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
              content: `You are an information extraction engine that converts raw resume text into a structured JSON profile.

STRICT OUTPUT
- Return ONLY a valid JSON object. No markdown, code fences, comments, or explanations.
- Use EXACT keys and datatypes requested. Do not add or remove keys.
- Strings must be trimmed; use "Unknown" for missing required strings.
- Arrays must be present even if empty where requested.
- Do NOT hallucinate facts; extract only what is explicitly in the resume text. Limited category inference for "technical_skills" is allowed (see below), but do NOT invent specific tools not evidenced in the resume.

EVIDENCE & NORMALIZATION RULES
- Prefer explicit evidence: role titles, companies, dates, technologies, quantified impact.
- Normalize common technology aliases (e.g., "Postgres" ≈ "PostgreSQL") but keep the surface form found in the resume when possible.
- For "level", use one of: "Beginner", "Intermediate", "Advanced" (title case only).
- "experience.total_years" should be a non-negative number. If years are unclear, estimate conservatively from explicit dates or roles; if impossible, use 0.
- Durations in "recent_roles[].duration" should copy the resume’s phrasing if available (e.g., "Jan 2022–Mar 2024", "2 yrs 3 mos"). If missing, use "Unknown".
- "projects[].technologies" should include only tools/frameworks/languages explicitly mentioned with each project or clearly tied to it in nearby text.

TECHNICAL SKILLS MAPPING
- Map skills into categories using the provided "skill taxonomy" when possible.
- The "technical_skills" array MUST contain at least ONE object. If the resume has no explicit skills, you may add a single generic category based on role signals (e.g., if the resume clearly references software engineering roles, include {"category":"Programming","skills":[],"level":"Beginner"}). Do not invent specific tools.
- Deduplicate skills within a category. Keep canonical, concise names (e.g., "React", not "React.js library").
- Each technical_skills item must include: category (string), skills (array of strings), level ("Beginner" | "Intermediate" | "Advanced").

QUALITY BAR
- Favor precision over recall; do not over-attribute. If in doubt, leave fields as "Unknown" or arrays empty (except technical_skills must have ≥1 category as stated).`
            },
            {
              role: 'user',
              content: `Analyze the following resume text and return ONLY valid JSON in this EXACT structure:

Resume text:
${resumeText}

Required JSON structure (ALL fields are required):
{
  "name": "string (extract full name from resume header/profile; if not found use 'Unknown')",
  "technical_skills": [{"category": "string", "skills": ["string"], "level": "Beginner|Intermediate|Advanced"}],
  "inferred_areas_of_strength": ["string (at least one strength based on evidenced experience/skills)"],
  "experience": {
    "total_years": number,
    "recent_roles": [{"title": "string", "company": "string", "duration": "string"}]
  },
  "projects": [{"name": "string", "description": "string", "technologies": ["string"]}],
  "education": [{"degree": "string", "institution": "string", "year": "string"}]
}

Skill taxonomy (for category mapping only; do not output it): ${JSON.stringify(skill_taxonomy)}

CRITICAL REQUIREMENTS
- Return ONLY JSON. No extra text.
- "technical_skills" MUST contain at least one object.
- If explicit technical skills are missing, include a single generic category inferred from role signals (e.g., "Programming") with an empty "skills" array and a conservative "level".
- Do NOT fabricate specific tools, companies, dates, or metrics.
- Use empty arrays [] for missing projects/education. Never use null.
- Map skills to taxonomy categories when possible.
- Keep field casing and enums EXACT as specified.`
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

    // Safely extract content from response
    const jsonText = extractOpenAIContent(response);
    logger.debug('OpenAI response received', { responseLength: jsonText.length });
    
    // Log first 500 chars of response for debugging
    logger.debug('OpenAI response preview', { 
      preview: jsonText.substring(0, 500),
      fullLength: jsonText.length 
    });
    
    // Extract and parse JSON (handles markdown code blocks)
    const extracted = extractJSON(jsonText);
    logger.debug('JSON extracted', { 
      hasSkills: !!extracted.technical_skills,
      hasExperience: !!extracted.work_experience,
      hasProjects: !!extracted.projects 
    });
    
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