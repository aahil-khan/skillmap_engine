/**
 * LeetCode API Client
 * Interfaces with custom LeetCode API at https://leetcode-api.aahil-khan.tech
 * Implements rate limiting, caching, and retry logic
 */

import { redis, CacheKeys, CacheTTL, getJSON, setJSON } from '../../lib/cache/redis.js';
import logger from '../../utils/logger.js';

const LEETCODE_API_BASE = 'https://leetcode-api.aahil-khan.tech';
const RATE_LIMIT_DELAY = 500; // 500ms between requests
const MAX_RETRIES = 3;

let lastRequestTime = 0;

/**
 * Rate-limited fetch with retry logic
 */
async function rateLimitedFetch(url: string, retries = 0): Promise<any> {
  // Enforce rate limit
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise(resolve => 
      setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest)
    );
  }
  
  lastRequestTime = Date.now();
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      // Don't retry on 404 (user not found) or 400 (bad request)
      if (response.status === 404 || response.status === 400) {
        throw new Error(`LeetCode API error: ${response.status} - Resource not found`);
      }
      
      if (response.status === 429 && retries < MAX_RETRIES) {
        // Rate limited - exponential backoff
        const delay = 1000 * Math.pow(2, retries);
        logger.warn({  retries, delay  }, 'LeetCode API rate limited');
        await new Promise(resolve => setTimeout(resolve, delay));
        return rateLimitedFetch(url, retries + 1);
      }
      
      throw new Error(`LeetCode API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    const err = error as Error;
    
    // Don't retry on "Resource not found" errors
    if (err.message.includes('Resource not found')) {
      throw error;
    }
    
    if (retries < MAX_RETRIES) {
      logger.warn({  error: err.message, retries  }, 'LeetCode API request failed, retrying');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return rateLimitedFetch(url, retries + 1);
    }
    throw error;
  }
}

/**
 * Fetch LeetCode user profile
 */
export async function fetchProfile(username: string): Promise<any> {
  const cacheKey = CacheKeys.leetcodeProfile(username);
  const cached = await getJSON<any>(cacheKey);
  
  if (cached) {
    logger.debug({  username  }, 'LeetCode profile cache hit');
    return cached;
  }
  
  const url = `${LEETCODE_API_BASE}/${username}`;
  logger.info({  username, url  }, 'Fetching LeetCode profile');
  const data = await rateLimitedFetch(url);
  logger.info({  
    username, 
    dataType: typeof data,
    keys: Object.keys(data),
    hasUsername: !!data.username,
    usernameValue: data.username,
    hasRanking: !!data.ranking
   }, 'LeetCode profile fetched successfully');
  
  // Cache for 24 hours
  await setJSON(cacheKey, data, CacheTTL.LEETCODE);
  
  return data;
}

/**
 * Fetch LeetCode user stats
 */
export async function fetchStats(username: string): Promise<any> {
  const cacheKey = CacheKeys.leetcodeStats(username);
  const cached = await getJSON<any>(cacheKey);
  
  if (cached) {
    logger.debug({  username  }, 'LeetCode stats cache hit');
    return cached;
  }
  
  const url = `${LEETCODE_API_BASE}/${username}/solved`;
  logger.info({  username, url  }, 'Fetching LeetCode stats');
  const data = await rateLimitedFetch(url);
  logger.info({  
    username,
    solvedProblem: data.solvedProblem,
    easy: data.easySolved,
    medium: data.mediumSolved,
    hard: data.hardSolved
   }, 'LeetCode stats fetched successfully');
  
  // Cache for 24 hours
  await setJSON(cacheKey, data, CacheTTL.LEETCODE);
  
  return data;
}

/**
 * Fetch recent submissions
 */
export async function fetchSubmissions(username: string, limit = 20): Promise<any[]> {
  const cacheKey = CacheKeys.leetcodeSubmissions(username, limit);
  const cached = await getJSON<any[]>(cacheKey);
  
  if (cached) {
    logger.debug({  username, limit  }, 'LeetCode submissions cache hit');
    return cached;
  }
  
  const url = `${LEETCODE_API_BASE}/${username}/submission?limit=${limit}`;
  logger.info({  username, url, limit  }, 'Fetching LeetCode submissions');
  const data = await rateLimitedFetch(url);
  
  const submissions = data.submission || [];
  logger.info({  
    username,
    count: submissions.length,
    hasData: !!data.submission
   }, 'LeetCode submissions fetched successfully');
  
  // Cache for 6 hours (more dynamic data)
  await setJSON(cacheKey, submissions, CacheTTL.LEETCODE / 4);
  
  return submissions;
}

/**
 * Fetch skill statistics (advanced, intermediate, fundamental topics)
 * Note: This endpoint may not be available on all LeetCode API implementations
 */
export async function fetchSkillStats(username: string): Promise<any> {
  const cacheKey = CacheKeys.leetcodeSkillStats(username);
  const cached = await getJSON<any>(cacheKey);
  
  if (cached) {
    logger.debug({  username  }, 'LeetCode skill stats cache hit');
    return cached;
  }
  
  try {
    const url = `${LEETCODE_API_BASE}/${username}/skillStats`;
    const data = await rateLimitedFetch(url);
    
    // Cache for 24 hours
    await setJSON(cacheKey, data, CacheTTL.LEETCODE);
    
    logger.info({  username  }, 'LeetCode skill stats fetched');
    return data;
  } catch (error) {
    const err = error as Error;
    // If endpoint doesn't exist (404), return empty structure
    if (err.message.includes('404') || err.message.includes('Resource not found')) {
      logger.warn({  username  }, 'Skill stats endpoint not available');
      return { advanced: [], intermediate: [], fundamental: [] };
    }
    throw error;
  }
}

/**
 * Fetch user activity calendar
 */
export async function fetchActivity(username: string): Promise<any> {
  const cacheKey = CacheKeys.leetcodeActivity(username);
  const cached = await getJSON<any>(cacheKey);
  
  if (cached) {
    logger.debug({  username  }, 'LeetCode activity cache hit');
    return cached;
  }
  
  const url = `${LEETCODE_API_BASE}/${username}/calendar`;
  const data = await rateLimitedFetch(url);
  
  // Cache for 24 hours
  await setJSON(cacheKey, data, CacheTTL.LEETCODE);
  
  logger.info({  username  }, 'LeetCode activity fetched');
  return data;
}

/**
 * Fetch problem details by slug
 */
export async function fetchProblemDetails(titleSlug: string): Promise<any> {
  const cacheKey = CacheKeys.leetcodeProblem(titleSlug);
  const cached = await getJSON<any>(cacheKey);
  
  if (cached) {
    logger.debug({  titleSlug  }, 'LeetCode problem details cache hit');
    return cached;
  }
  
  const url = `${LEETCODE_API_BASE}/select?titleSlug=${titleSlug}`;
  const data = await rateLimitedFetch(url);
  
  // Cache for 30 days (problem data rarely changes)
  await setJSON(cacheKey, data, CacheTTL.LEETCODE * 30);
  
  logger.debug({  titleSlug  }, 'LeetCode problem details fetched');
  return data;
}

/**
 * Clear all LeetCode cache for a user (force fresh data)
 */
export async function clearUserCache(username: string): Promise<void> {
  const keys = [
    CacheKeys.leetcodeProfile(username),
    CacheKeys.leetcodeStats(username),
    CacheKeys.leetcodeSkillStats(username),
    CacheKeys.leetcodeActivity(username),
  ];
  
  // Clear submissions cache for various limits
  for (const limit of [10, 20, 50]) {
    keys.push(CacheKeys.leetcodeSubmissions(username, limit));
  }
  
  await Promise.all(keys.map(key => redis.del(key)));
  
  logger.info({  username  }, 'LeetCode cache cleared');
}
