# SkillMap Engine - Production Refactor Master Plan

**Date:** December 13, 2025  
**Status:** Architecture Approved - Ready for Implementation  
**Timeline:** 4-5 Weeks to Launch

---

## 📋 TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Product Understanding](#product-understanding)
3. [Current State Analysis](#current-state-analysis)
4. [Technology Stack Decisions](#technology-stack-decisions)
5. [Architecture Design](#architecture-design)
6. [Data Models & Storage Strategy](#data-models--storage-strategy)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Cost Analysis](#cost-analysis)
9. [Migration Strategy](#migration-strategy)
10. [Success Metrics](#success-metrics)

---

## 1. EXECUTIVE SUMMARY

### The Problem
Current SkillMap Engine suffers from critical production blockers:
- **Non-deterministic resume parsing** - Same resume returns different results
- **Poor peer matching accuracy** - String matching misses semantic relationships
- **No caching** - Every request hits OpenAI APIs (slow + expensive)
- **Inconsistent data quality** - Embeddings poorly constructed
- **Zero observability** - Can't debug production issues

### The Solution
**Clean rewrite** with production-grade architecture:
- TypeScript + modern tooling for type safety
- Deterministic LLM operations (temp=0, structured outputs)
- Semantic vector search with reranking for accurate matching
- Redis caching (80-90% cost reduction)
- LangSmith + Sentry observability
- Dynamic skill gap detection (job market analysis, not static taxonomy)

### Success Criteria
- ✅ **Same resume = same output** (100% determinism)
- ✅ **Peer matching accuracy**: 3 high-quality matches > 10 mediocre matches
- ✅ **Response times**: Resume 5-10s, Gaps 10-30s, Matching <2s (real-time Tinder style)
- ✅ **Cost**: <$50/mo infrastructure, <$10/mo OpenAI for 500 users
- ✅ **Launch-ready**: 4-5 weeks

---

## 2. PRODUCT UNDERSTANDING

### Core Value Proposition
**SkillMap helps technical learners:**
1. **Understand themselves** - Parse resume/LeetCode → identify strengths/gaps
2. **Get personalized guidance** - Dynamic learning paths based on real job market
3. **Connect with peers** - Tinder-style matching for collaboration/study partners

### User Flow (Priority Order)
```
PRIORITY 1: Peer Matching (Core Feature)
├─ User creates profile → Algorithm finds matches → Swipe/Connect → DMs
└─ Use Cases: Project collaboration, DSA study partners, skill exchange

PRIORITY 2: Skill Gap Analysis
├─ User sets goal → System analyzes gaps → Shows personalized roadmap
└─ Use Cases: Career transitions, interview prep, curriculum planning

PRIORITY 3: Resume Processing
├─ User uploads resume → Extracts skills/experience → Creates searchable profile
└─ Use Cases: Profile creation, skill inventory, baseline assessment

PRIORITY 4: LeetCode Integration
├─ User links LeetCode → Analyzes patterns → Suggests problems/finds peers
└─ Use Cases: DSA mastery, finding study partners at same level
```

### Key Product Decisions
- **Matching Type**: Bidirectional (Tinder-style, both must approve)
- **Real-time Requirement**: Yes for matching; 10-30s acceptable for analysis
- **Learning Paths**: Ordered roadmap with resources (like roadmap.sh)
- **LeetCode Use Case**: Find same-level peers for DSA study together
- **Focus**: All features important, but **peer matching accuracy is #1 priority**

---

## 3. CURRENT STATE ANALYSIS

### Existing Features Inventory

#### ✅ **Working Components to Preserve**
1. **Authentication** (`middleware/auth.js`) - Supabase JWT validation
2. **Error Handling** (`middleware/errorHandler.js`, `utils/errors.js`) - Custom error classes
3. **Structured Logging** (`utils/logger.js`) - File + console logging
4. **PDF Parsing** (`utils/pdfParser.js`) - Extracts text from resumes
5. **Database Schemas** (Supabase):
   - User profiles, skills, experience, projects, education
   - Learning goals tracking
   - Peer profiles, connections, messaging
   - LeetCode profile storage
   - ATS scoring history

#### ⚠️ **Components Needing Major Refactor**
1. **Resume Service** (`services/resumeService.js`)
   - **Problem**: No temperature=0, taxonomy in prompt (376 lines!), inconsistent outputs
   - **Fix**: Structured outputs, two-pass extraction, caching

2. **Peer Matching** (`services/peerMatchingService.js`)
   - **Problem**: String matching (`skill_name.toLowerCase()`), misses synonyms
   - **Fix**: Multi-vector embeddings + cross-encoder reranking

3. **Skill Gap Detection** (`services/skillGapService.js`)
   - **Problem**: Static taxonomy (outdated, too generic)
   - **Fix**: Dynamic job market analysis + LLM reasoning

4. **LeetCode Matching** (`services/leetcodeEmbedService.js`)
   - **Problem**: Only embeds stats, not problem-solving patterns
   - **Fix**: Pattern analysis (strength/weak areas, difficulty comfort level)

5. **Profile Embeddings** (`services/userProfileService.js`)
   - **Problem**: Single vector, simple concatenation, dummy vectors in searches
   - **Fix**: Multi-vector approach (skills, goals, experience separate)

#### 📦 **Existing Features to Migrate**
1. **ATS Scoring** (`services/atsService.js`) - Resume vs job description matching
2. **Goal Conversion** (`services/convertToStandaloneService.js`) - Conversational goal → standalone
3. **Problem Suggestions** (`services/suggestProblemService.js`) - LeetCode recommendations
4. **User Data Aggregation** (`services/userDataService.js`) - Fetch complete profile
5. **Peer Connections** (`services/peerConnectionsService.js`) - Connection requests + messaging
6. **Peer Profiles** (`services/peerProfileService.js`) - Profile CRUD

#### 🗄️ **Database Tables (Supabase)**
```
Core Profile Data:
- user_profiles (name, email, strengths)
- skills (skill_name, skill_level, category)
- work_experience (title, company, duration, technologies)
- projects (name, description, technologies)
- education (degree, institution, year)

Learning & Goals:
- learning_goals (original_goal, refined_goal, status)
- ats_history (score tracking over time)

Resume Storage:
- resumes (raw_text, file_path, analysis_result)

LeetCode:
- leetcode_profiles (username, ranking, stats)

Peer System:
- peer_profiles (display_name, bio, experience_level, availability)
- peer_connections (sender, receiver, status, connection_type)
- peer_messages (connection_id, message_text, is_read)

Qdrant Collections:
- user_profiles (full profile embeddings)
- skill_taxonomy (skill embeddings)
- user_leetcode_embeddings (LeetCode pattern embeddings)
```

---

## 4. TECHNOLOGY STACK DECISIONS

### 🎯 Approved Tech Stack

| Component | Technology | Reasoning |
|-----------|-----------|-----------|
| **Language** | TypeScript | Type safety, better DX, prevents runtime errors |
| **Framework** | Hono | Modern, fast (EdgeRuntime-ready), excellent TS support, lightweight |
| **Architecture** | Modular Monolith (SOC) | Simple deployment, fast iteration, sufficient for 500-5k users |
| **LLM Orchestration** | Instructor + Direct OpenAI | Full control for deterministic tasks, no abstraction overhead |
| **Streaming AI** | Vercel AI SDK | For user-facing features (learning paths), streaming support |
| **Embeddings** | OpenAI text-embedding-3-small | Cost-effective, 1536 dims, proven quality |
| **Vector DB (Primary)** | Qdrant Cloud | Fast similarity search for peer matching, multi-vector support |
| **Vector DB (Secondary)** | Pgvector (Supabase) | Low-volume queries, transactional updates, cost savings |
| **Caching** | Upstash Redis | Serverless, pay-per-request, $1-2/mo at 500 users |
| **RDBMS** | Supabase (PostgreSQL) | Existing investment, free tier sufficient, good DX |
| **Reranking** | Cohere Rerank API | 20-30% accuracy boost for $0.50/mo |
| **Validation** | Zod | Runtime type checking, integrated with TS |
| **Observability** | LangSmith + Sentry | LLM tracing + error tracking |
| **Logging** | Pino | Structured JSON logs, fast |
| **Testing** | Vitest + Playwright | Unit + E2E |
| **Deployment** | AWS App Runner | Simple PaaS, auto-scaling, $20/mo |

### 🚫 Rejected Alternatives & Why

**LangChain**: Abstraction overhead for simple use case, breaking changes, harder debugging  
**LlamaIndex**: Better for document Q&A, overkill for structured data  
**NestJS**: Too much boilerplate, opinionated structure not needed  
**Pinecone**: 3x more expensive than Qdrant for same features  
**Microservices**: Operational overhead not justified for 500-user scale  
**Fine-tuned embeddings**: $100-500 setup cost for 5-10% gain, not worth it yet  
**ColBERT**: 100x storage cost, academic approach overkill for this scale  

---

## 5. ARCHITECTURE DESIGN

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│              Hono API (TypeScript)                      │
│  Port 5005 | JWT Auth | Rate Limiting | Request Tracing│
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌──────────────┐
│   Resume    │ │    Peer     │ │  Skill Gap   │
│   Service   │ │  Matching   │ │   Service    │
│             │ │   Service   │ │   (Dynamic)  │
└──────┬──────┘ └──────┬──────┘ └──────┬───────┘
       │               │               │
       └───────────────┴───────────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
       ▼               ▼               ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│  OpenAI    │  │   Qdrant   │  │  Supabase  │
│  (temp=0)  │  │Multi-Vector│  │   RDBMS +  │
│+ Cohere    │  │  +Rerank   │  │  Pgvector  │
└─────┬──────┘  └─────┬──────┘  └─────┬──────┘
      │               │               │
      │         ┌─────┴─────┐         │
      │         │           │         │
      └────────▶│  Upstash  │◀────────┘
                │   Redis   │
                │  (Cache)  │
                └─────┬─────┘
                      │
               ┌──────┴──────┐
               │             │
               ▼             ▼
        ┌───────────┐ ┌────────────┐
        │ LangSmith │ │   Sentry   │
        │  Traces   │ │   Errors   │
        └───────────┘ └────────────┘
```

### Service Boundaries

```typescript
src/
├── server.ts                    # Hono app entry point
├── routes/
│   ├── resume.ts               # POST /resume/upload, GET /resume/:id
│   ├── profile.ts              # POST /profile, GET /profile, PATCH /profile
│   ├── matching.ts             # GET /matches, POST /matches/swipe
│   ├── connections.ts          # GET /connections, POST /connections/:id/respond
│   ├── gaps.ts                 # POST /gaps/analyze, GET /gaps/:id
│   ├── leetcode.ts             # POST /leetcode/sync, GET /leetcode/suggestions
│   └── health.ts               # GET /health
├── services/
│   ├── resume/
│   │   ├── parser.ts           # PDF → text extraction
│   │   ├── extractor.ts        # LLM structured extraction (Instructor)
│   │   └── normalizer.ts       # Skill normalization (vector similarity)
│   ├── matching/
│   │   ├── embedder.ts         # Multi-vector profile embeddings
│   │   ├── matcher.ts          # Candidate retrieval (Qdrant)
│   │   ├── scorer.ts           # Multi-factor scoring algorithm
│   │   └── reranker.ts         # Cross-encoder reranking (Cohere)
│   ├── gaps/
│   │   ├── analyzer.ts         # Goal → job market analysis
│   │   ├── jobScraper.ts       # Fetch job postings (GitHub Jobs API)
│   │   └── pathGenerator.ts    # LLM learning path generation
│   ├── leetcode/
│   │   ├── fetcher.ts          # LeetCode API integration
│   │   └── analyzer.ts         # Pattern analysis (not just stats)
│   └── messaging/
│       ├── connections.ts      # Connection request handling
│       └── chat.ts             # Peer messaging
├── lib/
│   ├── llm/
│   │   ├── instructor.ts       # Structured output helper
│   │   ├── vercel-ai.ts        # Streaming helpers
│   │   └── prompts/            # Prompt templates
│   ├── vector/
│   │   ├── qdrant.ts           # Qdrant client
│   │   ├── pgvector.ts         # Supabase vector operations
│   │   └── embeddings.ts       # OpenAI embeddings wrapper
│   ├── cache/
│   │   └── redis.ts            # Upstash Redis client
│   └── db/
│       ├── supabase.ts         # Supabase client
│       └── queries/            # Typed SQL queries
├── schemas/
│   ├── resume.ts               # Zod schemas for resume data
│   ├── profile.ts              # User profile schemas
│   ├── matching.ts             # Matching request/response schemas
│   └── leetcode.ts             # LeetCode data schemas
├── middleware/
│   ├── auth.ts                 # JWT validation
│   ├── errors.ts               # Error handler
│   ├── logger.ts               # Request logging
│   └── rateLimit.ts            # Rate limiting
└── utils/
    ├── errors.ts               # Custom error classes
    ├── logger.ts               # Pino logger config
    └── validation.ts           # Validation helpers
```

---

## 6. DATA MODELS & STORAGE STRATEGY

### Storage Decision Matrix

| Data Type | Store Where | Why | TTL/Retention |
|-----------|-------------|-----|---------------|
| **Raw Resume PDF** | S3/Local (temp) | Legal/backup | 24 hours (delete after success) |
| **Parsed Resume Data** | Supabase | Structured queries, profile edits | Permanent |
| **Skill Embeddings** | Qdrant | Fast semantic search | Permanent |
| **Profile Embeddings** | Qdrant (multi-vector) | Real-time matching | Permanent (update on change) |
| **User Metadata** | Supabase | Relational queries, joins | Permanent |
| **Peer Connections** | Supabase | Transaction support | Permanent |
| **Messages** | Supabase | Query history, read status | Permanent (90 days?) |
| **Learning Goals** | Supabase | Track progress over time | Permanent |
| **Job Market Data** | Redis Cache | External API, slow to fetch | 7 days |
| **Parsed Resumes** | Redis Cache | Avoid re-parsing duplicates | 30 days |
| **Match Results** | Redis Cache | Frequently accessed | 1 hour |
| **Skill Taxonomy** | Qdrant + Redis | Semantic search + fast lookup | Permanent + 90 days |

### Multi-Vector Embedding Strategy

```typescript
// Instead of single profile embedding, create faceted embeddings:

interface UserVectorProfile {
  user_id: string;
  
  // Separate vectors for different aspects
  vectors: {
    skills: number[];        // Embedding of "Python|Expert, React|Intermediate, ..."
    goals: number[];         // Embedding of learning goals
    experience: number[];    // Embedding of work experience summary
    projects: number[];      // Embedding of project descriptions
  };
  
  // Filterable metadata
  metadata: {
    skill_count: number;
    experience_level: 'Entry Level' | '1-3 years' | '3-5 years' | '5+ years';
    primary_categories: string[];  // Top 3 skill categories
    has_leetcode: boolean;
    availability: string[];
    last_active: Date;
  };
}

// Matching algorithm:
// 1. Query with weighted average: skills*0.4 + goals*0.3 + experience*0.3
// 2. Retrieve 100 candidates
// 3. Rerank with Cohere (takes into account subtle relationships)
// 4. Return top 10
```

### Skill Taxonomy 2.0 (Dynamic)

```typescript
// OLD: Static 376-line JSON file (outdated, generic)
// NEW: Dynamic skill graph + job market analysis

interface SkillNode {
  canonical_name: string;        // "React"
  aliases: string[];             // ["ReactJS", "React.js", "React Native"]
  category: string;              // "Frontend Frameworks"
  prerequisites: string[];       // ["JavaScript", "HTML", "CSS"]
  commonly_paired_with: string[]; // ["Redux", "Next.js", "TypeScript"]
  job_demand: {
    frequency: number;           // % of job postings mentioning this
    last_updated: Date;
  };
  embedding: number[];           // For semantic similarity
}

// Population strategy:
// 1. Start with curated seed list (100 core skills)
// 2. Weekly job scraping to update demand stats
// 3. Extract new skills from job postings automatically
// 4. User-contributed skills (moderation queue)
```

### Caching Strategy Details

```typescript
// Cache Keys Schema
const CacheKeys = {
  // Resume parsing (prevent duplicate processing)
  RESUME_HASH: (hash: string) => `resume:parsed:${hash}`,        // TTL: 30 days
  
  // Embeddings (expensive to recompute)
  PROFILE_EMBEDDING: (userId: string, version: number) => 
    `embedding:profile:${userId}:v${version}`,                   // TTL: 7 days
  SKILL_EMBEDDING: (skillName: string) => 
    `embedding:skill:${skillName}`,                              // TTL: 90 days
  
  // Job market data (external API)
  JOB_SKILLS: (role: string, seniority: string) => 
    `jobs:skills:${role}:${seniority}`,                          // TTL: 7 days
  
  // Peer matching results (frequently accessed)
  MATCH_CANDIDATES: (userId: string) => 
    `matches:${userId}`,                                         // TTL: 1 hour
  
  // User session data
  USER_PROFILE: (userId: string) => 
    `profile:${userId}`,                                         // TTL: 15 min
};

// Smart invalidation:
// - Profile updated → invalidate USER_PROFILE + PROFILE_EMBEDDING
// - New skill added → invalidate MATCH_CANDIDATES
// - Resume re-uploaded → invalidate RESUME_HASH
```

---

## 7. IMPLEMENTATION ROADMAP

### Phase 1: Foundation & Critical Fixes (Weeks 1-2)

#### Week 1: Project Setup + Deterministic Resume Parsing

**Day 1-2: Bootstrapping**
- [ ] Initialize new repo branch `feat/production-refactor`
- [ ] Setup TypeScript + Hono boilerplate
- [ ] Configure tsconfig, eslint, prettier
- [ ] Setup Vitest for testing
- [ ] Create folder structure (routes, services, lib, schemas)
- [ ] Setup environment variables + dotenv
- [ ] Initialize Pino logger

**Day 3-5: Resume Parsing Refactor**
- [ ] Install Instructor + Zod
- [ ] Create `schemas/resume.ts` (strict Zod schema)
- [ ] Implement deterministic parser:
  ```typescript
  // services/resume/extractor.ts
  const extractResume = instructor({
    client: openai,
    mode: "TOOLS",
  });
  
  const result = await extractResume({
    messages: [{
      role: "user",
      content: resumeText,
    }],
    response_model: { schema: ResumeSchema, name: "Resume" },
    model: "gpt-4o-mini",
    temperature: 0,  // CRITICAL: Deterministic
    max_retries: 3,
  });
  ```
- [ ] Implement skill normalization (two-pass):
  - Pass 1: Extract skills as-is from resume
  - Pass 2: Semantic match to skill taxonomy via vector similarity
- [ ] Add Redis caching layer (hash resume text → cache parsed result)
- [ ] Write tests: Same resume → same output (10 runs)

**Day 6-7: Integration + Testing**
- [ ] Create POST /resume/upload endpoint
- [ ] Integrate with existing Supabase schema
- [ ] Test with 5-10 sample resumes
- [ ] Benchmark: Determinism check, response time, cost per resume

**Deliverables:**
- ✅ 100% deterministic resume parsing
- ✅ 90% cache hit rate after initial upload
- ✅ 5-10s parse time (first time), <500ms (cached)
- ✅ Cost: <$0.001 per resume (with caching)

#### Week 2: Semantic Peer Matching

**Day 1-3: Multi-Vector Embeddings**
- [ ] Design multi-vector schema (skills, goals, experience, projects)
- [ ] Implement `services/matching/embedder.ts`:
  ```typescript
  async function createUserVectors(profile: UserProfile) {
    const [skillsVec, goalsVec, expVec] = await Promise.all([
      embed(formatSkills(profile.skills)),
      embed(profile.goals.join(', ')),
      embed(formatExperience(profile.experience)),
    ]);
    
    return {
      skills: skillsVec,
      goals: goalsVec,
      experience: expVec,
      weighted_avg: weightedAverage([
        { vector: skillsVec, weight: 0.4 },
        { vector: goalsVec, weight: 0.3 },
        { vector: expVec, weight: 0.3 },
      ]),
    };
  }
  ```
- [ ] Update Qdrant schema to support multi-vectors
- [ ] Migrate existing embeddings to new format
- [ ] Create payload indexes for filtering

**Day 4-6: Matching Algorithm + Reranking**
- [ ] Implement candidate retrieval:
  ```typescript
  // services/matching/matcher.ts
  async function findCandidates(userId: string, limit = 100) {
    const userVectors = await getUserVectors(userId);
    
    return await qdrant.search("user_profiles", {
      vector: userVectors.weighted_avg,
      limit,
      filter: {
        must: [
          { key: "user_id", match: { value: { $ne: userId } } },
          { key: "is_active", match: { value: true } },
        ],
      },
    });
  }
  ```
- [ ] Implement multi-factor scoring:
  - Shared skills (30%)
  - Complementary skills (25%)
  - Goal alignment (20%)
  - Experience compatibility (15%)
  - Availability match (10%)
- [ ] Integrate Cohere Rerank API:
  ```typescript
  const reranked = await cohere.rerank({
    model: "rerank-english-v3.0",
    query: userProfile.toString(),
    documents: candidates.map(c => c.profile.toString()),
    top_n: 10,
  });
  ```
- [ ] Add Redis caching for match results (1 hour TTL)

**Day 7: Testing + Optimization**
- [ ] Test matching quality manually (10 user pairs)
- [ ] Benchmark: Latency (<2s), cache hit rate
- [ ] A/B test: Old matching vs new matching accuracy

**Deliverables:**
- ✅ Semantic matching (handles synonyms, related skills)
- ✅ <2s response time for real-time Tinder-style matching
- ✅ 20-30% accuracy improvement (qualitative test)
- ✅ 80% cache hit rate for repeated match queries

### Phase 2: Dynamic Skill Gaps + Performance (Week 3)

**Day 1-3: Job Market Integration**
- [ ] Setup GitHub Jobs API integration (free tier)
- [ ] Implement `services/gaps/jobScraper.ts`:
  ```typescript
  async function fetchJobSkills(role: string, limit = 100) {
    const jobs = await fetch(`https://api.github.com/jobs?description=${role}&limit=${limit}`);
    
    // Extract skills from job descriptions
    const skills = await llm.extract({
      jobs: jobs.map(j => j.description),
      schema: JobSkillsSchema,
    });
    
    // Aggregate skill frequencies
    return aggregateSkills(skills);
  }
  ```
- [ ] Cache job data (7 days TTL)
- [ ] Fallback to static taxonomy if API fails

**Day 4-5: Learning Path Generation**
- [ ] Implement dynamic gap analysis:
  ```typescript
  async function analyzeGaps(userId: string, goal: string) {
    // 1. Get user's current skills
    const userSkills = await getUserSkills(userId);
    
    // 2. Query job market for role (cached)
    const jobSkills = await fetchJobSkills(goal);
    
    // 3. LLM generates personalized path
    const path = await llm.generate({
      prompt: `User has: ${userSkills}. Job requires: ${jobSkills.top20}. 
               Generate learning path considering prerequisites.`,
      schema: LearningPathSchema,
    });
    
    return path;
  }
  ```
- [ ] Integrate with existing POST /gaps/analyze endpoint
- [ ] Generate roadmap resources (link to tutorials, courses)

**Day 6-7: Caching & Optimization**
- [ ] Implement full Redis caching layer
- [ ] Add cache warming (pre-cache popular roles)
- [ ] Benchmark cost savings (before/after caching)
- [ ] Load testing (simulate 50 concurrent users)

**Deliverables:**
- ✅ Dynamic gap detection (always up-to-date with job market)
- ✅ Personalized learning paths (not generic)
- ✅ 10-30s response time for gap analysis
- ✅ 80-90% cost reduction via caching

### Phase 3: LeetCode Enhancement + Observability (Week 4)

**Day 1-2: LeetCode Pattern Analysis**
- [ ] Enhance `services/leetcode/analyzer.ts`:
  ```typescript
  interface LeetCodePattern {
    strength_areas: string[];     // "DP", "Graphs"
    weak_areas: string[];         // "Bit Manipulation"
    comfort_level: "Easy" | "Medium" | "Hard";
    consistency: number;          // 0-1 solve frequency
    growth_trend: "improving" | "plateau" | "declining";
  }
  ```
- [ ] Pattern-based peer matching (complementary study partners)
- [ ] Update Qdrant embeddings to include patterns

**Day 3-4: Observability Setup**
- [ ] Setup LangSmith project
- [ ] Add tracing to all LLM calls:
  ```typescript
  import { LangChainTracer } from "langchain/callbacks";
  
  const tracer = new LangChainTracer({
    projectName: "skillmap-prod",
  });
  ```
- [ ] Setup Sentry for error tracking
- [ ] Create custom metrics:
  - Resume parse success rate
  - Match quality score (user feedback)
  - Average response times
  - OpenAI token usage per endpoint

**Day 5-7: Testing + Bug Fixes**
- [ ] Write integration tests (E2E flows)
- [ ] Load testing (100 concurrent users)
- [ ] Fix bugs discovered in testing
- [ ] Performance profiling + optimization

**Deliverables:**
- ✅ Enhanced LeetCode matching (pattern-based)
- ✅ Full observability (trace every request)
- ✅ Dashboard for monitoring costs, latency, errors
- ✅ 90%+ test coverage on critical paths

### Phase 4: Launch Prep + Migration (Week 5)

**Day 1-2: Data Migration**
- [ ] Script to migrate existing users to new format
- [ ] Backfill embeddings for existing profiles
- [ ] Validate data integrity post-migration

**Day 3-4: API Compatibility**
- [ ] Ensure backward compatibility with frontend
- [ ] Update API docs (OpenAPI spec)
- [ ] Coordinate with frontend team on changes

**Day 5: Deployment**
- [ ] Setup AWS App Runner
- [ ] Configure environment variables
- [ ] Setup Redis (Upstash)
- [ ] Deploy to staging
- [ ] Smoke tests

**Day 6-7: Launch**
- [ ] Final QA testing
- [ ] Deploy to production
- [ ] Monitor for first 48 hours
- [ ] Rollback plan ready

**Deliverables:**
- ✅ Production deployment
- ✅ Zero downtime migration
- ✅ All features working
- ✅ Monitoring dashboards live

---

## 8. COST ANALYSIS

### Infrastructure Costs (Monthly, 500 Users)

| Service | Tier | Cost | Notes |
|---------|------|------|-------|
| **Qdrant Cloud** | Starter | $25 | 1M vectors (way more than needed) |
| **Upstash Redis** | Pay-per-request | $2 | ~200k requests/month |
| **Supabase** | Free | $0 | <500 MAU, 500MB DB |
| **AWS App Runner** | 1 instance | $20 | 1 vCPU, 2GB RAM, auto-scales |
| **LangSmith** | Free | $0 | <50k traces/month |
| **Sentry** | Free | $0 | <5k errors/month |
| **Cohere Rerank** | Pay-per-use | $0.50 | 10k rerank calls @ $0.00005 |
| **GitHub Jobs API** | Free | $0 | Free tier |
| **TOTAL** | - | **~$47.50** | Fixed monthly cost |

### OpenAI Costs (Variable, with Caching)

| Operation | Without Cache | With Cache (80-90% hit rate) | Volume (500 users) | Monthly Cost |
|-----------|---------------|------------------------------|-------------------|--------------|
| **Resume Parsing** | $0.001 each | $0.0001 each | 500 uploads | **$0.05** |
| **Embeddings** | $0.0002 each | $0.00004 each | 2000 calls | **$0.08** |
| **Skill Gap Analysis** | $0.002 each | $0.001 each | 1000 queries | **$1.00** |
| **Learning Paths** | $0.003 each | - | 500 generations | **$1.50** |
| **Problem Suggestions** | $0.002 each | - | 300 queries | **$0.60** |
| **ATS Scoring** | $0.002 each | $0.0004 each | 500 scores | **$0.20** |
| **TOTAL** | - | - | - | **~$3.43** |

### Total Cost Summary

```
Infrastructure: $47.50/month
OpenAI:         $3.43/month
────────────────────────────
TOTAL:          $50.93/month

Cost per user: $0.10/month
Buffer for growth: $50 budget allows 5x growth (2500 users)
```

### Cost at Different Scales

| Users | Infrastructure | OpenAI (cached) | Total/Month | Per User |
|-------|----------------|-----------------|-------------|----------|
| 100 | $47.50 | $0.70 | $48.20 | $0.48 |
| 500 | $47.50 | $3.43 | $50.93 | $0.10 |
| 1000 | $47.50 | $6.86 | $54.36 | $0.05 |
| 2500 | $67.50 | $17.15 | $84.65 | $0.03 |

**Scaling triggers:**
- 500-1000 users: Current setup sufficient
- 1000-2500 users: Upgrade Qdrant tier ($42 → $62)
- 2500+ users: Consider dedicated Redis, multi-instance deployment

---

## 9. MIGRATION STRATEGY

### Data Migration Plan

#### Step 1: Schema Compatibility Check
```sql
-- Validate existing tables match expected structure
-- Add missing columns if needed
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS profile_version INTEGER DEFAULT 1;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS normalized_name TEXT;
```

#### Step 2: Backfill Embeddings
```typescript
// Script: scripts/migrate-embeddings.ts
async function migrateEmbeddings() {
  const users = await supabase.from('user_profiles').select('userid, name');
  
  for (const user of users) {
    // Generate new multi-vector embeddings
    const profile = await buildUserProfile(user.userid);
    const vectors = await createUserVectors(profile);
    
    // Upsert to Qdrant
    await qdrant.upsert("user_profiles", {
      id: user.userid,
      vector: vectors.weighted_avg,
      payload: {
        user_id: user.userid,
        skills_vector: vectors.skills,
        goals_vector: vectors.goals,
        experience_vector: vectors.experience,
        ...metadata
      }
    });
  }
}
```

#### Step 3: Dual-Write Period (1 week)
- Deploy new backend alongside old
- Frontend sends requests to both (old for UX, new for testing)
- Compare outputs, fix discrepancies
- Monitor error rates, performance

#### Step 4: Gradual Rollout
```
Day 1: 5% of traffic → new backend
Day 2: 10% of traffic
Day 3: 25% of traffic
Day 5: 50% of traffic
Day 7: 100% of traffic (old backend sunset)
```

#### Step 5: Cleanup
- Delete old Qdrant collections
- Remove deprecated API endpoints
- Archive old codebase (don't delete, keep for reference)

### Frontend Compatibility

**Breaking Changes:**
None! Maintain same API contracts.

**Endpoint Mapping:**
```
Old                      New (Compatible)
POST /upload-resume  →   POST /resume/upload
POST /user-profile   →   POST /profile
POST /analyze-skill-gaps → POST /gaps/analyze
POST /leetcode-stats →   POST /leetcode/sync
GET /peer/matches    →   GET /matches (same)
```

**Response Format:**
Keep same JSON structure, add new fields as optional for gradual frontend adoption.

---

## 10. SUCCESS METRICS

### Launch Readiness Checklist

#### Functional Requirements
- [ ] **Resume Parsing**: 100% determinism (10 runs, same output)
- [ ] **Peer Matching**: <2s response time, 3 high-quality matches
- [ ] **Skill Gaps**: 10-30s response, personalized paths
- [ ] **LeetCode**: Sync profile, pattern analysis, problem suggestions
- [ ] **Messaging**: Real-time DMs between connected peers
- [ ] **Auth**: JWT validation, protected routes

#### Performance Requirements
- [ ] **P95 Latency**: <3s for all endpoints
- [ ] **Cache Hit Rate**: >80% for repeated operations
- [ ] **Concurrency**: Handle 50 simultaneous users
- [ ] **Error Rate**: <1% of requests

#### Cost Requirements
- [ ] **Infrastructure**: <$50/mo
- [ ] **OpenAI**: <$10/mo for 500 users
- [ ] **Total**: <$60/mo

#### Quality Requirements
- [ ] **Test Coverage**: >80% on critical paths
- [ ] **Type Safety**: Zero `any` types in production code
- [ ] **Observability**: All LLM calls traced in LangSmith
- [ ] **Error Handling**: All errors logged to Sentry

### Post-Launch Metrics (First 30 Days)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Match Acceptance Rate** | >30% | % of shown matches that users connect with |
| **Resume Parse Success** | >95% | % of uploads that extract successfully |
| **User Retention (D7)** | >40% | % of users returning after 7 days |
| **Average Matches per User** | >3 | Avg connections made per active user |
| **P95 Response Time** | <5s | 95th percentile latency across all endpoints |
| **Error Rate** | <2% | % of requests resulting in 5xx errors |
| **OpenAI Cost per User** | <$0.02 | Average monthly OpenAI spend per MAU |

### Quality Validation Tests

```typescript
// Test 1: Determinism
test('same resume produces identical output', async () => {
  const results = await Promise.all(
    Array(10).fill(null).map(() => parseResume(sampleResume))
  );
  expect(new Set(results.map(r => JSON.stringify(r))).size).toBe(1);
});

// Test 2: Matching accuracy
test('matching finds semantically similar users', async () => {
  const reactDev = await createUser({ skills: ['React', 'JavaScript'] });
  const reactjsDev = await createUser({ skills: ['ReactJS', 'JS'] });
  
  const matches = await findMatches(reactDev.id);
  expect(matches.map(m => m.id)).toContain(reactjsDev.id);
});

// Test 3: Cache effectiveness
test('caching reduces costs by 80%', async () => {
  const calls1 = await trackOpenAICalls(() => parseResume(resume1));
  const calls2 = await trackOpenAICalls(() => parseResume(resume1)); // Same resume
  
  expect(calls2.count).toBe(0); // Served from cache
});
```

---

## 📞 CONTACT & NEXT STEPS

**Document Owner:** AI Coding Agent  
**Last Updated:** December 13, 2025  
**Status:** Approved by Product Owner - Ready for Implementation

### Immediate Next Steps:
1. ✅ **Approve this document** - Confirm all decisions are final
2. 🚀 **Create implementation branch** - `feat/production-refactor`
3. 📦 **Setup development environment** - Install dependencies, configure tools
4. 💻 **Begin Week 1, Day 1 tasks** - TypeScript bootstrapping

### Questions or Concerns?
All architectural decisions have been debated and approved. If new issues arise during implementation:
1. Document in `IMPLEMENTATION_LOG.md`
2. Raise immediately if blocking
3. No scope creep - stick to plan unless critical

**LET'S BUILD! 🚀**
