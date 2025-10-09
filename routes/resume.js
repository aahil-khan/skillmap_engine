/**
 * Resume Processing Routes
 * 
 * Handles resume upload and processing endpoints
 */

import express from 'express';
import fs from 'fs';
import { upload } from '../utils/multer.js';
import { processResume } from '../services/resumeService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /upload-resume
 * Upload and process a resume PDF file
 * 
 * @authentication Required
 * @body {File} resume - PDF file (max 10MB)
 * @returns {Object} Processed profile data with extracted skills
 */
router.post('/upload-resume', authenticate, upload.single('resume'), asyncHandler(async (req, res) => {
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
      data: profileData
    });
  } catch (error) {
    // Clean up file if it exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    throw error;
  }
}));

export default router;
