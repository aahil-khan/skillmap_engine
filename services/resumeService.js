import { openai } from '../config/openai.js';
import { parseResume } from '../utils/pdfParser.js';
import { skill_taxonomy } from '../taxonomy/skill_taxonomy.js';
import fs from 'fs';

/**
 * Process uploaded resume file and extract structured profile data
 * @param {string} filePath - Path to the uploaded PDF file
 * @returns {Object} Structured profile data
 */
export async function processResume(filePath) {
  try {
    // Extract text from PDF
    const resumeText = await parseResume(filePath);
    
    if (!resumeText) {
      throw new Error('Failed to extract text from PDF');
    }

    // Use OpenAI to structure the resume data
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are an AI assistant that converts resume text into structured user profiles for a peer-learning platform.'
        },
        {
          role: 'user',
          content: `Here is the resume text:\n\n${resumeText}\n\nExtract the following fields in JSON format:
            - name
            - education (list of degrees, institutions, years)
            - experience (companies, roles, technologies, durations)
            - projects (name, description, technologies)
            - technical_skills (list of skills categorized by taxonomy)
            - inferred_areas_of_strength (based on their work/projects)
            - possible_gaps (only if there's something obvious)
            Return only valid JSON.

            Note for technical_skills:
            - They should be mapped to this taxonomy: ${JSON.stringify(skill_taxonomy)}
            - If a skill is not in the taxonomy, include it as "other" with the skill name.
            - If a skill is mentioned but not in the taxonomy, infer its category based on context.
            - If a skill is not mentioned, do not include it in the output.
            - Use strictly this format - {
                    "category": "Data Structures & Algorithms",
                    "skills": [ "Graphs", "Trees", "Sorting Algorithms" ] 
                    }
            `
        }
      ],
      temperature: 0.3
    });

    const jsonText = response.choices[0].message.content;
    
    // Clean up JSON if it has markdown formatting
    const cleanedJson = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const parsed = JSON.parse(cleanedJson);
    
    // Save the structured profile to a file (optional)
    // const outputPath = `./data/${parsed.name?.replace(/\s+/g, '_').toLowerCase() || 'unknown'}_profile.json`;
    // const dataDir = './data';
    // if (!fs.existsSync(dataDir)) {
    //   fs.mkdirSync(dataDir, { recursive: true });
    // }
    // fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2), 'utf8');
    // console.log(`Structured profile saved to ${outputPath}`);
    console.log(parsed);
    return parsed;
    
  } catch (error) {
    console.error('Error processing resume:', error);
    throw new Error(`Failed to process resume: ${error.message}`);
  }
}
