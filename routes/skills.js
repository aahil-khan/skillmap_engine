/**
 * Skills Routes
 * 
 * Handles skill gap analysis, skill search, and skill-related endpoints
 */

import express from 'express';
import { analyzeSkillGaps } from '../services/skillGapService.js';
import { searchSimilarSkills } from '../services/skillSearchService.js';
import { convertToStandalone } from '../services/convertToStandaloneService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody, skillSearchSchema, convertToStandaloneSchema } from '../schemas/validation.js';
import { NotFoundError } from '../utils/errors.js';
import { supabase } from '../config/supabase.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /analyze-skill-gaps
 * Analyze skill gaps for a user
 * 
 * @authentication Required
 * @returns {Object} Skill gap analysis with recommendations
 */
router.post('/analyze-skill-gaps', authenticate, asyncHandler(async (req, res) => {
  const user_id = req.user.id;

  logger.info('Analyzing skill gaps', { userId: user_id, requestId: req.id });

  const analysis = await analyzeSkillGaps(user_id);

  if (!analysis) {
    throw new NotFoundError('User profile');
  }
  
  logger.info('Skill gap analysis completed', { userId: user_id, requestId: req.id });
  res.json({ success: true, data: analysis });
}));

/**
 * POST /search-skills
 * Search for similar skills using semantic search
 * 
 * @authentication Required
 * @body {string} query - Search query (2-200 chars)
 * @body {number} limit - Number of results (1-50, default: 10)
 */
router.post('/search-skills', authenticate, validateBody(skillSearchSchema), asyncHandler(async (req, res) => {
  const { query, limit = 10 } = req.validatedBody;

  logger.info('Searching skills', { query, limit, requestId: req.id });

  const results = await searchSimilarSkills(query, limit);
  
  res.json({
    success: true,
    data: {
      query,
      results
    }
  });
}));

/**
 * POST /convert-to-standalone
 * Convert user goal to standalone question
 * 
 * @authentication Required
 * @body {string} goal - User's career goal (5-500 chars)
 */
router.post('/convert-to-standalone', authenticate, validateBody(convertToStandaloneSchema), asyncHandler(async (req, res) => {
  const { goal } = req.validatedBody;

  logger.info('Converting goal to standalone', { requestId: req.id });

  const goalResponse = await convertToStandalone(goal);

  res.json({
    success: true,
    data: goalResponse
  });
}));

/**
 * GET /ats-score
 * Fetch ATS score for authenticated user
 * 
 * @authentication Required
 */
router.get('/ats-score', authenticate, asyncHandler(async (req, res) => {
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
    data: atsScore
  });
}));

/**
 * GET /skills
 * Fetch all skills for authenticated user
 * 
 * @authentication Required
 */
router.get('/skills', authenticate, asyncHandler(async (req, res) => {
  const user_id = req.user.id;
  
  logger.info('Fetching skills', { userId: user_id, requestId: req.id });
  
  const { data: skills } = await supabase
    .from('skills')
    .select('*')
    .eq('userid', user_id);

  if (!skills) {
    throw new NotFoundError('Skills');
  }

  res.json({
    success: true,
    data: skills
  });
}));

export default router;
