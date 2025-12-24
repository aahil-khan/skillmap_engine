import { Hono } from 'hono';
import '../types/hono.js'; // Type declarations for Hono context
import { authenticate } from '../middleware/auth.js';
import { recordFeedback, getFeedbackAnalytics } from '../services/feedback/index.js';
import { ValidationError } from '../utils/errors.js';

const app = new Hono();

// Record feedback on a match
app.post('/matches/:candidateId/feedback', authenticate, async (c) => {
  const userId = c.get('userId');
  const candidateId = c.req.param('candidateId');
  const body = await c.req.json();
  const { feedbackType, matchScore, scoringFactors } = body;
  
  if (!['like', 'dislike', 'skip', 'connect'].includes(feedbackType)) {
    throw new ValidationError('Invalid feedback type. Must be one of: like, dislike, skip, connect');
  }
  
  if (typeof matchScore !== 'number' || matchScore < 0 || matchScore > 100) {
    throw new ValidationError('matchScore must be a number between 0 and 100');
  }
  
  if (!scoringFactors || typeof scoringFactors !== 'object') {
    throw new ValidationError('scoringFactors must be an object');
  }
  
  await recordFeedback(userId, candidateId, feedbackType, matchScore, scoringFactors);
  
  return c.json({ 
    message: 'Feedback recorded successfully',
    feedback: {
      candidate_id: candidateId,
      type: feedbackType,
      score: matchScore,
    }
  });
});

// Get feedback analytics (for current user)
app.get('/analytics', authenticate, async (c) => {
  const userId = c.get('userId');
  const analytics = await getFeedbackAnalytics(userId);
  
  return c.json(analytics);
});

export default app;
