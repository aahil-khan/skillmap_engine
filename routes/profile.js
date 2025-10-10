/**
 * User Profile Routes
 * 
 * Handles user profile creation, updates, and skill-related endpoints
 */

import express from 'express';
import { createUserProfile } from '../services/userProfileService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody, userProfileSchema } from '../schemas/validation.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /user-profile
 * Create or update user profile
 * 
 * @authentication Required
 * @body {string} name - User's name
 * @body {Array} technical_skills - Array of {category, skills, level}
 * @body {Array} inferred_areas_of_strength - User's strengths
 * @body {string} goal - Career goal
 * @body {Object} experience - Work experience
 * @body {Array} projects - Projects
 */
router.post('/user-profile', authenticate, (req, res, next) => {
  // Log the raw request body before validation
  const bodyInfo = {
    userId: req.user?.id,
    bodyKeys: Object.keys(req.body || {}),
    hasName: !!req.body?.name,
    name: req.body?.name,
    hasTechnicalSkills: !!req.body?.technical_skills,
    technicalSkillsType: Array.isArray(req.body?.technical_skills) ? 'array' : typeof req.body?.technical_skills,
    technicalSkillsLength: req.body?.technical_skills?.length,
    firstSkillCategory: req.body?.technical_skills?.[0],
    hasGoal: !!req.body?.goal,
    goalLength: req.body?.goal?.length,
    hasExperience: !!req.body?.experience,
    experienceType: Array.isArray(req.body?.experience) ? 'array' : typeof req.body?.experience,
    hasEducation: !!req.body?.education,
  };
  
  logger.info('Received user-profile request', bodyInfo);
  console.log('[PROFILE ROUTE] Full request body:', JSON.stringify(req.body, null, 2));
  
  next();
}, validateBody(userProfileSchema), asyncHandler(async (req, res) => {
  const user_id = req.user.id;
  const { name, technical_skills, inferred_areas_of_strength, goal, experience, projects } = req.validatedBody;

  logger.info('Creating/updating user profile', { 
    userId: user_id, 
    requestId: req.id,
    hasName: !!name,
    technicalSkillsCount: technical_skills?.length || 0,
    hasGoal: !!goal
  });

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
  res.json({ success: true, data: result });
}));

export default router;
