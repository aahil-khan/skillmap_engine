/**
 * SkillMap Engine - Main Application Entry Point
 * 
 * A backend API for resume processing, skill gap analysis, and LeetCode integration
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

// Import middleware
import { errorHandler, notFoundHandler, timeoutHandler } from './middleware/errorHandler.js';
import { requestId, requestLogger, slowRequestLogger } from './middleware/requestLogger.js';
import { authenticate } from './middleware/auth.js';

// Import logger
import logger from './utils/logger.js';

// Import route modules
import resumeRoutes from './routes/resume.js';
import leetcodeRoutes from './routes/leetcode.js';
import profileRoutes from './routes/profile.js';
import skillsRoutes from './routes/skills.js';
import userDataRoutes from './routes/userData.js';
import peerMatchingRoutes from './routes/peerMatching.js';

// Import config
import { supabase } from './config/supabase.js';
import { asyncHandler } from './middleware/errorHandler.js';
import { NotFoundError, ValidationError } from './utils/errors.js';

const app = express();
const PORT = process.env.PORT || 5005;

// ============================================
// MIDDLEWARE SETUP
// ============================================

// 1. Request ID and logging
app.use(requestId);
app.use(requestLogger);
app.use(slowRequestLogger(3000)); // Log requests taking more than 3 seconds

// !!! change later
// 2. Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 50 requests per window (500 for now)
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// 3. CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true
}));

// 4. Body parsing
app.use(express.json({ limit: '10mb' }));

// 5. Request timeout (30 seconds)
app.use(timeoutHandler(30000));

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'SkillMap Engine API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ============================================
// API ROUTES
// ============================================

// Resume routes (authentication applied in route file)
app.use('/', resumeRoutes);

// User profile routes (authentication applied in route file)
app.use('/', profileRoutes);

// Skills routes (authentication applied in route file)
app.use('/', skillsRoutes);

// User data GET routes (authentication applied in route file)
app.use('/user-data', userDataRoutes);

// LeetCode routes (mixed auth - some public, some authenticated)
app.use('/', leetcodeRoutes);

// Peer matching routes (authentication required)
app.use('/peer', peerMatchingRoutes);

// Experience route

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

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  logger.info(`SkillMap Engine API started`, { 
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  });
  console.log(`
╔════════════════════════════════════════════════════╗
║   🚀 SkillMap Engine API Server Started            ║
╠════════════════════════════════════════════════════╣
║   📍 Port: ${PORT}                                    ║
║   🌍 Environment: ${process.env.NODE_ENV || 'development'}                       ║
║   📅 Started: ${new Date().toLocaleString()}         ║
╠════════════════════════════════════════════════════╣
║   📡 API Endpoints:                                 ║
║   ├─ 🏥 Health: GET /health                        ║
║   ├─ 📄 Resume: POST /upload-resume                ║
║   ├─ 👤 Profile: POST /user-profile                ║
║   ├─ 🔍 Skill Gaps: POST /analyze-skill-gaps       ║
║   ├─ 🔎 Search: POST /search-skills                ║
║   ├─ 🎯 Convert: POST /convert-to-standalone       ║
║   ├─ 📊 LeetCode: POST /leetcode-stats             ║
║   └─ 🏆 APIs: GET /api/leetcode/:username/*        ║
╚════════════════════════════════════════════════════╝
  `);
});

export default app;
