# Phase 1 Implementation Guide - SkillMap Engine

**Document Version:** 1.0  
**Date:** December 13, 2025  
**Status:** Ready for Implementation  
**Scope:** Foundation Infrastructure + Resume Parsing + Peer Matching

---

## 📋 TABLE OF CONTENTS

1. [Overview](#overview)
2. [Prerequisites & Setup](#prerequisites--setup)
3. [Feature 1: Project Foundation](#feature-1-project-foundation)
4. [Feature 2: Database Schema](#feature-2-database-schema)
5. [Feature 3: Infrastructure Layer](#feature-3-infrastructure-layer)
6. [Feature 4: Skill Taxonomy System](#feature-4-skill-taxonomy-system)
7. [Feature 5: Resume Parsing](#feature-5-resume-parsing)
8. [Feature 6: Profile Management](#feature-6-profile-management)
9. [Feature 7: Peer Matching Engine](#feature-7-peer-matching-engine)
10. [Testing Strategy](#testing-strategy)
11. [Acceptance Criteria](#acceptance-criteria)

---

## 1. OVERVIEW

### Phase 1 Objectives
Build the foundational infrastructure and two critical features:
1. **Deterministic resume parsing** with semantic skill normalization
2. **Semantic peer matching** with multi-vector embeddings and reranking

### Why This Order?
Features are organized by dependency chain:
```
Foundation → Database → Infrastructure → Taxonomy → Resume → Profile → Matching
     ↓           ↓            ↓              ↓          ↓         ↓         ↓
   (Setup)   (Schema)    (Clients)      (Seeds)   (Extract)  (CRUD)   (Search)
```

### Key Principles
- ✅ **Nothing is concrete** - If you find a better approach, pivot
- ✅ **Verify before reuse** - Old JavaScript code is reference only
- ✅ **Test as you build** - Every feature must pass tests before moving forward
- ✅ **Fresh start** - New Supabase schema, clean Qdrant collections

---

## 2. PREREQUISITES & SETUP

### Environment Requirements
```bash
# Required accounts & credentials
- Supabase project (fresh, empty database)
- Qdrant Cloud cluster
- Upstash Redis instance
- OpenAI API key
- Cohere API key (for reranking)
- LangSmith project (optional but recommended)
- Sentry project (optional but recommended)
```

### Development Machine
```bash
- Node.js 20+
- TypeScript 5+
- npm (preferred) or npm
- Git
- VS Code (recommended IDE)
```

### Sample Data Preparation
Before starting, prepare test data:
- **10 diverse resumes** (PDF format)
  - Mix: Entry-level, mid-level, senior
  - Mix: Frontend, backend, full-stack, ML, mobile
  - Include: Typos, formatting variations, different structures
- **5 user profiles** (manual JSON)
  - Different skill sets for matching tests
  - Varying experience levels
  - Different learning goals

---

## 3. FEATURE 1: PROJECT FOUNDATION

### Objective
Set up TypeScript monorepo with Hono framework, linting, testing, and logging.

### Tasks

#### 3.1 Repository Setup
```bash
# Create new branch
git checkout -b feat/production-refactor

# Initialize package.json
npm init

# Install core dependencies
npm add hono @hono/node-server
npm add -D typescript @types/node tsx
npm add -D vitest @vitest/ui
npm add -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npm add -D prettier eslint-config-prettier
```

#### 3.2 TypeScript Configuration
Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

#### 3.3 Folder Structure
Create the following directory structure:
```
src/
├── server.ts                # Hono app entry
├── routes/                  # API route handlers
├── services/                # Business logic
│   ├── resume/
│   ├── matching/
│   └── profile/
├── lib/                     # Shared utilities
│   ├── db/
│   ├── vector/
│   ├── cache/
│   └── llm/
├── schemas/                 # Zod validation schemas
├── middleware/              # Hono middleware
└── utils/                   # Helper functions
```

#### 3.4 Logging Setup
Install Pino:
```bash
npm add pino pino-pretty
```

Create `src/utils/logger.ts`:
```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' 
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
```

#### 3.5 Environment Variables
Create `.env.example`:
```bash
# Server
NODE_ENV=development
PORT=5005
LOG_LEVEL=info

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Qdrant
QDRANT_URL=
QDRANT_API_KEY=

# Upstash Redis
REDIS_URL=
REDIS_TOKEN=

# OpenAI
OPENAI_API_KEY=

# Cohere
COHERE_API_KEY=

# Observability (Optional)
LANGSMITH_API_KEY=
SENTRY_DSN=
```

#### 3.6 Basic Hono Server
Create `src/server.ts`:
```typescript
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import logger from './utils/logger.js';

const app = new Hono();

// Middleware
app.use('*', honoLogger());

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const port = parseInt(process.env.PORT || '5005');
logger.info(`🚀 Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
```

Create `src/index.ts`:
```typescript
import { serve } from '@hono/node-server';
import server from './server.js';

serve(server);
```

#### 3.7 Package Scripts
Update `package.json`:
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write \"src/**/*.ts\""
  }
}
```

### Testing
```bash
# Start dev server
npm dev

# In another terminal, test health endpoint
curl http://localhost:5005/health

# Expected output:
# {"status":"ok","timestamp":"2025-12-13T..."}
```

### Acceptance Criteria
- ✅ **Critical**: Server starts without errors on port 5005
- ✅ **Critical**: Health endpoint returns 200 OK
- ✅ **Critical**: TypeScript compiles with zero errors
- ✅ **Critical**: Logs are structured JSON in production, pretty in dev
- ⚠️ **Important**: ESLint passes with no warnings
- 💡 **Nice-to-have**: Hot reload works in dev mode

### Reference Files (Verify Before Using)
- `middleware/auth.js` - JWT validation patterns
- `middleware/errorHandler.js` - Error handling approach
- `utils/logger.js` - Logging patterns (adapt to Pino)

---

## 4. FEATURE 2: DATABASE SCHEMA

### Objective
Design and implement optimized PostgreSQL schema in Supabase from scratch.

### Schema Design Principles
- Normalize data (3NF) but denormalize for performance where needed
- Use UUIDs for all primary keys
- Timestamps (`created_at`, `updated_at`) on all tables
- Soft deletes where appropriate (`deleted_at`)
- Foreign key constraints with `ON DELETE CASCADE` where safe
- Indexes on frequently queried columns
- CHECK constraints for enums

### Full Supabase Schema

Create `schema.sql`:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CORE USER TABLES
-- ============================================================================

-- User profiles (extends Supabase auth.users)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  location TEXT,
  timezone TEXT,
  experience_level TEXT CHECK (experience_level IN ('entry', '1-3years', '3-5years', '5+years')),
  is_active BOOLEAN DEFAULT true,
  is_searchable BOOLEAN DEFAULT true,
  profile_completed BOOLEAN DEFAULT false,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_profiles_is_active ON user_profiles(is_active);
CREATE INDEX idx_user_profiles_experience_level ON user_profiles(experience_level);

-- ============================================================================
-- SKILLS TABLES
-- ============================================================================

-- Skill taxonomy (dynamic, updated from job market data)
CREATE TABLE skills_taxonomy (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  aliases TEXT[] DEFAULT '{}',
  prerequisites TEXT[] DEFAULT '{}',
  commonly_paired_with TEXT[] DEFAULT '{}',
  job_demand_frequency DECIMAL(5,2) DEFAULT 0.0, -- % of job postings
  job_demand_updated_at TIMESTAMPTZ,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_skills_taxonomy_canonical_name ON skills_taxonomy(canonical_name);
CREATE INDEX idx_skills_taxonomy_category ON skills_taxonomy(category);
CREATE INDEX idx_skills_taxonomy_job_demand ON skills_taxonomy(job_demand_frequency DESC);

-- User skills (links users to normalized skills)
CREATE TABLE user_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  skill_id UUID REFERENCES skills_taxonomy(id) ON DELETE CASCADE NOT NULL,
  skill_level TEXT CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  years_experience DECIMAL(3,1),
  source TEXT CHECK (source IN ('resume', 'manual', 'leetcode', 'verified')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill_id)
);

CREATE INDEX idx_user_skills_user_id ON user_skills(user_id);
CREATE INDEX idx_user_skills_skill_id ON user_skills(skill_id);
CREATE INDEX idx_user_skills_skill_level ON user_skills(skill_level);

-- ============================================================================
-- EXPERIENCE TABLES
-- ============================================================================

-- Work experience
CREATE TABLE work_experience (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  location TEXT,
  is_current BOOLEAN DEFAULT false,
  start_date DATE NOT NULL,
  end_date DATE,
  description TEXT,
  technologies TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_work_experience_user_id ON work_experience(user_id);
CREATE INDEX idx_work_experience_is_current ON work_experience(is_current);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_name TEXT NOT NULL,
  description TEXT,
  project_url TEXT,
  github_url TEXT,
  technologies TEXT[] DEFAULT '{}',
  start_date DATE,
  end_date DATE,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_is_featured ON projects(is_featured);

-- Education
CREATE TABLE education (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  institution_name TEXT NOT NULL,
  degree TEXT NOT NULL,
  field_of_study TEXT,
  start_date DATE,
  end_date DATE,
  grade TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_education_user_id ON education(user_id);

-- ============================================================================
-- LEARNING & GOALS TABLES
-- ============================================================================

-- Learning goals
CREATE TABLE learning_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  original_goal TEXT NOT NULL,
  refined_goal TEXT,
  target_role TEXT,
  target_timeline TEXT,
  status TEXT CHECK (status IN ('active', 'completed', 'paused', 'abandoned')) DEFAULT 'active',
  progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_learning_goals_user_id ON learning_goals(user_id);
CREATE INDEX idx_learning_goals_status ON learning_goals(status);

-- Learning path steps (generated dynamically)
CREATE TABLE learning_path_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  goal_id UUID REFERENCES learning_goals(id) ON DELETE CASCADE NOT NULL,
  step_order INTEGER NOT NULL,
  skill_name TEXT NOT NULL,
  skill_id UUID REFERENCES skills_taxonomy(id) ON DELETE SET NULL,
  description TEXT,
  estimated_hours INTEGER,
  resources JSONB DEFAULT '[]', -- [{title, url, type}]
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_learning_path_steps_goal_id ON learning_path_steps(goal_id);
CREATE INDEX idx_learning_path_steps_order ON learning_path_steps(goal_id, step_order);

-- ============================================================================
-- RESUME STORAGE
-- ============================================================================

-- Resumes (track versions, support re-uploads)
CREATE TABLE resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  file_path TEXT,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT,
  raw_text TEXT NOT NULL,
  content_hash TEXT UNIQUE NOT NULL, -- SHA256 for deduplication
  parsed_data JSONB, -- Full structured extraction result
  parse_version TEXT DEFAULT '1.0',
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resumes_user_id ON resumes(user_id);
CREATE INDEX idx_resumes_content_hash ON resumes(content_hash);
CREATE INDEX idx_resumes_is_current ON resumes(user_id, is_current);

-- ============================================================================
-- LEETCODE INTEGRATION
-- ============================================================================

-- LeetCode profiles
CREATE TABLE leetcode_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  leetcode_username TEXT UNIQUE NOT NULL,
  total_solved INTEGER DEFAULT 0,
  easy_solved INTEGER DEFAULT 0,
  medium_solved INTEGER DEFAULT 0,
  hard_solved INTEGER DEFAULT 0,
  ranking INTEGER,
  reputation INTEGER DEFAULT 0,
  contribution_points INTEGER DEFAULT 0,
  profile_data JSONB, -- Full API response
  pattern_analysis JSONB, -- {strength_areas, weak_areas, comfort_level}
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leetcode_profiles_user_id ON leetcode_profiles(user_id);
CREATE INDEX idx_leetcode_profiles_username ON leetcode_profiles(leetcode_username);

-- ============================================================================
-- PEER MATCHING & CONNECTIONS
-- ============================================================================

-- Peer availability preferences
CREATE TABLE peer_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  available_days TEXT[] DEFAULT '{}', -- ['monday', 'tuesday', ...]
  preferred_time_slots TEXT[] DEFAULT '{}', -- ['morning', 'afternoon', 'evening']
  preferred_collaboration_types TEXT[] DEFAULT '{}', -- ['project', 'study', 'mentor', 'learn']
  communication_preferences TEXT[] DEFAULT '{}', -- ['slack', 'discord', 'zoom']
  max_active_connections INTEGER DEFAULT 10,
  is_accepting_requests BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_peer_preferences_user_id ON peer_preferences(user_id);

-- Connection requests (Tinder-style bidirectional)
CREATE TABLE connection_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined', 'expired')) DEFAULT 'pending',
  connection_type TEXT CHECK (connection_type IN ('study_partner', 'project_collab', 'mentor_mentee', 'skill_exchange')),
  message TEXT,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sender_id, receiver_id),
  CHECK (sender_id != receiver_id)
);

CREATE INDEX idx_connection_requests_sender ON connection_requests(sender_id);
CREATE INDEX idx_connection_requests_receiver ON connection_requests(receiver_id);
CREATE INDEX idx_connection_requests_status ON connection_requests(status);

-- Active connections (formed after mutual accept)
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user2_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  connection_type TEXT NOT NULL,
  request_id UUID REFERENCES connection_requests(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user1_id, user2_id),
  CHECK (user1_id < user2_id) -- Enforce ordered pair to prevent duplicates
);

CREATE INDEX idx_connections_user1 ON connections(user1_id);
CREATE INDEX idx_connections_user2 ON connections(user2_id);
CREATE INDEX idx_connections_is_active ON connections(is_active);

-- Messages between connected peers
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id UUID REFERENCES connections(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_connection_id ON messages(connection_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

-- ============================================================================
-- ATS SCORING (Resume vs Job Description)
-- ============================================================================

-- ATS score history
CREATE TABLE ats_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE NOT NULL,
  job_description TEXT NOT NULL,
  overall_score DECIMAL(5,2) NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  skills_match_score DECIMAL(5,2),
  experience_match_score DECIMAL(5,2),
  keyword_match_score DECIMAL(5,2),
  analysis_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ats_scores_user_id ON ats_scores(user_id);
CREATE INDEX idx_ats_scores_resume_id ON ats_scores(resume_id);
CREATE INDEX idx_ats_scores_created_at ON ats_scores(created_at DESC);

-- ============================================================================
-- CACHING METADATA (Optional - for cache warming)
-- ============================================================================

-- Cache metadata (track what's cached in Redis)
CREATE TABLE cache_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cache_key TEXT UNIQUE NOT NULL,
  cache_type TEXT NOT NULL, -- 'resume', 'embedding', 'match', 'job_skills'
  entity_id UUID,
  ttl_seconds INTEGER NOT NULL,
  hit_count INTEGER DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_cache_metadata_key ON cache_metadata(cache_key);
CREATE INDEX idx_cache_metadata_expires_at ON cache_metadata(expires_at);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_skills_taxonomy_updated_at BEFORE UPDATE ON skills_taxonomy FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_skills_updated_at BEFORE UPDATE ON user_skills FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_work_experience_updated_at BEFORE UPDATE ON work_experience FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_education_updated_at BEFORE UPDATE ON education FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_learning_goals_updated_at BEFORE UPDATE ON learning_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_learning_path_steps_updated_at BEFORE UPDATE ON learning_path_steps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_resumes_updated_at BEFORE UPDATE ON resumes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leetcode_profiles_updated_at BEFORE UPDATE ON leetcode_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_peer_preferences_updated_at BEFORE UPDATE ON peer_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_connection_requests_updated_at BEFORE UPDATE ON connection_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_connections_updated_at BEFORE UPDATE ON connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all user-facing tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE education ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE leetcode_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE peer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = user_id);

-- Users can view searchable profiles
CREATE POLICY "Users can view searchable profiles" ON user_profiles FOR SELECT USING (is_searchable = true AND is_active = true);

-- (Add more RLS policies as needed for each table)
```

### Implementation Steps

1. **Create schema in Supabase**:
   - Open Supabase SQL Editor
   - Copy the entire `schema.sql` above
   - Execute to create all tables

2. **Verify schema**:
   ```bash
   # Check all tables exist
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' ORDER BY table_name;
   ```

3. **Test constraints**:
   ```sql
   -- Should fail (invalid experience_level)
   INSERT INTO user_profiles (user_id, display_name, email, experience_level) 
   VALUES (uuid_generate_v4(), 'Test', 'test@test.com', 'invalid');
   
   -- Should succeed
   INSERT INTO user_profiles (user_id, display_name, email, experience_level)
   VALUES (uuid_generate_v4(), 'Test', 'test@test.com', 'entry');
   ```

### Acceptance Criteria
- ✅ **Critical**: All 20+ tables created successfully
- ✅ **Critical**: All indexes created
- ✅ **Critical**: All foreign keys enforce referential integrity
- ✅ **Critical**: Triggers fire on UPDATE (test updated_at)
- ✅ **Critical**: CHECK constraints prevent invalid data
- ⚠️ **Important**: RLS policies allow user data access
- 💡 **Nice-to-have**: Query performance acceptable (<50ms for simple selects)

### Schema Design Notes
**Key Optimizations:**
- `user_skills` links to normalized `skills_taxonomy` (no duplicates)
- `connections` uses ordered pairs (`user1_id < user2_id`) to prevent duplicates
- `resumes` includes `content_hash` for deduplication (same resume = same hash)
- JSONB columns (`parsed_data`, `pattern_analysis`) for flexible schema
- Indexes on foreign keys for fast joins
- Separate `connection_requests` and `connections` tables for clear state management

**Differences from Old Schema:**
- ✅ Added `skills_taxonomy` for dynamic skill graph
- ✅ Added `peer_preferences` for matching filters
- ✅ Added `cache_metadata` for Redis cache tracking
- ✅ Split peer system into `connection_requests` + `connections` + `messages`
- ✅ Added `content_hash` to resumes for deduplication
- ✅ Added `pattern_analysis` to LeetCode profiles

---

## 5. FEATURE 3: INFRASTRUCTURE LAYER

### Objective
Set up clients for Supabase, Qdrant, Redis, OpenAI, and Cohere with proper error handling and connection pooling.

### Tasks

#### 5.1 Supabase Client
```bash
npm add @supabase/supabase-js
```

Create `src/lib/db/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';
import logger from '../../utils/logger.js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase credentials');
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Health check helper
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from('user_profiles').select('id').limit(1);
    if (error) throw error;
    logger.info('✅ Supabase connection successful');
    return true;
  } catch (error) {
    logger.error('❌ Supabase connection failed', { error });
    return false;
  }
}
```

#### 5.2 Qdrant Client
```bash
npm add @qdrant/js-client
```

Create `src/lib/vector/qdrant.ts`:
```typescript
import { QdrantClient } from '@qdrant/js-client';
import logger from '../../utils/logger.js';

if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
  throw new Error('Missing Qdrant credentials');
}

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

// Collection names
export const COLLECTIONS = {
  USER_PROFILES: 'user_profiles',
  SKILL_TAXONOMY: 'skill_taxonomy',
  LEETCODE_PATTERNS: 'leetcode_patterns',
} as const;

// Initialize collections
export async function initQdrantCollections() {
  try {
    // Check/create user_profiles collection
    const collections = await qdrant.getCollections();
    const existingNames = collections.collections.map(c => c.name);

    for (const [key, name] of Object.entries(COLLECTIONS)) {
      if (!existingNames.includes(name)) {
        logger.info(`Creating Qdrant collection: ${name}`);
        await qdrant.createCollection(name, {
          vectors: {
            size: 1536, // OpenAI text-embedding-3-small dimension
            distance: 'Cosine',
          },
          optimizers_config: {
            default_segment_number: 2,
          },
        });

        // Create payload indexes for filtering
        if (name === COLLECTIONS.USER_PROFILES) {
          await qdrant.createPayloadIndex(name, {
            field_name: 'user_id',
            field_schema: 'keyword',
          });
          await qdrant.createPayloadIndex(name, {
            field_name: 'is_active',
            field_schema: 'bool',
          });
          await qdrant.createPayloadIndex(name, {
            field_name: 'experience_level',
            field_schema: 'keyword',
          });
        }

        if (name === COLLECTIONS.SKILL_TAXONOMY) {
          await qdrant.createPayloadIndex(name, {
            field_name: 'canonical_name',
            field_schema: 'keyword',
          });
          await qdrant.createPayloadIndex(name, {
            field_name: 'category',
            field_schema: 'keyword',
          });
        }
      }
    }

    logger.info('✅ Qdrant collections initialized');
    return true;
  } catch (error) {
    logger.error('❌ Qdrant initialization failed', { error });
    throw error;
  }
}
```

#### 5.3 Redis Client (Upstash)
```bash
npm add @upstash/redis
```

Create `src/lib/cache/redis.ts`:
```typescript
import { Redis } from '@upstash/redis';
import logger from '../../utils/logger.js';

if (!process.env.REDIS_URL || !process.env.REDIS_TOKEN) {
  throw new Error('Missing Redis credentials');
}

export const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN,
});

// Cache key generators
export const CacheKeys = {
  resumeParsed: (hash: string) => `resume:parsed:${hash}`,
  profileEmbedding: (userId: string, version: number) => 
    `embedding:profile:${userId}:v${version}`,
  skillEmbedding: (skillName: string) => 
    `embedding:skill:${skillName.toLowerCase().replace(/\s+/g, '-')}`,
  jobSkills: (role: string, seniority: string) => 
    `jobs:skills:${role}:${seniority}`,
  matchCandidates: (userId: string) => 
    `matches:${userId}`,
  userProfile: (userId: string) => 
    `profile:${userId}`,
} as const;

// TTL constants (in seconds)
export const CacheTTL = {
  RESUME: 30 * 24 * 60 * 60, // 30 days
  EMBEDDING: 7 * 24 * 60 * 60, // 7 days
  SKILL: 90 * 24 * 60 * 60, // 90 days
  JOB_SKILLS: 7 * 24 * 60 * 60, // 7 days
  MATCHES: 60 * 60, // 1 hour
  PROFILE: 15 * 60, // 15 minutes
} as const;

// Helper: Get with JSON parse
export async function getJSON<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  return data ? (data as T) : null;
}

// Helper: Set with JSON stringify
export async function setJSON<T>(key: string, value: T, ttl?: number): Promise<void> {
  if (ttl) {
    await redis.setex(key, ttl, JSON.stringify(value));
  } else {
    await redis.set(key, JSON.stringify(value));
  }
}

// Health check
export async function testRedisConnection(): Promise<boolean> {
  try {
    await redis.ping();
    logger.info('✅ Redis connection successful');
    return true;
  } catch (error) {
    logger.error('❌ Redis connection failed', { error });
    return false;
  }
}
```

#### 5.4 OpenAI Client
```bash
npm add openai
npm add @instructor-ai/instructor zod
```

Create `src/lib/llm/openai.ts`:
```typescript
import OpenAI from 'openai';
import logger from '../../utils/logger.js';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OpenAI API key');
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Model configurations
export const MODELS = {
  STRUCTURED_OUTPUT: 'gpt-4o-mini', // For resume parsing, skill extraction
  CHAT: 'gpt-4o-mini', // For conversational features
  EMBEDDINGS: 'text-embedding-3-small', // 1536 dimensions
} as const;

// Embedding helper with caching
export async function createEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: MODELS.EMBEDDINGS,
      input: text,
      encoding_format: 'float',
    });

    return response.data[0].embedding;
  } catch (error) {
    logger.error('OpenAI embedding failed', { error, textLength: text.length });
    throw error;
  }
}

// Batch embeddings (more efficient)
export async function createBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  
  try {
    const response = await openai.embeddings.create({
      model: MODELS.EMBEDDINGS,
      input: texts,
      encoding_format: 'float',
    });

    return response.data.map(d => d.embedding);
  } catch (error) {
    logger.error('OpenAI batch embeddings failed', { error, count: texts.length });
    throw error;
  }
}
```

#### 5.5 Cohere Client
```bash
npm add cohere-ai
```

Create `src/lib/llm/cohere.ts`:
```typescript
import { CohereClient } from 'cohere-ai';
import logger from '../../utils/logger.js';

if (!process.env.COHERE_API_KEY) {
  throw new Error('Missing Cohere API key');
}

export const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

// Rerank helper
export async function rerankDocuments(
  query: string,
  documents: string[],
  topN: number = 10
) {
  try {
    const response = await cohere.rerank({
      model: 'rerank-english-v3.0',
      query,
      documents,
      topN,
    });

    return response.results;
  } catch (error) {
    logger.error('Cohere rerank failed', { error, docCount: documents.length });
    throw error;
  }
}
```

#### 5.6 Error Classes
Create `src/utils/errors.ts`:
```typescript
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT');
  }
}
```

#### 5.7 Error Handler Middleware
Create `src/middleware/errors.ts`:
```typescript
import { Context } from 'hono';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export async function errorHandler(err: Error, c: Context) {
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  });

  if (err instanceof AppError) {
    return c.json(
      {
        error: err.message,
        code: err.code,
      },
      err.statusCode
    );
  }

  // Generic 500 error
  return c.json(
    {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
    500
  );
}
```

#### 5.8 Authentication Middleware
Create `src/middleware/auth.ts`:
```typescript
import { Context, Next } from 'hono';
import { supabase } from '../lib/db/supabase.js';
import { AuthenticationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export async function authenticate(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing or invalid Authorization header');
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new AuthenticationError('Invalid token');
    }

    // Attach user to context
    c.set('user', user);
    c.set('userId', user.id);

    await next();
  } catch (error) {
    logger.error('Authentication failed', { error });
    throw new AuthenticationError();
  }
}
```

### Update Server with Middleware
Update `src/server.ts`:
```typescript
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { cors } from 'hono/cors';
import logger from './utils/logger.js';
import { errorHandler } from './middleware/errors.js';
import { testSupabaseConnection } from './lib/db/supabase.js';
import { initQdrantCollections } from './lib/vector/qdrant.js';
import { testRedisConnection } from './lib/cache/redis.js';

const app = new Hono();

// Global middleware
app.use('*', honoLogger());
app.use('*', cors());

// Health check
app.get('/health', async (c) => {
  const [supabaseOk, redisOk] = await Promise.all([
    testSupabaseConnection(),
    testRedisConnection(),
  ]);

  const healthy = supabaseOk && redisOk;

  return c.json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      supabase: supabaseOk,
      redis: redisOk,
    },
  }, healthy ? 200 : 503);
});

// Error handler (must be last)
app.onError(errorHandler);

// Initialize infrastructure on startup
async function initializeInfrastructure() {
  logger.info('Initializing infrastructure...');
  
  await testSupabaseConnection();
  await testRedisConnection();
  await initQdrantCollections();
  
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
```

### Testing Infrastructure
```bash
# Start server
npm dev

# Test health endpoint
curl http://localhost:5005/health

# Expected output:
# {
#   "status": "ok",
#   "timestamp": "...",
#   "services": {
#     "supabase": true,
#     "redis": true
#   }
# }
```

### Acceptance Criteria
- ✅ **Critical**: All clients connect successfully
- ✅ **Critical**: Health endpoint reports all services healthy
- ✅ **Critical**: Qdrant collections created with correct vector dimensions
- ✅ **Critical**: Error handling catches and logs all errors properly
- ✅ **Critical**: Authentication middleware validates JWT tokens
- ⚠️ **Important**: Connection pooling works (no connection leaks)
- 💡 **Nice-to-have**: Graceful shutdown on SIGTERM

### Reference Files (Verify Before Using)
- `config/qdrant.js` - Qdrant client setup patterns
- `config/supabase.js` - Supabase client patterns
- `middleware/auth.js` - JWT validation logic (adapt to TypeScript)

---

## 6. FEATURE 4: SKILL TAXONOMY SYSTEM

### Objective
Seed Qdrant with 100 core skills and implement semantic skill normalization (for Pass 2 of resume parsing).

### Why This Order?
Resume parsing (Feature 5) needs skill normalization, which requires a seeded taxonomy.

### Tasks

#### 6.1 Core Skills Seed Data
Create `src/data/core-skills.ts`:
```typescript
export interface CoreSkill {
  canonical_name: string;
  category: string;
  subcategory?: string;
  aliases: string[];
  prerequisites?: string[];
  commonly_paired_with?: string[];
}

// Top 100 technical skills (curated seed list)
export const CORE_SKILLS: CoreSkill[] = [
  // Programming Languages
  { canonical_name: 'JavaScript', category: 'Programming Languages', aliases: ['JS', 'Javascript', 'ECMAScript'], commonly_paired_with: ['React', 'Node.js', 'TypeScript'] },
  { canonical_name: 'TypeScript', category: 'Programming Languages', aliases: ['TS', 'Typescript'], prerequisites: ['JavaScript'], commonly_paired_with: ['React', 'Node.js', 'Angular'] },
  { canonical_name: 'Python', category: 'Programming Languages', aliases: ['Python3', 'Python 3', 'Py'], commonly_paired_with: ['Django', 'Flask', 'FastAPI', 'pandas'] },
  { canonical_name: 'Java', category: 'Programming Languages', aliases: ['Java SE', 'Java EE'], commonly_paired_with: ['Spring', 'Maven', 'Gradle'] },
  { canonical_name: 'C++', category: 'Programming Languages', aliases: ['Cpp', 'CPP', 'C Plus Plus'], prerequisites: ['C'] },
  { canonical_name: 'C#', category: 'Programming Languages', aliases: ['CSharp', 'C Sharp'], commonly_paired_with: ['.NET', 'ASP.NET'] },
  { canonical_name: 'Go', category: 'Programming Languages', aliases: ['Golang', 'Go Lang'], commonly_paired_with: ['Docker', 'Kubernetes'] },
  { canonical_name: 'Rust', category: 'Programming Languages', aliases: [], commonly_paired_with: ['WebAssembly'] },
  { canonical_name: 'Ruby', category: 'Programming Languages', aliases: [], commonly_paired_with: ['Rails', 'Ruby on Rails'] },
  { canonical_name: 'PHP', category: 'Programming Languages', aliases: ['PHP7', 'PHP8'], commonly_paired_with: ['Laravel', 'Symfony'] },
  
  // Frontend Frameworks
  { canonical_name: 'React', category: 'Frontend Frameworks', aliases: ['ReactJS', 'React.js', 'React JS'], prerequisites: ['JavaScript'], commonly_paired_with: ['Redux', 'Next.js', 'TypeScript'] },
  { canonical_name: 'Vue', category: 'Frontend Frameworks', aliases: ['Vue.js', 'VueJS', 'Vue JS'], prerequisites: ['JavaScript'], commonly_paired_with: ['Nuxt.js', 'Vuex'] },
  { canonical_name: 'Angular', category: 'Frontend Frameworks', aliases: ['AngularJS', 'Angular 2+'], prerequisites: ['TypeScript'], commonly_paired_with: ['RxJS', 'NgRx'] },
  { canonical_name: 'Svelte', category: 'Frontend Frameworks', aliases: ['SvelteJS'], prerequisites: ['JavaScript'] },
  { canonical_name: 'Next.js', category: 'Frontend Frameworks', subcategory: 'Meta-frameworks', aliases: ['NextJS', 'Next'], prerequisites: ['React'], commonly_paired_with: ['Vercel', 'TypeScript'] },
  
  // Backend Frameworks
  { canonical_name: 'Node.js', category: 'Backend Frameworks', aliases: ['NodeJS', 'Node'], prerequisites: ['JavaScript'], commonly_paired_with: ['Express', 'MongoDB'] },
  { canonical_name: 'Express', category: 'Backend Frameworks', aliases: ['Express.js', 'ExpressJS'], prerequisites: ['Node.js'] },
  { canonical_name: 'Django', category: 'Backend Frameworks', aliases: ['Django REST'], prerequisites: ['Python'], commonly_paired_with: ['PostgreSQL', 'Redis'] },
  { canonical_name: 'Flask', category: 'Backend Frameworks', aliases: [], prerequisites: ['Python'] },
  { canonical_name: 'FastAPI', category: 'Backend Frameworks', aliases: [], prerequisites: ['Python'], commonly_paired_with: ['Pydantic', 'SQLAlchemy'] },
  { canonical_name: 'Spring Boot', category: 'Backend Frameworks', aliases: ['Spring', 'Spring Framework'], prerequisites: ['Java'] },
  { canonical_name: 'Ruby on Rails', category: 'Backend Frameworks', aliases: ['Rails', 'RoR'], prerequisites: ['Ruby'] },
  
  // Databases
  { canonical_name: 'PostgreSQL', category: 'Databases', subcategory: 'SQL', aliases: ['Postgres', 'psql'], commonly_paired_with: ['SQL', 'pgAdmin'] },
  { canonical_name: 'MySQL', category: 'Databases', subcategory: 'SQL', aliases: ['My SQL'], commonly_paired_with: ['SQL', 'phpMyAdmin'] },
  { canonical_name: 'MongoDB', category: 'Databases', subcategory: 'NoSQL', aliases: ['Mongo'], commonly_paired_with: ['Mongoose', 'Express'] },
  { canonical_name: 'Redis', category: 'Databases', subcategory: 'In-Memory', aliases: [], commonly_paired_with: ['Caching', 'Pub/Sub'] },
  { canonical_name: 'Elasticsearch', category: 'Databases', subcategory: 'Search Engine', aliases: ['ES', 'Elastic Search'] },
  { canonical_name: 'DynamoDB', category: 'Databases', subcategory: 'NoSQL', aliases: ['AWS DynamoDB'], commonly_paired_with: ['AWS', 'Lambda'] },
  
  // Cloud & DevOps
  { canonical_name: 'AWS', category: 'Cloud Platforms', aliases: ['Amazon Web Services'], commonly_paired_with: ['EC2', 'S3', 'Lambda'] },
  { canonical_name: 'Azure', category: 'Cloud Platforms', aliases: ['Microsoft Azure', 'MS Azure'] },
  { canonical_name: 'GCP', category: 'Cloud Platforms', aliases: ['Google Cloud', 'Google Cloud Platform'] },
  { canonical_name: 'Docker', category: 'DevOps', subcategory: 'Containerization', aliases: [], commonly_paired_with: ['Kubernetes', 'Docker Compose'] },
  { canonical_name: 'Kubernetes', category: 'DevOps', subcategory: 'Orchestration', aliases: ['K8s'], prerequisites: ['Docker'], commonly_paired_with: ['Helm', 'kubectl'] },
  { canonical_name: 'CI/CD', category: 'DevOps', aliases: ['Continuous Integration', 'Continuous Deployment'], commonly_paired_with: ['Jenkins', 'GitHub Actions'] },
  { canonical_name: 'Terraform', category: 'DevOps', subcategory: 'Infrastructure as Code', aliases: [], commonly_paired_with: ['AWS', 'Azure'] },
  
  // Machine Learning & AI
  { canonical_name: 'Machine Learning', category: 'AI/ML', aliases: ['ML'], commonly_paired_with: ['Python', 'TensorFlow', 'scikit-learn'] },
  { canonical_name: 'Deep Learning', category: 'AI/ML', aliases: ['DL'], prerequisites: ['Machine Learning'], commonly_paired_with: ['PyTorch', 'TensorFlow'] },
  { canonical_name: 'TensorFlow', category: 'AI/ML', subcategory: 'Frameworks', aliases: ['TF'], prerequisites: ['Python', 'Machine Learning'] },
  { canonical_name: 'PyTorch', category: 'AI/ML', subcategory: 'Frameworks', aliases: [], prerequisites: ['Python', 'Machine Learning'] },
  { canonical_name: 'Natural Language Processing', category: 'AI/ML', aliases: ['NLP'], prerequisites: ['Machine Learning'], commonly_paired_with: ['transformers', 'spaCy'] },
  
  // Data Science
  { canonical_name: 'pandas', category: 'Data Science', aliases: ['Pandas'], prerequisites: ['Python'], commonly_paired_with: ['NumPy', 'Matplotlib'] },
  { canonical_name: 'NumPy', category: 'Data Science', aliases: ['Numpy'], prerequisites: ['Python'] },
  { canonical_name: 'Jupyter', category: 'Data Science', aliases: ['Jupyter Notebook', 'JupyterLab'], prerequisites: ['Python'] },
  { canonical_name: 'SQL', category: 'Data Science', aliases: ['Structured Query Language'], commonly_paired_with: ['PostgreSQL', 'MySQL'] },
  
  // Mobile Development
  { canonical_name: 'React Native', category: 'Mobile Development', aliases: ['ReactNative', 'RN'], prerequisites: ['React', 'JavaScript'] },
  { canonical_name: 'Flutter', category: 'Mobile Development', aliases: [], prerequisites: ['Dart'], commonly_paired_with: ['Dart', 'Firebase'] },
  { canonical_name: 'Swift', category: 'Mobile Development', aliases: [], commonly_paired_with: ['iOS', 'Xcode'] },
  { canonical_name: 'Kotlin', category: 'Mobile Development', aliases: [], prerequisites: ['Java'], commonly_paired_with: ['Android', 'Android Studio'] },
  
  // Testing
  { canonical_name: 'Jest', category: 'Testing', subcategory: 'Unit Testing', aliases: [], prerequisites: ['JavaScript'], commonly_paired_with: ['React', 'TypeScript'] },
  { canonical_name: 'Pytest', category: 'Testing', subcategory: 'Unit Testing', aliases: ['py.test'], prerequisites: ['Python'] },
  { canonical_name: 'Selenium', category: 'Testing', subcategory: 'E2E Testing', aliases: [], commonly_paired_with: ['Python', 'Java'] },
  
  // Version Control & Collaboration
  { canonical_name: 'Git', category: 'Version Control', aliases: [], commonly_paired_with: ['GitHub', 'GitLab'] },
  { canonical_name: 'GitHub', category: 'Version Control', aliases: [], prerequisites: ['Git'], commonly_paired_with: ['GitHub Actions', 'Pull Requests'] },
  
  // ... Add 50 more core skills following the same pattern
  // (Categories: Security, Blockchain, Game Development, etc.)
];
```

#### 6.2 Taxonomy Seeder Service
Create `src/services/taxonomy/seeder.ts`:
```typescript
import { supabase } from '../../lib/db/supabase.js';
import { qdrant, COLLECTIONS } from '../../lib/vector/qdrant.js';
import { createBatchEmbeddings } from '../../lib/llm/openai.js';
import { CacheKeys, CacheTTL, setJSON } from '../../lib/cache/redis.js';
import { CORE_SKILLS } from '../../data/core-skills.js';
import logger from '../../utils/logger.js';

export async function seedSkillTaxonomy() {
  logger.info('Starting skill taxonomy seeding...');

  try {
    // 1. Insert into Supabase
    const skillsToInsert = CORE_SKILLS.map(skill => ({
      canonical_name: skill.canonical_name,
      category: skill.category,
      subcategory: skill.subcategory || null,
      aliases: skill.aliases,
      prerequisites: skill.prerequisites || [],
      commonly_paired_with: skill.commonly_paired_with || [],
      is_verified: true,
    }));

    const { data: insertedSkills, error: insertError } = await supabase
      .from('skills_taxonomy')
      .upsert(skillsToInsert, { onConflict: 'canonical_name' })
      .select('id, canonical_name');

    if (insertError) throw insertError;
    logger.info(`Inserted ${insertedSkills.length} skills into Supabase`);

    // 2. Generate embeddings (batch for efficiency)
    const skillTexts = CORE_SKILLS.map(skill => {
      // Create rich text for better semantic matching
      return `${skill.canonical_name} (${skill.category}). Also known as: ${skill.aliases.join(', ')}.`;
    });

    logger.info('Generating embeddings...');
    const embeddings = await createBatchEmbeddings(skillTexts);

    // 3. Insert into Qdrant
    const points = CORE_SKILLS.map((skill, idx) => ({
      id: insertedSkills[idx].id,
      vector: embeddings[idx],
      payload: {
        canonical_name: skill.canonical_name,
        category: skill.category,
        subcategory: skill.subcategory,
        aliases: skill.aliases,
      },
    }));

    await qdrant.upsert(COLLECTIONS.SKILL_TAXONOMY, {
      wait: true,
      points,
    });

    logger.info(`Inserted ${points.length} skill vectors into Qdrant`);

    // 4. Cache embeddings in Redis
    for (let i = 0; i < CORE_SKILLS.length; i++) {
      const cacheKey = CacheKeys.skillEmbedding(CORE_SKILLS[i].canonical_name);
      await setJSON(cacheKey, embeddings[i], CacheTTL.SKILL);
    }

    logger.info('✅ Skill taxonomy seeding complete');
    return { count: insertedSkills.length };
  } catch (error) {
    logger.error('Skill taxonomy seeding failed', { error });
    throw error;
  }
}
```

#### 6.3 Skill Normalizer
Create `src/services/resume/normalizer.ts`:
```typescript
import { qdrant, COLLECTIONS } from '../../lib/vector/qdrant.js';
import { createEmbedding } from '../../lib/llm/openai.js';
import { CacheKeys, CacheTTL, getJSON, setJSON } from '../../lib/cache/redis.js';
import logger from '../../utils/logger.js';

export interface NormalizedSkill {
  original: string;
  canonical: string;
  confidence: number;
  skill_id?: string;
}

/**
 * Normalizes skill names using vector similarity search.
 * Pass 2 of resume parsing: "ReactJS" → "React"
 */
export async function normalizeSkills(rawSkills: string[]): Promise<NormalizedSkill[]> {
  const normalized: NormalizedSkill[] = [];

  for (const skill of rawSkills) {
    try {
      // Check cache first
      const cacheKey = CacheKeys.skillEmbedding(skill);
      let embedding = await getJSON<number[]>(cacheKey);

      if (!embedding) {
        embedding = await createEmbedding(skill);
        await setJSON(cacheKey, embedding, CacheTTL.SKILL);
      }

      // Search Qdrant for closest match
      const searchResults = await qdrant.search(COLLECTIONS.SKILL_TAXONOMY, {
        vector: embedding,
        limit: 1,
        score_threshold: 0.85, // High confidence threshold
      });

      if (searchResults.length > 0) {
        const match = searchResults[0];
        normalized.push({
          original: skill,
          canonical: match.payload?.canonical_name as string,
          confidence: match.score,
          skill_id: match.id as string,
        });
      } else {
        // No match found - keep original (flag for review)
        logger.warn(`No match found for skill: ${skill}`);
        normalized.push({
          original: skill,
          canonical: skill,
          confidence: 1.0, // Accept as-is
        });
      }
    } catch (error) {
      logger.error(`Failed to normalize skill: ${skill}`, { error });
      normalized.push({
        original: skill,
        canonical: skill,
        confidence: 1.0,
      });
    }
  }

  return normalized;
}
```

#### 6.4 Seed Script
Create `scripts/seed-taxonomy.ts`:
```typescript
import { seedSkillTaxonomy } from '../src/services/taxonomy/seeder.js';
import logger from '../src/utils/logger.js';

async function main() {
  try {
    await seedSkillTaxonomy();
    logger.info('✅ Seeding complete');
    process.exit(0);
  } catch (error) {
    logger.error('Seeding failed', { error });
    process.exit(1);
  }
}

main();
```

Add to `package.json`:
```json
{
  "scripts": {
    "seed:taxonomy": "tsx scripts/seed-taxonomy.ts"
  }
}
```

### Testing
```bash
# Seed taxonomy
npm seed:taxonomy

# Verify in Supabase
SELECT COUNT(*) FROM skills_taxonomy;
# Expected: 100

# Verify in Qdrant (use Qdrant dashboard or API)
# Collection: skill_taxonomy
# Expected: 100 points

# Test normalization
curl -X POST http://localhost:5005/test/normalize-skills \
  -H "Content-Type: application/json" \
  -d '{"skills": ["ReactJS", "Python3", "ML", "NodeJS"]}'

# Expected output:
# [
#   {"original": "ReactJS", "canonical": "React", "confidence": 0.95},
#   {"original": "Python3", "canonical": "Python", "confidence": 0.93},
#   {"original": "ML", "canonical": "Machine Learning", "confidence": 0.91},
#   {"original": "NodeJS", "canonical": "Node.js", "confidence": 0.94}
# ]
```

### Acceptance Criteria
- ✅ **Critical**: 100 skills inserted into Supabase `skills_taxonomy` table
- ✅ **Critical**: 100 skill vectors inserted into Qdrant
- ✅ **Critical**: Skill normalization works: "ReactJS" → "React" (>0.85 confidence)
- ✅ **Critical**: Unknown skills kept as-is (no errors)
- ⚠️ **Important**: Embeddings cached in Redis (verify TTL)
- ⚠️ **Important**: Synonyms match correctly: "JS" → "JavaScript", "ML" → "Machine Learning"
- 💡 **Nice-to-have**: Seeding is idempotent (can run multiple times)

### Key Design Decision: Vector Similarity vs Static Lookup
**Why NOT use static taxonomy?**
- ❌ Misses typos: "Javascipt" wouldn't match
- ❌ Misses variations: "React.js" vs "ReactJS" vs "React JS"
- ❌ Requires manual maintenance of aliases
- ✅ Vector search handles all of the above automatically
- ✅ Confidence scores allow quality control

**Cost Consideration:**
- Embedding 1 skill: ~$0.0002 (cached for 90 days)
- 100 skills seeded: ~$0.02 one-time cost
- Normalizing resume (20 skills): ~$0.004 (first time), $0 (cached)

### Reference Files (Verify Before Using)
- `taxonomy/skill_taxonomy.js` - Existing skill list (DON'T copy directly, use as inspiration)
- `services/skillSearchService.js` - Old search patterns (verify logic only)

---

