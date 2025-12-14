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