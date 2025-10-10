/**
 * Peer Matching API Routes
 * 
 * Handles peer profile management and connection requests
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import * as peerProfileService from '../services/peerProfileService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ============================================
// PEER PROFILE ROUTES
// ============================================

/**
 * POST /peer/profile
 * Create or update peer profile
 */
router.post('/profile', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const profileData = req.body;

  // Validate required fields
  if (!profileData.display_name || !profileData.title || !profileData.bio) {
    throw new ValidationError('Missing required fields: display_name, title, bio');
  }

  if (!profileData.experience_level || !profileData.availability) {
    throw new ValidationError('Missing required fields: experience_level, availability');
  }

  if (!profileData.looking_for || !Array.isArray(profileData.looking_for) || profileData.looking_for.length === 0) {
    throw new ValidationError('looking_for must be a non-empty array');
  }

  logger.info('[API] Creating/updating peer profile', { userId });

  const profile = await peerProfileService.upsertPeerProfile(userId, profileData);

  res.json({
    success: true,
    message: 'Peer profile created/updated successfully',
    data: profile
  });
}));

/**
 * GET /peer/profile
 * Get user's own peer profile
 */
router.get('/profile', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  logger.info('[API] Getting peer profile', { userId });

  const profile = await peerProfileService.getPeerProfile(userId);

  if (!profile) {
    throw new NotFoundError('Peer profile not found. Please create one first.');
  }

  res.json({
    success: true,
    data: profile
  });
}));

/**
 * DELETE /peer/profile
 * Deactivate peer profile
 */
router.delete('/profile', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  logger.info('[API] Deactivating peer profile', { userId });

  const result = await peerProfileService.deactivatePeerProfile(userId);

  res.json({
    success: true,
    message: 'Peer profile deactivated successfully',
    data: result.data
  });
}));

// ============================================
// MATCHING ROUTES
// ============================================

/**
 * GET /peer/matches
 * Get recommended matches for user
 * Query params: type (project|dsa|both), limit (default: 20)
 */
router.get('/matches', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const matchType = req.query.type || 'both';
  const limit = parseInt(req.query.limit) || 20;

  // Validate match type
  if (!['project', 'dsa', 'both'].includes(matchType)) {
    throw new ValidationError('Invalid match type. Must be: project, dsa, or both');
  }

  // Validate limit
  if (limit < 1 || limit > 50) {
    throw new ValidationError('Limit must be between 1 and 50');
  }

  logger.info('[API] Getting recommended matches', { userId, matchType, limit });

  // Check if user has a peer profile
  const profile = await peerProfileService.getPeerProfile(userId);
  if (!profile) {
    throw new NotFoundError('Please create a peer profile first to get matches');
  }

  if (!profile.is_active || !profile.is_open_to_connections) {
    throw new ValidationError('Your peer profile must be active and open to connections');
  }

  const matches = await peerProfileService.getRecommendedMatches(userId, matchType, limit);

  res.json({
    success: true,
    data: {
      matches,
      total: matches.length,
      match_type: matchType
    }
  });
}));

// ============================================
// CONNECTION ROUTES
// ============================================

/**
 * POST /peer/connect
 * Send connection request to another peer
 */
router.post('/connect', authenticate, asyncHandler(async (req, res) => {
  const senderId = req.user.id;
  
  // Log the entire request body for debugging
  logger.info('[API /peer/connect] Request body received:', {
    body: req.body,
    bodyKeys: Object.keys(req.body),
    receiverId: req.body.receiverId,
    connectionType: req.body.connectionType
  });

  const { receiverId, connectionType, message } = req.body;

  // Validate required fields
  if (!receiverId) {
    throw new ValidationError('receiverId is required');
  }

  if (!connectionType) {
    throw new ValidationError('connectionType is required');
  }

  // Validate connection type
  if (!['project_partner', 'study_partner', 'mentorship', 'general'].includes(connectionType)) {
    throw new ValidationError('Invalid connection type');
  }

  // Prevent self-connection
  if (senderId === receiverId) {
    throw new ValidationError('Cannot send connection request to yourself');
  }

  logger.info('[API] Sending connection request', { senderId, receiverId, connectionType });

  const connection = await peerProfileService.sendConnectionRequest(
    senderId,
    receiverId,
    connectionType,
    message
  );

  res.json({
    success: true,
    message: 'Connection request sent successfully',
    data: connection
  });
}));

/**
 * POST /peer/skip
 * Skip a peer (track interaction)
 */
router.post('/skip', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { peerUserId, matchScore } = req.body;

  if (!peerUserId) {
    throw new ValidationError('peerUserId is required');
  }

  logger.info('[API] Skipping peer', { userId, peerUserId, matchScore });

  await peerProfileService.skipPeer(userId, peerUserId, matchScore);

  res.json({
    success: true,
    message: 'Peer skipped'
  });
}));

/**
 * GET /peer/profile/:userId
 * Get public profile of another peer
 */
router.get('/profile/:userId', authenticate, asyncHandler(async (req, res) => {
  const peerUserId = req.params.userId;

  logger.info('[API] Getting public peer profile', { peerUserId });

  const profile = await peerProfileService.getPublicPeerProfile(peerUserId);

  res.json({
    success: true,
    data: profile
  });
}));

export default router;
