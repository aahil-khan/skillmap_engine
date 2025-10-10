import { openai } from "../config/openai.js";
import { getModelConfig } from '../config/ai-models.js';
import { validateAIResponse, extractJSON, standaloneGoalSchema, extractOpenAIContent } from '../schemas/ai-response-schemas.js';

// Logger helper
const logger = {
  info: (msg, data = {}) => console.log(`[INFO] ${msg}`, JSON.stringify(data)),
  warn: (msg, data = {}) => console.warn(`[WARN] ${msg}`, JSON.stringify(data)),
  error: (msg, data = {}) => console.error(`[ERROR] ${msg}`, JSON.stringify(data)),
  debug: (msg, data = {}) => console.debug(`[DEBUG] ${msg}`, JSON.stringify(data))
};


export async function convertToStandalone(goal){
    const startTime = Date.now();
    const modelConfig = getModelConfig('conversational');
    
    try {
        logger.info('Converting goal to standalone format', { 
            goalLength: goal?.length || 0 
        });
        
        // Validate the input
        if (!goal || typeof goal !== 'string') {
            throw new Error('Invalid goal input. Please provide a valid string.');
        }

        let response = null;
        let lastError = null;
        const maxAttempts = modelConfig.retry?.maxRetries || 3;
        
        for (let attempts = 1; attempts <= maxAttempts; attempts++) {
            try {
                logger.info(`Calling OpenAI API (attempt ${attempts}/${maxAttempts})`, { 
                    model: modelConfig.model,
                    temperature: modelConfig.temperature 
                });
                
                // Call OpenAI API to convert the goal into a standalone sentence
                response = await openai.chat.completions.create({
                    model: modelConfig.model,
                    messages: [
                        { 
                            role: "system", 
                            content: `You are an AI assistant that converts a user's learning or career goal into a concise, self-contained standalone sentence for a peer-learning platform.

STRICT OUTPUT
- Return ONLY a valid JSON object in the EXACT shape shown below.
- No markdown, no backticks, no extra keys, no commentary, no trailing commas.

Exact JSON shape to return:
{
  "original_goal": "string - the original user input",
  "standalone_goal": "string - concise standalone version",
  "key_requirements": ["string - key skill 1", "string - key skill 2"]
}

DEFINITIONS
- original_goal: Echo the user's input verbatim (trimmed).
- standalone_goal: A single, self-contained, concise sentence (≤ 12 words) that can stand alone without previous context.
  - Use imperative or infinitive form (e.g., "Learn X", "Master Y", "Build Z using A").
  - Remove filler words ("I want to", "please", "help me", "can you").
  - Replace pronouns and vague references with explicit subjects (e.g., "it" → the actual topic if inferable).
  - If multiple intents appear, pick the primary, highest-value intent.
  - Preserve the user's language; if unclear or mixed, default to English.
  - Expand ambiguous acronyms only if the input already disambiguates them; otherwise keep the acronym.
  - No ending period, no emojis.
- key_requirements: 2–6 canonical, deduplicated skill/knowledge items required to achieve the standalone goal.
  - Prefer nouns or short noun phrases (e.g., "Python", "Data Structures", "REST APIs", "React").
  - Include tools, languages, frameworks, domains, or foundational concepts.
  - Avoid sentences, avoid modifiers like "basic"/"advanced", avoid duplicates and near-duplicates.

GUIDELINES
- Be precise and concrete. Favor exact technologies/domains stated or clearly implied by the input.
- If the input is vague, keep the standalone goal broad but actionable and reflect that in key_requirements with fundamentals.
- Do NOT invent brand-new information not in or reasonably implied by the input.
- Normalize whitespace; keep standard capitalization for proper nouns and technologies.

EXAMPLES (for style only; do not include examples in output):
Input: "I want to learn Python for data science"
Output: {"original_goal": "I want to learn Python for data science", "standalone_goal": "Learn Python for data science", "key_requirements": ["Python", "Pandas", "NumPy", "Data Visualization", "Statistics"]}

Input: "prep for FAANG interviews systems + DSA"
Output: {"original_goal": "prep for FAANG interviews systems + DSA", "standalone_goal": "Prepare for software engineering interviews", "key_requirements": ["Data Structures", "Algorithms", "System Design", "Coding Interviews"]}

Input: "build a web app with nextjs and supabase auth"
Output: {"original_goal": "build a web app with nextjs and supabase auth", "standalone_goal": "Build a web app with Next.js and Supabase auth", "key_requirements": ["Next.js", "React", "Supabase Auth", "REST APIs", "Authentication"]}

RETURN ONLY THE JSON IN THE EXACT SHAPE ABOVE.`
                        },
                        { role: "user", content: goal }
                    ],
                    max_tokens: 200,
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
        
        // Extract and validate JSON
        const extracted = extractJSON(jsonText);
        const validated = validateAIResponse(extracted, standaloneGoalSchema, 'standalone goal conversion');
        
        const duration = Date.now() - startTime;
        logger.info('Goal converted to standalone successfully', {
            duration: `${duration}ms`,
            standaloneGoal: validated.standalone_goal
        });

        // Return just the standalone goal string for backward compatibility
        return validated.standalone_goal;

    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('Failed to convert goal to standalone', {
            error: error.message,
            errorType: error.constructor.name,
            duration: `${duration}ms`,
            stack: error.stack
        });
        throw new Error(`Failed to convert to standalone question: ${error.message}`);
    }
}
