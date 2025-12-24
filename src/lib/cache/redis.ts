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
  leetcodeProfile: (username: string) => `leetcode:${username}`,
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
  return data ? (data as T) : null;
}

// Helper: Set with JSON stringify
export async function setJSON<T>(key: string, value: T, ttl?: number): Promise<void> {
  if (ttl) {
    await redis.set(key, JSON.stringify(value), { ex: ttl });
  } else {
    await redis.set(key, JSON.stringify(value));
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
