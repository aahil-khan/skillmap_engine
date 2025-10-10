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

        const { data, error: userError } = await supabase
            .from('resumes')
            .select('resume_text, current_goal')
            .eq('userid', user_id)
            .single();

        if (userError) {
            logger.error('Error fetching user profile', { 
                error: userError.message,
                userId: user_id 
            });
            throw new Error(`Failed to fetch user profile: ${userError.message}`);
        }

        const { resume_text, current_goal } = data;

        if (!resume_text || typeof resume_text !== 'string') {
            throw new Error('Invalid resume_text input. Please provide a valid string.');
        }

        if (!current_goal || typeof current_goal !== 'string') {
            throw new Error('Invalid current_goal input. Please provide a valid string.');
        }

        logger.info('Resume and goal loaded', { 
            userId: user_id,
            resumeLength: typeof resume_text === 'string' ? resume_text.length : JSON.stringify(resume_text).length,
            goalLength: current_goal.length
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
                            content: `You are an ATS (Applicant Tracking System) evaluator.

STRICT OUTPUT REQUIREMENTS
- Return ONLY a valid JSON object in the EXACT shape shown below.
- No markdown, no backticks, no commentary outside JSON, no trailing commas.
- All numeric fields MUST be integers from 0 to 100 inclusive.

Exact JSON shape to return:
{
  "overall_score": 85,
  "breakdown": {
    "skills_match": 90,
    "experience_match": 80,
    "education_match": 85
  },
  "strengths": [
    "string",
    "string"
  ],
  "improvements": [
    "string",
    "string"
  ]
}

EVALUATION SCOPE
Compare the candidate's RESUME against the JOB DESCRIPTION. Score ONLY based on evidence explicitly present in the resume; do NOT invent or infer unstated experience. Give partial credit for close but not exact matches where reasonable (e.g., "PostgreSQL" ≈ "Postgres", "LLM" ≈ "large language model"), but do not over-credit vague keyword lists without proof of usage.

SCORING DIMENSIONS (subscores must be computed first)
1) Skills Match (weight guide ~45%)
   - Presence and depth of JD-required hard skills, tools, frameworks, domains, certifications.
   - Prefer proven usage (projects, roles, quantified outcomes) over mere listing.
   - Penalize missing must-haves explicitly called out in JD.

2) Experience Match (weight guide ~35%)
   - Alignment of seniority/years, role scope, domain relevance, responsibilities, leadership/ownership.
   - Evidence of impact via metrics/KPIs is a plus.

3) Education Match (weight guide ~10%)
   - Degree level/discipline alignment, required certifications or licensure (if the JD specifies).

GLOBAL RUBRIC (interpretation guidance; still return integers 0–100)
- 90–100: Strong match; most must-haves present with solid evidence.
- 75–89: Good match; minor gaps or weaker proof on a few areas.
- 60–74: Partial match; notable gaps in skills/level or limited proof.
- 40–59: Weak match; several must-haves missing.
- 0–39: Poor match; fundamental mismatch.

EVIDENCE RULES
- Cite only what is in the resume. If a JD requirement is absent in the resume, treat it as a gap.
- Prefer concrete proof: named tools, role titles, dates, employers, quantified achievements.
- If resume content is vague or generic, reduce scores accordingly even if keywords appear.

OUTPUT LISTS
- "strengths": 3–6 concise bullets highlighting the best-aligned evidence (≤180 chars each). Prefer format like: "Direct experience with <X>; evidence: <short phrase from resume>".
- "improvements": 3–6 concise, actionable gaps (≤180 chars each), especially JD must-haves missing or weakly evidenced. Prefer format like: "No proof of <Y> (JD must-have) — add project/metrics."

INPUT YOU WILL RECEIVE
Resume: <string>
Job Description: <string>

RETURN ONLY THE JSON IN THE EXACT SHAPE ABOVE. DO NOT ADD OR REMOVE KEYS.`
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
