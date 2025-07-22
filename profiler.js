import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { openai } from "./config.js";
import { parseResume } from "./scrapers/resume_parser.js";
import fs from 'fs';
import path from 'path';
import { skill_taxonomy } from "./skill_taxonomy.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Resume processing function
async function processResume(filePath) {
  try {
    const resumeText = await parseResume(filePath);
    
    if (!resumeText) {
      throw new Error('Failed to extract text from PDF');
    }

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
            Return only the JSON.

            Note for technical_skills:
            - They should be mapped to this taxonomy: ${JSON.stringify(skill_taxonomy)}.
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

    return parsed;
  } catch (error) {
    console.error('Error processing resume:', error);
    throw error;
  }
}

// Routes
app.post('/upload-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`Processing uploaded file: ${req.file.filename}`);
    
    const profileData = await processResume(req.file.path);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json({
      success: true,
      profile: profileData
    });

  } catch (error) {
    console.error('Error:', error);
    
    // Clean up file if it exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Failed to process resume',
      details: error.message 
    });
  }
});

//Convert to standalone question
app.post('/convertToStandalone', async (req, res) => {
  try {
    const { goal } = req.body;
    console.log('Converting goal to standalone question:', goal);
    if (!goal) {
      return res.status(400).json({ error: 'Goal is required' });
    }
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

    return res.json({
      success: true,
      goalResponse: response.choices[0].message.content
    });

  } catch (error) {
    console.error('Error converting to standalone question:', error);
    return res.status(500).json({ error: 'Failed to convert to standalone question' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Resume profiler service is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Resume profiler server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Upload endpoint: http://localhost:${PORT}/upload-resume`);
});
