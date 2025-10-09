/**
 * AI Models Configuration
 * 
 * Centralized configuration for OpenAI models with optimized settings
 * for different use cases. This ensures consistency and makes it easy
 * to upgrade models across the application.
 */

/**
 * Model Selection Guide:
 * 
 * GPT-4o-mini: Best balance of cost/quality for structured outputs
 * - 75% cheaper than GPT-4
 * - Better at following JSON schemas than GPT-3.5
 * - Less hallucination than GPT-3.5
 * - Input: $0.15 / 1M tokens, Output: $0.60 / 1M tokens
 * 
 * GPT-4o: Most reliable for complex tasks
 * - Best JSON adherence
 * - Lowest hallucination rate
 * - Input: $2.50 / 1M tokens, Output: $10.00 / 1M tokens
 * 
 * GPT-3.5-turbo: Fastest but inconsistent
 * - High hallucination rate
 * - Often ignores JSON format instructions
 * - Input: $0.50 / 1M tokens, Output: $1.50 / 1M tokens
 * - NOT RECOMMENDED for structured outputs
 */

export const AI_MODELS = {
  /**
   * Primary chat model - Used for most operations
   * Recommended: gpt-4o-mini for best cost/quality balance
   */
  chat: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
  
  /**
   * High-quality model for critical operations
   * Use when accuracy is more important than cost
   */
  chatHighQuality: process.env.OPENAI_HIGH_QUALITY_MODEL || 'gpt-4o',
  
  /**
   * Legacy/fallback model
   * Only use if explicitly needed for backwards compatibility
   */
  chatLegacy: 'gpt-3.5-turbo',
  
  /**
   * Embedding model for vector operations
   */
  embedding: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
};

/**
 * Model configurations optimized for different use cases
 */
export const MODEL_CONFIGS = {
  /**
   * Configuration for structured JSON outputs
   * Higher temperature = more creative but less consistent
   * Lower temperature = more consistent but less creative
   */
  structuredOutput: {
    model: AI_MODELS.chat,
    temperature: 0.1, // Very low for consistency
    max_tokens: 2000,
    response_format: { type: "json_object" }, // Force JSON mode (GPT-4+ only)
    top_p: 0.1, // Deterministic outputs
  },
  
  /**
   * Configuration for resume analysis
   * Needs to be accurate and extract all details
   */
  resumeAnalysis: {
    model: AI_MODELS.chat,
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: "json_object" },
  },
  
  /**
   * Configuration for skill gap analysis
   * Requires understanding context and providing recommendations
   */
  skillGapAnalysis: {
    model: AI_MODELS.chat,
    temperature: 0.3,
    max_tokens: 2500,
    response_format: { type: "json_object" },
  },
  
  /**
   * Configuration for ATS scoring
   * Needs to be consistent and fair
   */
  atsScoring: {
    model: AI_MODELS.chat,
    temperature: 0.1,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  },
  
  /**
   * Configuration for conversational/creative tasks
   * Can be more flexible with outputs
   */
  conversational: {
    model: AI_MODELS.chat,
    temperature: 0.7,
    max_tokens: 1000,
  },
  
  /**
   * Configuration for LeetCode problem suggestions
   * Needs to understand skill level and provide appropriate challenges
   */
  problemSuggestion: {
    model: AI_MODELS.chat,
    temperature: 0.4,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  },
};

/**
 * Retry configuration for API calls
 */
export const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2, // Exponential backoff
};

/**
 * Timeout configuration (in milliseconds)
 */
export const TIMEOUT_CONFIG = {
  standard: 30000, // 30 seconds
  long: 60000, // 60 seconds (for complex operations)
  short: 15000, // 15 seconds
};

/**
 * Helper function to get model configuration for a specific use case
 * @param {string} useCase - The use case (e.g., 'resumeAnalysis', 'skillGapAnalysis')
 * @returns {Object} Model configuration
 */
export function getModelConfig(useCase) {
  const config = MODEL_CONFIGS[useCase];
  
  if (!config) {
    console.warn(`Unknown use case: ${useCase}, using structuredOutput config`);
    return MODEL_CONFIGS.structuredOutput;
  }
  
  return config;
}

/**
 * Helper function to create OpenAI client with timeout
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Object} OpenAI client configuration
 */
export function getOpenAIClientConfig(timeout = TIMEOUT_CONFIG.standard) {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    timeout: timeout,
    maxRetries: RETRY_CONFIG.maxRetries,
  };
}

/**
 * Cost estimation helper (approximate costs per 1K tokens)
 */
export const MODEL_COSTS = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'text-embedding-3-small': { input: 0.00002, output: 0 },
};

/**
 * Estimate cost for a request
 * @param {string} model - Model name
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @returns {number} Estimated cost in USD
 */
export function estimateCost(model, inputTokens, outputTokens) {
  const costs = MODEL_COSTS[model];
  if (!costs) {
    console.warn(`Unknown model for cost estimation: ${model}`);
    return 0;
  }
  
  return (inputTokens * costs.input / 1000) + (outputTokens * costs.output / 1000);
}

export default {
  AI_MODELS,
  MODEL_CONFIGS,
  RETRY_CONFIG,
  TIMEOUT_CONFIG,
  getModelConfig,
  getOpenAIClientConfig,
  estimateCost,
};
