import { supabase } from '../../lib/db/supabase.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import { CacheKeys, redis } from '../../lib/cache/redis.js';
import { notifyConnectionRequest, notifyConnectionAccepted } from '../notifications/index.js';

export type ConnectionType = 'mentorship' | 'project_partner' | 'study_partner' | 'general';
export type ConnectionStatus = 'pending' | 'accepted' | 'rejected' | 'blocked';

export interface Connection {
  id: string;
  sender_id: string;
  receiver_id: string;
  connection_type: ConnectionType;
  status: ConnectionStatus;
  sender_message?: string;
  created_at: string;
  responded_at?: string;
}

export interface ConnectionWithProfile extends Connection {
  peer: {
    user_id: string;
    display_name: string;
    bio?: string;
    avatar_url?: string;
    experience_level?: string;
    skills?: Array<{ canonical_name: string; skill_level: string }>;
  };
}

/**
 * Send a connection request (swipe right / like action)
 */
export async function sendConnectionRequest(
  senderId: string,
  receiverId: string,
  connectionType: ConnectionType = 'general',
  matchScore?: number,
  message?: string
): Promise<Connection> {
  // Prevent self-connection
  if (senderId === receiverId) {
    throw new ValidationError('Cannot send connection request to yourself');
  }

  // Check if connection already exists (any status)
  const { data: existing } = await supabase
    .from('peer_connections')
    .select('id, status')
    .or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`)
    .single();

  if (existing) {
    if (existing.status === 'pending') {
      throw new ValidationError('Connection request already pending');
    }
    if (existing.status === 'accepted') {
      throw new ValidationError('Already connected');
    }
    // If rejected or blocked, allow resending
  }

  // Create new connection request
  const { data, error } = await supabase
    .from('peer_connections')
    .insert({
      sender_id: senderId,
      receiver_id: receiverId,
      connection_type: connectionType,
      status: 'pending',
      sender_message: message,
    })
    .select()
    .single();

  if (error) {
    logger.error({ error, senderId, receiverId }, 'Failed to create connection request');
    throw error;
  }

  // Invalidate match cache for both users
  await Promise.all([
    redis.del(CacheKeys.matchCandidates(senderId)),
    redis.del(CacheKeys.matchCandidates(receiverId)),
  ]).catch(err => logger.error({ err }, 'Failed to invalidate match cache'));

  // Send notification to receiver (non-blocking)
  const { data: senderProfile } = await supabase
    .from('user_profiles')
    .select('display_name')
    .eq('user_id', senderId)
    .single();
  
  if (senderProfile) {
    notifyConnectionRequest(receiverId, senderId, senderProfile.display_name, data.id)
      .catch(err => logger.error({ err }, 'Failed to send connection request notification'));
  }

  logger.info({ senderId, receiverId, connectionType }, 'Connection request sent');
  return data;
}

/**
 * Respond to a connection request (accept/reject)
 */
export async function respondToConnection(
  connectionId: string,
  userId: string,
  action: 'accept' | 'reject'
): Promise<Connection> {
  // Fetch connection to verify user is the receiver
  const { data: connection, error: fetchError } = await supabase
    .from('peer_connections')
    .select('*')
    .eq('id', connectionId)
    .single();

  if (fetchError || !connection) {
    throw new NotFoundError('Connection request not found');
  }

  // Verify user is the receiver
  if (connection.receiver_id !== userId) {
    throw new ValidationError('You can only respond to requests sent to you');
  }

  // Verify status is pending
  if (connection.status !== 'pending') {
    throw new ValidationError(`Cannot respond to connection with status: ${connection.status}`);
  }

  // Update status
  const newStatus = action === 'accept' ? 'accepted' : 'rejected';
  const { data, error } = await supabase
    .from('peer_connections')
    .update({
      status: newStatus,
      responded_at: new Date().toISOString(),
    })
    .eq('id', connectionId)
    .select()
    .single();

  if (error) {
    logger.error({ error, connectionId, action }, 'Failed to respond to connection');
    throw error;
  }

  // Invalidate match cache for both users
  await Promise.all([
    redis.del(CacheKeys.matchCandidates(connection.sender_id)),
    redis.del(CacheKeys.matchCandidates(connection.receiver_id)),
  ]).catch(err => logger.error({ err }, 'Failed to invalidate match cache'));

  // Send notification to sender if accepted (non-blocking)
  if (action === 'accept') {
    const { data: receiverProfile } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('user_id', userId)
      .single();
    
    if (receiverProfile) {
      notifyConnectionAccepted(connection.sender_id, userId, receiverProfile.display_name, connectionId)
        .catch(err => logger.error({ err }, 'Failed to send connection accepted notification'));
    }
  }

  logger.info({ connectionId, action, senderId: connection.sender_id, receiverId: userId }, 
    `Connection request ${action}ed`);
  
  return data;
}

/**
 * Get connections for a user
 */
export async function getConnections(
  userId: string,
  type?: 'received' | 'sent' | 'accepted'
): Promise<ConnectionWithProfile[]> {
  let query = supabase
    .from('peer_connections')
    .select('*');

  if (type === 'received') {
    query = query.eq('receiver_id', userId).eq('status', 'pending');
  } else if (type === 'sent') {
    query = query.eq('sender_id', userId).eq('status', 'pending');
  } else if (type === 'accepted') {
    query = query
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .eq('status', 'accepted');
  } else {
    // All connections (pending + accepted)
    query = query
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .in('status', ['pending', 'accepted']);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    logger.error({ error, userId, type }, 'Failed to fetch connections');
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Fetch user profiles for all connections
  const userIds = new Set<string>();
  data.forEach(conn => {
    userIds.add(conn.sender_id);
    userIds.add(conn.receiver_id);
  });

  const { data: profiles, error: profileError } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, bio, avatar_url, experience_level')
    .in('user_id', Array.from(userIds));

  if (profileError) {
    logger.error({ error: profileError }, 'Failed to fetch user profiles for connections');
    throw profileError;
  }

  const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

  // Transform to include peer info
  const connections: ConnectionWithProfile[] = data.map((conn: any) => {
    const isPeerSender = conn.sender_id === userId;
    const peerId = isPeerSender ? conn.receiver_id : conn.sender_id;
    const peerProfile = profileMap.get(peerId) || {
      user_id: peerId,
      display_name: 'Unknown User',
      bio: null,
      avatar_url: null,
      experience_level: null,
    };
    
    return {
      id: conn.id,
      sender_id: conn.sender_id,
      receiver_id: conn.receiver_id,
      connection_type: conn.connection_type,
      status: conn.status,
      sender_message: conn.sender_message,
      created_at: conn.created_at,
      responded_at: conn.responded_at,
      peer: {
        user_id: peerProfile.user_id,
        display_name: peerProfile.display_name,
        bio: peerProfile.bio,
        avatar_url: peerProfile.avatar_url,
        experience_level: peerProfile.experience_level,
      },
    };
  });

  return connections;
}

/**
 * Get a single connection
 */
export async function getConnection(connectionId: string, userId: string): Promise<ConnectionWithProfile> {
  const { data, error } = await supabase
    .from('peer_connections')
    .select('*')
    .eq('id', connectionId)
    .single();

  if (error || !data) {
    throw new NotFoundError('Connection not found');
  }

  // Verify user is part of this connection
  if (data.sender_id !== userId && data.receiver_id !== userId) {
    throw new ValidationError('You do not have access to this connection');
  }

  // Fetch peer profile
  const peerId = data.sender_id === userId ? data.receiver_id : data.sender_id;
  const { data: peerProfile, error: profileError } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, bio, avatar_url, experience_level')
    .eq('user_id', peerId)
    .single();

  if (profileError) {
    logger.error({ error: profileError, peerId }, 'Failed to fetch peer profile');
    throw profileError;
  }

  return {
    id: data.id,
    sender_id: data.sender_id,
    receiver_id: data.receiver_id,
    connection_type: data.connection_type,
    status: data.status,
    sender_message: data.sender_message,
    created_at: data.created_at,
    responded_at: data.responded_at,
    peer: {
      user_id: peerProfile.user_id,
      display_name: peerProfile.display_name,
      bio: peerProfile.bio,
      avatar_url: peerProfile.avatar_url,
      experience_level: peerProfile.experience_level,
    },
  };
}

/**
 * Cancel/delete a connection request (only sender can cancel pending)
 */
export async function deleteConnection(connectionId: string, userId: string): Promise<void> {
  const { data: connection, error: fetchError } = await supabase
    .from('peer_connections')
    .select('sender_id, status')
    .eq('id', connectionId)
    .single();

  if (fetchError || !connection) {
    logger.error({ error: fetchError, connectionId, userId }, 'Connection not found for deletion');
    throw new NotFoundError('Connection not found');
  }

  // Only sender can cancel pending requests
  if (connection.sender_id !== userId) {
    throw new ValidationError('Only the sender can cancel a connection request');
  }

  if (connection.status !== 'pending') {
    throw new ValidationError('Can only cancel pending connection requests');
  }

  const { error } = await supabase
    .from('peer_connections')
    .delete()
    .eq('id', connectionId);

  if (error) {
    logger.error({ error, connectionId }, 'Failed to delete connection');
    throw error;
  }

  // Invalidate match cache for sender (receiver will see in their matches again)
  await redis.del(CacheKeys.matchCandidates(userId))
    .catch(err => logger.error({ err }, 'Failed to invalidate match cache'));

  logger.info({ connectionId, userId }, 'Connection request cancelled');
}

/**
 * Check if user has any connection with candidate (for filtering matches)
 */
export async function hasConnectionWith(userId: string, candidateId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('peer_connections')
    .select('id')
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${candidateId}),and(sender_id.eq.${candidateId},receiver_id.eq.${userId})`)
    .in('status', ['pending', 'accepted'])
    .limit(1);

  if (error) {
    logger.error({ error, userId, candidateId }, 'Failed to check connection status');
    return false;
  }

  return (data?.length || 0) > 0;
}

/**
 * Check if candidate has sent a pending request to user
 */
export async function getPendingRequestFrom(userId: string, candidateId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('peer_connections')
    .select('id')
    .eq('sender_id', candidateId)
    .eq('receiver_id', userId)
    .eq('status', 'pending')
    .single();

  if (error || !data) {
    return null;
  }

  return data.id;
}
