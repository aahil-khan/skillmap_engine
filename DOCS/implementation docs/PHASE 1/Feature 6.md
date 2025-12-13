## FEATURE 6: PROFILE MANAGEMENT

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

**important:** Create unit tests aswell for this feature.

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