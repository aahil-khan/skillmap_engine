/**
 * LeetCode Pattern Analyzer
 * Analyzes user's problem-solving patterns using LLM
 * Identifies strengths, weaknesses, and provides recommendations
 */

import Instructor from '@instructor-ai/instructor';
import { z } from 'zod';
import { openai, MODELS } from '../../lib/llm/openai.js';
import logger from '../../utils/logger.js';
import {
  fetchSubmissions,
  fetchSkillStats,
  fetchActivity,
  fetchProblemDetails,
} from './apiClient.js';

// Zod schema for structured LLM output
const PatternAnalysisSchema = z.object({
  strength_patterns: z.array(
    z.object({
      pattern: z.string().describe('Problem pattern/topic (e.g., Dynamic Programming, Binary Search)'),
      proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
      evidence: z.string().describe('Why this is a strength (e.g., "Solved 45 DP problems with 85% acceptance")'),
      problem_count: z.number().describe('Number of problems solved in this pattern'),
    })
  ),
  weak_patterns: z.array(
    z.object({
      pattern: z.string().describe('Problem pattern/topic that needs improvement'),
      proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
      evidence: z.string().describe('Why this is a weakness (e.g., "Only 3 Graph problems attempted")'),
      recommended_problems: z.array(z.string()).optional().describe('Specific LeetCode problem IDs or names to practice'),
    })
  ),
  comfort_level: z.enum(['Easy', 'Medium', 'Hard']).describe('Highest difficulty level where user is comfortable'),
  consistency_score: z.number().min(0).max(100).describe('Score based on streak and active days (0-100)'),
  growth_trend: z.enum(['improving', 'plateau', 'declining']).describe('Recent problem-solving trajectory'),
  recommended_focus: z.array(z.string()).describe('Top 3-5 topics user should focus on next'),
});

type PatternAnalysis = z.infer<typeof PatternAnalysisSchema>;

const instructor = Instructor({
  client: openai,
  mode: 'TOOLS',
});

/**
 * Analyze LeetCode problem-solving patterns for a user
 */
export async function analyzePatterns(
  username: string,
  profileData: any
): Promise<PatternAnalysis> {
  try {
    logger.info({  
      username,
      totalSolved: profileData.totalSolved,
      easy: profileData.easySolved,
      medium: profileData.mediumSolved,
      hard: profileData.hardSolved
     }, 'Starting LeetCode pattern analysis');
    
    // 1. Fetch comprehensive data (make skillStats optional)
    const [submissions, skillStatsResult, activity] = await Promise.all([
      fetchSubmissions(username, 20),
      fetchSkillStats(username).catch(err => {
        logger.warn({  error: err.message  }, 'Skill stats API unavailable, will analyze from submissions only');
        return null;
      }),
      fetchActivity(username).catch(err => {
        logger.warn({  error: err.message  }, 'Activity API unavailable, will use default values');
        return null;
      }),
    ]);
    
    logger.info({ 
      username,
      submissionsCount: submissions.length,
      hasSkillStats: !!skillStatsResult,
      hasActivity: !!activity
     }, 'Data sources fetched for pattern analysis');
    
    if (!submissions || submissions.length === 0) {
      throw new Error('No submission history found');
    }
    
    const skillStats = skillStatsResult || { advanced: [], intermediate: [], fundamental: [] };
    
    // 2. Batch fetch problem details for recent accepted submissions
    const acceptedSubmissions = submissions
      .filter((sub: any) => sub.statusDisplay === 'Accepted')
      .slice(0, 15); // Limit to 15 for performance
    
    const problemDetails = await Promise.all(
      acceptedSubmissions.map((sub: any) =>
        fetchProblemDetails(sub.titleSlug).catch(() => null)
      )
    );
    
    const validProblems = problemDetails.filter(p => p !== null);
    
    // 3. Build skill categorization from API
    const { advanced = [], intermediate = [], fundamental = [] } = skillStats;
    
    // 4. Build context for LLM
    const strengthsText = advanced
      .map((t: any) => `${t.tagName}: ${t.problemsSolved} solved (Advanced)`)
      .join(', ');
    
    const intermediateText = intermediate
      .map((t: any) => `${t.tagName}: ${t.problemsSolved} solved (Intermediate)`)
      .join(', ');
    
    const fundamentalText = fundamental
      .slice(0, 10) // Top 10 fundamental
      .map((t: any) => `${t.tagName}: ${t.problemsSolved} solved (Fundamental)`)
      .join(', ');
    
    const problemSummary = validProblems
      .map(p => {
        const tags = p.topicTags?.map((t: any) => t.name).join(', ') || 'No tags';
        return `- ${p.questionTitle} (${p.difficulty}) [${tags}]`;
      })
      .join('\n');
    
    // 5. Parse calendar for consistency
    let streak = 0;
    let totalActiveDays = 0;
    if (activity) {
      streak = activity.streak || 0;
      try {
        const submissionCalendar = JSON.parse(activity.submissionCalendar || '{}');
        totalActiveDays = Object.keys(submissionCalendar).length;
      } catch (err) {
        logger.warn({  error: err  }, 'Failed to parse submission calendar');
        // Estimate from submission count
        totalActiveDays = Math.min(submissions.length, profileData.totalSolved || 0);
      }
    } else {
      // No activity data - estimate from submissions
      totalActiveDays = Math.min(submissions.length, profileData.totalSolved || 0);
    }
    
    const contextText = `
User: ${username}
Total Solved: ${profileData.totalSolved} (Easy: ${profileData.easySolved}, Medium: ${profileData.mediumSolved}, Hard: ${profileData.hardSolved})
Acceptance Rate: ${profileData.acceptanceRate}%
Streak: ${streak} days | Total Active Days: ${totalActiveDays}

**Advanced Skills (Expert Level):**
${strengthsText || 'None'}

**Intermediate Skills:**
${intermediateText || 'None'}

**Fundamental Skills:**
${fundamentalText}

**Recent Accepted Problems (with tags):**
${problemSummary}
    `.trim();
    
    // 6. Analyze with LLM (deterministic)
    const analysis = await instructor.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are an expert coding interview coach analyzing LeetCode problem-solving patterns. 

ANALYSIS RULES:
- STRENGTHS: Topics in "Advanced Skills" with high counts = Expert/Advanced proficiency
- WEAKNESSES: Fundamental topics with <10 solves = Critical gaps, Topics never attempted = Avoided patterns
- COMFORT LEVEL: Based on Easy/Medium/Hard distribution (>50% Hard solved = Hard comfort)
- CONSISTENCY: Based on streak and active days (high streak + many active days = high score)
- GROWTH: Compare recent problem difficulty to overall stats (more Hard problems recently = improving)

Provide actionable, specific recommendations (e.g., "Practice LeetCode #200, #207, #210 for Graph patterns").`,
        },
        {
          role: 'user',
          content: contextText,
        },
      ],
      model: MODELS.STRUCTURED_OUTPUT,
      temperature: 0, // Deterministic
      seed: 42,
      response_model: {
        schema: PatternAnalysisSchema,
        name: 'PatternAnalysis',
      },
      max_retries: 2,
    });
    
    logger.info({ 
      username,
      problems: validProblems.length,
      strengths: analysis.strength_patterns.length,
      weaknesses: analysis.weak_patterns.length,
     }, 'Pattern analysis complete');
    
    return analysis;
  } catch (error) {
    const err = error as Error;
    logger.error({  error: err.message, username  }, 'Pattern analysis failed');
    throw error;
  }
}
