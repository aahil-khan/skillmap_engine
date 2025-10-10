import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getUserProfile,
  getUserSkills,
  getUserExperience,
  getUserProjects,
  getUserEducation,
  getUserGoals,
  getUserResume,
  getLeetCodeProfile,
  getATSHistory,
  getLatestSkillGapAnalysis
} from '../services/userDataService.js';

const router = express.Router();

/**
 * GET /user-data/profile
 * Get complete user profile with all related data
 */
router.get('/profile', authenticate, asyncHandler(async (req, res) => {
  const userid = req.user.id;

  const profile = await getUserProfile(userid);

  res.json({
    success: true,
    data: profile
  });
}));

/**
 * GET /user-data/skills
 * Get user's technical skills grouped by category
 */
router.get('/skills', authenticate, asyncHandler(async (req, res) => {
  const userid = req.user.id;

  const skills = await getUserSkills(userid);

  res.json({
    success: true,
    data: skills
  });
}));

/**
 * GET /user-data/experience
 * Get user's work experience
 */
router.get('/experience', authenticate, asyncHandler(async (req, res) => {
  const userid = req.user.id;

  const experience = await getUserExperience(userid);

  res.json({
    success: true,
    data: experience
  });
}));

/**
 * GET /user-data/projects
 * Get user's projects
 */
router.get('/projects', authenticate, asyncHandler(async (req, res) => {
  const userid = req.user.id;

  const projects = await getUserProjects(userid);

  res.json({
    success: true,
    data: projects
  });
}));

/**
 * GET /user-data/education
 * Get user's education history
 */
router.get('/education', authenticate, asyncHandler(async (req, res) => {
  const userid = req.user.id;

  const education = await getUserEducation(userid);

  res.json({
    success: true,
    data: education
  });
}));

/**
 * GET /user-data/goals
 * Get user's learning goals
 * Query params: status (optional, default: 'active')
 */
router.get('/goals', authenticate, asyncHandler(async (req, res) => {
  const userid = req.user.id;
  const status = req.query.status || 'active';
  
  const goals = await getUserGoals(userid, status);

  res.json({
    success: true,
    data: goals
  });
}));

/**
 * GET /user-data/resume
 * Get user's resume data
 */
router.get('/resume', authenticate, asyncHandler(async (req, res) => {
  const userid = req.user.id;

  const resume = await getUserResume(userid);

  res.json({
    success: true,
    data: resume
  });
}));

/**
 * GET /user-data/leetcode
 * Get user's LeetCode profile
 */
router.get('/leetcode', authenticate, asyncHandler(async (req, res) => {
  const userid = req.user.id;

  const leetcode = await getLeetCodeProfile(userid);

  res.json({
    success: true,
    data: leetcode
  });
}));

/**
 * GET /user-data/ats-history
 * Get user's ATS score history
 * Query params: limit (optional, default: 10)
 */
router.get('/ats-history', authenticate, asyncHandler(async (req, res) => {
  const userid = req.user.id;
  const limit = parseInt(req.query.limit) || 10;
  
  const history = await getATSHistory(userid, limit);

  res.json({
    success: true,
    data: history
  });
}));

/**
 * GET /user-data/skill-gap-analysis
 * Get user's latest skill gap analysis
 */
router.get('/skill-gap-analysis', authenticate, asyncHandler(async (req, res) => {
  const userid = req.user.id;

  const analysis = await getLatestSkillGapAnalysis(userid);

  res.json({
    success: true,
    data: analysis
  });
}));

export default router;
