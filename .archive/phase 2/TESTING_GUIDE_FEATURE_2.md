# Feature 2 Testing Guide - Skill Gap Analysis

**Feature:** Skill Gap Analysis + Personalized Learning Paths  
**Status:** Ready for Testing  
**Date:** December 24, 2025

---

## 📋 Prerequisites

### 1. Database Setup

Run the SQL schema in Supabase SQL Editor:

```bash
# Open: scripts/phase2-feature2-schema.sql
# Copy and execute in Supabase
```

**Verify:**
- Table `learning_paths` created
- Indexes exist: `idx_learning_paths_user_goal`, `idx_learning_paths_created`
- Foreign key constraints valid

### 2. Feature 1 Complete

You must have run Feature 1 (Job Market Integration) first:
- Job market data cached for your goal
- Run: `POST /api/jobs/analyze` with your goalId

### 3. User Profile Setup

Ensure your user has:
- Skills added to `user_skills` table (with skill levels)
- Learning goal in `learning_goals` table
- User profile in `user_profiles` table

### 4. Server Running

```bash
npm run dev
# Server should start on http://localhost:5005
```

---

## 🧪 Test Scenarios

### Test 1: Analyze Skill Gaps

**Purpose:** Identify what skills user needs vs what they have

**Prerequisites:**
- User has some skills in profile (e.g., HTML: advanced, CSS: intermediate)
- Job market data exists for goal (run Feature 1 first)

**Request:**
```bash
curl -X POST http://localhost:5005/api/gaps/analyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "goalId": "your-goal-uuid"
  }'
```

**Expected Response:**
```json
{
  "goalId": "uuid",
  "analysis": {
    "gaps": [
      {
        "skill": "React",
        "required_frequency": 0.85,
        "user_has": false,
        "priority": "critical"
      },
      {
        "skill": "TypeScript",
        "required_frequency": 0.72,
        "user_has": false,
        "priority": "high"
      }
      // ... up to 10 gaps
    ],
    "strengths": [
      {
        "skill": "HTML",
        "required_frequency": 0.6,
        "user_has": true,
        "user_level": "advanced",
        "priority": "low"
      }
      // ... up to 5 strengths
    ],
    "improvements": [
      {
        "skill": "CSS",
        "required_frequency": 0.55,
        "user_has": true,
        "user_level": "intermediate",
        "priority": "medium"
      }
      // ... up to 5 improvements
    ]
  },
  "summary": "You're strong in HTML, CSS. To reach your goal, focus on learning: React, TypeScript, Node.js. 2 skill(s) need improvement. Personalized learning path covers 12 skill(s) to master.",
  "message": "Personalized learning path is being generated. Check /api/gaps/:goalId/path in a few seconds."
}
```

**Verify:**
- ✅ Response time <5 seconds
- ✅ Gaps list includes skills user doesn't have
- ✅ Strengths list includes user's advanced/expert skills
- ✅ Improvements list includes user's beginner/intermediate skills
- ✅ Priority correctly assigned (critical for >70% frequency)
- ✅ Summary is human-readable

**Check Logs:**
```
[INFO] Starting gap analysis { userId, goalId }
[INFO] Fetched user skills { userId, skillCount: N }
[INFO] Loaded job market data { userId, goalId, skillCount, source }
[INFO] Gap analysis complete { userId, goalId, gaps: X, improvements: Y, strengths: Z, criticalGaps: N }
[INFO] Generating learning path with LLM { userId, goalId, gapCount: X }
```

---

### Test 2: Retrieve Learning Path

**Purpose:** Get generated learning path after gap analysis

**Wait:** 5-10 seconds after Test 1 (LLM generation is async)

**Request:**
```bash
curl -X GET http://localhost:5005/api/gaps/your-goal-uuid/path \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "id": "path-uuid",
  "goalId": "your-goal-uuid",
  "path": {
    "total_estimated_weeks": 16,
    "steps": [
      {
        "step_number": 1,
        "title": "Master JavaScript Fundamentals",
        "description": "Build a strong foundation in modern JavaScript...",
        "skills_covered": ["JavaScript", "ES6"],
        "estimated_weeks": 3,
        "resources": [
          {
            "type": "docs",
            "title": "MDN JavaScript Guide",
            "url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide",
            "free": true
          },
          {
            "type": "course",
            "title": "freeCodeCamp JavaScript Algorithms",
            "url": "https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures/",
            "free": true
          }
        ],
        "project_idea": "Build a todo app with local storage"
      },
      {
        "step_number": 2,
        "title": "Learn React Basics",
        "description": "Understand components, props, state...",
        "skills_covered": ["React"],
        "estimated_weeks": 4,
        "resources": [
          {
            "type": "docs",
            "title": "React Official Tutorial",
            "url": "https://react.dev/learn",
            "free": true
          }
        ],
        "project_idea": "Build a weather app using a free API"
      }
      // ... more steps
    ],
    "key_milestones": [
      "Complete JavaScript fundamentals course",
      "Build first React app",
      "Deploy portfolio project"
    ]
  },
  "version": 1,
  "createdAt": "2025-12-24T..."
}
```

**Verify:**
- ✅ Response time <500ms (from database)
- ✅ Steps ordered logically (fundamentals before frameworks)
- ✅ Each step has 1-4 weeks estimate
- ✅ Resources are free (freeCodeCamp, MDN, official docs)
- ✅ Project ideas included
- ✅ Total weeks realistic for goal timeline

**Check Logs:**
```
[INFO] Fetching learning path { userId, goalId }
[INFO] Learning path retrieved { userId, goalId, pathId }
```

---

### Test 3: Path Not Found (Too Soon)

**Purpose:** Verify error handling when path generation hasn't completed

**Request:** (Immediately after Test 1, don't wait)
```bash
curl -X GET http://localhost:5005/api/gaps/your-goal-uuid/path \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected:** 404 Not Found
```json
{
  "error": "Learning path not found. Run POST /api/gaps/analyze first, then check back in a few seconds."
}
```

---

### Test 4: Regenerate Learning Path

**Purpose:** Update learning path after user adds new skills

**Scenario:** User just added "React: beginner" to their profile

**Request:**
```bash
curl -X POST http://localhost:5005/api/gaps/your-goal-uuid/regenerate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "goalId": "your-goal-uuid",
  "path": {
    "total_estimated_weeks": 12,
    "steps": [
      {
        "step_number": 1,
        "title": "Advance React Skills",
        "description": "Move from beginner to intermediate...",
        // ... updated path
      }
    ],
    "key_milestones": [...]
  },
  "version": 2,
  "message": "Learning path regenerated successfully"
}
```

**Verify:**
- ✅ Response time <30 seconds (synchronous LLM call)
- ✅ Version incremented (1 → 2)
- ✅ Path reflects user's new skills
- ✅ Steps adjusted (skips basics if user already knows React)

---

### Test 5: Missing Job Market Data

**Purpose:** Verify error when Feature 1 not run first

**Setup:** Use a goalId that hasn't had job market analysis

**Request:**
```bash
curl -X POST http://localhost:5005/api/gaps/analyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "goalId": "new-goal-without-job-data"
  }'
```

**Expected:** 400 or 500 Error
```json
{
  "error": "Job market data not available. Run /api/jobs/analyze first with your goal ID."
}
```

---

### Test 6: User With No Skills

**Purpose:** Verify gap analysis works for beginners

**Setup:** Test user with empty `user_skills` table

**Request:**
```bash
curl -X POST http://localhost:5005/api/gaps/analyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "goalId": "your-goal-uuid"
  }'
```

**Expected Response:**
- All market skills appear in `gaps` (none in `strengths`)
- Summary: "Building foundation skills. To reach your goal, focus on learning: [top 3 skills]."
- Learning path starts with absolute fundamentals

---

## ✅ Unit Tests

Run the test suite:

```bash
npm test src/services/gaps/__tests__/analyzer.test.ts
```

**Expected Output:**
```
✓ Skill Gap Analysis - Priority Calculation
  ✓ should mark high-frequency missing skills as critical
  ✓ should mark medium-frequency missing skills as high priority
  ✓ should mark beginner skills with high demand as high priority
  ✓ should mark intermediate skills as medium priority
  ✓ should mark low-frequency missing skills as low priority

✓ Skill Gap Analysis - Classification
  ✓ should classify skills correctly

Test Files  1 passed (1)
Tests  6 passed (6)
```

---

## 📊 Performance Benchmarks

| Operation | Target | Acceptable | Result |
|-----------|--------|------------|--------|
| POST /gaps/analyze | <3s | <5s | ___ |
| GET /gaps/:id/path | <200ms | <500ms | ___ |
| POST /gaps/:id/regenerate | <20s | <30s | ___ |
| LLM path generation (async) | <15s | <30s | ___ |

---

## 🎯 Acceptance Criteria Checklist

- [ ] ✅ **Critical:** Gap analysis identifies missing skills correctly
- [ ] ✅ **Critical:** Priority assignment makes sense (critical = >70% frequency)
- [ ] ✅ **Critical:** Learning path generated with realistic time estimates
- [ ] ✅ **Critical:** Steps ordered by prerequisites (HTML → CSS → JavaScript → React)
- [ ] ✅ **Critical:** Resources are free (freeCodeCamp, MDN, official docs)
- [ ] ✅ **Critical:** Response time <5s for analysis, <30s for path generation
- [ ] ⚠️ **Important:** Path regeneration works after user updates skills
- [ ] ⚠️ **Important:** Error handling for missing job market data
- [ ] ⚠️ **Important:** User with no skills gets beginner-friendly path

---

## 📝 Testing Notes

**Record Issues Here:**
- 

**Performance Results:**
- Test 1 response time: ___
- Test 2 response time: ___
- Test 4 regeneration time: ___

**LLM Quality Check:**
- Are steps logical? (Y/N): ___
- Are resources helpful? (Y/N): ___
- Are time estimates realistic? (Y/N): ___

**User Feedback:**
- 

---

## ✅ Sign-Off

Once all tests pass:

- [ ] All acceptance criteria met
- [ ] Performance targets achieved
- [ ] Error handling verified
- [ ] LLM output quality approved
- [ ] User approves moving to Feature 3

**Approved by:** _______________  
**Date:** _______________

---

**Next:** Feature 3 - LeetCode Pattern Analysis (independent feature)
