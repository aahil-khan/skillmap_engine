/**
 * Peer Connections & Messaging Routes
 */

import express from 'express';
import {
  getUserConnections,
  respondToConnection,
  getMessages,
  sendMessage,
  getUnreadCount
} from '../services/peerConnectionsService.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /connections
 * Get all connections for the authenticated user
 * Query params: status (optional)
 */
router.get('/connections', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const status = req.query.status || null;
  
  const connections = await getUserConnections(userId, status);

  res.json({
    success: true,
    data: connections
  });
}));

/**
 * POST /connections/:connectionId/respond
 * Accept or decline a connection request
 * Body: { action: 'accept' | 'decline' }
 */
router.post('/connections/:connectionId/respond', authenticate, asyncHandler(async (req, res) => {
  const { connectionId } = req.params;
  const userId = req.user.id;
  const { action } = req.body;

  if (!action) {
    return res.status(400).json({
      success: false,
      error: 'action is required'
    });
  }

  if (!['accept', 'decline'].includes(action)) {
    return res.status(400).json({
      success: false,
      error: 'action must be "accept" or "decline"'
    });
  }

  const connection = await respondToConnection(connectionId, userId, action);

  res.json({
    success: true,
    data: connection,
    message: `Connection ${action}ed successfully`
  });
}));

/**
 * GET /connections/:connectionId/messages
 * Get messages for a connection
 * Query params: limit (optional)
 */
router.get('/connections/:connectionId/messages', authenticate, asyncHandler(async (req, res) => {
  const { connectionId } = req.params;
  const userId = req.user.id;
  const limit = parseInt(req.query.limit) || 50;

  const messages = await getMessages(connectionId, userId, limit);

  res.json({
    success: true,
    data: {
      connection_id: connectionId,
      messages,
      count: messages.length
    }
  });
}));

/**
 * POST /connections/:connectionId/messages
 * Send a message
 * Body: { message: string }
 */
router.post('/connections/:connectionId/messages', authenticate, asyncHandler(async (req, res) => {
  const { connectionId } = req.params;
  const userId = req.user.id;
  const { message: messageText } = req.body;

  if (!messageText) {
    return res.status(400).json({
      success: false,
      error: 'message is required'
    });
  }

  if (messageText.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'message cannot be empty'
    });
  }

  if (messageText.length > 2000) {
    return res.status(400).json({
      success: false,
      error: 'message too long (max 2000 characters)'
    });
  }

  const message = await sendMessage(connectionId, userId, messageText.trim());

  res.json({
    success: true,
    data: message,
    message: 'Message sent successfully'
  });
}));

/**
 * GET /connections/unread-count
 * Get unread message count
 */
router.get('/connections/unread-count', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const count = await getUnreadCount(userId);

  res.json({
    success: true,
    data: {
      unread_count: count
    }
  });
}));

export default router;
