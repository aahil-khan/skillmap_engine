/**
 * LeetCode Integration Routes
 * Endpoints for syncing LeetCode profiles and analyzing patterns
 */

import { Hono } from 'hono';
import '../types/hono.js'; // Type declarations for Hono context
import { authenticate } from '../middleware/auth.js';
import {
  fetchLeetCodeProfile,
  saveLeetCodeProfile,
  shouldResync,
  getLeetCodeProfileFromDB,
  savePatternAnalysis,
} from '../services/leetcode/fetcher.js';
import { analyzePatterns } from '../services/leetcode/patternAnalyzer.js';
import {
  generateLeetCodeEmbedding,
  findSimilarLeetCodeUsers,
} from '../services/leetcode/embedder.js';
import { clearUserCache } from '../services/leetcode/apiClient.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const app = new Hono();

/**
 * Helper: Full sync process (profile + pattern analysis + embedding)
 */
async function performFullSync(userId: string, username: string) {
  try {
    // 1. Fetch profile from LeetCode API
    const profileData = await fetchLeetCodeProfile(username);
    logger.info({  userId, username  }, 'Profile fetched, starting pattern analysis');
    
    // 2. Analyze patterns (pass profile for context)
    const patternAnalysis = await analyzePatterns(username, profileData);
    logger.info({  userId, username  }, 'Pattern analysis complete, saving to database');
    
    // 3. Save to Supabase
    await saveLeetCodeProfile(userId, profileData);
    logger.info({  userId, username  }, 'Profile saved, saving pattern analysis');
    
    // 4. Update pattern analysis in DB
    await savePatternAnalysis(userId, patternAnalysis);
    logger.info({  userId, username  }, 'Pattern analysis saved, generating embeddings');
    
    // 5. Generate embedding (async, non-blocking for response)
    generateLeetCodeEmbedding(userId, patternAnalysis).catch(err =>
      logger.error({  userId, error: err.message  }, 'Embedding generation failed')
    );
    
    return { profileData, patternAnalysis };
  } catch (error) {
    logger.error({  
      userId, 
      username, 
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.constructor.name : 'Unknown',
      errorDetails: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      stack: error instanceof Error ? error.stack : undefined
     }, 'Full sync failed');
    throw error;
  }
}

/**
 * GET /api/leetcode/profile
 * Get user's LeetCode profile (smart sync: only re-fetch if >24h old)
 */
app.get('/profile', authenticate, async (c) => {
  const userId = c.get('userId');
  
  logger.info({  userId  }, 'Fetching LeetCode profile');
  
  // Check if profile exists and needs re-sync
  const existingProfile = await getLeetCodeProfileFromDB(userId);
  
  if (!existingProfile) {
    throw new NotFoundError(
      'LeetCode profile not found. Please sync your profile first using POST /api/leetcode/sync'
    );
  }
  
  // Check if re-sync needed
  const needsResync = await shouldResync(userId);
  
  if (needsResync) {
    logger.info({  userId  }, 'Profile outdated, triggering background re-sync');
    // Async re-sync in background
    performFullSync(userId, existingProfile.leetcode_username).catch(err =>
      logger.error({ 
        userId,
        error: err.message,
       }, 'Background re-sync failed')
    );
  }
  
  return c.json({
    profile: existingProfile.profile_data || {
      username: existingProfile.leetcode_username,
      totalSolved: existingProfile.total_solved,
      easySolved: existingProfile.easy_solved,
      mediumSolved: existingProfile.medium_solved,
      hardSolved: existingProfile.hard_solved,
      ranking: existingProfile.ranking,
      acceptanceRate: existingProfile.acceptance_rate,
    },
    patterns: existingProfile.pattern_analysis,
    lastSynced: existingProfile.last_synced_at,
    needsResync,
  });
});

/**
 * POST /api/leetcode/sync
 * Manual sync (user clicks "Sync Now" or first-time setup)
 */
app.post('/sync', authenticate, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { username, force } = body;
  
  if (!username) {
    throw new ValidationError('LeetCode username is required');
  }
  
  logger.info({  userId, username, force  }, 'Manual LeetCode sync requested');
  
  // Clear cache if force=true
  if (force) {
    await clearUserCache(username);
  }
  
  // Perform full sync
  const { profileData, patternAnalysis } = await performFullSync(
    userId,
    username
  );
  
  return c.json({
    profile: profileData,
    patterns: patternAnalysis,
    message: 'LeetCode profile synced successfully',
    synced_at: new Date().toISOString(),
  });
});

/**
 * POST /api/leetcode/analyze
 * Re-analyze patterns without re-fetching profile (useful after new submissions)
 */
app.post('/analyze', authenticate, async (c) => {
  const userId = c.get('userId');
  
  logger.info({  userId  }, 'Re-analyzing LeetCode patterns');
  
  // Get existing profile
  const existingProfile = await getLeetCodeProfileFromDB(userId);
  
  if (!existingProfile) {
    throw new NotFoundError(
      'LeetCode profile not found. Please sync your profile first'
    );
  }
  
  const username = existingProfile.leetcode_username;
  
  // Clear cache to get fresh submission data
  await clearUserCache(username);
  
  // Re-analyze patterns
  const patternAnalysis = await analyzePatterns(
    username,
    existingProfile.profile_data
  );
  
  // Save updated analysis
  await savePatternAnalysis(userId, patternAnalysis);
  
  // Regenerate embedding
  generateLeetCodeEmbedding(userId, patternAnalysis).catch(err =>
    logger.error({  userId, error: err.message  }, 'Embedding generation failed')
  );
  
  return c.json({
    patterns: patternAnalysis,
    message: 'Pattern analysis updated successfully',
    analyzed_at: new Date().toISOString(),
  });
});

/**
 * GET /api/leetcode/study-partners
 * Find LeetCode users with complementary skills (my weaknesses = their strengths)
 */
app.get('/study-partners', authenticate, async (c) => {
  const userId = c.get('userId');
  const limit = parseInt(c.req.query('limit') || '10');
  
  logger.info({  userId, limit  }, 'Finding LeetCode study partners');
  
  // Check if user has pattern analysis
  const existingProfile = await getLeetCodeProfileFromDB(userId);
  
  if (!existingProfile || !existingProfile.pattern_analysis) {
    throw new NotFoundError(
      'Pattern analysis not found. Please sync your LeetCode profile first'
    );
  }
  
  // Find similar users
  const matches = await findSimilarLeetCodeUsers(userId, limit);
  
  return c.json({
    matches,
    count: matches.length,
    message:
      matches.length > 0
        ? 'Found study partners with complementary skills'
        : 'No study partners found yet',
  });
});

export default app;
