# Phase 2 Implementation - Quick Reference

**Version:** 1.0  
**Date:** December 23, 2025  
**Timeline:** 7 weeks  
**Priority Order:** Skill Gaps → LeetCode → Match Feedback → ATS → Deployment

---

## 📋 OVERVIEW

Phase 2 adds **5 major features** on top of Phase 1's foundation:

| # | Feature | Priority | Weeks | Key Endpoints |
|---|---------|----------|-------|---------------|
| 1 | Job Market Integration | 🔥 High | 1-2 | `POST /api/jobs/analyze` (user-paste + fallback) |
| 2 | Skill Gap Analysis | 🔥 High | 2-3 | `POST /api/gaps/analyze`, `GET /api/gaps/:goalId/path` |
| 3 | LeetCode Pattern Analysis | 🔥 High | 3-4 | `POST /api/leetcode/sync`, `GET /api/leetcode/study-partners` |
| 4 | Match Quality Feedback | ⚠️ Med | 4-5 | `POST /api/feedback/matches/:id/feedback` |
| 5 | ATS Scoring | ⚠️ Med | 5-6 | `POST /api/ats/score` |

---

## 🏗️ ARCHITECTURE RULES

### **CRITICAL: File Structure**
```
✅ NEW CODE:    src/ (TypeScript + Hono)
❌ DO NOT TOUCH: services/ (Old Express/JS)
```

All Phase 2 implementations go in:
- `src/services/` - Business logic
- `src/routes/` - API endpoints
- `src/lib/` - Shared utilities

---

## 🔑 KEY TECHNOLOGIES

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Framework** | Hono 4.11.0 | Fast edge-optimized web framework |
| **Language** | TypeScript (strict) | Type safety |
| **LLM** | OpenAI gpt-4o-mini | Structured outputs (Instructor + Zod) |
| **Embeddings** | text-embedding-3-small | 1536-dimension vectors |
| **Vector DB** | Qdrant Cloud | Semantic search |
| **Database** | Supabase (PostgreSQL) | Relational data |
| **Cache** | Upstash Redis | Multi-TTL caching |
| **External API** | Custom LeetCode API | https://leetcode-api.aahil-khan.tech (no auth) |
| **Job Market** | User-pasted + Taxonomy | Zero cost, more accurate |

---

## 📊 FEATURE BREAKDOWN

### **Feature 1: Job Market Integration**

**How it works:**
1. User pastes 3-10 job descriptions they're targeting (or skips)
2. OpenAI extracts skills from descriptions (Instructor + Zod, temp=0)
3. Normalizes skills using Phase 1 taxonomy (vector similarity)
4. Calculates frequency (React in 9/10 jobs = 90% frequency)
5. **Fallback:** If no jobs pasted, uses Phase 1 taxonomy (65 skills with demand scores)
6. Caches for 7 days per user+goal

**Why better than Adzuna API:**
- ✅ More accurate (jobs user ACTUALLY wants)
- ✅ Zero cost (no API fees)
- ✅ Works globally (not country-limited)
- ✅ No rate limits
- ✅ Synergy with ATS scoring (same "paste job" UX)

**Files to create:**
- `src/services/jobs/taxonomyFallback.ts` - Taxonomy-based frequencies
- `src/services/jobs/scraper.ts` - Skill extraction (accepts job array)
- `src/services/jobs/aggregator.ts` - Frequency calculator
- `src/routes/jobs.ts` - Endpoints

**Key endpoint:**
```bash
POST /api/jobs/analyze
{
  "goalId": "uuid",
  "targetRole": "Frontend Developer",
  "jobDescriptions": [
    "We need a Senior Frontend Developer with React, TypeScript...",
    "Looking for Frontend Engineer: Next.js, GraphQL..."
  ]
}
# Response: { skills: [{ canonical_name: "React", frequency: 0.90 }], totalJobs: 2, source: "jobs" }

# OR skip job descriptions (taxonomy fallback):
POST /api/jobs/analyze { "goalId": "uuid", "targetRole": "Frontend Developer" }
# Response: { skills: [...], totalJobs: 65, source: "taxonomy", message: "Using curated taxonomy..." }
```

---

### **Feature 2: Skill Gap Analysis**

**How it works:**
1. Compares user skills vs job market frequencies
2. Identifies critical gaps (market needs it, user doesn't have it)
3. LLM generates ordered learning path with time estimates
4. Includes free resources (Docs, FreeCodeCamp, YouTube)
5. Regenerates when user skills change

**Files to create:**
- `src/services/gaps/analyzer.ts` - Gap identification
- `src/services/gaps/pathGenerator.ts` - LLM path generation
- `src/routes/gaps.ts` - Endpoints

**Key endpoints:**
```bash
POST /api/gaps/analyze { goalId }
GET /api/gaps/:goalId/path
```

---

### **Feature 3: LeetCode Pattern Analysis**

**How it works:**
1. Fetches profile + stats from custom API (https://leetcode-api.aahil-khan.tech)
2. Gets recent 20 submissions + problem details (cached 30 days)
3. Analyzes skill stats (fundamental/intermediate/advanced categorization)
4. LLM identifies: strengths, weaknesses, comfort level, consistency
5. Generates embedding for DSA-based matching
6. **Smart re-sync:** Auto-triggers if data >24h old

**Files to create:**
- `src/services/leetcode/apiClient.ts` - External API calls with rate limiting
- `src/services/leetcode/fetcher.ts` - Profile fetcher + smart sync logic
- `src/services/leetcode/patternAnalyzer.ts` - Pattern analysis with LLM
- `src/services/leetcode/embedder.ts` - Vector generation
- `src/routes/leetcode.ts` - Endpoints

**Key endpoints:**
```bash
POST /api/leetcode/sync { username }  # Manual sync
GET /api/leetcode/patterns            # Auto-sync if stale
GET /api/leetcode/study-partners      # DSA matching
```

**Dual Matching Modes:**
- **Mode 1**: Project/stack (Phase 1) → `GET /api/matches`
- **Mode 2**: DSA study partners (Phase 2) → `GET /api/leetcode/study-partners`

**Match types:**
- `peer` - Similar comfort level
- `mentor` - Their strength = your weakness, higher comfort level
- `mentee` - Your strength = their weakness, lower comfort level

---

### **Feature 4: Match Quality Feedback**

**How it works:**
1. User swipes on match (like/dislike/skip/connect)
2. Stores feedback + match_score + scoring_factors
3. Analytics: Conversion rate by score buckets
   - 90-100: 80% like rate
   - <70: 20% like rate
4. Phase 3 ML input: Which factors correlate with success?

**Files to create:**
- `src/services/feedback/index.ts` - Recording + analytics
- `src/routes/feedback.ts` - Endpoints
- Update `src/routes/matching.ts` - Add previous_feedback field

**Key endpoints:**
```bash
POST /api/feedback/matches/:candidateId/feedback
GET /api/feedback/analytics
```

---

### **Feature 5: ATS Scoring**

**How it works:**
1. **Skills match (50%):** Keyword comparison (2/3 = 66%)
2. **Experience match (30%):** Years calculation (4/5 = 80%)
3. **Semantic match (20%):** Cosine similarity of embeddings (78%)
4. **Weighted score:** `66×0.5 + 80×0.3 + 78×0.2 = 72%`
5. **Suggestions:** "Add Docker → +10%"

**Files to create:**
- `src/services/ats/scorer.ts` - Scoring logic
- `src/routes/ats.ts` - Endpoints

**Key endpoints:**
```bash
POST /api/ats/score { resumeId, jobTitle, jobDescription }
GET /api/ats/history
GET /api/ats/:scoreId
```

---

## 🗄️ DATABASE SCHEMA UPDATES

Run in Supabase SQL editor:

```sql
-- Feature 1: Job market cache (user-pasted OR taxonomy)
CREATE TABLE job_market_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES learning_goals(id) ON DELETE CASCADE,
  skill_frequencies JSONB NOT NULL,
  total_jobs_analyzed INT NOT NULL,
  data_source TEXT CHECK (data_source IN ('jobs', 'taxonomy')) NOT NULL,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(user_id, goal_id)
);

-- Feature 2: Learning paths
CREATE TABLE learning_paths (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES learning_goals(id) ON DELETE CASCADE,
  path_data JSONB NOT NULL,
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feature 3: LeetCode profiles
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
  pattern_analysis JSONB,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feature 4: Match feedback
CREATE TABLE match_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_type TEXT CHECK (feedback_type IN ('like', 'dislike', 'skip', 'connect')),
  match_score DECIMAL(5,2),
  scoring_factors JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, candidate_id)
);

-- Feature 5: ATS scores
CREATE TABLE ats_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL,
  job_description TEXT NOT NULL,
  overall_score DECIMAL(5,2) NOT NULL,
  score_breakdown JSONB NOT NULL,
  suggestions JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## ⚙️ ENVIRONMENT VARIABLES

Add to `.env`:

```bash
# Existing (Phase 1)
OPENAI_API_KEY=sk-...
QDRANT_URL=https://...
QDRANT_API_KEY=...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
REDIS_URL=redis://...

# Phase 2: NO NEW API KEYS NEEDED! ✅
# Job market: User-pasted descriptions (zero cost)
# LeetCode: Custom API (https://leetcode-api.aahil-khan.tech, no auth required)
```

---

## 🎯 PERFORMANCE TARGETS

| Operation | Target | Acceptable | Unacceptable |
|-----------|--------|------------|--------------|
| Job analysis (user-pasted) | <5s | <10s | >15s |
| Job analysis (cached) | <100ms | <500ms | >1s |
| Gap analysis | <10s | <30s | >60s |
| Learning path generation | <15s | <30s | >45s |
| LeetCode sync | <8s | <15s | >30s |
| ATS scoring | <3s | <7s | >10s |
| Match feedback | <100ms | <500ms | >1s |

---

## 💰 COST ESTIMATES

**Phase 2 Cost Breakdown:**

| Service | Usage (1000 users/mo) | Cost |
|---------|------------------------|------|
| OpenAI (gpt-4o-mini) | 50K LLM calls | ~$25/mo |
| OpenAI (embeddings) | 10K vectors | ~$1/mo |
| ~~Adzuna API~~ | ~~50K jobs~~ | ~~$50/mo~~ **REMOVED ✅** |
| Cohere (optional) | Reranking | ~$10/mo (if used) |
| **Phase 2 Total** | | **~$26-36/mo** |
| **Phase 1+2 Combined** | | **~$125/mo** |

**LLM Operations (gpt-4o-mini @ $0.15/1M input, $0.60/1M output):**

| Operation | Tokens | Cost/Call | Monthly @ 1000 users |
|-----------|--------|-----------|----------------------|
| Resume parsing | ~8k | $0.002 | $2 (1x/user) |
| Skill extraction (job) | ~2k × 5 | $0.003 | $3 (shared cache) |
| Gap analysis | ~5k | $0.002 | $20 (10x/user) |
| Learning path | ~8k | $0.004 | $40 (10x/user) |
| LeetCode patterns | ~6k | $0.003 | $6 (2x/user) |
| ATS scoring | ~10k | $0.005 | $25 (5x/user) |

---

## ✅ ACCEPTANCE CHECKLIST

### Critical (Must Work for Launch)

- [ ] Job analysis extracts skills from user-pasted descriptions
- [ ] Taxonomy fallback works when no jobs provided
- [ ] Skills extracted with >90% accuracy (Instructor + Zod validation)
- [ ] Gap analysis identifies missing skills correctly
- [ ] Learning paths ordered by prerequisites
- [ ] LeetCode profile syncs successfully
- [ ] Pattern analysis identifies strengths/weaknesses
- [ ] Study partners show complementary patterns
- [ ] Match feedback records successfully
- [ ] Analytics show conversion rates
- [ ] ATS scoring works (50% skills, 30% exp, 20% semantic)
- [ ] Suggestions actionable
- [ ] All responses <30s

### Important (Quality)

- [ ] Caching works (7 days for jobs, 30 days for problems)
- [ ] Rate limiting prevents API throttling
- [ ] Smart re-sync triggers when data stale
- [ ] Handles edge cases (0 skills, no experience)
- [ ] Score history tracks improvement

### Nice-to-have (v2)

- [ ] Problem recommendations
- [ ] Feedback trends dashboard
- [ ] Multi-country job search
- [ ] Unified matching (project + DSA combined)

---

## 📅 IMPLEMENTATION ORDER

### Week 1-2: Job Market + Skill Gaps
1. Implement taxonomy fallback helper (`taxonomyFallback.ts`)
2. Update job scraper to accept description array (`scraper.ts`)
3. Add user-paste route (`POST /api/jobs/analyze`)
4. Build gap analyzer + LLM path generator
5. Test with both user-pasted jobs and taxonomy fallback

### Week 3-4: LeetCode Integration
1. External API client with rate limiting
2. Pattern analyzer with fundamental/intermediate/advanced
3. DSA matching with mentor/peer/mentee categorization
4. Smart re-sync implementation (>24h auto + manual button)

### Week 4-5: Feedback + ATS
1. Match feedback tracking
2. Analytics dashboard
3. ATS scoring engine (synergy with job paste UX)
4. Suggestion generator

### Week 6-7: Testing + Deployment
1. Unit tests (>80% coverage)
2. Integration tests (determinism validation)
3. Performance testing
4. Production deployment prep

---

## 🎉 WHY THIS APPROACH WINS

**User-Pasted Job Descriptions vs Adzuna API:**

| Aspect | User-Paste ✅ | Adzuna API ❌ |
|--------|---------------|---------------|
| **Accuracy** | Jobs user ACTUALLY wants | Generic market data |
| **Cost** | $0/mo | ~$50/mo |
| **Coverage** | Global (any job board) | Limited countries |
| **Rate Limits** | None | 1000 calls/mo (free tier) |
| **Privacy** | No external API sees data | Shares user intent |
| **Reliability** | No API downtime | Dependent on external service |
| **UX Synergy** | Same workflow as ATS | Separate workflows |
| **Personalization** | Targeted to user goals | Broad market trends |

**Fallback to Taxonomy:**
- Phase 1's 65 curated skills with `job_demand_frequency` (0.1-0.9)
- Perfect for users who don't have job descriptions yet
- Still provides value (validated skill list + demand scores)
- Zero API dependency

---

## 📝 EXAMPLE USER FLOW

```
1. User: "I want to become a Senior Frontend Developer"
   ↓
2. System: "Paste 3-10 job descriptions you're targeting (or skip)"
   ↓
3a. USER PASTES 5 JOBS:
   POST /api/jobs/analyze { jobDescriptions: [...], goalId }
   → LLM extracts: React (90%), TypeScript (85%), Next.js (70%)
   → Cache 7 days
   ↓
   POST /api/gaps/analyze { goalId }
   → Gaps: Next.js (missing), TypeScript (level up needed)
   ↓
   GET /api/gaps/:goalId/path
   → LLM generates: Step 1: Master TypeScript (2 weeks)
                    Step 2: Build Next.js project (3 weeks)
   ↓
   System matches with mentors who have Next.js expertise

3b. USER SKIPS (no jobs pasted):
   POST /api/jobs/analyze { goalId, targetRole: "Frontend Developer" }
   → Returns taxonomy frequencies (React: 0.85, TypeScript: 0.78)
   → source: 'taxonomy'
   ↓
   Same gap analysis flow with curated taxonomy data
```

---

## 🔗 DOCUMENT REFERENCES

- **Part 1:** Features 1-2 (Job Market + Skill Gaps)
- **Part 2:** Features 3-5 (LeetCode + Feedback + ATS) + Testing + Acceptance Criteria
- **Phase 1 Summary:** Actual Phase 1 implementation reference
- **LeetCode API Doc:** Custom API endpoint documentation

---

**Ready to implement?** Start with Feature 1 (Job Market Integration) in Part 1!
