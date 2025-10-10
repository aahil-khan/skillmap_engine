import { openai } from "../config/openai.js";
import { supabase } from '../config/supabase.js';
import { getModelConfig } from '../config/ai-models.js';
import { validateAIResponse, extractJSON, atsScoreSchema, extractOpenAIContent } from '../schemas/ai-response-schemas.js';

// Logger helper
const logger = {
  info: (msg, data = {}) => console.log(`[INFO] ${msg}`, JSON.stringify(data)),
  warn: (msg, data = {}) => console.warn(`[WARN] ${msg}`, JSON.stringify(data)),
  error: (msg, data = {}) => console.error(`[ERROR] ${msg}`, JSON.stringify(data)),
  debug: (msg, data = {}) => console.debug(`[DEBUG] ${msg}`, JSON.stringify(data))
};

// This is the first version of the ATS service
// It uses OpenAI to evaluate resumes against job descriptions and provide an ATS score
// Future versions may include more advanced features like keyword extraction, improving vague phrases, etc.

export async function atsScore(user_id) {
    const startTime = Date.now();
    const modelConfig = getModelConfig('atsScoring');
    
    try {
        logger.info('Starting ATS score calculation', { userId: user_id });
        
        // Validate the input
        if (!user_id || typeof user_id !== 'string') {
            throw new Error('Invalid user_id input. Please provide a valid string.');
        }

        // Fetch resume data (raw_text for ATS analysis)
        const { data: resumeData, error: resumeError } = await supabase
            .from('resumes')
            .select('raw_text')
            .eq('userid', user_id)
            .single();

        if (resumeError) {
            logger.error('Error fetching resume', { 
                error: resumeError.message,
                userId: user_id 
            });
            throw new Error(`Failed to fetch resume: ${resumeError.message}`);
        }

        // Fetch active learning goal
        const { data: goalData, error: goalError } = await supabase
            .from('learning_goals')
            .select('refined_goal')
            .eq('userid', user_id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (goalError) {
            logger.warn('No active learning goal found, using default', { 
                error: goalError.message,
                userId: user_id 
            });
        }

        const resume_text = resumeData.raw_text;
        const current_goal = goalData?.refined_goal || 'General software development position';

        if (!resume_text || typeof resume_text !== 'string') {
            throw new Error('Invalid resume text. Please upload a resume first.');
        }

        logger.info('Resume and goal loaded', { 
            userId: user_id,
            resumeLength: resume_text.length,
            goalLength: current_goal.length,
            hasGoal: !!goalData
        });

        let response = null;
        let lastError = null;
        const maxAttempts = modelConfig.retry?.maxRetries || 3;
        
        for (let attempts = 1; attempts <= maxAttempts; attempts++) {
            try {
                logger.info(`Calling OpenAI API (attempt ${attempts}/${maxAttempts})`, { 
                    model: modelConfig.model,
                    temperature: modelConfig.temperature 
                });
                
                // Call OpenAI API to get ATS score
                response = await openai.chat.completions.create({
                    model: modelConfig.model,
                    messages: [
                        { 
                            role: "system", 
                            content: `You are an ATS (Applicant Tracking System) evaluator. Analyze the resume against the job description and provide a detailed score.

You MUST respond with ONLY valid JSON in this EXACT format:
{
  "overall_score": 85,
  "breakdown": {
    "skills_match": 90,
    "experience_match": 80,
    "education_match": 85
  },
  "strengths": [
    "string - what matches well",
    "string - what matches well"
  ],
  "improvements": [
    "string - what's missing",
    "string - what could be better"
  ]
}

The overall_score MUST be a number between 0 and 100. Do not include any markdown, explanations, or text outside the JSON.` 
                        },
                        { 
                            role: "user", 
                            content: `Resume: ${typeof resume_text === 'string' ? resume_text : JSON.stringify(resume_text)}\n\nJob Description: ${current_goal}` 
                        }
                    ],
                    max_tokens: 500,
                    temperature: modelConfig.temperature,
                    response_format: modelConfig.response_format
                });
                
                break; // Success, exit retry loop
                
            } catch (error) {
                lastError = error;
                logger.warn(`OpenAI API call failed (attempt ${attempts}/${maxAttempts})`, {
                    error: error.message,
                    errorType: error.constructor.name
                });
                
                if (error.message?.includes('timeout') && attempts < maxAttempts) {
                    const delay = 2000 * attempts;
                    logger.info(`Retrying after ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else if (attempts >= maxAttempts) {
                    throw error;
                } else {
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
        
        // Log the actual response for debugging
        console.log('[ATS] Raw OpenAI response:', jsonText.substring(0, 500));
        
        // Extract and validate JSON
        const extracted = extractJSON(jsonText);
        console.log('[ATS] Extracted JSON keys:', Object.keys(extracted));
        console.log('[ATS] Breakdown keys:', Object.keys(extracted.breakdown || {}));
        
        const validated = validateAIResponse(extracted, atsScoreSchema, 'ATS scoring');
        
        // Ensure score is within valid range
        if (validated.overall_score < 0 || validated.overall_score > 100) {
            logger.warn('ATS score out of range, clamping', { 
                originalScore: validated.overall_score 
            });
            validated.overall_score = Math.max(0, Math.min(100, validated.overall_score));
        }
        
        const duration = Date.now() - startTime;
        logger.info('ATS score calculated successfully', {
            duration: `${duration}ms`,
            userId: user_id,
            score: validated.overall_score
        });

        // Store ATS score in database
        try {
            // 1. Update the resume with the ATS score
            const { error: resumeUpdateError } = await supabase
                .from('resumes')
                .update({ ats_score: validated.overall_score })
                .eq('userid', user_id);

            if (resumeUpdateError) {
                logger.error('Error updating resume ATS score', { 
                    error: resumeUpdateError.message,
                    userId: user_id 
                });
            }

            // 2. Store in ATS history for tracking
            const { data: resumeData } = await supabase
                .from('resumes')
                .select('id')
                .eq('userid', user_id)
                .single();

            const { error: historyError } = await supabase
                .from('ats_history')
                .insert({
                    userid: user_id,
                    resume_id: resumeData?.id || null,
                    overall_score: validated.overall_score,
                    skills_match: validated.breakdown?.skills_match || null,
                    experience_match: validated.breakdown?.experience_match || null,
                    education_match: validated.breakdown?.education_match || null,
                    strengths: validated.strengths || [],
                    weaknesses: [],
                    improvements: validated.improvements || [],
                    recommendations: []
                });

            if (historyError) {
                logger.error('Error storing ATS history', { 
                    error: historyError.message,
                    userId: user_id 
                });
            } else {
                logger.info('ATS score stored in history', { userId: user_id });
            }

        } catch (dbError) {
            logger.error('Database operation failed during ATS storage', { 
                error: dbError.message,
                userId: user_id 
            });
        }

        return validated;

    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('ATS score calculation failed', {
            error: error.message,
            errorType: error.constructor.name,
            duration: `${duration}ms`,
            userId: user_id,
            stack: error.stack
        });
        throw new Error(`Failed to find ats score: ${error.message}`);
    }
}