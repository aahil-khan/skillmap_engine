import { Hono } from 'hono';
import '../types/hono.js'; // Type declarations for Hono context
import { authenticate } from '../middleware/auth.js';
import { extractSkillsFromJobDescriptions } from '../services/jobs/scraper.js';
import { analyzeSkillFrequencies, cacheJobMarketSkills, clearJobMarketCache } from '../services/jobs/aggregator.js';
import { generateTaxonomyBasedFrequencies } from '../services/jobs/taxonomyFallback.js';
import { CacheKeys, getJSON } from '../lib/cache/redis.js';
import { ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const app = new Hono();

/**
 * POST /api/jobs/analyze
 * Analyze skills from user-pasted job descriptions OR use taxonomy fallback
 */
app.post('/analyze', authenticate, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { jobDescriptions, goalId, targetRole } = body;
  
  if (!goalId) {
    throw new ValidationError('goalId is required');
  }
  
  // Check cache first
  const cacheKey = CacheKeys.jobSkills(userId, goalId);
  const cached = await getJSON<{ frequencies: any; totalJobs: number; source: string }>(cacheKey);
  
  if (cached) {
    logger.info({  userId, goalId  }, 'Returning cached job market data');
    return c.json({
      skills: cached.frequencies,
      totalJobs: cached.totalJobs,
      source: cached.source,
      cached: true,
    });
  }
  
  let frequencies;
  let totalJobs;
  let source: 'jobs' | 'taxonomy';
  
  // User provided job descriptions
  if (jobDescriptions && Array.isArray(jobDescriptions) && jobDescriptions.length > 0) {
    logger.info({  userId, goalId, jobCount: jobDescriptions.length  }, 'Analyzing user-provided jobs');
    
    const skills = await extractSkillsFromJobDescriptions(jobDescriptions);
    frequencies = await analyzeSkillFrequencies(skills, jobDescriptions.length);
    totalJobs = jobDescriptions.length;
    source = 'jobs';
  } 
  // Fallback to Phase 1 taxonomy
  else {
    logger.info({  userId, goalId, targetRole  }, 'Using taxonomy fallback');
    
    frequencies = generateTaxonomyBasedFrequencies(targetRole);
    totalJobs = frequencies.length;
    source = 'taxonomy';
  }
  
  // Cache result
  await cacheJobMarketSkills(userId, goalId, frequencies, totalJobs, source);
  
  return c.json({
    skills: frequencies,
    totalJobs,
    source,
    cached: false,
    message: source === 'taxonomy' 
      ? 'Using curated skill taxonomy. Paste job descriptions for personalized analysis.'
      : `Analyzed ${totalJobs} job description${totalJobs > 1 ? 's' : ''}`,
  });
});

/**
 * PUT /api/jobs/analyze
 * Update job market analysis with new job descriptions
 * Clears cache and re-analyzes
 */
app.put('/analyze', authenticate, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { jobDescriptions, goalId, targetRole } = body;
  
  if (!goalId) {
    throw new ValidationError('goalId is required');
  }
  
  logger.info({  userId, goalId  }, 'Updating job market analysis');
  
  // Clear existing cache
  await clearJobMarketCache(userId, goalId);
  
  // Re-analyze with new data
  let frequencies;
  let totalJobs;
  let source: 'jobs' | 'taxonomy';
  
  if (jobDescriptions && Array.isArray(jobDescriptions) && jobDescriptions.length > 0) {
    const skills = await extractSkillsFromJobDescriptions(jobDescriptions);
    frequencies = await analyzeSkillFrequencies(skills, jobDescriptions.length);
    totalJobs = jobDescriptions.length;
    source = 'jobs';
  } else {
    frequencies = generateTaxonomyBasedFrequencies(targetRole);
    totalJobs = frequencies.length;
    source = 'taxonomy';
  }
  
  // Cache updated result
  await cacheJobMarketSkills(userId, goalId, frequencies, totalJobs, source);
  
  return c.json({
    skills: frequencies,
    totalJobs,
    source,
    cached: false,
    updated: true,
    message: `Analysis updated with ${totalJobs} job${totalJobs > 1 ? 's' : ''}`,
  });
});

/**
 * DELETE /api/jobs/:goalId
 * Clear job market analysis cache for a specific goal
 */
app.delete('/:goalId', authenticate, async (c) => {
  const userId = c.get('userId');
  const goalId = c.req.param('goalId');
  
  if (!goalId) {
    throw new ValidationError('goalId is required');
  }
  
  logger.info({  userId, goalId  }, 'Clearing job market cache');
  
  await clearJobMarketCache(userId, goalId);
  
  return c.json({
    success: true,
    message: 'Job market analysis cleared. Run /analyze to generate new analysis.',
  });
});

export default app;
