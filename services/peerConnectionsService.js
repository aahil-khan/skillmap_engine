/**
 * Peer Connections & Messaging Service
 * Handles connection requests and simple peer-to-peer messaging
 */

import { supabase } from '../config/supabase.js';
import logger from '../utils/logger.js';

/**
 * Get all connections for a user (sent, received, accepted)
 * @param {string} userId - User ID
 * @param {string} status - Filter by status (optional: 'pending', 'accepted', 'declined')
 * @returns {Object} Connections organized by type
 */
export async function getUserConnections(userId, status = null) {
  try {
    logger.info('[Connections] Fetching user connections', { userId, status });

    // Build query - just get the connections first
    let sentQuery = supabase
      .from('peer_connections')
      .select('*')
      .eq('sender_userid', userId)
      .order('created_at', { ascending: false });

    let receivedQuery = supabase
      .from('peer_connections')
      .select('*')
      .eq('receiver_userid', userId)
      .order('created_at', { ascending: false });

    // Apply status filter if provided
    if (status) {
      sentQuery = sentQuery.eq('status', status);
      receivedQuery = receivedQuery.eq('status', status);
    }

    const [sentResult, receivedResult] = await Promise.all([
      sentQuery,
      receivedQuery
    ]);

    if (sentResult.error) throw sentResult.error;
    if (receivedResult.error) throw receivedResult.error;

    // Fetch peer profiles separately
    const sentConnections = sentResult.data || [];
    const receivedConnections = receivedResult.data || [];
    
    const receiverIds = sentConnections.map(c => c.receiver_userid);
    const senderIds = receivedConnections.map(c => c.sender_userid);
    const allUserIds = [...new Set([...receiverIds, ...senderIds])];

    // Fetch all peer profiles in one query
    const { data: profiles } = await supabase
      .from('peer_profiles')
      .select('userid, display_name, title, bio, experience_level, availability, looking_for')
      .in('userid', allUserIds);

    const profileMap = {};
    (profiles || []).forEach(p => {
      profileMap[p.userid] = p;
    });

    // Attach profiles to connections
    const enrichSent = sentConnections.map(conn => ({
      ...conn,
      receiver_profile: profileMap[conn.receiver_userid] || null
    }));

    const enrichReceived = receivedConnections.map(conn => ({
      ...conn,
      sender_profile: profileMap[conn.sender_userid] || null
    }));

    // Get unread message counts for each connection
    const allConnectionIds = [
      ...enrichSent.map(c => c.id),
      ...enrichReceived.map(c => c.id)
    ];

    const { data: unreadCounts } = await supabase
      .from('peer_messages')
      .select('connection_id, is_read')
      .in('connection_id', allConnectionIds)
      .eq('receiver_userid', userId)
      .eq('is_read', false);

    const unreadMap = {};
    if (unreadCounts) {
      unreadCounts.forEach(msg => {
        unreadMap[msg.connection_id] = (unreadMap[msg.connection_id] || 0) + 1;
      });
    }

    // Add unread counts to connections
    const addUnreadCounts = (connections) => {
      return connections.map(conn => ({
        ...conn,
        unread_count: unreadMap[conn.id] || 0
      }));
    };

    // For accepted connections, we need to ensure both sender_profile and receiver_profile are available
    // regardless of whether the user was the sender or receiver
    const acceptedConnections = [
      ...enrichSent.filter(c => c.status === 'accepted'),
      ...enrichReceived.filter(c => c.status === 'accepted')
    ];

    logger.info('[Connections] Accepted connections breakdown', {
      userId,
      acceptedCount: acceptedConnections.length,
      fromSent: enrichSent.filter(c => c.status === 'accepted').length,
      fromReceived: enrichReceived.filter(c => c.status === 'accepted').length,
      sample: acceptedConnections[0] ? {
        id: acceptedConnections[0].id,
        sender_userid: acceptedConnections[0].sender_userid,
        receiver_userid: acceptedConnections[0].receiver_userid,
        has_sender_profile: !!acceptedConnections[0].sender_profile,
        has_receiver_profile: !!acceptedConnections[0].receiver_profile
      } : null
    });

    const result = {
      sent: addUnreadCounts(enrichSent),
      received: addUnreadCounts(enrichReceived),
      accepted: addUnreadCounts(acceptedConnections),
      pending_sent: enrichSent.filter(c => c.status === 'pending'),
      pending_received: enrichReceived.filter(c => c.status === 'pending')
    };

    logger.info('[Connections] Fetched connections', {
      userId,
      counts: {
        sent: result.sent.length,
        received: result.received.length,
        accepted: result.accepted.length,
        pending_sent: result.pending_sent.length,
        pending_received: result.pending_received.length
      }
    });

    return result;
  } catch (error) {
    logger.error('[Connections] Error fetching connections', {
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Respond to a connection request (accept/decline)
 * @param {string} connectionId - Connection ID
 * @param {string} userId - User ID (must be receiver)
 * @param {string} action - 'accept' or 'decline'
 * @returns {Object} Updated connection
 */
export async function respondToConnection(connectionId, userId, action) {
  try {
    logger.info('[Connections] Responding to connection', { connectionId, userId, action });

    // Verify user is the receiver
    const { data: connection, error: fetchError } = await supabase
      .from('peer_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('receiver_userid', userId)
      .eq('status', 'pending')
      .single();

    if (fetchError || !connection) {
      throw new Error('Connection not found or you are not authorized to respond');
    }

    // Update status
    const newStatus = action === 'accept' ? 'accepted' : 'declined';
    const { data: updated, error: updateError } = await supabase
      .from('peer_connections')
      .update({
        status: newStatus,
        responded_at: new Date().toISOString()
      })
      .eq('id', connectionId)
      .select()
      .single();

    if (updateError) throw updateError;

    logger.info('[Connections] Connection updated', { connectionId, status: newStatus });

    return updated;
  } catch (error) {
    logger.error('[Connections] Error responding to connection', {
      connectionId,
      userId,
      action,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get messages for a connection
 * @param {string} connectionId - Connection ID
 * @param {string} userId - User ID (must be part of connection)
 * @param {number} limit - Number of messages to fetch
 * @returns {Array} Messages
 */
export async function getMessages(connectionId, userId, limit = 50) {
  try {
    logger.info('[Messages] Fetching messages', { connectionId, userId, limit });

    // Verify user is part of this connection
    const { data: connection, error: connError } = await supabase
      .from('peer_connections')
      .select('sender_userid, receiver_userid, status')
      .eq('id', connectionId)
      .single();

    if (connError || !connection) {
      throw new Error('Connection not found');
    }

    if (connection.sender_userid !== userId && connection.receiver_userid !== userId) {
      throw new Error('You are not part of this connection');
    }

    if (connection.status !== 'accepted') {
      throw new Error('Connection must be accepted before messaging');
    }

    // Fetch messages
    const { data: messages, error: msgError } = await supabase
      .from('peer_messages')
      .select('*')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (msgError) throw msgError;

    // Fetch sender profiles separately
    const senderIds = [...new Set((messages || []).map(m => m.sender_userid))];
    const { data: profiles } = await supabase
      .from('peer_profiles')
      .select('userid, display_name')
      .in('userid', senderIds);

    const profileMap = {};
    (profiles || []).forEach(p => {
      profileMap[p.userid] = p;
    });

    // Enrich messages with sender info
    const enrichedMessages = (messages || []).map(msg => ({
      ...msg,
      sender_profile: profileMap[msg.sender_userid] || { display_name: 'Unknown' }
    }));

    // Mark messages as read for this user
    await supabase
      .from('peer_messages')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('connection_id', connectionId)
      .eq('receiver_userid', userId)
      .eq('is_read', false);

    logger.info('[Messages] Fetched messages', {
      connectionId,
      count: enrichedMessages.length
    });

    return enrichedMessages;
  } catch (error) {
    logger.error('[Messages] Error fetching messages', {
      connectionId,
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Send a message
 * @param {string} connectionId - Connection ID
 * @param {string} senderId - Sender user ID
 * @param {string} messageText - Message content
 * @returns {Object} Sent message
 */
export async function sendMessage(connectionId, senderId, messageText) {
  try {
    logger.info('[Messages] Sending message', { connectionId, senderId });

    // Verify connection is accepted and get receiver
    const { data: connection, error: connError } = await supabase
      .from('peer_connections')
      .select('sender_userid, receiver_userid, status')
      .eq('id', connectionId)
      .eq('status', 'accepted')
      .single();

    if (connError || !connection) {
      throw new Error('Connection not found or not accepted');
    }

    // Determine receiver
    const receiverId = connection.sender_userid === senderId
      ? connection.receiver_userid
      : connection.receiver_userid === senderId
        ? connection.sender_userid
        : null;

    if (!receiverId) {
      throw new Error('You are not part of this connection');
    }

    // Insert message
    const { data: message, error: msgError } = await supabase
      .from('peer_messages')
      .insert({
        connection_id: connectionId,
        sender_userid: senderId,
        receiver_userid: receiverId,
        message_text: messageText
      })
      .select('*')
      .single();

    if (msgError) throw msgError;

    // Fetch sender profile
    const { data: profile } = await supabase
      .from('peer_profiles')
      .select('userid, display_name')
      .eq('userid', senderId)
      .single();

    // Enrich message with sender info
    const enrichedMessage = {
      ...message,
      sender_profile: profile || { display_name: 'Unknown' }
    };

    logger.info('[Messages] Message sent', { messageId: message.id });

    return enrichedMessage;
  } catch (error) {
    logger.error('[Messages] Error sending message', {
      connectionId,
      senderId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get unread message count for user
 * @param {string} userId - User ID
 * @returns {number} Unread count
 */
export async function getUnreadCount(userId) {
  try {
    const { data, error } = await supabase
      .from('peer_messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_userid', userId)
      .eq('is_read', false);

    if (error) throw error;

    return data || 0;
  } catch (error) {
    logger.error('[Messages] Error getting unread count', {
      userId,
      error: error.message
    });
    return 0;
  }
}
