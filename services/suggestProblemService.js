import { openai } from "../config/openai.js";
import { getLastnSubmissions } from "./leetcodeService.js";
import { getModelConfig } from '../config/ai-models.js';
import { validateAIResponse, extractJSON, leetcodeSuggestionSchema, extractOpenAIContent } from '../schemas/ai-response-schemas.js';

// Logger helper
const logger = {
  info: (msg, data = {}) => console.log(`[INFO] ${msg}`, JSON.stringify(data)),
  warn: (msg, data = {}) => console.warn(`[WARN] ${msg}`, JSON.stringify(data)),
  error: (msg, data = {}) => console.error(`[ERROR] ${msg}`, JSON.stringify(data)),
  debug: (msg, data = {}) => console.debug(`[DEBUG] ${msg}`, JSON.stringify(data))
};

export async function suggestProblem(username){
    const startTime = Date.now();
    const modelConfig = getModelConfig('problemSuggestion');
    
    try{
        logger.info('Fetching LeetCode submissions', { username });
        
        const {submissions} = await getLastnSubmissions(username, 10);
        if(!submissions || submissions.length === 0){
            logger.warn('No submissions found, returning defaults', { username });
            return getDefaultRecommendations();
        }

        // Clean submissions data
        const solvedProblems = submissions
            .filter(sub => sub.statusDisplay === "Accepted")
            .map(sub => sub.title);

        logger.info('Solved problems retrieved', { 
            username,
            solvedCount: solvedProblems.length 
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
                
                // Add timeout to prevent hanging
                const timeoutMs = 10000; // 10 seconds
                response = await Promise.race([
                    openai.chat.completions.create({
                        model: modelConfig.model,
                        messages: [
                            {
                                role: "system",
                                content: `You are a LeetCode problem recommendation expert. Based on solved problems, recommend new challenges.

You MUST respond with ONLY valid JSON in this EXACT format:
{
  "problems": [
    {
      "title": "Problem Name",
      "difficulty": "Easy",
      "category": "Array",
      "description": "Brief description of the problem",
      "url": "https://leetcode.com/problems/problem-slug/"
    }
  ],
  "focus_areas": ["Array", "Hash Table"],
  "learning_path": "string - brief progression advice"
}

Recommend 4 problems that build on their current skills. Use real LeetCode URLs. Do not include any markdown, explanations, or text outside the JSON.`
                            },
                            {
                                role: "user", 
                                content: `I have solved these LeetCode problems: ${solvedProblems.slice(0, 5).join(", ")}. Recommend 4 new problems that will help me progress.`
                            }
                        ],
                        temperature: modelConfig.temperature,
                        max_tokens: 500,
                        response_format: modelConfig.response_format
                    }),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('OpenAI request timeout')), timeoutMs)
                    )
                ]);
                
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
                    // Max attempts reached, use smart fallback
                    logger.warn('Max attempts reached, using smart fallback', { username });
                    return getSmartRecommendations(solvedProblems);
                } else {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        if (!response) {
            logger.warn('No response from OpenAI, using smart fallback', { username });
            return getSmartRecommendations(solvedProblems);
        }

        // Safely extract content from response
        const jsonText = extractOpenAIContent(response);
        logger.debug('OpenAI response received', { responseLength: jsonText.length });
        
        // Extract and validate JSON
        const extracted = extractJSON(jsonText);
        const validated = validateAIResponse(extracted, leetcodeSuggestionSchema, 'LeetCode problem suggestions');
        
        const duration = Date.now() - startTime;
        logger.info('Problem suggestions generated successfully', {
            duration: `${duration}ms`,
            username,
            problemCount: validated.problems?.length || 0
        });

        return {
            recommended_problems: validated.problems,
            focus_areas: validated.focus_areas,
            learning_path: validated.learning_path
        };

    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('Problem suggestion failed', {
            error: error.message,
            errorType: error.constructor.name,
            duration: `${duration}ms`,
            username,
            stack: error.stack
        });
        
        // Return smart fallback on any error
        logger.info('Using default recommendations as fallback', { username });
        return getDefaultRecommendations();
    }
}

function getDefaultRecommendations() {
    return {
        recommended_problems: [
            {
                title: "Two Sum",
                difficulty: "Easy",
                category: "Array",
                description: "Hash table fundamentals",
                url: "https://leetcode.com/problems/two-sum/"
            },
            {
                title: "Valid Parentheses",
                difficulty: "Easy",
                category: "Stack",
                description: "Stack basics",
                url: "https://leetcode.com/problems/valid-parentheses/"
            },
            {
                title: "Maximum Subarray",
                difficulty: "Medium",
                category: "Dynamic Programming", 
                description: "DP introduction",
                url: "https://leetcode.com/problems/maximum-subarray/"
            },
            {
                title: "Binary Tree Inorder Traversal",
                difficulty: "Easy",
                category: "Tree",
                description: "Tree traversal",
                url: "https://leetcode.com/problems/binary-tree-inorder-traversal/"
            }
        ]
    };
}

function getSmartRecommendations(solvedProblems) {
    const allProblems = [
        {
            title: "Reverse Linked List",
            difficulty: "Easy", 
            category: "Linked List",
            description: "Linked list manipulation",
            url: "https://leetcode.com/problems/reverse-linked-list/"
        },
        {
            title: "Valid Anagram",
            difficulty: "Easy",
            category: "String",
            description: "String manipulation and sorting", 
            url: "https://leetcode.com/problems/valid-anagram/"
        },
        {
            title: "Best Time to Buy and Sell Stock",
            difficulty: "Easy",
            category: "Array",
            description: "Array traversal and optimization",
            url: "https://leetcode.com/problems/best-time-to-buy-and-sell-stock/"
        },
        {
            title: "Contains Duplicate", 
            difficulty: "Easy",
            category: "Array",
            description: "Hash set usage",
            url: "https://leetcode.com/problems/contains-duplicate/"
        },
        {
            title: "Climbing Stairs",
            difficulty: "Easy",
            category: "Dynamic Programming",
            description: "Basic DP concept",
            url: "https://leetcode.com/problems/climbing-stairs/"
        },
        {
            title: "Merge Two Sorted Lists",
            difficulty: "Easy", 
            category: "Linked List",
            description: "Linked list merging",
            url: "https://leetcode.com/problems/merge-two-sorted-lists/"
        }
    ];

    // Filter out already solved problems
    const unsolvedProblems = allProblems.filter(problem => 
        !solvedProblems.some(solved => 
            solved.toLowerCase().includes(problem.title.toLowerCase()) ||
            problem.title.toLowerCase().includes(solved.toLowerCase())
        )
    );

    // Return 4 unsolved problems, or default if not enough
    const recommendations = unsolvedProblems.slice(0, 4);
    
    while (recommendations.length < 4) {
        recommendations.push(allProblems[recommendations.length]);
    }

    return {
        recommended_problems: recommendations
    };
}
