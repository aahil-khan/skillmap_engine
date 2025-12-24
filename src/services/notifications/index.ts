import { supabase } from '../../lib/db/supabase.js';
import logger from '../../utils/logger.js';

export type NotificationType = 
  | 'connection_request' 
  | 'connection_accepted' 
  | 'connection_rejected'
  | 'new_message';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  related_user_id?: string;
  related_connection_id?: string;
  related_message_id?: string;
  read_at?: string;
  created_at: string;
}

export interface NotificationWithProfile extends Notification {
  related_user?: {
    user_id: string;
    display_name: string;
    avatar_url?: string;
  };
}

/**
 * Create a notification for a user
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  relatedUserId?: string,
  relatedConnectionId?: string,
  relatedMessageId?: string
): Promise<Notification> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      title,
      message,
      related_user_id: relatedUserId,
      related_connection_id: relatedConnectionId,
      related_message_id: relatedMessageId,
    })
    .select()
    .single();

  if (error) {
    logger.error({ error, userId, type }, 'Failed to create notification');
    throw error;
  }

  logger.info({ notificationId: data.id, userId, type }, 'Notification created');
  return data;
}

/**
 * Get notifications for a user
 */
export async function getNotifications(
  userId: string,
  unreadOnly: boolean = false,
  limit: number = 50
): Promise<NotificationWithProfile[]> {
  // Query notifications without FK hint
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is('read_at', null);
  }

  const { data, error } = await query;

  if (error) {
    logger.error({ error, userId }, 'Failed to fetch notifications');
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Extract unique related user IDs
  const relatedUserIds = [...new Set(
    data
      .filter(notif => notif.related_user_id)
      .map(notif => notif.related_user_id as string)
  )];

  // Fetch related user profiles separately
  let relatedUserMap = new Map<string, { user_id: string; display_name: string; avatar_url?: string }>();
  
  if (relatedUserIds.length > 0) {
    const { data: relatedUsers, error: profileError } = await supabase
      .from('user_profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', relatedUserIds);

    if (profileError) {
      logger.error({ error: profileError }, 'Failed to fetch related user profiles');
    } else if (relatedUsers) {
      relatedUserMap = new Map(
        relatedUsers.map(user => [user.user_id, user])
      );
    }
  }

  // Map notifications with related user data
  return data.map(notif => ({
    id: notif.id,
    user_id: notif.user_id,
    type: notif.type,
    title: notif.title,
    message: notif.message,
    related_user_id: notif.related_user_id,
    related_connection_id: notif.related_connection_id,
    related_message_id: notif.related_message_id,
    read_at: notif.read_at,
    created_at: notif.created_at,
    related_user: notif.related_user_id 
      ? relatedUserMap.get(notif.related_user_id) || {
          user_id: notif.related_user_id,
          display_name: 'Unknown User',
        }
      : undefined,
  }));
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId);

  if (error) {
    logger.error({ error, notificationId, userId }, 'Failed to mark notification as read');
    throw error;
  }

  logger.info({ notificationId, userId }, 'Notification marked as read');
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) {
    logger.error({ error, userId }, 'Failed to mark all notifications as read');
    throw error;
  }

  logger.info({ userId }, 'All notifications marked as read');
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) {
    logger.error({ error, userId }, 'Failed to get unread count');
    return 0;
  }

  return count || 0;
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)
    .eq('user_id', userId);

  if (error) {
    logger.error({ error, notificationId, userId }, 'Failed to delete notification');
    throw error;
  }

  logger.info({ notificationId, userId }, 'Notification deleted');
}

// ============================================
// HELPER FUNCTIONS FOR COMMON NOTIFICATIONS
// ============================================

/**
 * Send connection request notification
 */
export async function notifyConnectionRequest(
  receiverId: string,
  senderId: string,
  senderName: string,
  connectionId: string
): Promise<void> {
  await createNotification(
    receiverId,
    'connection_request',
    'New Connection Request',
    `${senderName} sent you a connection request`,
    senderId,
    connectionId
  );
}

/**
 * Send connection accepted notification
 */
export async function notifyConnectionAccepted(
  senderId: string,
  accepterld: string,
  accepterName: string,
  connectionId: string
): Promise<void> {
  await createNotification(
    senderId,
    'connection_accepted',
    'Connection Accepted',
    `${accepterName} accepted your connection request`,
    accepterld,
    connectionId
  );
}

/**
 * Send new message notification
 */
export async function notifyNewMessage(
  receiverId: string,
  senderId: string,
  senderName: string,
  connectionId: string,
  messageId: string
): Promise<void> {
  await createNotification(
    receiverId,
    'new_message',
    'New Message',
    `${senderName} sent you a message`,
    senderId,
    connectionId,
    messageId
  );
}
