# Feature 2 Summary - Skill Gap Analysis

**Status:** ✅ Code Complete  
**Date:** December 24, 2025  
**Testing Guide:** [TESTING_GUIDE_FEATURE_2.md](TESTING_GUIDE_FEATURE_2.md)

---

## 🎯 What It Does

Compares user's current skills against job market demands (from Feature 1) and generates personalized learning paths with LLM.

---

## 📦 Files Created/Modified

### SQL Schema
- `scripts/phase2-feature2-schema.sql` - Creates `learning_paths` table with RLS

### Services (Domain Logic)
- `src/services/gaps/analyzer.ts` - Gap classification logic
  - Fetches user skills from `user_skills` table
  - Loads job market data from Feature 1 cache
  - Classifies into: gaps, strengths, improvements
  - Priority calculation: critical (>70%), high (>50%), medium (>30%), low (<30%)

- `src/services/gaps/pathGenerator.ts` - LLM path generation
  - Uses Instructor + Zod for structured output
  - Generates 1-4 week steps with free resources
  - Orders by prerequisites (foundations → advanced)
  - Stores in `learning_paths` table

### API Routes
- `src/routes/gaps.ts` - 3 endpoints:
  1. `POST /api/gaps/analyze` - Run gap analysis + trigger async path generation
  2. `GET /api/gaps/:goalId/path` - Retrieve generated learning path
  3. `POST /api/gaps/:goalId/regenerate` - Regenerate path after skill updates

### Infrastructure
- `src/server.ts` - Registered `/api/gaps` route

### Tests
- `src/services/gaps/__tests__/analyzer.test.ts` - 6 unit tests for priority logic

---

## 🔄 How It Works

```
1. User calls POST /api/gaps/analyze with goalId
   ↓
2. System fetches user skills from database
   ↓
3. System loads job market data (Feature 1 cache)
   ↓
4. Analyzer classifies skills:
   - Missing + high demand = GAP
   - Beginner/intermediate + demand = IMPROVEMENT
   - Advanced/expert = STRENGTH
   ↓
5. Returns analysis to user immediately
   ↓
6. Triggers async LLM path generation (10-15 seconds)
   ↓
7. Path stored in learning_paths table
   ↓
8. User retrieves via GET /api/gaps/:goalId/path
```

---

## ✨ Key Features

### Smart Classification
- **Gaps:** Skills user lacks that >50% of jobs require
- **Improvements:** Skills user has at beginner/intermediate level
- **Strengths:** Skills user has at advanced/expert level

### Priority System
- **Critical:** Missing skill, >70% of jobs need it (e.g., React for frontend)
- **High:** Missing skill, >50% of jobs need it (e.g., TypeScript)
- **Medium:** Have skill at beginner level, >50% demand OR missing skill, >30% demand
- **Low:** Everything else

### LLM Learning Path
- **Structured Output:** Instructor + Zod ensures valid format
- **Deterministic:** `temperature=0.3, seed=42` for consistency
- **Free Resources:** Prioritizes freeCodeCamp, MDN, official docs
- **Realistic Timelines:** 1-4 weeks per step, total matches user's goal timeline
- **Project-Based:** Each step includes hands-on project idea

### Async Generation
- Analysis returns immediately (<5s)
- Path generation happens in background (10-30s)
- User polls `/path` endpoint to retrieve

---

## 📋 Database Schema

```sql
CREATE TABLE learning_paths (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  goal_id UUID REFERENCES learning_goals(id),
  path_data JSONB, -- { steps: [...], total_estimated_weeks: N, key_milestones: [...] }
  version INT DEFAULT 1, -- Increments when regenerated
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(user_id, goal_id, version)
);
```

---

## 🧪 Testing Checklist

- [ ] Run SQL schema in Supabase
- [ ] Test 1: Analyze gaps with realistic user data
- [ ] Test 2: Retrieve generated learning path
- [ ] Test 3: Verify error when path not ready yet
- [ ] Test 4: Regenerate path after adding skills
- [ ] Test 5: Error handling for missing job market data
- [ ] Test 6: Beginner user (no skills) gets basic path
- [ ] Run unit tests: `npm test src/services/gaps`

---

## 🚀 API Examples

### Analyze Gaps
```bash
POST /api/gaps/analyze
{
  "goalId": "uuid"
}

Response:
{
  "analysis": {
    "gaps": [{ skill, frequency, priority }],
    "strengths": [{ skill, user_level }],
    "improvements": [{ skill, user_level, priority }]
  },
  "summary": "You're strong in HTML. Focus on: React, TypeScript...",
  "message": "Learning path is being generated..."
}
```

### Get Learning Path
```bash
GET /api/gaps/:goalId/path

Response:
{
  "path": {
    "total_estimated_weeks": 16,
    "steps": [
      {
        "title": "Master JavaScript Fundamentals",
        "estimated_weeks": 3,
        "resources": [{ type, title, url, free }],
        "project_idea": "Build a todo app"
      }
    ],
    "key_milestones": ["Complete JS course", "Build first React app"]
  },
  "version": 1
}
```

---

## 🔗 Dependencies

- **Feature 1 (Job Market):** REQUIRED - Must have job market data cached
- **User Skills:** Reads from `user_skills` table (Phase 1)
- **Learning Goals:** Reads from `learning_goals` table (Phase 1)

---

## 🎯 Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| Gap analysis identifies missing skills | ✅ Implemented |
| Priority correctly assigned (>70% = critical) | ✅ Implemented |
| Learning path generated in <30s | ✅ Implemented |
| Steps ordered by prerequisites | ✅ LLM instructed |
| Resources are free | ✅ LLM instructed |
| Path regeneration works | ✅ Implemented |
| Error handling for missing data | ✅ Implemented |

---

## 📊 Performance Targets

- Gap analysis: <5 seconds
- Path retrieval: <500ms (database query)
- Path generation (async): <30 seconds
- Regeneration (sync): <30 seconds

---

## 🐛 Known Limitations

- LLM output quality varies (check manually during testing)
- No caching for learning paths (regenerates each time)
- Async path generation means 2 API calls (analyze → wait → get path)

**Potential Improvements:**
- Cache paths by hash of (goalId + user skills)
- Streaming path generation with Server-Sent Events
- Store path generation status for better UX

---

## 📖 Next Steps

1. **Run database schema** in Supabase
2. **Manual testing** - Follow TESTING_GUIDE_FEATURE_2.md
3. **Approve quality** - Check LLM output makes sense
4. **Move to Feature 3** - LeetCode Pattern Analysis

---

**Implementation Time:** ~2 hours  
**Lines of Code:** ~600  
**Test Coverage:** 6 unit tests  
**API Endpoints:** 3
