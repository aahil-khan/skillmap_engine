# Phase 1 Implementation Guide - Part 2

**Continuation of:** PHASE_1_IMPLEMENTATION_GUIDE.md  
**Features:** Resume Parsing, Profile Management, Peer Matching, Testing

---

## 7. FEATURE 5: RESUME PARSING

### Objective
Build deterministic resume parser with two-pass skill extraction and Redis caching.

### Prerequisites
- ✅ Feature 3 (Infrastructure) completed
- ✅ Feature 4 (Skill Taxonomy) seeded

### Tasks

#### 7.1 Zod Schemas
Create `src/schemas/resume.ts`:
```typescript
import { z } from 'zod';

// Pass 1: Raw extraction from resume (as-is)
export const ResumeExtractionSchema = z.object({
  personal_info: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin_url: z.string().url().optional(),
    github_url: z.string().url().optional(),
    portfolio_url: z.string().url().optional(),
  }),
  summary: z.string().optional(),
  skills: z.array(z.object({
    name: z.string(),
    proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  })),
  work_experience: z.array(z.object({
    company: z.string(),
    title: z.string(),
    location: z.string().optional(),
    start_date: z.string(), // "2020-01" or "January 2020"
    end_date: z.string().optional(),
    is_current: z.boolean().default(false),
    description: z.string().optional(),
    technologies: z.array(z.string()).default([]),
  })),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    url: z.string().url().optional(),
    github_url: z.string().url().optional(),
    technologies: z.array(z.string()).default([]),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
  })).default([]),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    field_of_study: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    grade: z.string().optional(),
  })).default([]),
});

export type ResumeExtraction = z.infer<typeof ResumeExtractionSchema>;
```

#### 7.2 PDF Parser (Reuse Existing Logic)
Create `src/services/resume/parser.ts`:
```typescript
import pdf from 'pdf-parse';
import logger from '../../utils/logger.js';

/**
 * Extracts text from PDF buffer.
 * Reference: utils/pdfParser.js (verify this works, adapt if needed)
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdf(buffer);
    return data.text;
  } catch (error) {
    logger.error('PDF parsing failed', { error });
    throw new Error('Failed to extract text from PDF');
  }
}
```

Install dependency:
```bash
pnpm add pdf-parse
pnpm add -D @types/pdf-parse
```

#### 7.3 Resume Extractor (Instructor + OpenAI)
Create `src/services/resume/extractor.ts`:
```typescript
import Instructor from '@instructor-ai/instructor';
import { openai, MODELS } from '../../lib/llm/openai.js';
import { ResumeExtractionSchema, type ResumeExtraction } from '../../schemas/resume.js';
import logger from '../../utils/logger.js';

const instructor = Instructor({
  client: openai,
  mode: 'TOOLS',
});

/**
 * Pass 1: Extract structured data from resume text using LLM.
 * CRITICAL: temperature=0 for determinism
 */
export async function extractResumeData(resumeText: string): Promise<ResumeExtraction> {
  try {
    const extraction = await instructor.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a resume parser. Extract structured information from the resume text.
          
Rules:
- Extract skills EXACTLY as written (don't normalize yet)
- For dates, prefer ISO format (YYYY-MM) but keep original if unclear
- Include ALL technologies mentioned in work experience and projects
- Be precise - only extract information explicitly stated`,
        },
        {
          role: 'user',
          content: resumeText,
        },
      ],
      model: MODELS.STRUCTURED_OUTPUT,
      temperature: 0, // CRITICAL: Deterministic
      response_model: {
        schema: ResumeExtractionSchema,
        name: 'ResumeExtraction',
      },
      max_retries: 3,
    });

    logger.info('Resume extraction successful', {
      skillsCount: extraction.skills.length,
      experienceCount: extraction.work_experience.length,
      projectsCount: extraction.projects.length,
    });

    return extraction;
  } catch (error) {
    logger.error('Resume extraction failed', { error });
    throw error;
  }
}
```

#### 7.4 Resume Service (Orchestrator)
Create `src/services/resume/index.ts`:
```typescript
import crypto from 'crypto';
import { supabase } from '../../lib/db/supabase.js';
import { CacheKeys, CacheTTL, getJSON, setJSON } from '../../lib/cache/redis.js';
import { extractTextFromPDF } from './parser.js';
import { extractResumeData } from './extractor.js';
import { normalizeSkills } from './normalizer.js';
import logger from '../../utils/logger.js';
import type { ResumeExtraction } from '../../schemas/resume.js';

export async function processResume(userId: string, pdfBuffer: Buffer, fileName: string) {
  try {
    // 1. Extract text from PDF
    const resumeText = await extractTextFromPDF(pdfBuffer);
    
    // 2. Generate content hash for deduplication
    const contentHash = crypto.createHash('sha256').update(resumeText).digest('hex');
    
    // 3. Check cache (avoid re-processing same resume)
    const cacheKey = CacheKeys.resumeParsed(contentHash);
    let parsedData = await getJSON<ResumeExtraction>(cacheKey);
    
    if (!parsedData) {
      logger.info('Cache miss - parsing resume', { contentHash });
      
      // Pass 1: Extract as-is
      parsedData = await extractResumeData(resumeText);
      
      // Cache for 30 days
      await setJSON(cacheKey, parsedData, CacheTTL.RESUME);
    } else {
      logger.info('Cache hit - using cached resume', { contentHash });
    }
    
    // Pass 2: Normalize skills
    const rawSkills = parsedData.skills.map(s => s.name);
    const normalizedSkills = await normalizeSkills(rawSkills);
    
    // 4. Store in Supabase
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .insert({
        user_id: userId,
        file_name: fileName,
        file_size_bytes: pdfBuffer.length,
        mime_type: 'application/pdf',
        raw_text: resumeText,
        content_hash: contentHash,
        parsed_data: parsedData,
        is_current: true,
      })
      .select('id')
      .single();
    
    if (resumeError) throw resumeError;
    
    // 5. Store normalized skills
    for (const skill of normalizedSkills) {
      // Find skill_id from taxonomy
      const { data: taxonomySkill } = await supabase
        .from('skills_taxonomy')
        .select('id')
        .eq('canonical_name', skill.canonical)
        .single();
      
      if (taxonomySkill) {
        await supabase.from('user_skills').upsert({
          user_id: userId,
          skill_id: taxonomySkill.id,
          skill_level: parsedData.skills.find(s => s.name === skill.original)?.proficiency || 'intermediate',
          source: 'resume',
        }, { onConflict: 'user_id,skill_id' });
      }
    }
    
    // 6. Store work experience
    for (const exp of parsedData.work_experience) {
      await supabase.from('work_experience').insert({
        user_id: userId,
        company_name: exp.company,
        job_title: exp.title,
        location: exp.location,
        is_current: exp.is_current,
        start_date: parseDate(exp.start_date),
        end_date: exp.end_date ? parseDate(exp.end_date) : null,
        description: exp.description,
        technologies: exp.technologies,
      });
    }
    
    // 7. Store projects
    for (const project of parsedData.projects) {
      await supabase.from('projects').insert({
        user_id: userId,
        project_name: project.name,
        description: project.description,
        project_url: project.url,
        github_url: project.github_url,
        technologies: project.technologies,
        start_date: project.start_date ? parseDate(project.start_date) : null,
        end_date: project.end_date ? parseDate(project.end_date) : null,
      });
    }
    
    // 8. Store education
    for (const edu of parsedData.education) {
      await supabase.from('education').insert({
        user_id: userId,
        institution_name: edu.institution,
        degree: edu.degree,
        field_of_study: edu.field_of_study,
        start_date: edu.start_date ? parseDate(edu.start_date) : null,
        end_date: edu.end_date ? parseDate(edu.end_date) : null,
        grade: edu.grade,
      });
    }
    
    // 9. Update user profile
    await supabase.from('user_profiles').update({
      display_name: parsedData.personal_info.name,
      profile_completed: true,
    }).eq('user_id', userId);
    
    logger.info('Resume processing complete', {
      resumeId: resume.id,
      skillsNormalized: normalizedSkills.length,
    });
    
    return {
      resumeId: resume.id,
      skillsExtracted: rawSkills.length,
      skillsNormalized: normalizedSkills.length,
      experienceAdded: parsedData.work_experience.length,
      projectsAdded: parsedData.projects.length,
    };
  } catch (error) {
    logger.error('Resume processing failed', { error, userId });
    throw error;
  }
}

// Helper: Parse various date formats
function parseDate(dateStr: string): string | null {
  try {
    // Handle "2020-01", "January 2020", "01/2020", etc.
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}
```

#### 7.5 Resume Upload Route
Create `src/routes/resume.ts`:
```typescript
import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import { processResume } from '../services/resume/index.js';
import { ValidationError } from '../utils/errors.js';

const app = new Hono();

app.post('/upload', authenticate, async (c) => {
  const userId = c.get('userId');
  
  // Get file from multipart form
  const body = await c.req.parseBody();
  const file = body['resume'] as File;
  
  if (!file) {
    throw new ValidationError('Resume file is required');
  }
  
  if (file.type !== 'application/pdf') {
    throw new ValidationError('Only PDF files are supported');
  }
  
  if (file.size > 5 * 1024 * 1024) { // 5MB limit
    throw new ValidationError('File size must be less than 5MB');
  }
  
  // Convert to Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  const result = await processResume(userId, buffer, file.name);
  
  return c.json({
    message: 'Resume processed successfully',
    ...result,
  });
});

export default app;
```

Add route to `src/server.ts`:
```typescript
import resumeRoutes from './routes/resume.js';

app.route('/resume', resumeRoutes);
```

### Testing

#### Unit Tests
Create `src/services/resume/__tests__/determinism.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { extractResumeData } from '../extractor.js';
import fs from 'fs';

describe('Resume Parsing Determinism', () => {
  it('should produce identical output for same input (10 runs)', async () => {
    const sampleResume = fs.readFileSync('./test/fixtures/sample-resume.txt', 'utf-8');
    
    const results = await Promise.all(
      Array(10).fill(null).map(() => extractResumeData(sampleResume))
    );
    
    // All results should be identical
    const stringified = results.map(r => JSON.stringify(r));
    const uniqueResults = new Set(stringified);
    
    expect(uniqueResults.size).toBe(1);
  }, 60000); // 60s timeout
});
```

#### Manual Testing
```bash
# 1. Start server
pnpm dev

# 2. Upload resume
curl -X POST http://localhost:5005/resume/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "resume=@path/to/resume.pdf"

# 3. Verify in Supabase
SELECT * FROM resumes ORDER BY created_at DESC LIMIT 1;
SELECT * FROM user_skills WHERE user_id = '...';
SELECT * FROM work_experience WHERE user_id = '...';

# 4. Test caching (upload same resume again)
# Should be instant (<500ms) due to cache
```

### Acceptance Criteria
- ✅ **Critical (Blocking)**: Same resume produces identical output across 10 runs
- ✅ **Critical**: Skills normalized correctly (e.g., "ReactJS" → "React")
- ✅ **Critical**: All resume data stored in Supabase (skills, experience, projects, education)
- ✅ **Critical**: Caching works (second upload of same resume <500ms)
- ✅ **Critical**: PDF parsing handles various formats (single column, two column, tables)
- ⚠️ **Important**: Handles missing sections gracefully (no experience, no projects, etc.)
- ⚠️ **Important**: File size validation prevents DoS (5MB limit)
- 💡 **Nice-to-have**: Supports multiple file formats (DOCX, TXT)

### Key Implementation Notes

**Why Two-Pass Extraction?**
1. **Pass 1 (LLM)**: Extract skills AS-IS to avoid hallucination
   - "ReactJS", "Python3", "ML" kept exactly as written
2. **Pass 2 (Vector Search)**: Normalize to canonical names
   - "ReactJS" → "React" (0.95 confidence)
   - "ML" → "Machine Learning" (0.91 confidence)

**Why NOT normalize in LLM?**
- ❌ LLM might hallucinate skills not in resume
- ❌ Inconsistent normalization (same input → different output)
- ✅ Vector search is deterministic (same embedding → same result)
- ✅ Confidence scores allow quality control

**Cost Breakdown:**
- Extract resume: ~$0.001 (cached 30 days)
- Normalize 20 skills: ~$0.004 first time, $0 cached
- Total per resume: <$0.005 (first time), <$0.001 (repeat user)

### Reference Files (Verify Before Using)
- `services/resumeService.js` - Extraction patterns (DON'T copy temperature/taxonomy)
- `utils/pdfParser.js` - PDF parsing logic (reuse if it works)
- `schemas/ai-response-schemas.js` - Zod schema patterns

---

## 8. FEATURE 6: PROFILE MANAGEMENT

### Objective
Allow users to view/update profiles and generate multi-vector embeddings for matching.

### Prerequisites
- ✅ Feature 2 (Database) completed
- ✅ Feature 3 (Infrastructure) completed

### Tasks

#### 8.1 Profile Schemas
Create `src/schemas/profile.ts`:
```typescript
import { z } from 'zod';

export const ProfileUpdateSchema = z.object({
  display_name: z.string().min(2).max(100).optional(),
  bio: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  timezone: z.string().optional(),
  experience_level: z.enum(['entry', '1-3years', '3-5years', '5+years']).optional(),
  is_searchable: z.boolean().optional(),
});

export const PeerPreferencesSchema = z.object({
  available_days: z.array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])).optional(),
  preferred_time_slots: z.array(z.enum(['morning', 'afternoon', 'evening', 'night'])).optional(),
  preferred_collaboration_types: z.array(z.enum(['project', 'study', 'mentor', 'learn'])).optional(),
  communication_preferences: z.array(z.string()).optional(),
  is_accepting_requests: z.boolean().optional(),
});
```

#### 8.2 Profile Service
Create `src/services/profile/index.ts`:
```typescript
import { supabase } from '../../lib/db/supabase.js';
import { NotFoundError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

export async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select(`
      *,
      skills:user_skills(
        skill_id,
        skill_level,
        skill:skills_taxonomy(canonical_name, category)
      ),
      work_experience(*),
      projects(*),
      education(*),
      learning_goals(*)
    `)
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    throw new NotFoundError('Profile not found');
  }
  
  return data;
}

export async function updateUserProfile(userId: string, updates: any) {
  const { data, error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('user_id', userId)
    .select()
    .single();
  
  if (error) throw error;
  
  logger.info('Profile updated', { userId });
  return data;
}

export async function updatePeerPreferences(userId: string, preferences: any) {
  // Check if preferences exist
  const { data: existing } = await supabase
    .from('peer_preferences')
    .select('id')
    .eq('user_id', userId)
    .single();
  
  if (existing) {
    const { data, error } = await supabase
      .from('peer_preferences')
      .update(preferences)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('peer_preferences')
      .insert({ user_id: userId, ...preferences })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}
```

#### 8.3 Profile Embedder (Multi-Vector)
Create `src/services/profile/embedder.ts`:
```typescript
import { createBatchEmbeddings } from '../../lib/llm/openai.js';
import { qdrant, COLLECTIONS } from '../../lib/vector/qdrant.js';
import { supabase } from '../../lib/db/supabase.js';
import logger from '../../utils/logger.js';

interface UserVectorProfile {
  skills_vector: number[];
  goals_vector: number[];
  experience_vector: number[];
  weighted_avg: number[];
}

/**
 * Generate multi-vector embeddings for a user profile
 */
export async function generateProfileEmbeddings(userId: string): Promise<UserVectorProfile> {
  // Fetch profile data
  const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();
  const { data: skills } = await supabase.from('user_skills').select('*, skill:skills_taxonomy(canonical_name)').eq('user_id', userId);
  const { data: goals } = await supabase.from('learning_goals').select('*').eq('user_id', userId).eq('status', 'active');
  const { data: experience } = await supabase.from('work_experience').select('*').eq('user_id', userId);
  
  // Format text for embedding
  const skillsText = skills?.map(s => `${s.skill.canonical_name} (${s.skill_level})`).join(', ') || '';
  const goalsText = goals?.map(g => g.refined_goal || g.original_goal).join(', ') || '';
  const experienceText = experience?.map(e => `${e.job_title} at ${e.company_name}: ${e.description || ''}`).join(' ') || '';
  
  // Generate embeddings (batch for efficiency)
  const [skillsVec, goalsVec, expVec] = await createBatchEmbeddings([
    skillsText || 'No skills listed',
    goalsText || 'No learning goals',
    experienceText || 'No work experience',
  ]);
  
  // Weighted average (skills 40%, goals 30%, experience 30%)
  const weightedAvg = skillsVec.map((val, idx) => 
    val * 0.4 + goalsVec[idx] * 0.3 + expVec[idx] * 0.3
  );
  
  return {
    skills_vector: skillsVec,
    goals_vector: goalsVec,
    experience_vector: expVec,
    weighted_avg: weightedAvg,
  };
}

/**
 * Upsert user profile embedding to Qdrant
 */
export async function upsertProfileEmbedding(userId: string) {
  const vectors = await generateProfileEmbeddings(userId);
  
  // Get metadata
  const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();
  const { data: skills } = await supabase.from('user_skills').select('*').eq('user_id', userId);
  const { data: leetcode } = await supabase.from('leetcode_profiles').select('*').eq('user_id', userId).single();
  
  await qdrant.upsert(COLLECTIONS.USER_PROFILES, {
    wait: true,
    points: [{
      id: userId,
      vector: vectors.weighted_avg,
      payload: {
        user_id: userId,
        skills_vector: vectors.skills_vector,
        goals_vector: vectors.goals_vector,
        experience_vector: vectors.experience_vector,
        skill_count: skills?.length || 0,
        experience_level: profile?.experience_level || 'entry',
        primary_categories: [], // TODO: Extract top 3 categories
        has_leetcode: !!leetcode,
        is_active: profile?.is_active || false,
        is_searchable: profile?.is_searchable || true,
        last_active: profile?.last_active_at || new Date().toISOString(),
      },
    }],
  });
  
  logger.info('Profile embedding upserted', { userId });
}
```

#### 8.4 Profile Routes
Create `src/routes/profile.ts`:
```typescript
import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import { getUserProfile, updateUserProfile, updatePeerPreferences } from '../services/profile/index.js';
import { upsertProfileEmbedding } from '../services/profile/embedder.js';
import { ProfileUpdateSchema, PeerPreferencesSchema } from '../schemas/profile.js';

const app = new Hono();

// Get current user profile
app.get('/', authenticate, async (c) => {
  const userId = c.get('userId');
  const profile = await getUserProfile(userId);
  return c.json(profile);
});

// Update profile
app.patch('/', authenticate, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const validated = ProfileUpdateSchema.parse(body);
  
  const updated = await updateUserProfile(userId, validated);
  
  // Regenerate embeddings (async, don't block response)
  upsertProfileEmbedding(userId).catch(err => 
    console.error('Failed to update embeddings', err)
  );
  
  return c.json(updated);
});

// Update peer preferences
app.patch('/preferences', authenticate, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const validated = PeerPreferencesSchema.parse(body);
  
  const updated = await updatePeerPreferences(userId, validated);
  return c.json(updated);
});

export default app;
```

### Testing
```bash
# Get profile
curl http://localhost:5005/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Update profile
curl -X PATCH http://localhost:5005/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "John Doe",
    "bio": "Full-stack developer passionate about React",
    "experience_level": "3-5years",
    "is_searchable": true
  }'

# Verify embedding in Qdrant
# Use Qdrant dashboard to check point exists with user_id
```

### Acceptance Criteria
- ✅ **Critical**: Profile CRUD operations work (GET, PATCH)
- ✅ **Critical**: Multi-vector embeddings generated (skills, goals, experience separate)
- ✅ **Critical**: Weighted average computed correctly (40%, 30%, 30%)
- ✅ **Critical**: Profile embedding upserted to Qdrant with metadata
- ⚠️ **Important**: Preferences stored separately
- ⚠️ **Important**: Profile updates trigger embedding regeneration
- 💡 **Nice-to-have**: Optimistic updates (return immediately, regenerate async)

---

## 9. FEATURE 7: PEER MATCHING ENGINE

### Objective
Implement semantic matching with multi-factor scoring and Cohere reranking.

### Prerequisites
- ✅ Feature 6 (Profile Embeddings) completed

### Tasks

#### 9.1 Matcher Service (Candidate Retrieval)
Create `src/services/matching/matcher.ts`:
```typescript
import { qdrant, COLLECTIONS } from '../../lib/vector/qdrant.js';
import { supabase } from '../../lib/db/supabase.js';
import logger from '../../utils/logger.js';

export async function findMatchCandidates(userId: string, limit: number = 100) {
  // Get user's vector profile from Qdrant
  const userPoint = await qdrant.retrieve(COLLECTIONS.USER_PROFILES, {
    ids: [userId],
    with_vectors: true,
  });
  
  if (!userPoint || userPoint.length === 0) {
    throw new Error('User profile embedding not found');
  }
  
  const userVector = userPoint[0].vector as number[];
  
  // Search for similar profiles
  const results = await qdrant.search(COLLECTIONS.USER_PROFILES, {
    vector: userVector,
    limit,
    filter: {
      must: [
        { key: 'user_id', match: { value: userId }, operator: 'ne' }, // Exclude self
        { key: 'is_active', match: { value: true } },
        { key: 'is_searchable', match: { value: true } },
      ],
    },
    with_payload: true,
    with_vectors: false,
  });
  
  logger.info('Found match candidates', {
    userId,
    count: results.length,
  });
  
  return results.map(r => ({
    user_id: r.payload?.user_id as string,
    similarity_score: r.score,
    payload: r.payload,
  }));
}
```

#### 9.2 Scorer (Multi-Factor Scoring)
Create `src/services/matching/scorer.ts`:
```typescript
import { supabase } from '../../lib/db/supabase.js';

interface ScoringFactors {
  shared_skills_score: number; // 30%
  complementary_skills_score: number; // 25%
  goal_alignment_score: number; // 20%
  experience_compatibility_score: number; // 15%
  availability_match_score: number; // 10%
}

export async function calculateMatchScore(
  userId: string,
  candidateId: string,
  vectorSimilarity: number
): Promise<{ total_score: number; factors: ScoringFactors }> {
  // Fetch skills for both users
  const { data: userSkills } = await supabase
    .from('user_skills')
    .select('skill_id, skill_level')
    .eq('user_id', userId);
  
  const { data: candidateSkills } = await supabase
    .from('user_skills')
    .select('skill_id, skill_level')
    .eq('user_id', candidateId);
  
  const userSkillIds = new Set(userSkills?.map(s => s.skill_id) || []);
  const candidateSkillIds = new Set(candidateSkills?.map(s => s.skill_id) || []);
  
  // 1. Shared skills (30%)
  const sharedSkills = [...userSkillIds].filter(id => candidateSkillIds.has(id));
  const shared_skills_score = sharedSkills.length > 0 
    ? Math.min((sharedSkills.length / userSkillIds.size) * 100, 100)
    : 0;
  
  // 2. Complementary skills (25%) - candidate has skills user is learning
  const { data: userGoals } = await supabase
    .from('learning_goals')
    .select('target_role, refined_goal')
    .eq('user_id', userId)
    .eq('status', 'active');
  
  // Simplified: Check if candidate has skills in user's learning goals
  // TODO: Use semantic similarity between goals and candidate's skills
  const complementary_skills_score = vectorSimilarity * 25; // Placeholder
  
  // 3. Goal alignment (20%) - similar career aspirations
  const goal_alignment_score = vectorSimilarity * 20; // Use goals_vector similarity
  
  // 4. Experience compatibility (15%) - similar levels
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('experience_level')
    .eq('user_id', userId)
    .single();
  
  const { data: candidateProfile } = await supabase
    .from('user_profiles')
    .select('experience_level')
    .eq('user_id', candidateId)
    .single();
  
  const experienceLevels = ['entry', '1-3years', '3-5years', '5+years'];
  const userExpIdx = experienceLevels.indexOf(userProfile?.experience_level || 'entry');
  const candidateExpIdx = experienceLevels.indexOf(candidateProfile?.experience_level || 'entry');
  const experienceDiff = Math.abs(userExpIdx - candidateExpIdx);
  const experience_compatibility_score = Math.max(0, 100 - (experienceDiff * 25)); // Closer = better
  
  // 5. Availability match (10%)
  const { data: userPrefs } = await supabase
    .from('peer_preferences')
    .select('available_days, preferred_time_slots')
    .eq('user_id', userId)
    .single();
  
  const { data: candidatePrefs } = await supabase
    .from('peer_preferences')
    .select('available_days, preferred_time_slots')
    .eq('user_id', candidateId)
    .single();
  
  const userDays = new Set(userPrefs?.available_days || []);
  const candidateDays = new Set(candidatePrefs?.available_days || []);
  const overlappingDays = [...userDays].filter(d => candidateDays.has(d));
  const availability_match_score = overlappingDays.length > 0
    ? (overlappingDays.length / Math.max(userDays.size, 1)) * 100
    : 50; // Default if no preferences set
  
  // Calculate weighted total
  const total_score = 
    (shared_skills_score * 0.30) +
    (complementary_skills_score * 0.25) +
    (goal_alignment_score * 0.20) +
    (experience_compatibility_score * 0.15) +
    (availability_match_score * 0.10);
  
  return {
    total_score: Math.round(total_score),
    factors: {
      shared_skills_score: Math.round(shared_skills_score),
      complementary_skills_score: Math.round(complementary_skills_score),
      goal_alignment_score: Math.round(goal_alignment_score),
      experience_compatibility_score: Math.round(experience_compatibility_score),
      availability_match_score: Math.round(availability_match_score),
    },
  };
}
```

#### 9.3 Reranker (Cohere)
Create `src/services/matching/reranker.ts`:
```typescript
import { rerankDocuments } from '../../lib/llm/cohere.js';
import { supabase } from '../../lib/db/supabase.js';
import logger from '../../utils/logger.js';

export async function rerankMatches(userId: string, candidateIds: string[], topN: number = 10) {
  // Get user profile as query
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select(`
      *,
      skills:user_skills(skill:skills_taxonomy(canonical_name)),
      goals:learning_goals(refined_goal, target_role)
    `)
    .eq('user_id', userId)
    .single();
  
  const userQuery = `
    ${userProfile.display_name}
    Skills: ${userProfile.skills.map((s: any) => s.skill.canonical_name).join(', ')}
    Goals: ${userProfile.goals.map((g: any) => g.refined_goal || g.target_role).join(', ')}
    Bio: ${userProfile.bio || ''}
  `;
  
  // Get candidate profiles as documents
  const { data: candidates } = await supabase
    .from('user_profiles')
    .select(`
      *,
      skills:user_skills(skill:skills_taxonomy(canonical_name)),
      goals:learning_goals(refined_goal, target_role)
    `)
    .in('user_id', candidateIds);
  
  const documents = candidates?.map(c => `
    ${c.display_name}
    Skills: ${c.skills.map((s: any) => s.skill.canonical_name).join(', ')}
    Goals: ${c.goals.map((g: any) => g.refined_goal || g.target_role).join(', ')}
    Bio: ${c.bio || ''}
  `) || [];
  
  // Rerank with Cohere
  const reranked = await rerankDocuments(userQuery, documents, topN);
  
  // Map back to user IDs
  const rerankedMatches = reranked.map(r => ({
    user_id: candidates![r.index].user_id,
    rerank_score: r.relevance_score,
  }));
  
  logger.info('Matches reranked', {
    userId,
    before: candidateIds.length,
    after: rerankedMatches.length,
  });
  
  return rerankedMatches;
}
```

#### 9.4 Matching Route
Create `src/routes/matching.ts`:
```typescript
import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import { findMatchCandidates } from '../services/matching/matcher.js';
import { calculateMatchScore } from '../services/matching/scorer.js';
import { rerankMatches } from '../services/matching/reranker.js';
import { CacheKeys, CacheTTL, getJSON, setJSON } from '../lib/cache/redis.js';

const app = new Hono();

// Get matches for current user
app.get('/', authenticate, async (c) => {
  const userId = c.get('userId');
  
  // Check cache
  const cacheKey = CacheKeys.matchCandidates(userId);
  let matches = await getJSON<any[]>(cacheKey);
  
  if (!matches) {
    // 1. Vector similarity search (top 100)
    const candidates = await findMatchCandidates(userId, 100);
    
    // 2. Multi-factor scoring
    const scored = await Promise.all(
      candidates.map(async (c) => {
        const score = await calculateMatchScore(userId, c.user_id, c.similarity_score);
        return {
          user_id: c.user_id,
          similarity_score: c.similarity_score,
          ...score,
        };
      })
    );
    
    // 3. Sort by total score
    scored.sort((a, b) => b.total_score - a.total_score);
    
    // 4. Rerank top 20 with Cohere
    const topCandidates = scored.slice(0, 20).map(s => s.user_id);
    const reranked = await rerankMatches(userId, topCandidates, 10);
    
    // 5. Merge rerank scores with calculated scores
    matches = reranked.map(r => {
      const original = scored.find(s => s.user_id === r.user_id);
      return {
        ...original,
        rerank_score: r.rerank_score,
        final_score: (original!.total_score * 0.7) + (r.rerank_score * 30), // 70% calculated, 30% rerank
      };
    });
    
    // Sort by final score
    matches.sort((a, b) => b.final_score - a.final_score);
    
    // Cache for 1 hour
    await setJSON(cacheKey, matches, CacheTTL.MATCHES);
  }
  
  return c.json({ matches });
});

export default app;
```

### Testing
```bash
# Get matches
curl http://localhost:5005/matches \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Expected response:
# {
#   "matches": [
#     {
#       "user_id": "...",
#       "similarity_score": 0.89,
#       "total_score": 87,
#       "rerank_score": 0.92,
#       "final_score": 88.5,
#       "factors": {
#         "shared_skills_score": 85,
#         "complementary_skills_score": 78,
#         ...
#       }
#     },
#     ...
#   ]
# }
```

### Acceptance Criteria
- ✅ **Critical (Blocking)**: Semantic matching finds synonyms (React vs ReactJS)
- ✅ **Critical**: Multi-factor scoring combines 5 factors correctly
- ✅ **Critical**: Reranking improves top 10 quality (20-30% boost)
- ✅ **Critical**: Response time <2s for real-time matching
- ✅ **Critical**: Cache works (second request <100ms)
- ⚠️ **Important**: Self-matching excluded
- ⚠️ **Important**: Inactive/unsearchable users filtered out
- 💡 **Nice-to-have**: Explain why matched (show top factors)

---

## 10. TESTING STRATEGY

### Unit Tests (Vitest)
```typescript
// src/services/resume/__tests__/normalizer.test.ts
describe('Skill Normalizer', () => {
  it('should normalize "ReactJS" to "React"', async () => {
    const result = await normalizeSkills(['ReactJS']);
    expect(result[0].canonical).toBe('React');
    expect(result[0].confidence).toBeGreaterThan(0.85);
  });
  
  it('should handle unknown skills gracefully', async () => {
    const result = await normalizeSkills(['SuperObscureFramework']);
    expect(result[0].canonical).toBe('SuperObscureFramework');
  });
});

// src/services/matching/__tests__/scorer.test.ts
describe('Match Scorer', () => {
  it('should calculate shared skills correctly', async () => {
    // Mock users with 50% skill overlap
    const score = await calculateMatchScore('user1', 'user2', 0.8);
    expect(score.factors.shared_skills_score).toBeGreaterThan(0);
  });
});
```

Run tests:
```bash
pnpm test
```

### Integration Tests (Manual)

#### Test 1: End-to-End Resume Parsing
```bash
# 1. Upload 3 different resumes
# 2. Verify all data in Supabase
# 3. Check Qdrant embeddings exist
# 4. Upload same resume again → verify cache hit
```

#### Test 2: Semantic Matching Quality
```bash
# 1. Create 2 users:
#    - User A: React, TypeScript, Node.js
#    - User B: ReactJS, TS, NodeJS
# 2. Generate embeddings for both
# 3. Search matches for User A
# 4. Verify User B appears in top results
# 5. Check confidence scores
```

#### Test 3: Performance
```bash
# 1. Seed 100 user profiles
# 2. Measure match query time (should be <2s)
# 3. Query again (cache hit, should be <100ms)
# 4. Check OpenAI token usage (should use cache)
```

### Acceptance Checklist (All Features)

#### Resume Parsing
- [ ] ✅ **Critical**: Same resume = same output (10 runs)
- [ ] ✅ **Critical**: Skills normalized via vector similarity
- [ ] ✅ **Critical**: Cache reduces cost by 80%+
- [ ] ⚠️ **Important**: Handles various PDF formats
- [ ] 💡 **Nice-to-have**: Multi-format support (DOCX, TXT)

#### Profile Management
- [ ] ✅ **Critical**: CRUD operations work
- [ ] ✅ **Critical**: Multi-vector embeddings generated
- [ ] ✅ **Critical**: Qdrant payload indexed for filtering
- [ ] ⚠️ **Important**: Updates trigger regeneration
- [ ] 💡 **Nice-to-have**: Optimistic updates

#### Peer Matching
- [ ] ✅ **Critical**: Semantic matching works
- [ ] ✅ **Critical**: <2s response time
- [ ] ✅ **Critical**: Reranking improves quality
- [ ] ✅ **Critical**: Cache hit rate >80%
- [ ] ⚠️ **Important**: Multi-factor scoring accurate
- [ ] 💡 **Nice-to-have**: Explainable matches

### Cost Validation
- [ ] Resume parsing: <$0.005 per resume (first time)
- [ ] Embeddings: <$0.004 per profile update
- [ ] Matching: <$0.001 per query (cached)
- [ ] Total Phase 1: <$50/mo infrastructure, <$10/mo OpenAI

---

## 11. NEXT STEPS

Once Phase 1 is complete and all acceptance criteria pass:

1. **Code Review** - Review all TypeScript code for quality
2. **Documentation** - Update API docs with new endpoints
3. **Deploy to Staging** - Test in production-like environment
4. **Load Testing** - Simulate 50 concurrent users
5. **Phase 2 Planning** - Create implementation guide for Skill Gaps + LeetCode

**Phase 1 Complete When:**
- ✅ All features deployed and working
- ✅ All tests passing (>80% coverage)
- ✅ Performance metrics met (<2s matching, <10s resume)
- ✅ Cost within budget (<$60/mo for 500 users)
- ✅ No critical bugs in production

---

**Document Complete**  
**Next:** Begin implementation with Feature 1 (Project Foundation)
