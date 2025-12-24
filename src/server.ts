import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { cors } from 'hono/cors';
import logger from './utils/logger.js';
import { errorHandler } from './middleware/errors.js';
import { testSupabaseConnection } from './lib/db/supabase.js';
import { initQdrantCollections } from './lib/vector/qdrant.js';
import { testRedisConnection } from './lib/cache/redis.js';
import resumeRoutes from './routes/resume.js';
import testRoutes from './routes/test.js';
import profileRoutes from './routes/profile.js';
import matchingRoutes from './routes/matching.js';
import jobsRoutes from './routes/jobs.js';
import gapsRoutes from './routes/gaps.js';

const app = new Hono();

// Global middleware
app.use('*', honoLogger());
app.use('*', cors());

// Routes
app.route('/resume', resumeRoutes);
app.route('/test', testRoutes);
app.route('/profile', profileRoutes);
app.route('/peer/matches', matchingRoutes);
app.route('/api/jobs', jobsRoutes);
app.route('/api/gaps', gapsRoutes);

// Health check
app.get('/health', async (c) => {
  const [supabaseOk, redisOk] = await Promise.all([
    testSupabaseConnection(),
    testRedisConnection(),
  ]);

  const healthy = supabaseOk && redisOk;

  return c.json(
    {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        supabase: supabaseOk,
        redis: redisOk,
      },
    },
    healthy ? 200 : 503
  );
});

// Error handler (must be last)
app.onError(errorHandler);

// Initialize infrastructure on startup
async function initializeInfrastructure() {
  logger.info('Initializing infrastructure...');
  
  await testSupabaseConnection();
  await initQdrantCollections();
  await testRedisConnection();
  
  logger.info('✅ Infrastructure initialized');
}

initializeInfrastructure().catch((error) => {
  logger.error('Failed to initialize infrastructure', { error });
  process.exit(1);
});

const port = parseInt(process.env.PORT || '5005');
logger.info(`🚀 Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
