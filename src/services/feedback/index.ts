import { supabase } from '../../lib/db/supabase.js';
import logger from '../../utils/logger.js';

export async function recordFeedback(
  userId: string,
  candidateId: string,
  feedbackType: 'like' | 'dislike' | 'skip' | 'connect',
  matchScore: number,
  scoringFactors: Record<string, number>
) {
  const { error } = await supabase
    .from('match_feedback')
    .upsert({
      user_id: userId,
      candidate_id: candidateId,
      feedback_type: feedbackType,
      match_score: matchScore,
      scoring_factors: scoringFactors,
    }, {
      onConflict: 'user_id,candidate_id'
    });
  
  if (error) {
    logger.error('Failed to record feedback', { error, userId, candidateId });
    throw error;
  }
  
  logger.info('Match feedback recorded', { userId, candidateId, feedbackType, matchScore });
}

export async function getFeedbackAnalytics(userId?: string) {
  let query = supabase
    .from('match_feedback')
    .select('feedback_type, match_score');
  
  if (userId) {
    query = query.eq('user_id', userId);
  }
  
  const { data, error } = await query;
  
  if (error) {
    logger.error('Failed to fetch feedback analytics', { error });
    return null;
  }
  
  if (!data || data.length === 0) {
    return {
      total_feedback: 0,
      likes: 0,
      dislikes: 0,
      skips: 0,
      like_rate: 0,
      conversion_by_score: [],
    };
  }
  
  // Calculate metrics
  const total = data.length;
  const likes = data.filter(f => f.feedback_type === 'like' || f.feedback_type === 'connect').length;
  const dislikes = data.filter(f => f.feedback_type === 'dislike').length;
  const skips = data.filter(f => f.feedback_type === 'skip').length;
  
  // Conversion rate by score buckets
  const scoreBuckets: Record<string, { likes: number; dislikes: number; total: number }> = {
    '90-100': { likes: 0, dislikes: 0, total: 0 },
    '80-89': { likes: 0, dislikes: 0, total: 0 },
    '70-79': { likes: 0, dislikes: 0, total: 0 },
    '<70': { likes: 0, dislikes: 0, total: 0 },
  };
  
  for (const feedback of data) {
    const score = feedback.match_score;
    const bucket = score >= 90 ? '90-100' : 
                   score >= 80 ? '80-89' : 
                   score >= 70 ? '70-79' : '<70';
    
    scoreBuckets[bucket].total++;
    if (feedback.feedback_type === 'like' || feedback.feedback_type === 'connect') {
      scoreBuckets[bucket].likes++;
    } else if (feedback.feedback_type === 'dislike') {
      scoreBuckets[bucket].dislikes++;
    }
  }
  
  // Calculate conversion rates
  const conversionRates = Object.entries(scoreBuckets).map(([bucket, stats]) => ({
    score_range: bucket,
    conversion_rate: stats.total > 0 ? parseFloat(((stats.likes / stats.total) * 100).toFixed(2)) : 0,
    total_matches: stats.total,
  }));
  
  return {
    total_feedback: total,
    likes,
    dislikes,
    skips,
    like_rate: total > 0 ? parseFloat(((likes / total) * 100).toFixed(2)) : 0,
    conversion_by_score: conversionRates,
  };
}
