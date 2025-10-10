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
              content: 'You are an AI assistant that converts resume text into structured JSON profiles. You MUST respond with valid JSON only, no markdown, no explanations. Be accurate and do not hallucinate information not present in the resume.'
            },
            {
              role: 'user',
              content: `Analyze this resume and return ONLY valid JSON.

Resume text:
${resumeText}

Required JSON structure (ALL fields are required):
{
  "name": "string (extract from resume or use 'Unknown')",
  "technical_skills": [{"category": "string", "skills": ["string"], "level": "Beginner|Intermediate|Advanced"}],
  "inferred_areas_of_strength": ["string (at least one strength based on experience/skills)"],
  "experience": {"total_years": number, "recent_roles": [{"title": "string", "company": "string", "duration": "string"}]},
  "projects": [{"name": "string", "description": "string", "technologies": ["string"]}],
  "education": [{"degree": "string", "institution": "string", "year": "string"}]
}

Skill taxonomy: ${JSON.stringify(skill_taxonomy)}

CRITICAL REQUIREMENTS:
- Return ONLY valid JSON (no markdown, no explanations)
- technical_skills array MUST have at least ONE category with skills
- If no technical skills found in resume, infer from context (e.g., if mentions "developer" → add Programming)
- Use empty arrays [] for missing projects/education, but NEVER for technical_skills
- Do not hallucinate - only extract actual information
- Map skills to taxonomy categories when possible`
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
    
    // Add the raw text to validated object for storage
    validated.raw_text = resumeText;
    validated.file_path = filePath;
    validated.file_name = filePath.split('/').pop();
    
    const duration = Date.now() - startTime;
    logger.info('Resume analysis completed successfully', {
      duration: `${duration}ms`,
      userId,
      skillsCount: validated.technical_skills?.length || 0,
      projectsCount: validated.projects?.length || 0,
      rawTextLength: resumeText.length
    });
    
    // Store resume data in normalized database schema if userId is provided
    if (userId && validated) {
      try {
        logger.info('Storing resume in normalized database', { userId });
        
        // 1. Store resume file metadata and parsed data
        const { data: resumeData, error: resumeError } = await supabase
          .from('resumes')
          .upsert(
            {
              userid: userId,
              file_name: validated.file_name || 'resume.pdf',
              file_path: validated.file_path || null,
              file_size: validated.file_size || null,
              mime_type: validated.mime_type || 'application/pdf',
              raw_text: validated.raw_text || null,
              parsed_data: validated,
              ats_score: null // Will be updated later by ATS service
            },
            { onConflict: 'userid', returning: 'representation' }
          );
        
        if (resumeError) {
          logger.error('Error storing resume', { error: resumeError.message, userId });
          throw resumeError;
        }
        
        logger.info('Resume stored successfully', { userId });
        
        // 2. Store user profile
        if (validated.name) {
          const { error: profileError } = await supabase
            .from('user_profiles')
            .upsert(
              {
                userid: userId,
                name: validated.name,
                email: validated.email || null,
                inferred_areas_of_strength: validated.inferred_areas_of_strength || []
              },
              { onConflict: 'userid' }
            );
          
          if (profileError) {
            logger.error('Error storing profile', { error: profileError.message, userId });
          } else {
            logger.info('Profile stored successfully', { userId });
          }
        }
        
        // 3. Store skills
        if (validated.technical_skills && Array.isArray(validated.technical_skills)) {
          // Delete existing skills first
          await supabase.from('skills').delete().eq('userid', userId);
          
          const skillsToInsert = [];
          validated.technical_skills.forEach(category => {
            const categoryName = category.category || 'Other';
            const skills = Array.isArray(category.skills) ? category.skills : [];
            
            skills.forEach(skill => {
              let skillName, skillLevel;
              
              if (typeof skill === 'string') {
                skillName = skill;
                skillLevel = 'intermediate';
              } else if (skill && typeof skill === 'object') {
                skillName = skill.name || skill.skill_name;
                skillLevel = (skill.level || skill.skill_level || 'intermediate').toLowerCase();
              }
              
              if (skillName) {
                skillsToInsert.push({
                  userid: userId,
                  skill_name: skillName,
                  skill_level: skillLevel,
                  skill_category: categoryName
                });
              }
            });
          });
          
          if (skillsToInsert.length > 0) {
            const { error: skillsError } = await supabase
              .from('skills')
              .insert(skillsToInsert);
            
            if (skillsError) {
              logger.error('Error storing skills', { error: skillsError.message, userId });
            } else {
              logger.info('Skills stored successfully', { userId, count: skillsToInsert.length });
            }
          }
        }
        
        // 4. Store work experience
        if (validated.experience && Array.isArray(validated.experience)) {
          await supabase.from('work_experience').delete().eq('userid', userId);
          
          const experienceToInsert = validated.experience.map((exp, index) => ({
            userid: userId,
            job_title: exp.title || exp.role || 'Position',
            company: exp.company || 'Company',
            location: exp.location || null,
            duration: exp.duration || null,
            description: exp.description || null,
            responsibilities: Array.isArray(exp.responsibilities) ? exp.responsibilities : [],
            technologies: Array.isArray(exp.technologies) ? exp.technologies : [],
            achievements: Array.isArray(exp.achievements) ? exp.achievements : [],
            display_order: index
          }));
          
          if (experienceToInsert.length > 0) {
            const { error: expError } = await supabase
              .from('work_experience')
              .insert(experienceToInsert);
            
            if (expError) {
              logger.error('Error storing experience', { error: expError.message, userId });
            } else {
              logger.info('Experience stored successfully', { userId, count: experienceToInsert.length });
            }
          }
        }
        
        // 5. Store projects
        if (validated.projects && Array.isArray(validated.projects)) {
          await supabase.from('projects').delete().eq('userid', userId);
          
          const projectsToInsert = validated.projects.map((proj, index) => ({
            userid: userId,
            project_name: proj.name || proj.title || 'Project',
            description: proj.description || null,
            role: proj.role || null,
            technologies: Array.isArray(proj.technologies) ? proj.technologies : [],
            github_url: proj.github_url || proj.link || null,
            live_url: proj.live_url || null,
            highlights: Array.isArray(proj.highlights) ? proj.highlights : [],
            display_order: index
          }));
          
          if (projectsToInsert.length > 0) {
            const { error: projError } = await supabase
              .from('projects')
              .insert(projectsToInsert);
            
            if (projError) {
              logger.error('Error storing projects', { error: projError.message, userId });
            } else {
              logger.info('Projects stored successfully', { userId, count: projectsToInsert.length });
            }
          }
        }
        
        // 6. Store education
        if (validated.education && Array.isArray(validated.education)) {
          await supabase.from('education').delete().eq('userid', userId);
          
          const educationToInsert = validated.education.map((edu, index) => ({
            userid: userId,
            degree: edu.degree || 'Degree',
            institution: edu.institution || edu.school || 'Institution',
            location: edu.location || null,
            field_of_study: edu.field_of_study || edu.field || null,
            graduation_year: edu.year || edu.graduation_year || null,
            gpa: edu.gpa || null,
            honors: Array.isArray(edu.honors) ? edu.honors : [],
            display_order: index
          }));
          
          if (educationToInsert.length > 0) {
            const { error: eduError } = await supabase
              .from('education')
              .insert(educationToInsert);
            
            if (eduError) {
              logger.error('Error storing education', { error: eduError.message, userId });
            } else {
              logger.info('Education stored successfully', { userId, count: educationToInsert.length });
            }
          }
        }
        
        logger.info('All resume data stored in normalized schema', { userId });
        
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
