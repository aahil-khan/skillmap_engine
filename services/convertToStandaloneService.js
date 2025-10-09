import { openai } from "../config/openai.js";
import { getModelConfig } from '../config/ai-models.js';
import { validateAIResponse, extractJSON, standaloneGoalSchema } from '../schemas/ai-response-schemas.js';

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
                            content: `You are an AI assistant that converts user goals into concise standalone sentences for a peer-learning platform.

You MUST respond with ONLY valid JSON in this EXACT format:
{
  "original_goal": "string - the original user input",
  "standalone_goal": "string - concise standalone version",
  "key_requirements": ["string - key skill 1", "string - key skill 2"]
}

Example: 
Input: "I want to learn Python for data science"
Output: {"original_goal": "I want to learn Python for data science", "standalone_goal": "Learn Python for data science", "key_requirements": ["Python", "Data Science"]}

Be concise and clear. Do not include any markdown, explanations, or text outside the JSON.` 
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

        const jsonText = response.choices[0].message.content;
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