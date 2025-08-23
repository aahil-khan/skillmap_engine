import { openai } from "../config/openai.js";
import { supabase } from '../config/supabase.js';


// This is the first version of the ATS service
// It uses OpenAI to evaluate resumes against job descriptions and provide an ATS score
// Future versions may include more advanced features like keyword extraction, improving vague phrases, etc.

export async function atsScore(user_id) {
    try {
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
            console.error('Error fetching user profile:', userError);
            throw new Error(`Failed to fetch user profile: ${userError.message}`);
        }

        const { resume_text, current_goal } = data;

        if (!resume_text || typeof resume_text !== 'string') {
            throw new Error('Invalid resume_text input. Please provide a valid string.');
        }

        if (!current_goal || typeof current_goal !== 'string') {
            throw new Error('Invalid current_goal input. Please provide a valid string.');
        }

        // Call OpenAI API to get ATS score
        const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
            { 
            role: "system", 
            content: "You are an AI assistant that evaluates resumes against job descriptions to provide an ATS score. The score is a percentage indicating how well the resume matches the job description. Example: 'Resume: [resume text] Job Description: [job description text]' -> '85'" 
            },
            { role: "user", content: `Resume: ${resume_text} Job Description: ${current_goal}` }
        ],
        max_tokens: 300,
        });

        return response.choices[0].message.content;

    } catch (error) {
        console.error('Error finding ats score:', error);
        throw new Error(`Failed to find ats score: ${error.message}`);
    }
}