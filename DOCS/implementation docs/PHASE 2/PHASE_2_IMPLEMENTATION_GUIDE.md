# Phase 2 Implementation Guide
**SkillMap Engine - Dynamic Skill Gaps + LeetCode + Match Feedback**

**Created:** December 23, 2025  
**Based On:** Phase 1 actual implementation (see `PHASE_1_IMPLEMENTATION_SUMMARY.md`)  
**Timeline:** 7 weeks  
**Priority Order:** Skill Gaps → LeetCode → Match Feedback → ATS → Deployment

---

## TABLE OF CONTENTS

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Phase 2 Architecture](#3-phase-2-architecture)
4. [Feature 1: Job Market Integration](#4-feature-1-job-market-integration)
5. [Feature 2: Skill Gap Analysis](#5-feature-2-skill-gap-analysis)
6. [Feature 3: LeetCode Pattern Analysis](#6-feature-3-leetcode-pattern-analysis)
7. [Feature 4: Match Quality Feedback](#7-feature-4-match-quality-feedback)
8. [Feature 5: ATS Scoring](#8-feature-5-ats-scoring)
9. [Testing Strategy](#9-testing-strategy)
10. [Acceptance Criteria](#10-acceptance-criteria)

---

## 1. OVERVIEW

### Objectives

Phase 2 builds on Phase 1's foundation to deliver **dynamic, job-market-driven features**:

1. **Skill Gap Analysis** - Real-time job market analysis (not static taxonomy)
2. **LeetCode Integration** - Pattern analysis + peer matching for DSA study partners
3. **Match Feedback Loop** - Track match quality to improve algorithm
4. **ATS Scoring** - Resume optimization against real job postings
5. **Production Prep** - Monitoring, rate limiting, deployment readiness

### What Phase 1 Already Has

✅ Deterministic resume parsing (Instructor + Zod)  
✅ Multi-vector embeddings (skills, goals, experience)  
✅ 6-factor peer matching with preference compatibility  
✅ Redis caching (70-95% hit rates)  
✅ Qdrant vector search (<1s matching)  
✅ Supabase schema (users, skills, experience, projects, goals)  

### What Phase 2 Adds

🆕 **Job market data pipeline** (user-paste OR taxonomy fallback → cache → analysis)  
🆕 **Dynamic learning paths** (LLM-generated, personalized)  
🆕 **LeetCode pattern embeddings** (problem-solving strengths/weaknesses)  
🆕 **Match feedback tracking** (thumbs up/down → algorithm improvements)  
🆕 **ATS scoring** (resume vs job description semantic matching)  

### Dependency Chain

```
Week 1-2: Job Market Integration (Foundation)
   ↓
Week 3-4: Skill Gap Analysis (Depends on job data)
   ↓
Week 5: LeetCode Pattern Analysis (Parallel to gaps)
   ↓
Week 6: Match Feedback + ATS Scoring (Polish features)
   ↓
Week 7: Production Deployment Prep
```

### Key Principles

1. **Build on Phase 1 patterns** - Reuse `scorer.ts` weights, `embedder.ts` batch generation
2. **Cache aggressively** - Job data (7 days), learning paths (until user skills change)
3. **Fail gracefully** - If no job descriptions provided, fall back to Phase 1 taxonomy
4. **Measure quality** - Track match feedback to validate improvements

---

## 2. PREREQUISITES

### Verify Phase 1 Features Working

Before starting Phase 2, ensure these are functional:

- [x] **Resume parsing** producing deterministic output (test with `src/services/resume/__tests__/determinism.test.ts`)
- [x] **Skill normalization** working (check cache hit rate in Redis)
- [x] **Profile embeddings** generating correctly (inspect Qdrant `user_profiles` collection)
- [x] **Peer matching** returning <1s responses (test `GET /api/matches`)
- [x] **Caching layer** operational (Upstash Redis dashboard shows activity)

### Database Schema Extensions

Add new tables via Supabase SQL editor:

```sql
-- Job market cache
CREATE TABLE job_market_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES learning_goals(id) ON DELETE CASCADE,
  skill_frequencies JSONB NOT NULL, -- { "React": 0.85, "TypeScript": 0.72, ... }
  total_jobs_analyzed INT NOT NULL,
  data_source TEXT CHECK (data_source IN ('jobs', 'taxonomy')) NOT NULL,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(user_id, goal_id)
);

-- Learning paths
CREATE TABLE learning_paths (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES learning_goals(id) ON DELETE CASCADE,
  path_data JSONB NOT NULL, -- { steps: [...], estimated_weeks: 12, ... }
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LeetCode profiles (extend existing if needed)
CREATE TABLE leetcode_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  leetcode_username TEXT NOT NULL UNIQUE,
  total_solved INT DEFAULT 0,
  easy_solved INT DEFAULT 0,
  medium_solved INT DEFAULT 0,
  hard_solved INT DEFAULT 0,
  ranking INT,
  acceptance_rate DECIMAL(5,2),
  pattern_analysis JSONB, -- { strengths: [...], weaknesses: [...], comfort_level: "Medium" }
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Match feedback (NEW)
CREATE TABLE match_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_type TEXT CHECK (feedback_type IN ('like', 'dislike', 'skip', 'connect')) NOT NULL,
  match_score DECIMAL(5,2), -- Score that was shown
  scoring_factors JSONB, -- Copy of factors from scorer.ts
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, candidate_id)
);

-- ATS scores (NEW)
CREATE TABLE ats_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL,
  job_description TEXT NOT NULL,
  overall_score DECIMAL(5,2) NOT NULL,
  score_breakdown JSONB NOT NULL, -- { skills: 85, experience: 60, ... }
  suggestions JSONB, -- [ { type: "add_skill", skill: "Docker", impact: 15 }, ... ]
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_market_role ON job_market_skills(role_title, seniority_level);
CREATE INDEX idx_learning_paths_user ON learning_paths(user_id, goal_id);
CREATE INDEX idx_match_feedback_user ON match_feedback(user_id);
CREATE INDEX idx_ats_scores_user ON ats_scores(user_id, created_at DESC);
```

### External API Setup

#### LeetCode API (Already configured)
- Uses custom API: `https://leetcode-api.aahil-khan.tech`
- No API key required (public endpoint)
- Rate limiting: 500ms delay between requests

#### No External Job APIs Needed
- Users paste job descriptions directly (more accurate, zero cost)
- Fallback to Phase 1 taxonomy (65 curated skills with demand scores)
- No API dependencies for job market analysis

### Test Data Preparation

Create sample job descriptions for testing:

```bash
# Run this to seed test job postings
tsx src/scripts/seed-test-jobs.ts
```

---

## 3. PHASE 2 ARCHITECTURE

### New Service Modules

```
src/services/
├── jobs/
│   ├── taxonomyFallback.ts # Taxonomy-based frequencies
│   ├── scraper.ts          # Job scraping + skill extraction
│   └── aggregator.ts       # Skill frequency analysis
├── gaps/
│   ├── analyzer.ts         # Compare user skills vs job market
│   ├── pathGenerator.ts    # LLM learning path generation
│   └── index.ts            # Main gap analysis orchestrator
├── leetcode/
│   ├── fetcher.ts          # LeetCode GraphQL queries (reuse existing)
│   ├── patternAnalyzer.ts  # Analyze problem-solving patterns
│   └── embedder.ts         # LeetCode pattern embeddings
├── ats/
│   ├── scorer.ts           # Semantic resume vs job scoring
│   └── suggestions.ts      # Optimization suggestions generator
└── feedback/
    └── index.ts            # Match feedback CRUD + analytics
```

### New Routes

```
src/routes/
├── jobs.ts                 # GET /api/jobs/skills/:role
├── gaps.ts                 # POST /api/gaps/analyze, GET /api/gaps/:goalId/path
├── leetcode.ts             # POST /api/leetcode/sync, GET /api/leetcode/patterns
├── ats.ts                  # POST /api/ats/score
└── feedback.ts             # POST /api/matches/:candidateId/feedback
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│              Phase 2 Data Flows                         │
└─────────────────────────────────────────────────────────┘

1. JOB MARKET PIPELINE (User-Paste + Taxonomy Fallback)
   User sets goal ("Frontend Developer")
      ↓
   [OPTION A] User pastes 3-10 job descriptions
      ↓
   POST /api/jobs/analyze { jobDescriptions, goalId }
      ↓
   Extract skills with frequency (React: 90%, TypeScript: 85%)
      ↓
   Cache in Redis (7 days) + Supabase (job_market_skills, source='jobs')
   
   [OPTION B] User skips (no jobs pasted)
      ↓
   POST /api/jobs/analyze { goalId, targetRole }
      ↓
   Load Phase 1 taxonomy (65 skills with demand scores)
      ↓
   Cache in Redis (7 days) + Supabase (job_market_skills, source='taxonomy')

2. SKILL GAP ANALYSIS
   User goal + current skills
      ↓
   Fetch cached job market data (user-pasted OR taxonomy)
      ↓
   Gap identification (user has X, market/taxonomy needs Y)
      ↓
   LLM generates learning path (ordered steps + resources)
      ↓
   Store in learning_paths table + cache

3. LEETCODE INTEGRATION
   User links LeetCode username
      ↓
   Fetch profile + submission history (custom API)
      ↓
   Analyze patterns (strong in DP, weak in Graphs)
      ↓
   Generate embeddings for pattern matching
      ↓
   Update Qdrant leetcode_patterns collection

4. MATCH FEEDBACK
   User swipes/connects with candidate
      ↓
   Store feedback (like/dislike/skip) + match_score
      ↓
   Analytics: Track conversion rate by score range
      ↓
   Future ML: Use feedback to tune scoring weights

5. ATS SCORING
   User uploads resume + pastes job description
      ↓
   Semantic similarity (resume_embedding vs job_embedding)
      ↓
   Keyword matching (required skills present?)
      ↓
   Generate score + suggestions ("Add Docker → +15%")
      ↓
   Store in ats_scores + show trend graph
```

---

## 4. FEATURE 1: JOB MARKET INTEGRATION

### Objective
Build job market analysis from **user-pasted job descriptions** with intelligent fallback to Phase 1 taxonomy (65 curated skills with demand scores).

**Why user-paste?** More accurate (users analyze jobs they want), zero API costs, works globally, no rate limits.

### Prerequisites
- ✅ Database table `job_market_skills` created
- ✅ Phase 1 taxonomy available (`src/data/core-skills.ts`)

### Tasks

#### 4.1 Taxonomy Fallback Helper

Create `src/services/jobs/taxonomyFallback.ts`:

```typescript
import { coreSkills } from '../../data/core-skills.js';
import logger from '../../utils/logger.js';

interface SkillFrequency {
  skill: string;
  canonical_name: string;
  frequency: number;
  occurrences: number;
  source: 'taxonomy' | 'jobs';
}

/**
 * Generate skill frequencies from Phase 1 taxonomy when user doesn't provide jobs
 * Uses job_demand_frequency and value_weight from core-skills.ts
 */
export function generateTaxonomyBasedFrequencies(
  targetRole?: string
): SkillFrequency[] {
  logger.info('Using taxonomy fallback for skill frequencies', { targetRole });
  
  // Map taxonomy skills to frequency format
  // job_demand_frequency: 0.1-0.9 scale → convert to 10-90% frequency
  const frequencies: SkillFrequency[] = coreSkills.map(skill => ({
    skill: skill.name,
    canonical_name: skill.name,
    frequency: skill.job_demand_frequency || 0.5, // Default 50% if not set
    occurrences: Math.round((skill.job_demand_frequency || 0.5) * 100), // Simulated count
    source: 'taxonomy' as const,
  }));
  
  // Sort by frequency (demand) descending
  frequencies.sort((a, b) => b.frequency - a.frequency);
  
  logger.info('Taxonomy frequencies generated', { 
    skillCount: frequencies.length,
    topSkill: frequencies[0]?.canonical_name 
  });
  
  return frequencies;
}
```

#### 4.2 Skill Extraction from Job Descriptions

Create `src/services/jobs/scraper.ts`:

```typescript
import Instructor from '@instructor-ai/instructor';
import { z } from 'zod';
import { openai, MODELS } from '../../lib/llm/openai.js';
import logger from '../../utils/logger.js';

const JobSkillsSchema = z.object({
  required_skills: z.array(z.object({
    skill: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
  })),
  nice_to_have_skills: z.array(z.string()),
  experience_years: z.number().optional(),
});

const instructor = Instructor({
  client: openai,
  mode: 'TOOLS',
});

export async function extractSkillsFromJob(jobDescription: string) {
  try {
    const extraction = await instructor.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Extract technical skills from job description. 
          Focus on: programming languages, frameworks, tools, platforms.
          Ignore soft skills and general requirements.`
        },
        { role: 'user', content: jobDescription }
      ],
      model: MODELS.STRUCTURED_OUTPUT,
      temperature: 0,
      response_model: {
        schema: JobSkillsSchema,
        name: 'JobSkills',
      },
      max_retries: 2,
    });
    
    return extraction;
  } catch (error) {
    logger.error('Skill extraction failed', { error });
    return null;
  }
}

export async function extractSkillsFromJobDescriptions(
  jobDescriptions: string[]
): Promise<string[]> {
  if (!jobDescriptions || jobDescriptions.length === 0) {
    logger.warn('No job descriptions provided, will use taxonomy fallback');
    return [];
  }
  
  // Batch process to manage LLM costs
  const BATCH_SIZE = 5;
  const allSkills: string[] = [];
  
  for (let i = 0; i < jobDescriptions.length; i += BATCH_SIZE) {
    const batch = jobDescriptions.slice(i, i + BATCH_SIZE);
    const promises = batch.map(description => 
      extractSkillsFromJob(description)
    );
    
    const results = await Promise.all(promises);
    
    for (const result of results) {
      if (result) {
        allSkills.push(...result.required_skills.map(s => s.skill));
        allSkills.push(...result.nice_to_have_skills);
      }
    }
    
    // Small delay between batches for rate limiting
    if (i + BATCH_SIZE < jobDescriptions.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  logger.info('Skills extracted from job descriptions', { 
    jobCount: jobDescriptions.length,
    skillCount: allSkills.length 
  });
  
  return allSkills;
}
```

#### 4.3 Skill Frequency Aggregator

Create `src/services/jobs/aggregator.ts`:

```typescript
import { supabase } from '../../lib/db/supabase.js';
import { CacheKeys, CacheTTL, getJSON, setJSON } from '../../lib/cache/redis.js';
import { normalizeSkills } from '../taxonomy/normalizer.js';
import logger from '../../utils/logger.js';

interface SkillFrequency {
  skill: string;
  canonical_name: string;
  frequency: number; // 0.0 to 1.0
  occurrences: number;
}

export async function analyzeSkillFrequencies(
  skills: string[],
  totalJobs: number
): Promise<SkillFrequency[]> {
  // 1. Normalize all skills (reuse Phase 1 normalizer)
  const normalized = await normalizeSkills(skills);
  
  // 2. Count occurrences
  const counts = new Map<string, number>();
  for (const { canonical } of normalized) {
    counts.set(canonical, (counts.get(canonical) || 0) + 1);
  }
  
  // 3. Calculate frequencies
  const frequencies: SkillFrequency[] = [];
  for (const [canonical, count] of counts.entries()) {
    frequencies.push({
      skill: canonical,
      canonical_name: canonical,
      frequency: count / totalJobs,
      occurrences: count,
    });
  }
  
  // 4. Sort by frequency DESC
  frequencies.sort((a, b) => b.frequency - a.frequency);
  
  return frequencies;
}

export async function cacheJobMarketSkills(
  userId: string,
  goalId: string,
  frequencies: SkillFrequency[],
  totalJobs: number,
  source: 'jobs' | 'taxonomy'
) {
  // Cache in Redis (7 days)
  const cacheKey = CacheKeys.jobSkills(userId, goalId);
  await setJSON(cacheKey, { frequencies, totalJobs, source }, CacheTTL.JOB_MARKET);
  
  // Store in Supabase for analytics
  const { error } = await supabase
    .from('job_market_skills')
    .upsert({
      user_id: userId,
      goal_id: goalId,
      skill_frequencies: frequencies.reduce((acc, f) => {
        acc[f.canonical_name] = f.frequency;
        return acc;
      }, {} as Record<string, number>),
      total_jobs_analyzed: totalJobs,
      data_source: source, // 'jobs' or 'taxonomy'
      expires_at: new Date(Date.now() + CacheTTL.JOB_MARKET * 1000).toISOString(),
    }, {
      onConflict: 'user_id,goal_id'
    });
  
  if (error) {
    logger.error('Failed to cache job market skills', { error, userId, goalId });
  } else {
    logger.info('Job market skills cached', { 
      userId, 
      goalId, 
      skillCount: frequencies.length,
      source 
    });
  }
}
```

#### 4.4 Job Market API Route

Create `src/routes/jobs.ts`:

```typescript
import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import { extractSkillsFromJobDescriptions } from '../services/jobs/scraper.js';
import { analyzeSkillFrequencies, cacheJobMarketSkills } from '../services/jobs/aggregator.js';
import { generateTaxonomyBasedFrequencies } from '../services/jobs/taxonomyFallback.js';
import { CacheKeys, getJSON } from '../lib/cache/redis.js';
import { ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const app = new Hono();

// Analyze skills from user-pasted job descriptions
app.post('/analyze', authenticate, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { jobDescriptions, goalId, targetRole } = body;
  
  if (!goalId) {
    throw new ValidationError('goalId is required');
  }
  
  // Check cache first
  const cacheKey = CacheKeys.jobSkills(userId, goalId);
  const cached = await getJSON(cacheKey);
  
  if (cached) {
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
  if (jobDescriptions && jobDescriptions.length > 0) {
    const skills = await extractSkillsFromJobDescriptions(jobDescriptions);
    frequencies = await analyzeSkillFrequencies(skills, jobDescriptions.length);
    totalJobs = jobDescriptions.length;
    source = 'jobs';
    
    logger.info('Analyzed user-provided jobs', { userId, goalId, jobCount: totalJobs });
  } 
  // Fallback to Phase 1 taxonomy
  else {
    frequencies = generateTaxonomyBasedFrequencies(targetRole);
    totalJobs = 65; // Number of taxonomy skills
    source = 'taxonomy';
    
    logger.info('Using taxonomy fallback', { userId, goalId, targetRole });
  }
  
  // Cache result
  await cacheJobMarketSkills(userId, goalId, frequencies, totalJobs, source);
  
  return c.json({
    skills: frequencies,
    totalJobs,
    source,
    cached: false,
    message: source === 'taxonomy' 
      ? 'Using curated skill taxonomy (paste job descriptions for personalized analysis)'
      : `Analyzed ${totalJobs} job descriptions`,
  });
});

export default app;
```

Update `src/lib/cache/redis.ts` with new cache key:

```typescript
export const CacheKeys = {
  // ... existing keys ...
  jobSkills: (role: string, seniority: string) => 
    `jobs:skills:${role.toLowerCase()}:${seniority}`,
};

export const CacheTTL = {
  // ... existing TTLs ...
  JOB_MARKET: 7 * 24 * 60 * 60, // 7 days
};
```

Add route to `src/server.ts`:

```typescript
import jobsRoutes from './routes/jobs.js';

app.route('/api/jobs', jobsRoutes);
```

### Testing

#### Manual Testing
```bash
# 1. Start server
npm run dev

# 2. Get job market skills for "Frontend Developer"
curl "http://localhost:5005/api/jobs/skills/Frontend%20Developer?seniority=mid" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Expected response:
# {
#   "role": "Frontend Developer",
#   "seniority": "mid",
#   "skills": [
#     { "skill": "React", "canonical_name": "React", "frequency": 0.85, "occurrences": 42 },
#     { "skill": "TypeScript", "canonical_name": "TypeScript", "frequency": 0.72, "occurrences": 36 },
#     ...
#   ],
#   "totalJobs": 50,
#   "cached": false
# }

# 3. Query again (should be cached)
# cached: true, response < 100ms
```

#### Unit Test
Create `src/services/jobs/__tests__/aggregator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { analyzeSkillFrequencies } from '../aggregator.js';

describe('Skill Frequency Analysis', () => {
  it('should calculate frequencies correctly', async () => {
    const skills = ['React', 'React', 'TypeScript', 'React'];
    const frequencies = await analyzeSkillFrequencies(skills, 4);
    
    expect(frequencies[0].canonical_name).toBe('React');
    expect(frequencies[0].frequency).toBe(0.75); // 3/4
    expect(frequencies[1].canonical_name).toBe('TypeScript');
    expect(frequencies[1].frequency).toBe(0.25); // 1/4
  });
});
```

### Acceptance Criteria

- ✅ **Critical (Blocking)**: Job analysis extracts skills from user-pasted descriptions (<5s for 5 jobs)
- ✅ **Critical**: Skills extracted with LLM (>90% accuracy on manual review)
- ✅ **Critical**: Frequencies calculated correctly (React: 0.85 means 85% of jobs)
- ✅ **Critical**: Caching works (second query <100ms, 7-day TTL)
- ✅ **Critical**: Fallback to Phase 1 taxonomy if API fails
- ⚠️ **Important**: Rate limiting prevents quota exhaustion (max 1000 calls/month)
- ⚠️ **Important**: Normalized skills match Phase 1 taxonomy
- 💡 **Nice-to-have**: Support multiple countries (US, UK, CA)

### Reference Files (Verify Before Using)
- `src/services/taxonomy/normalizer.ts` - Skill normalization (Phase 1)
- `src/lib/cache/redis.ts` - Cache utilities (Phase 1)
- `src/schemas/resume.ts` - Zod schema patterns (Phase 1)

---

## 5. FEATURE 2: SKILL GAP ANALYSIS

### Objective
Compare user skills vs job market data, generate personalized learning paths with LLM.

### Prerequisites
- ✅ Feature 1 (Job Market Integration) completed
- ✅ User has `learning_goals` table entry

### Tasks

#### 5.1 Gap Analyzer

Create `src/services/gaps/analyzer.ts`:

```typescript
import { supabase } from '../../lib/db/supabase.js';
import { CacheKeys, getJSON } from '../../lib/cache/redis.js';
import logger from '../../utils/logger.js';

interface SkillGap {
  skill: string;
  required_frequency: number; // How often market needs it
  user_has: boolean;
  user_level?: string; // 'beginner' | 'intermediate' | 'advanced' | 'expert'
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export async function analyzeGaps(
  userId: string,
  goalId: string
): Promise<{
  gaps: SkillGap[];
  strengths: SkillGap[];
  improvements: SkillGap[];
}> {
  // 1. Fetch user's goal
  const { data: goal, error: goalError } = await supabase
    .from('learning_goals')
    .select('original_goal, refined_goal, target_role')
    .eq('id', goalId)
    .single();
  
  if (goalError || !goal) {
    throw new Error('Goal not found');
  }
  
  const targetRole = goal.target_role || goal.refined_goal || goal.original_goal;
  
  // 2. Fetch user's current skills
  const { data: userSkills } = await supabase
    .from('user_skills')
    .select(`
      skill_id,
      skill_level,
      skill:skills_taxonomy(canonical_name, category)
    `)
    .eq('user_id', userId);
  
  const userSkillMap = new Map(
    userSkills?.map(s => [s.skill.canonical_name, s.skill_level]) || []
  );
  
  // 3. Fetch job market skills (cached from Feature 1)
  // Extract seniority from user profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('experience_level')
    .eq('user_id', userId)
    .single();
  
  const seniority = profile?.experience_level || 'mid';
  const cacheKey = CacheKeys.jobSkills(targetRole, seniority);
  const jobMarketData = await getJSON(cacheKey);
  
  if (!jobMarketData) {
    throw new Error('Job market data not available. Fetch it first via /api/jobs/skills/:role');
  }
  
  // 4. Classify skills
  const gaps: SkillGap[] = [];
  const strengths: SkillGap[] = [];
  const improvements: SkillGap[] = [];
  
  for (const { canonical_name, frequency } of jobMarketData.frequencies) {
    const userLevel = userSkillMap.get(canonical_name);
    const gap: SkillGap = {
      skill: canonical_name,
      required_frequency: frequency,
      user_has: !!userLevel,
      user_level: userLevel,
      priority: getPriority(frequency, userLevel),
    };
    
    if (!userLevel && frequency > 0.5) {
      // High-demand skill user doesn't have
      gaps.push(gap);
    } else if (userLevel && ['beginner', 'intermediate'].includes(userLevel) && frequency > 0.3) {
      // User has it but needs improvement
      improvements.push(gap);
    } else if (userLevel && ['advanced', 'expert'].includes(userLevel)) {
      // User is strong in this skill
      strengths.push(gap);
    }
  }
  
  // Sort by priority
  gaps.sort((a, b) => priorityScore(b.priority) - priorityScore(a.priority));
  improvements.sort((a, b) => b.required_frequency - a.required_frequency);
  
  logger.info('Gap analysis complete', {
    userId,
    goalId,
    gaps: gaps.length,
    improvements: improvements.length,
    strengths: strengths.length,
  });
  
  return { gaps, strengths, improvements };
}

function getPriority(frequency: number, userLevel?: string): 'critical' | 'high' | 'medium' | 'low' {
  if (!userLevel && frequency > 0.7) return 'critical';
  if (!userLevel && frequency > 0.5) return 'high';
  if (userLevel === 'beginner' && frequency > 0.5) return 'high';
  if (userLevel === 'intermediate' && frequency > 0.6) return 'medium';
  return 'low';
}

function priorityScore(priority: string): number {
  const scores = { critical: 4, high: 3, medium: 2, low: 1 };
  return scores[priority] || 0;
}
```

#### 5.2 Learning Path Generator

Create `src/services/gaps/pathGenerator.ts`:

```typescript
import Instructor from '@instructor-ai/instructor';
import { z } from 'zod';
import { openai, MODELS } from '../../lib/llm/openai.js';
import { supabase } from '../../lib/db/supabase.js';
import logger from '../../utils/logger.js';

const LearningStepSchema = z.object({
  step_number: z.number(),
  title: z.string(),
  description: z.string(),
  skills_covered: z.array(z.string()),
  estimated_weeks: z.number(),
  resources: z.array(z.object({
    type: z.enum(['course', 'docs', 'video', 'tutorial', 'book', 'project']),
    title: z.string(),
    url: z.string().url().optional(),
    free: z.boolean().default(true),
  })),
  project_idea: z.string().optional(),
});

const LearningPathSchema = z.object({
  total_estimated_weeks: z.number(),
  steps: z.array(LearningStepSchema),
  key_milestones: z.array(z.string()),
});

const instructor = Instructor({
  client: openai,
  mode: 'TOOLS',
});

export async function generateLearningPath(
  userId: string,
  goalId: string,
  gaps: any[],
  strengths: any[]
) {
  try {
    // 1. Fetch user context
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('display_name, experience_level')
      .eq('user_id', userId)
      .single();
    
    const { data: goal } = await supabase
      .from('learning_goals')
      .select('refined_goal, target_role, target_timeline')
      .eq('id', goalId)
      .single();
    
    // 2. Format prompt
    const gapsList = gaps.map(g => `- ${g.skill} (${Math.round(g.required_frequency * 100)}% of jobs)`).join('\n');
    const strengthsList = strengths.map(s => `- ${s.skill} (${s.user_level})`).join('\n');
    
    const prompt = `Generate a personalized learning path for:
    
**User Profile:**
- Experience: ${profile?.experience_level || 'entry'}
- Current Strengths:
${strengthsList || '  (None yet)'}

**Goal:** ${goal?.refined_goal || goal?.target_role}
**Target Timeline:** ${goal?.target_timeline || '3-6 months'}

**Skills to Learn (Priority Order):**
${gapsList}

**Requirements:**
1. Order steps by prerequisites (learn foundations before advanced)
2. Include hands-on projects for each major skill
3. Recommend free/affordable resources (prefer official docs, freeCodeCamp, YouTube)
4. Be realistic about time estimates
5. Build on user's existing strengths where possible

Generate a step-by-step learning path.`;
    
    // 3. Generate with LLM
    const path = await instructor.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are a career coach creating personalized learning roadmaps for software developers.'
        },
        { role: 'user', content: prompt }
      ],
      model: MODELS.STRUCTURED_OUTPUT,
      temperature: 0.3, // Slight creativity for resource suggestions
      response_model: {
        schema: LearningPathSchema,
        name: 'LearningPath',
      },
      max_retries: 2,
    });
    
    // 4. Store in database
    const { data: savedPath, error } = await supabase
      .from('learning_paths')
      .insert({
        user_id: userId,
        goal_id: goalId,
        path_data: path,
        version: 1,
      })
      .select()
      .single();
    
    if (error) {
      logger.error('Failed to save learning path', { error, userId, goalId });
    }
    
    logger.info('Learning path generated', {
      userId,
      goalId,
      steps: path.steps.length,
      weeks: path.total_estimated_weeks,
    });
    
    return savedPath || path;
  } catch (error) {
    logger.error('Learning path generation failed', { error, userId, goalId });
    throw error;
  }
}
```

#### 5.3 Gap Analysis Route

Create `src/routes/gaps.ts`:

```typescript
import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import { analyzeGaps } from '../services/gaps/analyzer.js';
import { generateLearningPath } from '../services/gaps/pathGenerator.js';
import { supabase } from '../lib/db/supabase.js';
import { ValidationError } from '../utils/errors.js';

const app = new Hono();

// Analyze skill gaps for a goal
app.post('/analyze', authenticate, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { goalId } = body;
  
  if (!goalId) {
    throw new ValidationError('goalId is required');
  }
  
  // Run gap analysis
  const { gaps, strengths, improvements } = await analyzeGaps(userId, goalId);
  
  // Generate learning path (async, don't block response)
  generateLearningPath(userId, goalId, gaps, strengths).catch(err =>
    console.error('Path generation failed', err)
  );
  
  return c.json({
    goalId,
    analysis: {
      gaps: gaps.slice(0, 10), // Top 10 critical gaps
      strengths: strengths.slice(0, 5),
      improvements: improvements.slice(0, 5),
    },
    summary: generateSummary(gaps, strengths, improvements),
  });
});

// Get learning path for a goal
app.get('/:goalId/path', authenticate, async (c) => {
  const userId = c.get('userId');
  const goalId = c.req.param('goalId');
  
  const { data, error } = await supabase
    .from('learning_paths')
    .select('*')
    .eq('user_id', userId)
    .eq('goal_id', goalId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error || !data) {
    return c.json({ error: 'Learning path not found. Run /analyze first.' }, 404);
  }
  
  return c.json(data);
});

function generateSummary(gaps: any[], strengths: any[], improvements: any[]): string {
  const topGaps = gaps.slice(0, 3).map(g => g.skill).join(', ');
  const topStrengths = strengths.slice(0, 2).map(s => s.skill).join(', ');
  
  return `You're strong in ${topStrengths || 'foundational skills'}. ` +
    `To reach your goal, focus on learning: ${topGaps}. ` +
    `${improvements.length} skills need improvement. ` +
    `Personalized learning path generated with ${gaps.length + improvements.length} total skills to master.`;
}

export default app;
```

Add route to `src/server.ts`:

```typescript
import gapsRoutes from './routes/gaps.js';

app.route('/api/gaps', gapsRoutes);
```

### Testing

```bash
# 1. Analyze gaps
curl -X POST http://localhost:5005/api/gaps/analyze \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{ "goalId": "uuid-of-learning-goal" }'

# 2. Get learning path
curl http://localhost:5005/api/gaps/uuid-of-learning-goal/path \
  -H "Authorization: Bearer YOUR_JWT"
```

### Acceptance Criteria

- ✅ **Critical**: Gap analysis identifies skills user lacks (high frequency in jobs, 0% in profile)
- ✅ **Critical**: Learning path generated with realistic time estimates (12 weeks for 5 skills)
- ✅ **Critical**: Steps ordered by prerequisites (HTML → CSS → JavaScript → React)
- ✅ **Critical**: Resources include free options (freeCodeCamp, MDN, YouTube)
- ✅ **Critical**: Response time <30s for analysis + path generation
- ⚠️ **Important**: Path regenerates when user adds new skills
- ⚠️ **Important**: Caching prevents duplicate LLM calls (cache by goalId + user skills hash)
- 💡 **Nice-to-have**: Streaming learning path generation (use Vercel AI SDK)

---

*[Document continues with Features 3-5, Testing Strategy, and Acceptance Criteria in next section...]*

**To be continued in next response due to length constraints**
