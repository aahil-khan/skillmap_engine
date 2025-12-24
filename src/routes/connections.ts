import { Hono } from 'hono';
import '../types/hono.js';
import { authenticate } from '../middleware/auth.js';
import {
  sendConnectionRequest,
  respondToConnection,
  getConnections,
  getConnection,
  deleteConnection,
  type ConnectionType,
} from '../services/connections/index.js';
import { ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { supabase } from '../lib/db/supabase.js';

const app = new Hono();

/**
 * POST /peer/matches/:candidateId/action
 * Send connection request (like), dislike, or skip a match
 */
app.post('/:candidateId/action', authenticate, async (c) => {
  const userId = c.get('userId');
  const candidateId = c.req.param('candidateId');
  const body = await c.req.json();
  const { action, connection_type, match_score } = body;

  if (!['like', 'dislike', 'skip'].includes(action)) {
    throw new ValidationError('Invalid action. Must be: like, dislike, or skip');
  }

  if (action === 'like') {
    // Send connection request
    const connectionType = (connection_type || 'general') as ConnectionType;
    const connection = await sendConnectionRequest(userId, candidateId, connectionType, match_score);
    
    return c.json({
      success: true,
      action: 'like',
      connection_status: 'pending',
      connection_id: connection.id,
      message: 'Connection request sent',
    });
  } 
  
  if (action === 'dislike') {
    // Store dislike in match_feedback (permanent filter)
    const { supabase } = await import('../lib/db/supabase.js');
    const { error } = await supabase
      .from('match_feedback')
      .upsert({
        user_id: userId,
        candidate_id: candidateId,
        feedback_type: 'dislike',
        match_score: match_score || 0,
        scoring_factors: {},
      }, {
        onConflict: 'user_id,candidate_id'
      });

    if (error) {
      logger.error({ error, userId, candidateId }, 'Failed to record dislike');
      throw error;
    }

    return c.json({
      success: true,
      action: 'dislike',
      message: 'Candidate removed from matches',
    });
  }

  // Skip action
  const { supabase } = await import('../lib/db/supabase.js');
  const { error } = await supabase
    .from('match_feedback')
    .upsert({
      user_id: userId,
      candidate_id: candidateId,
      feedback_type: 'skip',
      match_score: match_score || 0,
      scoring_factors: {},
    }, {
      onConflict: 'user_id,candidate_id'
    });

  if (error) {
    logger.error({ error, userId, candidateId }, 'Failed to record skip');
    throw error;
  }

  return c.json({
    success: true,
    action: 'skip',
    message: 'Candidate skipped (will reappear in 7 days)',
  });
});

/**
 * GET /api/connections?type=received|sent|accepted
 * Get connections for current user
 */
app.get('/', authenticate, async (c) => {
  const userId = c.get('userId');
  const type = c.req.query('type') as 'received' | 'sent' | 'accepted' | undefined;

  if (type && !['received', 'sent', 'accepted'].includes(type)) {
    throw new ValidationError('Invalid type. Must be: received, sent, or accepted');
  }

  const connections = await getConnections(userId, type);

  // Group by status for easy frontend handling
  const grouped = {
    received: connections.filter(c => c.receiver_id === userId && c.status === 'pending'),
    sent: connections.filter(c => c.sender_id === userId && c.status === 'pending'),
    accepted: connections.filter(c => c.status === 'accepted'),
  };

  return c.json({
    success: true,
    connections: type ? connections : grouped,
    total: connections.length,
  });
});

/**
 * GET /api/connections/stats
 * Get connection statistics for current user
 */
app.get('/stats', authenticate, async (c) => {
  const userId = c.get('userId');

  // Get stats from peer_connections
  const { data: stats, error } = await supabase
    .from('peer_connections')
    .select('status, sender_id, receiver_id')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

  if (error) {
    logger.error({ error, userId }, 'Failed to fetch connection stats');
    throw error;
  }

  // Count by status
  const pending_received = stats.filter(c => c.status === 'pending' && c.receiver_id === userId).length;
  const pending_sent = stats.filter(c => c.status === 'pending' && c.sender_id === userId).length;
  const accepted = stats.filter(c => c.status === 'accepted').length;
  const total = stats.length;

  return c.json({
    pending_received,
    pending_sent,
    accepted,
    total,
  });
});

/**
 * GET /api/connections/:connectionId
 * Get a single connection
 */
app.get('/:connectionId', authenticate, async (c) => {
  const userId = c.get('userId');
  const connectionId = c.req.param('connectionId');

  const connection = await getConnection(connectionId, userId);

  return c.json({
    success: true,
    connection,
  });
});

/**
 * POST /api/connections/:connectionId/respond
 * Accept or reject a connection request
 */
app.post('/:connectionId/respond', authenticate, async (c) => {
  const userId = c.get('userId');
  const connectionId = c.req.param('connectionId');
  const body = await c.req.json();
  const { action } = body;

  if (!['accept', 'reject'].includes(action)) {
    throw new ValidationError('Invalid action. Must be: accept or reject');
  }

  const connection = await respondToConnection(connectionId, userId, action);

  return c.json({
    success: true,
    action,
    connection,
    message: action === 'accept' ? 'Connection accepted' : 'Connection request declined',
  });
});

/**
 * DELETE /api/connections/:connectionId
 * Cancel a pending connection request (sender only)
 */
app.delete('/:connectionId', authenticate, async (c) => {
  const userId = c.get('userId');
  const connectionId = c.req.param('connectionId');

  await deleteConnection(connectionId, userId);

  return c.json({
    success: true,
    message: 'Connection request cancelled',
  });
});

export default app;
