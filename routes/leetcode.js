/**
 * LeetCode Integration Routes
 * 
 * Handles all LeetCode-related endpoints for stats, submissions, and analysis
 */

import express from 'express';
import { 
  getLeetCodeStats, 
  getLastnSubmissions, 
  getLeetCodeLanguages, 
  getLeetCodeTopics, 
  getLeetCodeActivity, 
  getLeetCodeProfile 
} from '../services/leetcodeService.js';
import { suggestProblem } from '../services/suggestProblemService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validateParams, validateBody, leetcodeUsernameParamSchema, leetcodeStatsSchema } from '../schemas/validation.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/leetcode/:username/profile
 * Get LeetCode user profile
 */
router.get('/api/leetcode/:username/profile', validateParams(leetcodeUsernameParamSchema), asyncHandler(async (req, res) => {
  const { username } = req.validatedParams;
  
  logger.info('Fetching LeetCode profile', { username, requestId: req.id });
  const profile = await getLeetCodeProfile(username);
  res.json({ success: true, data: profile });
}));

/**
 * GET /api/leetcode/:username
 * Get LeetCode stats and problem distribution
 */
router.get('/api/leetcode/:username', validateParams(leetcodeUsernameParamSchema), asyncHandler(async (req, res) => {
  const { username } = req.validatedParams;
  
  logger.info('Fetching LeetCode stats', { username, requestId: req.id });
  const stats = await getLeetCodeStats(username);
  res.json({ success: true, data: stats });
}));

/**
 * GET /api/leetcode/:username/submission
 * Get last N submissions
 */
router.get('/api/leetcode/:username/submission', validateParams(leetcodeUsernameParamSchema), asyncHandler(async (req, res) => {
  const { username } = req.validatedParams;
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 5;
  
  logger.info('Fetching LeetCode submissions', { username, limit, requestId: req.id });
  const stats = await getLastnSubmissions(username, limit);
  res.json({ success: true, data: stats });
}));

/**
 * GET /api/leetcode/:username/languages
 * Get languages used by the user
 */
router.get('/api/leetcode/:username/languages', validateParams(leetcodeUsernameParamSchema), asyncHandler(async (req, res) => {
  const { username } = req.validatedParams;
  
  logger.info('Fetching LeetCode languages', { username, requestId: req.id });
  const languages = await getLeetCodeLanguages(username);
  res.json({ success: true, data: languages });
}));

/**
 * GET /api/leetcode/:username/topics
 * Get topic analysis
 */
router.get('/api/leetcode/:username/topics', validateParams(leetcodeUsernameParamSchema), asyncHandler(async (req, res) => {
  const { username } = req.validatedParams;
  
  logger.info('Fetching LeetCode topics', { username, requestId: req.id });
  const topics = await getLeetCodeTopics(username);
  res.json({ success: true, data: topics });
}));

/**
 * GET /api/leetcode/:username/activity
 * Get heatmap, streak, daily average, total active days
 */
router.get('/api/leetcode/:username/activity', validateParams(leetcodeUsernameParamSchema), asyncHandler(async (req, res) => {
  const { username } = req.validatedParams;
  
  logger.info('Fetching LeetCode activity', { username, requestId: req.id });
  const data = await getLeetCodeActivity(username);
  res.json({ success: true, data });
}));

/**
 * GET /api/leetcode/:username/suggestions
 * Get SkillMap suggested problems
 */
router.get('/api/leetcode/:username/suggestions', validateParams(leetcodeUsernameParamSchema), asyncHandler(async (req, res) => {
  const { username } = req.validatedParams;
  
  logger.info('Fetching LeetCode problem suggestions', { username, requestId: req.id });
  const suggestions = await suggestProblem(username);
  res.json({ success: true, data: suggestions });
}));

/**
 * POST /leetcode-stats
 * Get LeetCode stats (authenticated endpoint)
 * 
 * @authentication Required
 */
router.post('/leetcode-stats', authenticate, validateBody(leetcodeStatsSchema), asyncHandler(async (req, res) => {
  const { username } = req.validatedBody;

  logger.info('Fetching LeetCode stats', { username, requestId: req.id });
  
  const stats = await getLeetCodeStats(username);
  res.json({ success: true, data: stats });
}));

export default router;
