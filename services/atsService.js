import { openai } from "../config/openai.js";


// This is the first version of the ATS service
// It uses OpenAI to evaluate resumes against job descriptions and provide an ATS score
// Future versions may include more advanced features like keyword extraction, improving vague phrases, etc.

export async function atsScore(resumeText, jobDescription) {
    try {
        // Validate the input
        if (!resumeText || typeof resumeText !== 'string') {
            throw new Error('Invalid resumeText input. Please provide a valid string.');
        }

        if (!jobDescription || typeof jobDescription !== 'string') {
            throw new Error('Invalid jobDescription input. Please provide a valid string.');
        }

        // Call OpenAI API to get ATS score
        const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
            { 
            role: "system", 
            content: "You are an AI assistant that evaluates resumes against job descriptions to provide an ATS score. The score is a percentage indicating how well the resume matches the job description. Example: 'Resume: [resume text] Job Description: [job description text]' -> 'ATS Score: 85%'" 
            },
            { role: "user", content: `Resume: ${resumeText} Job Description: ${jobDescription}` }
        ],
        max_tokens: 300,
        });

        return response.choices[0].message.content;

    } catch (error) {
        console.error('Error finding ats score:', error);
        throw new Error(`Failed to find ats score: ${error.message}`);
    }
}