# Feature 7: Peer Matching - Implementation Decisions

## Architecture Decisions

### 1. Multi-Vector Matching Strategy
**Decision**: Use `weighted_avg` for retrieval, separate vectors for detailed scoring

**Rationale**:
- Single Qdrant search (fast) retrieves top 100 candidates via weighted_avg
- Post-retrieval scoring uses individual vectors for precision
- Avoids 3x search cost while maintaining accuracy

**Implementation**:
```
Search: weighted_avg → Top 100 candidates
Score: Compare skills_vector, goals_vector, experience_vector individually
```

### 2. Complementary Skills Scoring
**Decision**: Implement semantic matching between learning goals and candidate skills

**Rationale**:
- Core value prop: "find peers who can teach what you want to learn"
- Captures asymmetric relationship (I want to learn X, they know X)
- Leverages existing embedding infrastructure

**Implementation**:
```
1. Fetch user's learning_goals text
2. Generate embedding for goals
3. Compare against candidate's skills_vector
4. Similarity score = complementary skill score
```

### 3. Cohere Reranking
**Decision**: Skip for MVP, add as optimization later

**Rationale**:
- 5-factor scoring already sophisticated
- Adds cost ($1-2/1K requests) + latency (200-500ms)
- Validate basic matching first
- Optimize if match quality insufficient

### 4. Route Path
**Decision**: `/peer/matches`

**Rationale**:
- Consistency with `/peer/matching`, `/peer/connections`
- Clear namespace separation
- RESTful organization

### 5. Response Format
**Decision**: IDs + scores + essential profile preview

**Include**:
- `user_id`, `display_name`, `bio` (150 char truncated), `avatar_url`
- `experience_level`, top 5 skills
- All scoring factors breakdown
- `final_score` (calculated from 5 factors)

**Exclude** (separate detail endpoint):
- Full work experience, projects, education
- Complete skills list
- Full preferences

### 6. Scoring Weights
**Final Formula**:
```
final_score = 
  (shared_skills * 0.30) +
  (complementary_skills * 0.25) +
  (goal_alignment * 0.20) +
  (experience_compatibility * 0.15) +
  (availability_match * 0.10)
```

### 7. Performance Targets
- Vector search: <500ms
- Scoring (100 candidates): <1s
- Total response: <2s
- Cached response: <100ms
- Cache TTL: 1 hour

### 8. Filtering
**Must filter**:
- Exclude self (user_id != current user)
- `is_active = true`
- `is_searchable = true`

**Consider later**:
- Location-based filtering
- Timezone overlap filtering
- Language preferences

## Implementation Order

1. **Matcher Service** (`src/services/matching/matcher.ts`)
   - Vector search with weighted_avg
   - Return top 100 candidates with similarity scores

2. **Scorer Service** (`src/services/matching/scorer.ts`)
   - 5-factor scoring implementation
   - Semantic goal-to-skills matching
   - Experience compatibility logic
   - Availability overlap calculation

3. **Route** (`src/routes/matching.ts`)
   - GET `/peer/matches` endpoint
   - Redis caching layer
   - Profile preview assembly
   - Error handling

4. **Tests** (if time permits)
   - Unit tests for scorer logic
   - Integration test for full flow

## Cache Strategy
```typescript
CacheKey: `match:candidates:${userId}`
TTL: 1 hour
Invalidate on: Profile update, skills update, preferences update
```

## Open Questions (Deferred)
- Should we support pagination? (Start with top 10)
- Should we support filters (e.g., "only frontend devs")? (No for MVP)
- Should we explain WHY matched? (Return factor breakdown - yes)
