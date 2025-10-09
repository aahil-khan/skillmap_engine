import express from 'express';
import cors from 'cors';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import fetch from 'node-fetch';
import 'dotenv/config';

// Import configurations
import { upload } from './utils/multer.js';
import { supabase } from './config/supabase.js';

// Import services
import { processResume } from './services/resumeService.js';
import { getLeetCodeStats, getLastnSubmissions, getLeetCodeLanguages, getLeetCodeTopics, getLeetCodeActivity, getLeetCodeProfile } from './services/leetcodeService.js';
import { createUserProfile, updateUserProfile } from './services/userProfileService.js';
import { analyzeSkillGaps } from './services/skillGapService.js';
import { searchSimilarSkills } from './services/skillSearchService.js';
import { convertToStandalone } from './services/convertToStandaloneService.js';
import { atsScore } from './services/atsService.js';
import { suggestProblem } from './services/suggestProblemService.js';

// Import middleware
import { errorHandler, asyncHandler, notFoundHandler, timeoutHandler } from './middleware/errorHandler.js';
import { requestId, requestLogger, slowRequestLogger } from './middleware/requestLogger.js';

// Import error classes
import { AuthenticationError, ValidationError, NotFoundError } from './utils/errors.js';

// Import logger
import logger from './utils/logger.js';

// Import validation schemas
import {
  validateBody,
  validateQuery,
  validateParams,
  userProfileSchema,
  skillGapAnalysisSchema,
  skillSearchSchema,
  convertToStandaloneSchema,
  leetcodeUsernameSchema,
  leetcodeUsernameParamSchema,
  leetcodeStatsSchema,
  leetcodeSubmissionsSchema
} from './schemas/validation.js';

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

// Middleware - ORDER MATTERS!
// 1. Request ID and logging
app.use(requestId);
app.use(requestLogger);
app.use(slowRequestLogger(3000)); // Log requests taking more than 3 seconds

// 2. Security and parsing
app.use(limiter);
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// 3. Request timeout (30 seconds)
app.use(timeoutHandler(30000));

// Supabase Auth middleware
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid Authorization header');
    }
    const token = authHeader.split(' ')[1];
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      throw new AuthenticationError('Invalid or expired token');
    }
    req.user = data.user;
    logger.debug('User authenticated', { userId: data.user.id, requestId: req.id });
    next();
  } catch (err) {
    next(err);
  }
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'SkillMap Engine API is running',
    timestamp: new Date().toISOString(),
    requestId: req.id
  });
});

// Resume processing endpoint
app.post('/upload-resume', authenticate, upload.single('resume'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ValidationError('No file uploaded');
  }

  logger.info('Processing uploaded file', { 
    filename: req.file.filename,
    size: req.file.size,
    userId: req.user.id,
    requestId: req.id
  });

  try {
    const user_id = req.user.id;
    const profileData = await processResume(req.file.path, user_id);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    logger.info('Resume processed successfully', {
      userId: user_id,
      requestId: req.id
    });

    res.json({
      success: true,
      profile: profileData
    });
  } catch (error) {
    // Clean up file if it exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    throw error;
  }
}));

//get leetcode profile
app.get('/api/leetcode/:username/profile', validateParams(leetcodeUsernameParamSchema), asyncHandler(async (req, res) => {
  const { username } = req.validatedParams;
  
  logger.info('Fetching LeetCode profile', { username, requestId: req.id });
  const profile = await getLeetCodeProfile(username);
  res.json(profile);
}));

//connecting leetcodeStats and problem distribution
app.get('/api/leetcode/:username', validateParams(leetcodeUsernameParamSchema), asyncHandler(async (req, res) => {
  const {username} = req.validatedParams;
  
  logger.info('Fetching LeetCode stats', { username, requestId: req.id });
  const stats = await getLeetCodeStats(username);
  res.json(stats);
}));

//generate last n submissions
app.get('/api/leetcode/:username/submission', validateParams(leetcodeUsernameParamSchema), asyncHandler(async (req, res) => {
  const { username } = req.validatedParams;
  
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 5;
  
  logger.info('Fetching LeetCode submissions', { username, limit, requestId: req.id });
  const stats = await getLastnSubmissions(username, limit);
  res.json(stats);
}));

//generate languages used
app.get('/api/leetcode/:username/languages', validateParams(leetcodeUsernameParamSchema), asyncHandler(async (req, res) => {
  const{username} = req.validatedParams;
  
  logger.info('Fetching LeetCode languages', { username, requestId: req.id });
  const languages = await getLeetCodeLanguages(username);
  res.json(languages);
}));

//fetch topic analysis
app.get('/api/leetcode/:username/topics', validateParams(leetcodeUsernameParamSchema), asyncHandler(async (req, res) => {
  const{username} = req.validatedParams;
  
  logger.info('Fetching LeetCode topics', { username, requestId: req.id });
  const topics = await getLeetCodeTopics(username);
  res.json(topics);
}));

//heatmap, streak, daily average, total active days
app.get('/api/leetcode/:username/activity', validateParams(leetcodeUsernameParamSchema), asyncHandler(async (req, res) => {
  const {username}= req.validatedParams;
  
  logger.info('Fetching LeetCode activity', { username, requestId: req.id });
  const data = await getLeetCodeActivity(username);
  res.json(data);
}));

//fetch skillmap suggested problems
app.get('/api/leetcode/:username/suggestions', validateParams(leetcodeUsernameParamSchema), asyncHandler(async (req, res) => {
  const { username } = req.validatedParams;
  
  logger.info('Fetching LeetCode problem suggestions', { username, requestId: req.id });
  const suggestions = await suggestProblem(username);
  res.json(suggestions);
}));

//Leetcode Endpoint
app.post('/leetcode-stats', authenticate, validateBody(leetcodeStatsSchema), asyncHandler(async (req, res) => {
  const { username } = req.validatedBody;

  logger.info('Fetching LeetCode stats', { username, requestId: req.id });
  
  const stats = await getLeetCodeStats(username);
  res.json(stats);
}));

// User profile management
app.post('/user-profile', authenticate, validateBody(userProfileSchema), asyncHandler(async (req, res) => {
  const user_id = req.user.id;
  const { name, technical_skills, inferred_areas_of_strength, goal, experience, projects } = req.validatedBody;

  logger.info('Creating/updating user profile', { userId: user_id, requestId: req.id });

  const result = await createUserProfile({
    user_id,
    name,
    technical_skills,
    inferred_areas_of_strength,
    goal,
    experience,
    projects
  });
  
  logger.info('User profile processed successfully', { userId: user_id, requestId: req.id });
  res.json(result);
}));

// Skill gap analysis
app.post('/analyze-skill-gaps', authenticate, asyncHandler(async (req, res) => {
  const user_id = req.user.id;

  logger.info('Analyzing skill gaps', { userId: user_id, requestId: req.id });

  const analysis = await analyzeSkillGaps(user_id);

  if (!analysis) {
    throw new NotFoundError('User profile');
  }
  
  logger.info('Skill gap analysis completed', { userId: user_id, requestId: req.id });
  res.json(analysis);
}));

// Skill similarity search
app.post('/search-skills', authenticate, validateBody(skillSearchSchema), asyncHandler(async (req, res) => {
  const { query, limit = 10 } = req.validatedBody;

  logger.info('Searching skills', { query, limit, requestId: req.id });

  const results = await searchSimilarSkills(query, limit);
  
  res.json({
    success: true,
    query,
    results
  });
}));

// Convert goal to standalone question
app.post('/convert-to-standalone', authenticate, validateBody(convertToStandaloneSchema), asyncHandler(async (req, res) => {
  const { goal } = req.validatedBody;

  logger.info('Converting goal to standalone', { requestId: req.id });

  const goalResponse = await convertToStandalone(goal);

  res.json({
    success: true,
    goalResponse
  });
}));

// Temporary Route to fetch ATS score
app.get('/ats-score', authenticate, asyncHandler(async (req, res) => {
  const user_id = req.user.id;
  
  logger.info('Fetching ATS score', { userId: user_id, requestId: req.id });
  
  const { data: atsScore } = await supabase
    .from('resumes')
    .select('ats_score')
    .eq('userid', user_id)
    .single();

  if (!atsScore) {
    throw new NotFoundError('ATS score');
  }

  res.json({
    success: true,
    atsScore
  });
}));

//Temporary route to fetch user skills
app.get('/skills', authenticate, asyncHandler(async (req, res) => {
  const user_id = req.user.id;
  
  logger.info('Fetching skills', { userId: user_id, requestId: req.id });
  
  const { data: skills } = await supabase
    .from('skills')
    .select('*')
    .eq('userid', user_id);

  if (!skills) {
    throw new NotFoundError('Skills');
  }

  logger.debug('Fetched skills for user', { userId: user_id, skillCount: skills.length });
  
  res.json({
    success: true,
    skills
  });
}));

app.get('/experience', authenticate, asyncHandler(async (req, res) => {
  const user_id = req.user.id;
  
  logger.info('Fetching experience', { userId: user_id, requestId: req.id });
  
  const { data: resume_text } = await supabase
    .from('resumes')
    .select('resume_text')
    .eq('userid', user_id);

  if (!resume_text) {
    throw new NotFoundError('Resume');
  }

  // resume_text is an array containing objects with resume_text property
  const resumeData = Array.isArray(resume_text) && resume_text.length > 0 ? resume_text[0] : resume_text;
  if (!resumeData || !resumeData.resume_text) {
    throw new NotFoundError('Resume text');
  }

  // Parse the resume text and extract the experience object
  let experience = null;
  try {
    const parsed = JSON.parse(resumeData.resume_text);
    experience = parsed.experience || [];
  } catch (err) {
    throw new ValidationError('Resume text is not valid JSON', err.message);
  }

  logger.debug('Fetched experience for user', { userId: user_id });

  res.json({
    success: true,
    experience
  });
}));

// Error handling middleware - MUST BE AFTER ALL ROUTES
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`SkillMap Engine API started`, { 
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  });
  console.log(`🚀 SkillMap Engine API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📝 API Documentation:`);
  console.log(`   📄 Resume upload: POST /upload-resume`);
  console.log(`   👤 User profile: POST /user-profile`);
  console.log(`   🔍 Skill gaps: POST /analyze-skill-gaps`);
  console.log(`   🔎 Search skills: POST /search-skills`);
  console.log(`   🎯 Convert goal: POST /convert-to-standalone`);
  console.log(`   📊 LeetCode stats: POST /leetcode-stats`);
});
