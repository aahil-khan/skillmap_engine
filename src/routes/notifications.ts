import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
} from '../services/notifications/index.js';

const app = new Hono();

/**
 * GET /api/notifications
 * Get notifications for current user
 * Query params:
 * - unread_only: if true, only return unread notifications
 * - limit: number of notifications (default 50, max 100)
 */
app.get('/', authenticate, async (c) => {
  const userId = c.get('userId');
  const unreadOnly = c.req.query('unread_only') === 'true';
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

  const notifications = await getNotifications(userId, unreadOnly, limit);

  return c.json({ notifications });
});

/**
 * GET /api/notifications/unread/count
 * Get unread notification count
 */
app.get('/unread/count', authenticate, async (c) => {
  const userId = c.get('userId');
  const count = await getUnreadCount(userId);

  return c.json({ unread_count: count });
});

/**
 * PATCH /api/notifications/:notificationId/read
 * Mark a notification as read
 */
app.patch('/:notificationId/read', authenticate, async (c) => {
  const userId = c.get('userId');
  const notificationId = c.req.param('notificationId');

  await markAsRead(notificationId, userId);

  return c.json({ success: true });
});

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read
 */
app.patch('/read-all', authenticate, async (c) => {
  const userId = c.get('userId');

  await markAllAsRead(userId);

  return c.json({ success: true });
});

/**
 * DELETE /api/notifications/:notificationId
 * Delete a notification
 */
app.delete('/:notificationId', authenticate, async (c) => {
  const userId = c.get('userId');
  const notificationId = c.req.param('notificationId');

  await deleteNotification(notificationId, userId);

  return c.json({ success: true });
});

export default app;
