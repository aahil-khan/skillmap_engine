import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { cors } from 'hono/cors';
import './types/hono.js'; // Import type declarations
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
import skillsRoutes from './routes/skills.js';
import leetcodeRoutes from './routes/leetcode.js';
import feedbackRoutes from './routes/feedback.js';
import connectionsRoutes from './routes/connections.js';
import messagesRoutes from './routes/messages.js';
import notificationsRoutes from './routes/notifications.js';

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
app.route('/skills', skillsRoutes);
app.route('/api/leetcode', leetcodeRoutes);
app.route('/api/feedback', feedbackRoutes);
app.route('/api/connections', connectionsRoutes);
app.route('/peer/matches/:candidateId', connectionsRoutes); // Swipe actions
app.route('/api/messages', messagesRoutes); // Message unread count
// Message sending/receiving is nested under connections
app.route('/api/connections', messagesRoutes); // Includes /:connectionId/messages
app.route('/api/notifications', notificationsRoutes);

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
  logger.error({  error  }, 'Failed to initialize infrastructure');
  process.exit(1);
});

const port = parseInt(process.env.PORT || '5005');
logger.info(`🚀 Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
