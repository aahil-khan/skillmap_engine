import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import {
  sendMessage,
  getMessages,
  getUnreadCount,
  getUnreadByConnection,
  markConnectionAsRead,
} from '../services/messages/index.js';
import { ValidationError } from '../utils/errors.js';

const app = new Hono();

/**
 * POST /api/connections/:connectionId/messages
 * Send a message in a connection
 */
app.post('/:connectionId/messages', authenticate, async (c) => {
  const userId = c.get('userId');
  const connectionId = c.req.param('connectionId');
  const body = await c.req.json();

  if (!body.content || typeof body.content !== 'string') {
    throw new ValidationError('Message content is required');
  }

  const message = await sendMessage(connectionId, userId, body.content);

  return c.json({ message }, 201);
});

/**
 * GET /api/connections/:connectionId/messages
 * Get messages for a connection (with pagination)
 * Query params:
 * - limit: number of messages (default 50, max 100)
 * - before: message ID for pagination (get messages before this)
 */
app.get('/:connectionId/messages', authenticate, async (c) => {
  const userId = c.get('userId');
  const connectionId = c.req.param('connectionId');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const before = c.req.query('before');

  const messages = await getMessages(connectionId, userId, limit, before);

  return c.json({
    messages,
    pagination: {
      limit,
      has_more: messages.length === limit,
      before: messages.length > 0 ? messages[messages.length - 1].id : null,
    },
  });
});

/**
 * PATCH /api/connections/:connectionId/messages/read
 * Mark all messages in a connection as read
 */
app.patch('/:connectionId/messages/read', authenticate, async (c) => {
  const userId = c.get('userId');
  const connectionId = c.req.param('connectionId');

  await markConnectionAsRead(connectionId, userId);

  return c.json({ success: true });
});

/**
 * GET /api/messages/unread
 * Get unread message count for current user
 * Query params:
 * - by_connection: if true, return count per connection
 */
app.get('/unread', authenticate, async (c) => {
  const userId = c.get('userId');
  const byConnection = c.req.query('by_connection') === 'true';

  if (byConnection) {
    const counts = await getUnreadByConnection(userId);
    return c.json({ unread_by_connection: counts });
  } else {
    const count = await getUnreadCount(userId);
    return c.json({ unread_count: count });
  }
});

export default app;
