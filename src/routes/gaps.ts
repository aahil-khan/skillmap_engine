import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import { analyzeGaps } from '../services/gaps/analyzer.js';
import { generateLearningPath } from '../services/gaps/pathGenerator.js';
import { supabase } from '../lib/db/supabase.js';
import { ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const app = new Hono();

/**
 * POST /api/gaps/analyze
 * Analyze skill gaps for a user's learning goal
 * Triggers async learning path generation
 */
app.post('/analyze', authenticate, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { goalId } = body;
  
  if (!goalId) {
    throw new ValidationError('goalId is required');
  }
  
  logger.info('Starting gap analysis', { userId, goalId });
  
  // Run gap analysis
  const { gaps, strengths, improvements } = await analyzeGaps(userId, goalId);
  
  // Generate learning path asynchronously (don't block response)
  generateLearningPath(userId, goalId, gaps, strengths).catch(err => {
    logger.error('Path generation failed (async)', { error: err.message, userId, goalId });
  });
  
  return c.json({
    goalId,
    analysis: {
      gaps: gaps.slice(0, 10), // Top 10 critical gaps
      strengths: strengths.slice(0, 5), // Top 5 strengths
      improvements: improvements.slice(0, 5), // Top 5 improvements
    },
    summary: generateSummary(gaps, strengths, improvements),
    message: 'Personalized learning path is being generated. Check /api/gaps/:goalId/path in a few seconds.',
  });
});

/**
 * GET /api/gaps/:goalId/path
 * Retrieve generated learning path for a goal
 */
app.get('/:goalId/path', authenticate, async (c) => {
  const userId = c.get('userId');
  const goalId = c.req.param('goalId');
  
  logger.info('Fetching learning path', { userId, goalId });
  
  // Fetch latest learning path
  const { data, error } = await supabase
    .from('learning_paths')
    .select('*')
    .eq('user_id', userId)
    .eq('goal_id', goalId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error || !data) {
    logger.warn('Learning path not found', { userId, goalId });
    return c.json(
      { 
        error: 'Learning path not found. Run POST /api/gaps/analyze first, then check back in a few seconds.' 
      }, 
      404
    );
  }
  
  logger.info('Learning path retrieved', { userId, goalId, pathId: data.id });
  
  return c.json({
    id: data.id,
    goalId: data.goal_id,
    path: data.path_data,
    version: data.version,
    createdAt: data.created_at,
  });
});

/**
 * POST /api/gaps/:goalId/regenerate
 * Regenerate learning path (e.g., after user adds new skills)
 */
app.post('/:goalId/regenerate', authenticate, async (c) => {
  const userId = c.get('userId');
  const goalId = c.req.param('goalId');
  
  logger.info('Regenerating learning path', { userId, goalId });
  
  // Re-analyze gaps
  const { gaps, strengths, improvements } = await analyzeGaps(userId, goalId);
  
  // Get current version number
  const { data: existing } = await supabase
    .from('learning_paths')
    .select('version')
    .eq('user_id', userId)
    .eq('goal_id', goalId)
    .order('version', { ascending: false })
    .limit(1)
    .single();
  
  const nextVersion = (existing?.version || 0) + 1;
  
  // Generate new path synchronously (user is explicitly requesting it)
  try {
    const path = await generateLearningPath(userId, goalId, gaps, strengths);
    
    return c.json({
      goalId,
      path: path.path_data || path,
      version: nextVersion,
      message: 'Learning path regenerated successfully',
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Path regeneration failed', { error: err.message, userId, goalId });
    throw error;
  }
});

/**
 * Generate human-readable summary of gap analysis
 */
function generateSummary(gaps: any[], strengths: any[], improvements: any[]): string {
  if (strengths.length === 0 && gaps.length === 0) {
    return 'Complete skill profile not available. Please ensure your skills are added to your profile.';
  }
  
  const topGaps = gaps.slice(0, 3).map(g => g.skill).join(', ');
  const topStrengths = strengths.slice(0, 2).map(s => s.skill).join(', ');
  
  let summary = '';
  
  if (topStrengths) {
    summary += `You're strong in ${topStrengths}. `;
  }
  
  if (topGaps) {
    summary += `To reach your goal, focus on learning: ${topGaps}. `;
  }
  
  if (improvements.length > 0) {
    summary += `${improvements.length} skill(s) need improvement. `;
  }
  
  const totalSkills = gaps.length + improvements.length;
  if (totalSkills > 0) {
    summary += `Personalized learning path covers ${totalSkills} skill(s) to master.`;
  }
  
  return summary.trim();
}

export default app;
