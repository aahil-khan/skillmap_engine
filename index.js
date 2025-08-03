import express from 'express';
import cors from 'cors';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

// Import configurations
import { upload } from './utils/multer.js';
import { supabase } from './config/supabase.js';

// Import services
import { processResume } from './services/resumeService.js';
import { createUserProfile, updateUserProfile } from './services/userProfileService.js';
import { analyzeSkillGaps } from './services/skillGapService.js';
import { searchSimilarSkills } from './services/skillSearchService.js';
import { convertToStandalone } from './services/convertToStandaloneService.js';
import { atsScore } from './services/atsService.js';

const app = express();
const PORT = process.env.PORT || 5005;

// Rate limiting - 5 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Middleware
app.use(limiter);
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Supabase Auth middleware
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = authHeader.split(' ')[1];
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = data.user;
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    return res.status(401).json({ error: 'Authentication failed', details: err.message });
  }
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'SkillMap Engine API is running',
    timestamp: new Date().toISOString()
  });
});

// Resume processing endpoint
app.post('/upload-resume', authenticate, upload.single('resume'), async (req, res) => {
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
    console.error('Error processing resume:', error);
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

// User profile management
app.post('/user-profile', authenticate, async (req, res) => {
  try {
    const user_id = req.user.id; // Use authenticated user ID
    const { name, technical_skills, inferred_areas_of_strength, goal, experience, projects } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await createUserProfile({
      user_id,
      name,
      technical_skills,
      inferred_areas_of_strength,
      goal,
      experience,
      projects
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Error creating/updating user profile:', error);
    res.status(500).json({ 
      error: 'Failed to process user profile',
      details: error.message 
    });
  }
});

// Skill gap analysis
app.post('/analyze-skill-gaps', authenticate, async (req, res) => {
  try {
    
    const user_id = req.user.id; // Use authenticated user ID
    console.log(`Analyzing skill gaps for user ID: ${user_id}`);
    const analysis = await analyzeSkillGaps(user_id);

    if (!analysis) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(analysis);
    
  } catch (error) {
    console.error('Error analyzing skill gaps:', error);
    res.status(500).json({ 
      error: 'Failed to analyze skill gaps',
      details: error.message 
    });
  }
});

// Skill similarity search
app.post('/search-skills', async (req, res) => {
  try {
    const { query, limit = 10 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    const results = await searchSimilarSkills(query, limit);
    
    res.json({
      success: true,
      query,
      results
    });
    
  } catch (error) {
    console.error('Error searching skills:', error);
    res.status(500).json({ 
      error: 'Failed to search skills',
      details: error.message 
    });
  }
});

// Convert goal to standalone question
app.post('/convert-to-standalone', async (req, res) => {
  try {
    const { goal } = req.body;

    if (!goal) {
      return res.status(400).json({ error: 'Goal is required' });
    }

    const goalResponse = await convertToStandalone(goal);

    res.json({
      success: true,
      goalResponse
    });

  } catch (error) {
    console.error('Error converting to standalone question:', error);
    return res.status(500).json({ 
        error: 'Failed to convert to standalone question',
        details: error.message
    });
  }
});

// ATS score evaluation
app.post('/ats-score', async (req, res) => {
  try {
    const { resumeText, jobDescription } = req.body;

    if (!resumeText || !jobDescription) {
      return res.status(400).json({ error: 'Both resumeText and jobDescription are required' });
    }

    const score = await atsScore(resumeText, jobDescription);

    res.json({
      success: true,
      atsScore: score
    });

  } catch (error) {
    console.error('Error evaluating ATS score:', error);
    return res.status(500).json({ 
        error: 'Failed to evaluate ATS score',
        details: error.message
    });
  }
});


// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health',
      'POST /upload-resume',
      'POST /user-profile', 
      'POST /analyze-skill-gaps',
      'POST /search-skills'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 SkillMap Engine API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📝 API Documentation:`);
  console.log(`   📄 Resume upload: POST /upload-resume`);
  console.log(`   👤 User profile: POST /user-profile`);
  console.log(`   🔍 Skill gaps: POST /analyze-skill-gaps`);
  console.log(`   🔎 Search skills: POST /search-skills`);
});
