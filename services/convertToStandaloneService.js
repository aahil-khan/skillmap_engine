import { openai } from "../config/openai.js";


export async function convertToStandalone(goal){
    try {
        // Validate the input
        if (!goal || typeof goal !== 'string') {
            throw new Error('Invalid goal input. Please provide a valid string.');
        }

        // Call OpenAI API to convert the goal into a standalone sentence
        const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
            { 
            role: "system", 
            content: "You are an AI assistant that converts user goals into concise standalone sentences for a peer-learning platform. Example: 'I want to learn Python for data science' -> 'Learn Python for data science'" 
            },
            { role: "user", content: goal }
        ],
        max_tokens: 300,
        });

        return response.choices[0].message.content;

    } catch (error) {
        console.error('Error converting to standalone question:', error);
        throw new Error(`Failed to convert to standalone question: ${error.message}`);
    }
}