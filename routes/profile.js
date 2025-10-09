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
router.post('/user-profile', authenticate, validateBody(userProfileSchema), asyncHandler(async (req, res) => {
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
  res.json({ success: true, data: result });
}));

export default router;
