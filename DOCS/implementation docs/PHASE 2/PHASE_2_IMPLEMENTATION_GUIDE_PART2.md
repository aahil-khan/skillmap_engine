# Phase 2 Implementation Guide - Part 2
**Features 3-5, Testing, Acceptance Criteria**

---

## 6. FEATURE 3: LEETCODE PATTERN ANALYSIS

### Objective
Complete the 50% LeetCode implementation: pattern analysis, embeddings, dual matching modes (project-based + DSA-based).

### Prerequisites
- ✅ Custom LeetCode API endpoint: `https://leetcode-api.aahil-khan.tech`
- ✅ `leetcode_profiles` table created
- ✅ Qdrant `leetcode_patterns` collection exists
- ✅ Redis caching configured

### Architecture Note
**CRITICAL:** Do NOT modify old Express files (`services/leetcodeService.js`). All new code goes in `src/` with TypeScript/Hono.

### Tasks

#### 6.1 External API Client

Create `src/services/leetcode/apiClient.ts`:

```typescript
import { redis } from '../../lib/cache/redis.js';
import logger from '../../utils/logger.js';

const LEETCODE_API_BASE = 'https://leetcode-api.aahil-khan.tech';
const RATE_LIMIT_DELAY = 500; // 500ms between requests (assume 20 req/10s limit)
const MAX_RETRIES = 3;

// Simple rate limiter
let lastRequestTime = 0;

async function rateLimitedFetch(url: string, retries = 0): Promise<any> {
  // Enforce rate limit
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SkillMap-Engine/1.0',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    if (retries < MAX_RETRIES) {
      const backoff = Math.pow(2, retries) * 1000; // Exponential backoff
      logger.warn('LeetCode API retry', { url, retries, backoff });
      await new Promise(resolve => setTimeout(resolve, backoff));
      return rateLimitedFetch(url, retries + 1);
    }
    logger.error('LeetCode API failed after retries', { url, error });
    throw error;
  }
}

export async function fetchProfile(username: string) {
  const url = `${LEETCODE_API_BASE}/${username}`;
  return rateLimitedFetch(url);
}

export async function fetchStats(username: string) {
  const url = `${LEETCODE_API_BASE}/userProfile/${username}`;
  return rateLimitedFetch(url);
}

export async function fetchSubmissions(username: string, limit: number = 20) {
  const url = `${LEETCODE_API_BASE}/${username}/submission?limit=${limit}`;
  const data = await rateLimitedFetch(url);
  return data.submission || [];
}

export async function fetchSkillStats(username: string) {
  const url = `${LEETCODE_API_BASE}/skillStats/${username}`;
  const data = await rateLimitedFetch(url);
  return data?.data?.matchedUser?.tagProblemCounts || {};
}

export async function fetchActivity(username: string) {
  const currentYear = new Date().getFullYear();
  const url = `${LEETCODE_API_BASE}/userProfileCalendar?username=${username}&year=${currentYear}`;
  const data = await rateLimitedFetch(url);
  return data?.data?.matchedUser?.userCalendar || null;
}

export async function fetchProblemDetails(titleSlug: string) {
  // Check cache first (problems rarely change, cache 30 days)
  const cacheKey = `leetcode:problem:${titleSlug}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  const url = `${LEETCODE_API_BASE}/select?titleSlug=${titleSlug}`;
  const data = await rateLimitedFetch(url);
  
  // Cache for 30 days
  await redis.setex(cacheKey, 30 * 24 * 60 * 60, JSON.stringify(data));
  
  return data;
}
```

#### 6.2 Profile Fetcher with Smart Sync

Create `src/services/leetcode/fetcher.ts`:

```typescript
import { supabase } from '../../lib/db/supabase.js';
import logger from '../../utils/logger.js';
import { fetchProfile, fetchStats } from './apiClient.js';

export async function fetchLeetCodeProfile(username: string) {
  try {
    const [profile, stats] = await Promise.all([
      fetchProfile(username),
      fetchStats(username)
    ]);
    
    if (!profile || !stats) {
      throw new Error(`LeetCode user '${username}' not found`);
    }
    
    // Calculate acceptance rate from stats
    const acSubmissions = stats.matchedUserStats?.acSubmissionNum?.find(
      (item: any) => item.difficulty === 'All'
    )?.submissions || 0;
    const totalSubmissions = stats.matchedUserStats?.totalSubmissionNum?.find(
      (item: any) => item.difficulty === 'All'
    )?.submissions || 0;
    const acceptanceRate = totalSubmissions > 0 
      ? parseFloat(((acSubmissions / totalSubmissions) * 100).toFixed(2)) 
      : 0;
    
    return {
      username: profile.username,
      realName: profile.name,
      ranking: profile.ranking || stats.ranking,
      totalSolved: stats.totalSolved || 0,
      easySolved: stats.easySolved || 0,
      mediumSolved: stats.mediumSolved || 0,
      hardSolved: stats.hardSolved || 0,
      acceptanceRate,
      avatar: profile.avatar,
      reputation: profile.reputation,
      skillTags: profile.skillTags || [],
      about: profile.about || '',
    };
  } catch (error) {
    logger.error('LeetCode fetch failed', { error, username });
    throw error;
  }
}

export async function saveLeetCodeProfile(userId: string, profileData: any) {
  const { error } = await supabase
    .from('leetcode_profiles')
    .upsert({
      user_id: userId,
      leetcode_username: profileData.username,
      total_solved: profileData.totalSolved,
      easy_solved: profileData.easySolved,
      medium_solved: profileData.mediumSolved,
      hard_solved: profileData.hardSolved,
      ranking: profileData.ranking,
      acceptance_rate: profileData.acceptanceRate,
      last_synced_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id'
    });
  
  if (error) {
    logger.error('Failed to save LeetCode profile', { error, userId });
    throw error;
  }
  
  logger.info('LeetCode profile saved', { userId, username: profileData.username });
}

export async function shouldResync(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('leetcode_profiles')
    .select('last_synced_at')
    .eq('user_id', userId)
    .single();
  
  if (!data || !data.last_synced_at) return true;
  
  const lastSync = new Date(data.last_synced_at);
  const now = new Date();
  const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
  
  return hoursSinceSync > 24; // Re-sync if >24 hours
}
```

#### 6.3 Enhanced Pattern Analyzer

Create `src/services/leetcode/patternAnalyzer.ts`:

```typescript
import Instructor from '@instructor-ai/instructor';
import { z } from 'zod';
import { openai, MODELS } from '../../lib/llm/openai.js';
import logger from '../../utils/logger.js';
import { 
  fetchSubmissions,
  fetchSkillStats,
  fetchActivity,
  fetchProblemDetails
} from './apiClient.js';

const PatternAnalysisSchema = z.object({
  strength_patterns: z.array(z.object({
    pattern: z.string(),
    proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
    evidence: z.string(),
    problem_count: z.number(), // How many problems in this pattern
  })),
  weak_patterns: z.array(z.object({
    pattern: z.string(),
    proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
    evidence: z.string(),
    recommended_problems: z.array(z.string()).optional(), // Specific problem suggestions
  })),
  comfort_level: z.enum(['Easy', 'Medium', 'Hard']),
  consistency_score: z.number().min(0).max(100),
  growth_trend: z.enum(['improving', 'plateau', 'declining']),
  recommended_focus: z.array(z.string()),
});

const instructor = Instructor({
  client: openai,
  mode: 'TOOLS',
});

export async function analyzePatterns(username: string, profileData: any): Promise<any> {
  try {
    // 1. Fetch comprehensive data
    const [submissions, skillStats, activity] = await Promise.all([
      fetchSubmissions(username, 20),
      fetchSkillStats(username),
      fetchActivity(username)
    ]);
    
    if (!submissions || submissions.length === 0) {
      throw new Error('No submission history found');
    }
    
    // 2. Batch fetch problem details for recent submissions
    const acceptedSubmissions = submissions.filter((sub: any) => 
      sub.statusDisplay === 'Accepted'
    ).slice(0, 15); // Limit to 15 for performance
    
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
      .map((t: any) => `${t.tagName}: ${t.problemsSolved} solved (Fundamental)`)
      .slice(0, 10) // Top 10 fundamental
      .join(', ');
    
    const problemSummary = validProblems.map(p => 
      `- ${p.questionTitle} (${p.difficulty}) [${p.topicTags?.map((t: any) => t.name).join(', ')}]`
    ).join('\n');
    
    // Parse calendar for consistency
    let streak = 0;
    let totalActiveDays = 0;
    if (activity) {
      streak = activity.streak || 0;
      totalActiveDays = activity.totalActiveDays || 0;
      const submissionCalendar = JSON.parse(activity.submissionCalendar || '{}');
      totalActiveDays = Object.keys(submissionCalendar).length;
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
    
    // 5. Analyze with LLM
    const analysis = await instructor.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Analyze LeetCode problem-solving patterns. 
          - STRENGTHS: Topics in "Advanced Skills" with high counts = Expert/Advanced proficiency
          - WEAKNESSES: Fundamental topics with <10 solves = Critical gaps, Topics never attempted = Avoided patterns
          - COMFORT LEVEL: Based on Easy/Medium/Hard distribution
          - CONSISTENCY: Based on streak and active days
          - GROWTH: Compare recent problem difficulty to overall stats
          
          Provide actionable recommendations with specific problem types.`
        },
        {
          role: 'user',
          content: contextText
        }
      ],
      model: MODELS.STRUCTURED_OUTPUT,
      temperature: 0,
      response_model: {
        schema: PatternAnalysisSchema,
        name: 'PatternAnalysis',
      },
      max_retries: 2,
    });
    
    logger.info('Pattern analysis complete', { 
      username, 
      problems: validProblems.length,
      strengths: analysis.strength_patterns.length,
      weaknesses: analysis.weak_patterns.length
    });
    
    return analysis;
  } catch (error) {
    logger.error('Pattern analysis failed', { error, username });
    throw error;
  }
}
```

#### 6.3 LeetCode Embedder

Create `src/services/leetcode/embedder.ts`:

```typescript
import { createEmbedding } from '../../lib/llm/openai.js';
import { qdrant, COLLECTIONS } from '../../lib/vector/qdrant.js';
import { supabase } from '../../lib/db/supabase.js';
import logger from '../../utils/logger.js';

export async function generateLeetCodeEmbedding(userId: string, patternAnalysis: any) {
  // Format text for embedding
  const strengthsText = patternAnalysis.strength_patterns
    .map((p: any) => `${p.pattern} (${p.proficiency})`)
    .join(', ');
  
  const weaknessesText = patternAnalysis.weak_patterns
    .map((p: any) => `${p.pattern} (${p.proficiency})`)
    .join(', ');
  
  const embeddingText = `
    Strengths: ${strengthsText}
    Weaknesses: ${weaknessesText}
    Comfort Level: ${patternAnalysis.comfort_level}
    Consistency: ${patternAnalysis.consistency_score}
    Trend: ${patternAnalysis.growth_trend}
  `.trim();
  
  const embedding = await createEmbedding(embeddingText);
  
  // Upsert to Qdrant
  await qdrant.upsert(COLLECTIONS.LEETCODE_PATTERNS, {
    wait: true,
    points: [{
      id: userId,
      vector: embedding,
      payload: {
        user_id: userId,
        strength_patterns: patternAnalysis.strength_patterns.map((p: any) => p.pattern),
        weak_patterns: patternAnalysis.weak_patterns.map((p: any) => p.pattern),
        comfort_level: patternAnalysis.comfort_level,
        consistency_score: patternAnalysis.consistency_score,
        growth_trend: patternAnalysis.growth_trend,
        last_analyzed: new Date().toISOString(),
      },
    }],
  });
  
  logger.info('LeetCode embedding generated', { userId });
}
```

#### 6.4 LeetCode Routes with Smart Sync

Create `src/routes/leetcode.ts`:

```typescript
import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import { 
  fetchLeetCodeProfile, 
  saveLeetCodeProfile,
  shouldResync 
} from '../services/leetcode/fetcher.js';
import { analyzePatterns } from '../services/leetcode/patternAnalyzer.js';
import { generateLeetCodeEmbedding } from '../services/leetcode/embedder.js';
import { qdrant, COLLECTIONS } from '../lib/vector/qdrant.js';
import { supabase } from '../lib/db/supabase.js';
import { ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const app = new Hono();

// Helper: Full sync process
async function performFullSync(userId: string, username: string) {
  // 1. Fetch profile
  const profileData = await fetchLeetCodeProfile(username);
  
  // 2. Analyze patterns (pass profile for context)
  const patternAnalysis = await analyzePatterns(username, profileData);
  
  // 3. Save to Supabase
  await saveLeetCodeProfile(userId, profileData);
  
  // 4. Update pattern analysis in DB
  await supabase
    .from('leetcode_profiles')
    .update({
      pattern_analysis: patternAnalysis,
    })
    .eq('user_id', userId);
  
  // 5. Generate embedding (async, non-blocking for response)
  generateLeetCodeEmbedding(userId, patternAnalysis).catch(err =>
    logger.error('Embedding generation failed', { userId, error: err })
  );
  
  return { profileData, patternAnalysis };
}

// Manual sync (user clicks "Sync Now" button)
app.post('/sync', authenticate, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { username } = body;
  
  if (!username) {
    throw new ValidationError('LeetCode username is required');
  }
  
  const { profileData, patternAnalysis } = await performFullSync(userId, username);
  
  return c.json({
    profile: profileData,
    patterns: patternAnalysis,
    message: 'LeetCode profile synced successfully',
    synced_at: new Date().toISOString(),
  });
});

// Get LeetCode patterns (with auto-sync if stale)
app.get('/patterns', authenticate, async (c) => {
  const userId = c.get('userId');
  
  const { data, error } = await supabase
    .from('leetcode_profiles')
    .select('leetcode_username, pattern_analysis, last_synced_at')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    return c.json({ 
      error: 'LeetCode profile not found. Sync first via POST /sync',
      should_sync: true 
    }, 404);
  }
  
  // Smart re-sync: Check if data is stale (>24h)
  const needsResync = await shouldResync(userId);
  
  if (needsResync && data.leetcode_username) {
    logger.info('Auto-triggering LeetCode re-sync', { userId, username: data.leetcode_username });
    
    // Trigger async re-sync (non-blocking)
    performFullSync(userId, data.leetcode_username).catch(err =>
      logger.error('Auto-sync failed', { userId, error: err })
    );
    
    return c.json({
      ...data,
      syncing: true,
      message: 'Data is >24h old, re-syncing in background',
    });
  }
  
  return c.json(data);
});

// Find DSA study partners (based on LeetCode patterns)
app.get('/study-partners', authenticate, async (c) => {
  const userId = c.get('userId');
  
  // Get user's LeetCode pattern embedding
  const userPoint = await qdrant.retrieve(COLLECTIONS.LEETCODE_PATTERNS, {
    ids: [userId],
    with_vectors: true,
  });
  
  if (!userPoint || userPoint.length === 0) {
    return c.json({ 
      error: 'LeetCode patterns not found. Sync your profile first.',
      should_sync: true
    }, 404);
  }
  
  const userVector = userPoint[0].vector as number[];
  const userPayload = userPoint[0].payload;
  
  // Find similar users (complementary patterns preferred)
  // Strategy: Users with YOUR weaknesses as THEIR strengths = Good mentors
  //           Users with similar comfort_level = Good peers
  const results = await qdrant.search(COLLECTIONS.LEETCODE_PATTERNS, {
    vector: userVector,
    limit: 20,
    filter: {
      must: [
        { key: 'user_id', match: { value: userId }, operator: 'ne' },
      ],
    },
  });
  
  // Enrich with profile data
  const candidateIds = results.map(r => r.payload?.user_id).filter(Boolean);
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, experience_level')
    .in('user_id', candidateIds);
  
  // Score matches based on complementarity
  const enriched = results.map(r => {
    const theirStrengths = r.payload?.strength_patterns || [];
    const myWeaknesses = userPayload?.weak_patterns || [];
    
    // Count how many of MY weaknesses are THEIR strengths
    const complementaryCount = myWeaknesses.filter((weak: string) =>
      theirStrengths.includes(weak)
    ).length;
    
    // Same comfort level = peer, different = mentor/mentee
    const comfortMatch = r.payload?.comfort_level === userPayload?.comfort_level
      ? 'peer'
      : r.payload?.comfort_level > userPayload?.comfort_level
      ? 'mentor'
      : 'mentee';
    
    return {
      user_id: r.payload?.user_id,
      similarity_score: r.score,
      complementary_skills: complementaryCount,
      match_type: comfortMatch, // peer, mentor, or mentee
      patterns: {
        strengths: r.payload?.strength_patterns,
        weaknesses: r.payload?.weak_patterns,
        comfort_level: r.payload?.comfort_level,
      },
      profile: profiles?.find(p => p.user_id === r.payload?.user_id),
    };
  });
  
  // Sort by complementarity (mentors/peers first)
  enriched.sort((a, b) => b.complementary_skills - a.complementary_skills);
  
  return c.json({ 
    study_partners: enriched,
    your_patterns: {
      strengths: userPayload?.strength_patterns,
      weaknesses: userPayload?.weak_patterns,
      comfort_level: userPayload?.comfort_level,
    }
  });
});

export default app;
```

Add to `src/server.ts` (or main Hono app file):

```typescript
import leetcodeRoutes from './routes/leetcode.js';

app.route('/api/leetcode', leetcodeRoutes);
```

### Testing

```bash
# 1. Manual sync LeetCode profile
curl -X POST http://localhost:5005/api/leetcode/sync \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{ "username": "your_leetcode_username" }'

# Expected response:
# {
#   "profile": { username, totalSolved, ranking, ... },
#   "patterns": { 
#     strength_patterns: [{ pattern: "DP", proficiency: "advanced", ... }],
#     weak_patterns: [...],
#     comfort_level: "Medium",
#     ...
#   },
#   "message": "LeetCode profile synced successfully",
#   "synced_at": "2025-12-23T10:30:00Z"
# }

# 2. Get patterns (auto-sync if stale)
curl http://localhost:5005/api/leetcode/patterns \
  -H "Authorization: Bearer YOUR_JWT"

# If >24h old, response includes:
# { ..., "syncing": true, "message": "Data is >24h old, re-syncing in background" }

# 3. Find DSA study partners
curl http://localhost:5005/api/leetcode/study-partners \
  -H "Authorization: Bearer YOUR_JWT"

# Response includes match_type (peer/mentor/mentee) and complementary_skills count
```

### Dual Matching Modes

Users now have **two matching options**:

#### **Mode 1: Project/Stack Matching** (Phase 1 - Existing)
```typescript
GET /api/matches
// Uses user_profiles collection
// Matches on: shared skills, complementary skills, goals, experience, availability
```

#### **Mode 2: DSA Study Partners** (Phase 2 - New)
```typescript
GET /api/leetcode/study-partners
// Uses leetcode_patterns collection
// Matches on: complementary patterns (your weakness = their strength)
// Categorizes as: peer, mentor, or mentee based on comfort_level
```

Frontend can toggle between modes or show both:
```typescript
// Unified matching endpoint (future enhancement)
GET /api/matches?mode=project  // Default Phase 1 matching
GET /api/matches?mode=dsa      // LeetCode pattern matching
GET /api/matches?mode=both     // Combined scoring
```

### Acceptance Criteria

- ✅ **Critical**: LeetCode profile fetched successfully (username, stats, ranking)
- ✅ **Critical**: Pattern analysis uses fundamental/intermediate/advanced categorization
- ✅ **Critical**: Problem details fetched and cached (difficulty, tags, similar problems)
- ✅ **Critical**: Embeddings generated for pattern matching
- ✅ **Critical**: Study partner matching finds complementary patterns (your weakness = their strength)
- ✅ **Critical**: Smart re-sync: Auto-triggers if data >24h old when user views patterns
- ✅ **Critical**: Manual "Sync Now" button works
- ✅ **Critical**: Match types categorized correctly (peer/mentor/mentee)
- ⚠️ **Important**: Handles users with <10 problems solved gracefully
- ⚠️ **Important**: Rate limiting prevents API throttling (500ms between requests)
- ⚠️ **Important**: Problem details cached for 30 days
- ⚠️ **Important**: Re-sync updates existing profile (not duplicate)
- 💡 **Nice-to-have**: Problem recommendations based on weak patterns + similarQuestions field
- 💡 **Nice-to-have**: Unified matching endpoint (mode=project|dsa|both)

---

```bash
# 1. Sync LeetCode profile
curl -X POST http://localhost:5005/api/leetcode/sync \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{ "username": "your_leetcode_username" }'

# 2. Get patterns
curl http://localhost:5005/api/leetcode/patterns \
  -H "Authorization: Bearer YOUR_JWT"

# 3. Find study partners
curl http://localhost:5005/api/leetcode/study-partners \
  -H "Authorization: Bearer YOUR_JWT"
```

### Acceptance Criteria

- ✅ **Critical**: LeetCode profile fetched successfully (username, stats, ranking)
- ✅ **Critical**: Pattern analysis identifies strengths/weaknesses (DP vs Graphs)
- ✅ **Critical**: Embeddings generated for pattern matching
- ✅ **Critical**: Study partner matching finds complementary patterns
- ⚠️ **Important**: Handles users with <10 problems solved gracefully
- ⚠️ **Important**: Re-sync updates existing profile (not duplicate)
- 💡 **Nice-to-have**: Problem recommendations based on weak patterns

---

## 7. FEATURE 4: MATCH QUALITY FEEDBACK

### Objective
Track user feedback on matches (like/dislike/skip) to measure algorithm quality and enable future ML improvements.

### Prerequisites
- ✅ `match_feedback` table created
- ✅ Phase 1 matching working

### Tasks

#### 7.1 Feedback Service

Create `src/services/feedback/index.ts`:

```typescript
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
  
  // Calculate metrics
  const total = data.length;
  const likes = data.filter(f => f.feedback_type === 'like' || f.feedback_type === 'connect').length;
  const dislikes = data.filter(f => f.feedback_type === 'dislike').length;
  const skips = data.filter(f => f.feedback_type === 'skip').length;
  
  // Conversion rate by score buckets
  const scoreBuckets = {
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
    conversion_rate: stats.total > 0 ? (stats.likes / stats.total) * 100 : 0,
    total_matches: stats.total,
  }));
  
  return {
    total_feedback: total,
    likes,
    dislikes,
    skips,
    like_rate: total > 0 ? (likes / total) * 100 : 0,
    conversion_by_score: conversionRates,
  };
}
```

#### 7.2 Feedback Routes

Create `src/routes/feedback.ts`:

```typescript
import { Hono } from 'hono';
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
    throw new ValidationError('Invalid feedback type');
  }
  
  await recordFeedback(userId, candidateId, feedbackType, matchScore, scoringFactors);
  
  return c.json({ message: 'Feedback recorded successfully' });
});

// Get feedback analytics (admin or self)
app.get('/analytics', authenticate, async (c) => {
  const userId = c.get('userId');
  const analytics = await getFeedbackAnalytics(userId);
  
  return c.json(analytics);
});

export default app;
```

Update `src/routes/matching.ts` to include feedback data in response:

```typescript
// In matching route, add this to each match object:
const enriched = await enrichMatchProfiles(pageMatches);

// Add feedback status
for (const match of enriched) {
  const { data: feedback } = await supabase
    .from('match_feedback')
    .select('feedback_type')
    .eq('user_id', userId)
    .eq('candidate_id', match.user_id)
    .single();
  
  match.previous_feedback = feedback?.feedback_type || null;
}
```

Add to `src/server.ts`:

```typescript
import feedbackRoutes from './routes/feedback.js';

app.route('/api/feedback', feedbackRoutes);
```

### Testing

```bash
# 1. Record feedback
curl -X POST http://localhost:5005/api/feedback/matches/candidate-uuid/feedback \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "feedbackType": "like",
    "matchScore": 87.5,
    "scoringFactors": {
      "shared_skills_score": 85,
      "complementary_skills_score": 78,
      ...
    }
  }'

# 2. Get analytics
curl http://localhost:5005/api/feedback/analytics \
  -H "Authorization: Bearer YOUR_JWT"
```

### Acceptance Criteria

- ✅ **Critical**: Feedback recorded successfully (like/dislike/skip/connect)
- ✅ **Critical**: Analytics show conversion rate by score bucket (90-100: 80% like, <70: 20% like)
- ✅ **Critical**: Frontend can track "already swiped" matches (previous_feedback field)
- ⚠️ **Important**: Handles duplicate feedback gracefully (upsert on conflict)
- 💡 **Nice-to-have**: Dashboard showing feedback trends over time

---

## 8. FEATURE 5: ATS SCORING

### Objective
Score resume against job descriptions using semantic similarity + keyword matching.

### Prerequisites
- ✅ Phase 1 resume parsing working
- ✅ `ats_scores` table created

### Tasks

#### 8.1 ATS Scorer

Create `src/services/ats/scorer.ts`:

```typescript
import { createEmbedding } from '../../lib/llm/openai.js';
import { supabase } from '../../lib/db/supabase.js';
import { normalizeSkills } from '../taxonomy/normalizer.js';
import logger from '../../utils/logger.js';

export async function scoreResumeVsJob(
  userId: string,
  resumeId: string,
  jobTitle: string,
  jobDescription: string
) {
  // 1. Fetch resume data
  const { data: resume } = await supabase
    .from('resumes')
    .select('parsed_data, raw_text')
    .eq('id', resumeId)
    .single();
  
  if (!resume) {
    throw new Error('Resume not found');
  }
  
  const resumeSkills = resume.parsed_data?.skills?.map((s: any) => s.name) || [];
  const resumeExperience = resume.parsed_data?.work_experience || [];
  
  // 2. Extract skills from job description (reuse Feature 1 logic)
  const { extractSkillsFromJob } = await import('../jobs/scraper.js');
  const jobSkillsExtraction = await extractSkillsFromJob(jobDescription);
  const jobSkills = jobSkillsExtraction?.required_skills?.map(s => s.skill) || [];
  
  // 3. Normalize all skills
  const [normalizedResumeSkills, normalizedJobSkills] = await Promise.all([
    normalizeSkills(resumeSkills),
    normalizeSkills(jobSkills),
  ]);
  
  const resumeSkillSet = new Set(normalizedResumeSkills.map(s => s.canonical));
  const jobSkillSet = new Set(normalizedJobSkills.map(s => s.canonical));
  
  // 4. Calculate skills match
  const matchingSkills = [...jobSkillSet].filter(skill => resumeSkillSet.has(skill));
  const skillsScore = jobSkills.length > 0 
    ? (matchingSkills.length / jobSkills.length) * 100 
    : 0;
  
  // 5. Calculate experience match
  const requiredYears = jobSkillsExtraction?.experience_years || 0;
  const userYears = calculateTotalYears(resumeExperience);
  const experienceScore = requiredYears > 0
    ? Math.min((userYears / requiredYears) * 100, 100)
    : userYears > 0 ? 100 : 50;
  
  // 6. Semantic similarity (resume vs job embedding)
  const [resumeEmbedding, jobEmbedding] = await Promise.all([
    createEmbedding(resume.raw_text.substring(0, 8000)), // Truncate to 8k chars
    createEmbedding(jobDescription.substring(0, 8000)),
  ]);
  
  const semanticScore = cosineSimilarity(resumeEmbedding, jobEmbedding) * 100;
  
  // 7. Calculate weighted overall score
  const overallScore = 
    skillsScore * 0.5 +        // 50% skills
    experienceScore * 0.3 +    // 30% experience
    semanticScore * 0.2;       // 20% semantic fit
  
  // 8. Generate suggestions
  const suggestions = generateSuggestions(
    matchingSkills,
    jobSkillSet,
    resumeSkillSet,
    skillsScore
  );
  
  // 9. Store result
  const { data: savedScore, error } = await supabase
    .from('ats_scores')
    .insert({
      user_id: userId,
      resume_id: resumeId,
      job_title: jobTitle,
      job_description: jobDescription,
      overall_score: Math.round(overallScore),
      score_breakdown: {
        skills: Math.round(skillsScore),
        experience: Math.round(experienceScore),
        semantic: Math.round(semanticScore),
      },
      suggestions,
    })
    .select()
    .single();
  
  if (error) {
    logger.error('Failed to save ATS score', { error, userId, resumeId });
  }
  
  logger.info('ATS scoring complete', {
    userId,
    resumeId,
    overallScore: Math.round(overallScore),
  });
  
  return savedScore || {
    overall_score: Math.round(overallScore),
    score_breakdown: {
      skills: Math.round(skillsScore),
      experience: Math.round(experienceScore),
      semantic: Math.round(semanticScore),
    },
    suggestions,
  };
}

function cosineSimilarity(vec1: number[], vec2: number[]): number {
  let dot = 0, mag1 = 0, mag2 = 0;
  for (let i = 0; i < vec1.length; i++) {
    dot += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }
  return dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

function calculateTotalYears(experience: any[]): number {
  let total = 0;
  for (const exp of experience) {
    const start = new Date(exp.start_date);
    const end = exp.end_date ? new Date(exp.end_date) : new Date();
    const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);
    total += years;
  }
  return total;
}

function generateSuggestions(
  matchingSkills: string[],
  jobSkills: Set<string>,
  resumeSkills: Set<string>,
  skillsScore: number
): any[] {
  const suggestions = [];
  
  // Missing critical skills
  const missingSkills = [...jobSkills].filter(skill => !resumeSkills.has(skill));
  for (const skill of missingSkills.slice(0, 5)) {
    suggestions.push({
      type: 'add_skill',
      skill,
      impact: 10, // +10% if added
      priority: 'high',
      suggestion: `Add "${skill}" to your skills section or work experience`,
    });
  }
  
  // Weak experience section
  if (skillsScore < 60) {
    suggestions.push({
      type: 'improve_experience',
      impact: 15,
      priority: 'high',
      suggestion: 'Expand work experience descriptions with technical details and achievements',
    });
  }
  
  return suggestions;
}
```

#### 8.2 ATS Routes

Create `src/routes/ats.ts`:

```typescript
import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import { scoreResumeVsJob } from '../services/ats/scorer.js';
import { supabase } from '../lib/db/supabase.js';
import { ValidationError } from '../utils/errors.js';

const app = new Hono();

// Score resume against job description
app.post('/score', authenticate, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { resumeId, jobTitle, jobDescription } = body;
  
  if (!resumeId || !jobTitle || !jobDescription) {
    throw new ValidationError('resumeId, jobTitle, and jobDescription are required');
  }
  
  const score = await scoreResumeVsJob(userId, resumeId, jobTitle, jobDescription);
  
  return c.json(score);
});

// Get score history
app.get('/history', authenticate, async (c) => {
  const userId = c.get('userId');
  
  const { data, error } = await supabase
    .from('ats_scores')
    .select('id, job_title, overall_score, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (error) {
    throw error;
  }
  
  return c.json({ history: data });
});

// Get detailed score
app.get('/:scoreId', authenticate, async (c) => {
  const userId = c.get('userId');
  const scoreId = c.req.param('scoreId');
  
  const { data, error } = await supabase
    .from('ats_scores')
    .select('*')
    .eq('id', scoreId)
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    return c.json({ error: 'Score not found' }, 404);
  }
  
  return c.json(data);
});

export default app;
```

Add to `src/server.ts`:

```typescript
import atsRoutes from './routes/ats.js';

app.route('/api/ats', atsRoutes);
```

### Testing

```bash
# 1. Score resume
curl -X POST http://localhost:5005/api/ats/score \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "resumeId": "uuid-of-resume",
    "jobTitle": "Senior Frontend Developer",
    "jobDescription": "We are looking for a Senior Frontend Developer with 5+ years experience in React, TypeScript, and Next.js..."
  }'

# 2. Get score history
curl http://localhost:5005/api/ats/history \
  -H "Authorization: Bearer YOUR_JWT"
```

### Acceptance Criteria

- ✅ **Critical**: ATS scoring works (skills 50%, experience 30%, semantic 20%)
- ✅ **Critical**: Missing skills identified correctly
- ✅ **Critical**: Suggestions actionable ("Add Docker → +10%")
- ✅ **Critical**: Response time <5s
- ⚠️ **Important**: Score history tracks improvement over time
- ⚠️ **Important**: Handles edge cases (resume with 0 skills, job with no requirements)
- 💡 **Nice-to-have**: Trend graph (score improving from 65% → 85% after edits)

---

## 9. TESTING STRATEGY

### Unit Tests (Vitest)

#### Test Coverage Requirements
- **Critical paths:** >80% coverage
- **Services:** All core functions tested
- **Utilities:** 100% coverage (small, reusable)

#### Key Test Files

```typescript
// src/services/jobs/__tests__/aggregator.test.ts
describe('Skill Frequency Analysis', () => {
  it('should calculate frequencies correctly', async () => {
    const skills = ['React', 'React', 'TypeScript', 'React'];
    const frequencies = await analyzeSkillFrequencies(skills, 4);
    
    expect(frequencies[0].canonical_name).toBe('React');
    expect(frequencies[0].frequency).toBe(0.75); // 3/4
  });
});

// src/services/gaps/__tests__/analyzer.test.ts
describe('Gap Analyzer', () => {
  it('should identify critical gaps', async () => {
    const { gaps } = await analyzeGaps(userId, goalId);
    
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0].priority).toBe('critical');
  });
});

// src/services/leetcode/__tests__/patternAnalyzer.test.ts
describe('LeetCode Pattern Analysis', () => {
  it('should analyze strengths and weaknesses', async () => {
    const analysis = await analyzePatterns('leetcode_user');
    
    expect(analysis.strength_patterns).toBeDefined();
    expect(analysis.weak_patterns).toBeDefined();
  });
});

// src/services/ats/__tests__/scorer.test.ts
describe('ATS Scorer', () => {
  it('should score resume vs job correctly', async () => {
    const score = await scoreResumeVsJob(userId, resumeId, jobTitle, jobDesc);
    
    expect(score.overall_score).toBeGreaterThan(0);
    expect(score.overall_score).toBeLessThanOrEqual(100);
    expect(score.score_breakdown.skills).toBeDefined();
  });
});
```

Run tests:
```bash
npm test
npm run test:ui  # Interactive UI
```

### Integration Tests (Manual)

#### End-to-End Flow Tests

**Test 1: Complete Skill Gap Analysis Flow**
```bash
# 1. User sets learning goal
# 2. Fetch job market data: GET /api/jobs/skills/Frontend%20Developer
# 3. Analyze gaps: POST /api/gaps/analyze { goalId }
# 4. View learning path: GET /api/gaps/:goalId/path
# 5. Verify path includes missing skills with resources
```

**Test 2: LeetCode Integration**
```bash
# 1. Sync LeetCode: POST /api/leetcode/sync { username }
# 2. Verify patterns: GET /api/leetcode/patterns
# 3. Find study partners: GET /api/leetcode/study-partners
# 4. Verify partners have complementary patterns
```

**Test 3: Match Feedback Loop**
```bash
# 1. Get matches: GET /api/matches
# 2. Record feedback: POST /api/feedback/matches/:id/feedback
# 3. Check analytics: GET /api/feedback/analytics
# 4. Verify conversion rate calculated correctly
```

**Test 4: ATS Scoring**
```bash
# 1. Upload resume (Phase 1)
# 2. Score against job: POST /api/ats/score
# 3. Verify suggestions actionable
# 4. Edit resume, re-score
# 5. Verify score improved
```

### Performance Tests

#### Load Testing (Artillery or k6)

```yaml
# artillery-config.yml
config:
  target: 'http://localhost:5005'
  phases:
    - duration: 60
      arrivalRate: 10  # 10 users/sec
scenarios:
  - name: "Gap Analysis"
    flow:
      - post:
          url: "/api/gaps/analyze"
          headers:
            Authorization: "Bearer {{ token }}"
          json:
            goalId: "{{ goalId }}"
```

Run:
```bash
artillery run artillery-config.yml
```

#### Performance Targets

| Operation | Target | Acceptable | Unacceptable |
|-----------|--------|------------|--------------|
| Job market fetch (cold) | <5s | <10s | >15s |
| Job market fetch (cached) | <100ms | <500ms | >1s |
| Gap analysis | <10s | <30s | >60s |
| Learning path generation | <15s | <30s | >45s |
| LeetCode sync | <8s | <15s | >30s |
| ATS scoring | <3s | <7s | >10s |
| Match feedback record | <100ms | <500ms | >1s |

---

## 10. ACCEPTANCE CRITERIA

### Feature 1: Job Market Integration

- ✅ **Critical (Blocking)**: Job analysis extracts skills from user-pasted descriptions (<5s for 5 jobs)
- ✅ **Critical**: Skills extracted with >90% accuracy (manual review of 20 jobs)
- ✅ **Critical**: Frequencies cached for 7 days (second query <100ms)
- ✅ **Critical**: Fallback to Phase 1 taxonomy if API fails
- ⚠️ **Important**: Rate limiting prevents quota exhaustion
- ⚠️ **Important**: Multiple seniority levels supported
- 💡 **Nice-to-have**: Multi-country support (US, UK, CA)

### Feature 2: Skill Gap Analysis

- ✅ **Critical (Blocking)**: Gap analysis identifies skills user lacks
- ✅ **Critical**: Learning path generated with realistic time estimates
- ✅ **Critical**: Steps ordered by prerequisites
- ✅ **Critical**: Resources include free options
- ✅ **Critical**: Response time <30s
- ⚠️ **Important**: Path regenerates when user skills change
- ⚠️ **Important**: Caching prevents duplicate LLM calls
- 💡 **Nice-to-have**: Streaming path generation

### Feature 3: LeetCode Integration

- ✅ **Critical (Blocking)**: LeetCode profile synced successfully
- ✅ **Critical**: Pattern analysis identifies strengths/weaknesses
- ✅ **Critical**: Embeddings generated for matching
- ✅ **Critical**: Study partners found with complementary patterns
- ⚠️ **Important**: Handles <10 problems solved gracefully
- ⚠️ **Important**: Re-sync updates (not duplicates)
- 💡 **Nice-to-have**: Problem recommendations

### Feature 4: Match Feedback

- ✅ **Critical (Blocking)**: Feedback recorded (like/dislike/skip/connect)
- ✅ **Critical**: Analytics show conversion rate by score bucket
- ✅ **Critical**: Frontend tracks "already swiped" matches
- ⚠️ **Important**: Duplicate feedback handled gracefully
- 💡 **Nice-to-have**: Feedback trends dashboard

### Feature 5: ATS Scoring

- ✅ **Critical (Blocking)**: ATS scoring works (50% skills, 30% exp, 20% semantic)
- ✅ **Critical**: Missing skills identified
- ✅ **Critical**: Suggestions actionable
- ✅ **Critical**: Response time <5s
- ⚠️ **Important**: Score history tracks improvement
- ⚠️ **Important**: Edge cases handled
- 💡 **Nice-to-have**: Trend graph

### Overall Phase 2 Success

- ✅ **All critical features deployed and working**
- ✅ **Performance targets met** (see section 9)
- ✅ **Tests passing** (>80% coverage on critical paths)
- ✅ **Cost within budget** (<$100/mo for 1000 users)
- ✅ **No critical bugs in production**

---

## 11. NEXT STEPS

Once Phase 2 is complete:

1. **Merge to develop branch** (all-at-once deployment strategy)
2. **Frontend integration testing** (coordinate with frontend team)
3. **Beta testing** (10-20 users for 1 week)
4. **Production deployment** (Week 7)
5. **Phase 3 planning** (Production hardening: monitoring, rate limiting, scaling)

**Phase 2 Complete When:**
- ✅ All 5 features implemented
- ✅ All acceptance criteria passing
- ✅ Performance metrics validated
- ✅ Ready for frontend integration

---

**Document Version:** 1.0  
**Last Updated:** December 23, 2025  
**Timeline:** 7 weeks (Features 1-5 + Testing)  
**Next:** Begin implementation with Feature 1 (Job Market Integration)
