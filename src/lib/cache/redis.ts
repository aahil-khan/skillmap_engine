import { Redis } from '@upstash/redis';
import logger from '../../utils/logger.js';

if (!process.env.REDIS_URL || !process.env.REDIS_TOKEN) {
  throw new Error('Missing Redis credentials');
}

export const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN,
});

// Cache key generators
export const CacheKeys = {
  resumeParsed: (hash: string) => `resume:parsed:${hash}`,
  matchCandidates: (userId: string) => `match:candidates:${userId}`,
  userProfile: (userId: string) => `profile:${userId}`,
  skillNormalization: (skillName: string) => `skill:norm:${skillName}`,
  
  // LeetCode cache keys
  leetcodeProfile: (username: string) => `leetcode:profile:${username}`,
  leetcodeStats: (username: string) => `leetcode:stats:${username}`,
  leetcodeSubmissions: (username: string, limit: number) => `leetcode:submissions:${username}:${limit}`,
  leetcodeSkillStats: (username: string) => `leetcode:skillStats:${username}`,
  leetcodeActivity: (username: string) => `leetcode:activity:${username}`,
  leetcodeProblem: (titleSlug: string) => `leetcode:problem:${titleSlug}`,
  
  // Job market cache
  jobSkills: (userId: string, goalId: string) => `jobs:skills:${userId}:${goalId}`,
} as const;

// TTL constants (in seconds)
export const CacheTTL = {
  RESUME: 30 * 24 * 60 * 60, // 30 days
  MATCHES: 15 * 60, // 15 minutes
  SKILL: 7 * 24 * 60 * 60, // 7 days
  LEETCODE: 24 * 60 * 60, // 24 hours
  PROFILE: 15 * 60, // 15 minutes
  JOB_MARKET: 7 * 24 * 60 * 60, // 7 days
} as const;

// Helper: Get with JSON parse
export async function getJSON<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  if (!data) return null;

  // Upstash may return a string; normalize to object
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as T;
    } catch (err) {
      logger.warn('Failed to parse cached JSON', { key, error: (err as Error).message });
      // @ts-expect-error allow string fallback if parsing fails
      return data as T;
    }
  }

  return data as T;
}

// Helper: Set with JSON stringify
export async function setJSON<T>(key: string, value: T, ttl?: number): Promise<void> {
  const payload = JSON.stringify(value);
  if (ttl) {
    await redis.set(key, payload, { ex: ttl });
  } else {
    await redis.set(key, payload);
  }
}

// Helper: Delete key
export async function deleteKey(key: string): Promise<void> {
  await redis.del(key);
  logger.debug('Redis key deleted', { key });
}

// Health check
export async function testRedisConnection(): Promise<boolean> {
  try {
    const result = await redis.ping();
    if (result === 'PONG') {
      logger.info('Redis connection healthy');
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Redis connection error', { error });
    return false;
  }
}
