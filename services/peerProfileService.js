/**
 * Peer Profile Service
 * 
 * Manages peer profiles and connections for peer matching system
 */

import { supabase } from '../config/supabase.js';
import logger from '../utils/logger.js';
import { getTopMatches } from './peerMatchingService.js';

/**
 * Create or update peer profile
 * @param {string} userId - User ID
 * @param {Object} profileData - Profile data
 * @returns {Object} Created/updated profile
 */
export async function upsertPeerProfile(userId, profileData) {
  try {
    logger.info('[PeerProfile] Upserting peer profile', { userId });

    // Extract top skills for skill_tags (for faster matching)
    const skillTags = await getTopSkillsForUser(userId);

    // Determine interest areas based on skills and goals
    const interestAreas = await getInterestAreasForUser(userId);

    const profile = {
      userid: userId,
      display_name: profileData.display_name || profileData.name,
      title: profileData.title,
      bio: profileData.bio,
      avatar_url: profileData.avatar_url || null,
      location: profileData.location || null,
      timezone: profileData.timezone || null,
      experience_level: profileData.experience_level,
      availability: profileData.availability,
      looking_for: profileData.looking_for || [],
      github_url: profileData.github_url || null,
      linkedin_url: profileData.linkedin_url || null,
      portfolio_url: profileData.portfolio_url || null,
      is_active: profileData.is_active !== undefined ? profileData.is_active : true,
      is_open_to_connections: profileData.is_open_to_connections !== undefined ? profileData.is_open_to_connections : true,
      skill_tags: skillTags,
      interest_areas: interestAreas,
      last_active_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('peer_profiles')
      .upsert(profile, {
        onConflict: 'userid'
      })
      .select()
      .single();

    if (error) throw error;

    logger.info('[PeerProfile] Profile upserted successfully', { userId, profileId: data.id });

    return data;
  } catch (error) {
    logger.error('[PeerProfile] Error upserting profile', {
      userId,
      error: error.message
    });
    throw new Error(`Failed to create/update peer profile: ${error.message}`);
  }
}

/**
 * Get user's peer profile
 * @param {string} userId - User ID
 * @returns {Object|null} Peer profile
 */
export async function getPeerProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('peer_profiles')
      .select('*')
      .eq('userid', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No profile found
        return null;
      }
      throw error;
    }

    return data;
  } catch (error) {
    logger.error('[PeerProfile] Error getting profile', {
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get public peer profile (sanitized)
 * @param {string} peerUserId - Peer user ID
 * @returns {Object} Public profile
 */
export async function getPublicPeerProfile(peerUserId) {
  try {
    const { data, error } = await supabase
      .from('peer_profiles')
      .select(`
        id,
        display_name,
        title,
        bio,
        avatar_url,
        location,
        experience_level,
        availability,
        looking_for,
        github_url,
        linkedin_url,
        portfolio_url,
        skill_tags,
        interest_areas,
        is_active,
        is_open_to_connections,
        created_at
      `)
      .eq('userid', peerUserId)
      .eq('is_active', true)
      .single();

    if (error) throw error;

    // Fetch additional data for display
    const { data: skills } = await supabase
      .from('skills')
      .select('skill_name, skill_level, skill_category')
      .eq('userid', peerUserId)
      .limit(20);

    const { data: leetcode } = await supabase
      .from('leetcode_profiles')
      .select('total_solved, easy_solved, medium_solved, hard_solved')
      .eq('userid', peerUserId)
      .single();

    return {
      ...data,
      skills: skills || [],
      leetcode_stats: leetcode || null
    };
  } catch (error) {
    logger.error('[PeerProfile] Error getting public profile', {
      peerUserId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Deactivate peer profile
 * @param {string} userId - User ID
 * @returns {Object} Result
 */
export async function deactivatePeerProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('peer_profiles')
      .update({
        is_active: false,
        is_open_to_connections: false
      })
      .eq('userid', userId)
      .select()
      .single();

    if (error) throw error;

    logger.info('[PeerProfile] Profile deactivated', { userId });

    return { success: true, data };
  } catch (error) {
    logger.error('[PeerProfile] Error deactivating profile', {
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get recommended matches for user
 * @param {string} userId - User ID
 * @param {string} matchType - 'project', 'dsa', or 'both'
 * @param {number} limit - Max matches to return
 * @returns {Array} Recommended matches with full peer data
 */
export async function getRecommendedMatches(userId, matchType = 'both', limit = 20) {
  try {
    logger.info('[PeerProfile] Getting recommended matches', { userId, matchType, limit });

    // Get match scores
    const matches = await getTopMatches(userId, matchType, limit);

    if (!matches || matches.length === 0) {
      return [];
    }

    // Fetch full peer profiles for each match
    const enrichedMatches = await Promise.all(
      matches.map(async (match) => {
        try {
          const peerProfile = await getPublicPeerProfile(match.user2_id);
          return {
            match_score: match.overall_score,
            shared_skills: match.shared_skills,
            complementary_skills: match.complementary_skills,
            match_type: match.match_type,
            peer_profile: peerProfile
          };
        } catch (error) {
          logger.warn('[PeerProfile] Failed to fetch peer profile', {
            peerUserId: match.user2_id,
            error: error.message
          });
          return null;
        }
      })
    );

    // Filter out null results
    const validMatches = enrichedMatches.filter(m => m !== null);

    logger.info('[PeerProfile] Recommended matches retrieved', {
      userId,
      count: validMatches.length
    });

    return validMatches;
  } catch (error) {
    logger.error('[PeerProfile] Error getting recommended matches', {
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Send connection request
 * @param {string} senderId - Sender user ID
 * @param {string} receiverId - Receiver user ID
 * @param {string} connectionType - Type of connection
 * @param {string} message - Optional message
 * @returns {Object} Connection object
 */
export async function sendConnectionRequest(senderId, receiverId, connectionType, message = null) {
  try {
    logger.info('[PeerProfile] Sending connection request', {
      senderId,
      receiverId,
      connectionType
    });

    // Check if connection already exists
    const { data: existing } = await supabase
      .from('peer_connections')
      .select('id, status')
      .or(`and(sender_userid.eq.${senderId},receiver_userid.eq.${receiverId}),and(sender_userid.eq.${receiverId},receiver_userid.eq.${senderId})`)
      .single();

    if (existing) {
      throw new Error(`Connection already exists with status: ${existing.status}`);
    }

    // Create connection request
    const { data, error } = await supabase
      .from('peer_connections')
      .insert({
        sender_userid: senderId,
        receiver_userid: receiverId,
        connection_type: connectionType,
        sender_message: message,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    // Track interaction
    await trackInteraction(senderId, receiverId, 'connect', null);

    logger.info('[PeerProfile] Connection request sent', {
      connectionId: data.id,
      senderId,
      receiverId
    });

    return data;
  } catch (error) {
    logger.error('[PeerProfile] Error sending connection request', {
      senderId,
      receiverId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Respond to connection request
 * @param {string} connectionId - Connection ID
 * @param {string} receiverId - Receiver user ID (must match)
 * @param {string} response - 'accept' or 'decline'
 * @returns {Object} Updated connection
 */
export async function respondToConnection(connectionId, receiverId, response) {
  try {
    logger.info('[PeerProfile] Responding to connection', {
      connectionId,
      receiverId,
      response
    });

    // Verify receiver
    const { data: connection, error: fetchError } = await supabase
      .from('peer_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('receiver_userid', receiverId)
      .single();

    if (fetchError || !connection) {
      throw new Error('Connection not found or unauthorized');
    }

    if (connection.status !== 'pending') {
      throw new Error(`Connection already ${connection.status}`);
    }

    // Update status
    const newStatus = response === 'accept' ? 'accepted' : 'declined';
    const { data, error } = await supabase
      .from('peer_connections')
      .update({
        status: newStatus,
        responded_at: new Date().toISOString()
      })
      .eq('id', connectionId)
      .select()
      .single();

    if (error) throw error;

    logger.info('[PeerProfile] Connection response recorded', {
      connectionId,
      status: newStatus
    });

    return data;
  } catch (error) {
    logger.error('[PeerProfile] Error responding to connection', {
      connectionId,
      receiverId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get user's connections
 * @param {string} userId - User ID
 * @param {string} status - Filter by status (optional)
 * @returns {Array} Connections
 */
export async function getUserConnections(userId, status = null) {
  try {
    let query = supabase
      .from('peer_connections')
      .select(`
        *,
        sender_profile:peer_profiles!peer_connections_sender_userid_fkey(display_name, title, avatar_url),
        receiver_profile:peer_profiles!peer_connections_receiver_userid_fkey(display_name, title, avatar_url)
      `)
      .or(`sender_userid.eq.${userId},receiver_userid.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  } catch (error) {
    logger.error('[PeerProfile] Error getting connections', {
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Skip a peer (track interaction)
 * @param {string} userId - User ID
 * @param {string} peerUserId - Peer user ID
 * @param {number} matchScore - Match score at time of skip
 * @returns {Object} Result
 */
export async function skipPeer(userId, peerUserId, matchScore) {
  try {
    await trackInteraction(userId, peerUserId, 'skip', matchScore);
    logger.info('[PeerProfile] Peer skipped', { userId, peerUserId, matchScore });
    return { success: true };
  } catch (error) {
    logger.error('[PeerProfile] Error skipping peer', {
      userId,
      peerUserId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Track user interaction for algorithm learning
 * @param {string} userId - User ID
 * @param {string} peerUserId - Peer user ID
 * @param {string} action - Action type
 * @param {number} matchScore - Match score
 */
async function trackInteraction(userId, peerUserId, action, matchScore = null) {
  try {
    await supabase
      .from('peer_interactions')
      .insert({
        userid: userId,
        peer_userid: peerUserId,
        action,
        match_score: matchScore
      });
  } catch (error) {
    logger.warn('[PeerProfile] Error tracking interaction', {
      userId,
      peerUserId,
      action,
      error: error.message
    });
    // Don't throw - tracking is not critical
  }
}

/**
 * Get top skills for user (for skill_tags)
 * @param {string} userId - User ID
 * @returns {Array} Top skills
 */
async function getTopSkillsForUser(userId) {
  try {
    const { data } = await supabase
      .from('skills')
      .select('skill_name, skill_level')
      .eq('userid', userId)
      .order('skill_level', { ascending: false })
      .limit(10);

    return data ? data.map(s => s.skill_name) : [];
  } catch (error) {
    logger.warn('[PeerProfile] Error getting top skills', { userId, error: error.message });
    return [];
  }
}

/**
 * Get interest areas for user based on skills and goals
 * @param {string} userId - User ID
 * @returns {Array} Interest areas
 */
async function getInterestAreasForUser(userId) {
  try {
    const { data: skills } = await supabase
      .from('skills')
      .select('skill_category')
      .eq('userid', userId);

    const { data: goals } = await supabase
      .from('learning_goals')
      .select('goal_category')
      .eq('userid', userId)
      .eq('status', 'active');

    const areas = new Set();

    // Map skill categories to interest areas
    if (skills) {
      skills.forEach(skill => {
        if (skill.skill_category) {
          areas.add(skill.skill_category);
        }
      });
    }

    // Map goal categories to interest areas
    if (goals) {
      goals.forEach(goal => {
        if (goal.goal_category) {
          areas.add(goal.goal_category);
        }
      });
    }

    return Array.from(areas);
  } catch (error) {
    logger.warn('[PeerProfile] Error getting interest areas', { userId, error: error.message });
    return [];
  }
}
