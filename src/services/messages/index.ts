import { supabase } from '../../lib/db/supabase.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import { notifyNewMessage } from '../notifications/index.js';

export interface Message {
  id: string;
  connection_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  read_at?: string;
}

export interface MessageWithSender extends Message {
  sender: {
    user_id: string;
    display_name: string;
    avatar_url?: string;
  };
}

/**
 * Send a message in a connection
 */
export async function sendMessage(
  connectionId: string,
  senderId: string,
  content: string
): Promise<Message> {
  // Verify connection exists and user is part of it
  const { data: connection, error: connError } = await supabase
    .from('peer_connections')
    .select('sender_id, receiver_id, status')
    .eq('id', connectionId)
    .single();

  if (connError || !connection) {
    throw new NotFoundError('Connection not found');
  }

  // Verify connection is accepted
  if (connection.status !== 'accepted') {
    throw new ValidationError('Can only send messages in accepted connections');
  }

  // Verify user is part of this connection
  if (connection.sender_id !== senderId && connection.receiver_id !== senderId) {
    throw new ValidationError('You are not part of this connection');
  }

  const receiverId = connection.sender_id === senderId 
    ? connection.receiver_id 
    : connection.sender_id;

  // Validate content
  if (!content || content.trim().length === 0) {
    throw new ValidationError('Message content cannot be empty');
  }

  if (content.length > 5000) {
    throw new ValidationError('Message content too long (max 5000 characters)');
  }

  // Insert message
  const { data, error } = await supabase
    .from('messages')
    .insert({
      connection_id: connectionId,
      sender_id: senderId,
      receiver_id: receiverId,
      content: content.trim(),
    })
    .select()
    .single();

  if (error) {
    logger.error({ error, connectionId, senderId }, 'Failed to send message');
    throw error;
  }

  // Send notification to receiver (non-blocking)
  const { data: senderProfile } = await supabase
    .from('user_profiles')
    .select('display_name')
    .eq('user_id', senderId)
    .single();
  
  if (senderProfile) {
    notifyNewMessage(receiverId, senderId, senderProfile.display_name, connectionId, data.id)
      .catch(err => logger.error({ err }, 'Failed to send new message notification'));
  }

  logger.info({ connectionId, senderId, messageId: data.id }, 'Message sent');
  return data;
}

/**
 * Get messages for a connection
 */
export async function getMessages(
  connectionId: string,
  userId: string,
  limit: number = 50,
  before?: string // Message ID for pagination
): Promise<MessageWithSender[]> {
  // Verify user is part of connection
  const { data: connection, error: connError } = await supabase
    .from('peer_connections')
    .select('sender_id, receiver_id')
    .eq('id', connectionId)
    .single();

  if (connError || !connection) {
    throw new NotFoundError('Connection not found');
  }

  if (connection.sender_id !== userId && connection.receiver_id !== userId) {
    throw new ValidationError('You are not part of this connection');
  }

  // Build query
  let query = supabase
    .from('messages')
    .select('*')
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Pagination: Get messages before a certain message
  if (before) {
    const { data: beforeMsg } = await supabase
      .from('messages')
      .select('created_at')
      .eq('id', before)
      .single();
    
    if (beforeMsg) {
      query = query.lt('created_at', beforeMsg.created_at);
    }
  }

  const { data, error } = await query;

  if (error) {
    logger.error({ error, connectionId }, 'Failed to fetch messages');
    throw error;
  }

  // Fetch sender profiles for all messages
  const senderIds = [...new Set(data?.map((msg: any) => msg.sender_id) || [])];
  const { data: senders } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, avatar_url')
    .in('user_id', senderIds);

  const senderMap = new Map(senders?.map(s => [s.user_id, s]) || []);

  // Mark messages as read (where user is receiver)
  if (data && data.length > 0) {
    const unreadIds = data
      .filter((msg: any) => msg.receiver_id === userId && !msg.read_at)
      .map((msg: any) => msg.id);

    if (unreadIds.length > 0) {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds)
        .then(() => logger.info({ connectionId, count: unreadIds.length }, 'Marked messages as read'))
        .catch(err => logger.error({ err }, 'Failed to mark messages as read'));
    }
  }

  return (data || []).map((msg: any) => {
    const sender = senderMap.get(msg.sender_id) || {
      user_id: msg.sender_id,
      display_name: 'Unknown User',
      avatar_url: null,
    };
    
    return {
      id: msg.id,
      connection_id: msg.connection_id,
      sender_id: msg.sender_id,
      receiver_id: msg.receiver_id,
      content: msg.content,
      created_at: msg.created_at,
      read_at: msg.read_at,
      sender: {
        user_id: sender.user_id,
        display_name: sender.display_name,
        avatar_url: sender.avatar_url,
      },
    };
  });
}

/**
 * Get unread message count for a user across all connections
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', userId)
    .is('read_at', null);

  if (error) {
    logger.error({ error, userId }, 'Failed to get unread count');
    return 0;
  }

  return count || 0;
}

/**
 * Get unread message count per connection
 */
export async function getUnreadByConnection(userId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('messages')
    .select('connection_id')
    .eq('receiver_id', userId)
    .is('read_at', null);

  if (error) {
    logger.error({ error, userId }, 'Failed to get unread by connection');
    return {};
  }

  const counts: Record<string, number> = {};
  data?.forEach(msg => {
    counts[msg.connection_id] = (counts[msg.connection_id] || 0) + 1;
  });

  return counts;
}

/**
 * Mark all messages in a connection as read
 */
export async function markConnectionAsRead(connectionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('connection_id', connectionId)
    .eq('receiver_id', userId)
    .is('read_at', null);

  if (error) {
    logger.error({ error, connectionId, userId }, 'Failed to mark connection as read');
    throw error;
  }

  logger.info({ connectionId, userId }, 'Connection messages marked as read');
}
