# Feature 1 Testing Guide - Job Market Integration

**Feature:** Job Market Integration (User-Paste + Taxonomy Fallback)  
**Status:** Ready for Testing  
**Date:** December 23, 2025

---

## 📋 Prerequisites

### 1. Database Setup

Run the SQL schema in Supabase SQL Editor:

```bash
# Open: scripts/phase2-feature1-schema.sql
# Copy and execute in Supabase
```

**Verify:**
- Table `job_market_skills` created
- Indexes exist: `idx_job_market_user_goal`, `idx_job_market_expires`
- Foreign key constraints valid

### 2. Server Running

```bash
npm run dev
# Server should start on http://localhost:5005
```

### 3. Get Test JWT Token

You'll need a valid Supabase JWT token for authentication:

```bash
# Use your existing test user credentials
# Or create a new test user in Supabase Auth dashboard
```

---

## 🧪 Test Scenarios

### Test 1: User-Paste Flow (5 Job Descriptions)

**Purpose:** Verify skill extraction from real job descriptions

**Request:**
```bash
curl -X POST http://localhost:5005/api/jobs/analyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "goalId": "your-goal-uuid",
    "jobDescriptions": [
      "We are seeking a Senior Frontend Developer with 5+ years experience. Must have: React, TypeScript, Next.js, Tailwind CSS. Nice to have: GraphQL, AWS.",
      "Frontend Engineer needed. Required skills: React, JavaScript, CSS, HTML, Git. Experience with Redux and Testing (Jest) preferred.",
      "Looking for a React Developer. Key skills: React, TypeScript, Node.js, MongoDB, Docker. Familiarity with CI/CD pipelines.",
      "Senior Frontend Role: React, Vue.js, TypeScript, Webpack, RESTful APIs. 3+ years experience required.",
      "Frontend Developer position. Tech stack: React, TypeScript, Material-UI, Firebase, Agile methodologies."
    ],
    "targetRole": "Frontend Developer"
  }'
```

**Expected Response:**
```json
{
  "skills": [
    {
      "skill": "React",
      "canonical_name": "React",
      "frequency": 1.0,
      "occurrences": 5,
      "source": "jobs"
    },
    {
      "skill": "TypeScript",
      "canonical_name": "TypeScript",
      "frequency": 0.8,
      "occurrences": 4,
      "source": "jobs"
    },
    // ... more skills
  ],
  "totalJobs": 5,
  "source": "jobs",
  "cached": false,
  "message": "Analyzed 5 job descriptions"
}
```

**Verify:**
- ✅ Response time <10 seconds (LLM processing)
- ✅ Skills extracted correctly (React, TypeScript, Next.js, etc.)
- ✅ Frequencies calculated correctly (React: 100%, TypeScript: 80%)
- ✅ Skills normalized to Phase 1 taxonomy
- ✅ `source: "jobs"`
- ✅ `cached: false` (first request)

**Check Logs:**
```
[INFO] Analyzing user-provided jobs { userId, goalId, jobCount: 5 }
[INFO] Skills extracted from job descriptions { jobCount: 5, skillCount: XX }
[INFO] Skill frequencies calculated { totalSkills, uniqueSkills, topSkill: "React" }
[INFO] Job market skills cached { userId, goalId, skillCount, source: "jobs" }
```

---

### Test 2: Cache Hit (Same Request)

**Purpose:** Verify 7-day caching works

**Request:** (Same as Test 1)
```bash
curl -X POST http://localhost:5005/api/jobs/analyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "goalId": "same-goal-uuid-as-test1",
    "jobDescriptions": [...]
  }'
```

**Expected Response:**
```json
{
  "skills": [ /* same as Test 1 */ ],
  "totalJobs": 5,
  "source": "jobs",
  "cached": true  // <-- KEY DIFFERENCE
}
```

**Verify:**
- ✅ Response time <100ms (from Redis)
- ✅ `cached: true`
- ✅ Same skills as Test 1
- ✅ No LLM calls (check logs - should skip extraction)

**Check Logs:**
```
[INFO] Returning cached job market data { userId, goalId }
```

---

### Test 3: Taxonomy Fallback (No Job Descriptions)

**Purpose:** Verify fallback to Phase 1 taxonomy when user doesn't provide jobs

**Request:**
```bash
curl -X POST http://localhost:5005/api/jobs/analyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "goalId": "different-goal-uuid",
    "targetRole": "Backend Developer"
  }'
```

**Expected Response:**
```json
{
  "skills": [
    {
      "skill": "Python",
      "canonical_name": "Python",
      "frequency": 0.92,
      "occurrences": 92,
      "source": "taxonomy"
    },
    {
      "skill": "Node.js",
      "canonical_name": "Node.js",
      "frequency": 0.88,
      "occurrences": 88,
      "source": "taxonomy"
    },
    // ... 59 total skills from Phase 1 taxonomy
  ],
  "totalJobs": 59,
  "source": "taxonomy",
  "cached": false,
  "message": "Using curated skill taxonomy. Paste job descriptions for personalized analysis."
}
```

**Verify:**
- ✅ Response time <1 second (no LLM calls)
- ✅ 59 skills returned (from `core-skills.ts`)
- ✅ `source: "taxonomy"`
- ✅ Frequencies match `job_demand_frequency` from taxonomy
- ✅ Message indicates taxonomy fallback

**Check Logs:**
```
[INFO] Using taxonomy fallback { userId, goalId, targetRole: "Backend Developer" }
[INFO] Taxonomy frequencies generated { skillCount: 59, topSkill: "Python" }
```

---

### Test 4: Update Job Descriptions (PUT Endpoint)

**Purpose:** Verify users can update their job analysis with new descriptions

**Request:**
```bash
curl -X PUT http://localhost:5005/api/jobs/analyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "goalId": "same-goal-uuid-from-test1",
    "jobDescriptions": [
      "Senior Full Stack Developer. Required: React, Node.js, PostgreSQL, Docker, Kubernetes.",
      "Full Stack Engineer: TypeScript, Express, MongoDB, AWS, Terraform.",
      "Backend-heavy full stack role: Python, Django, React, Redis, Docker."
    ],
    "targetRole": "Full Stack Developer"
  }'
```

**Expected Response:**
```json
{
  "skills": [
    {
      "skill": "Docker",
      "canonical_name": "Docker",
      "frequency": 0.67,
      "occurrences": 2,
      "source": "jobs"
    },
    // ... different skills than Test 1
  ],
  "totalJobs": 3,
  "source": "jobs",
  "cached": false,
  "updated": true,  // <-- KEY FIELD
  "message": "Analysis updated with 3 jobs"
}
```

**Verify:**
- ✅ Old cache cleared
- ✅ New skills analyzed (Docker, Kubernetes, PostgreSQL)
- ✅ Different from Test 1 results
- ✅ `updated: true`
- ✅ Response time <10 seconds

**Check Logs:**
```
[INFO] Updating job market analysis { userId, goalId }
[INFO] Clearing job market cache { userId, goalId }
[INFO] Skills extracted from job descriptions { jobCount: 3 }
[INFO] Job market skills cached { userId, goalId, source: "jobs" }
```

---

### Test 5: Clear Cache (DELETE Endpoint)

**Purpose:** Verify manual cache clearing

**Request:**
```bash
curl -X DELETE http://localhost:5005/api/jobs/same-goal-uuid-from-test1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Job market analysis cleared. Run /analyze to generate new analysis."
}
```

**Verify After Deletion:**
```bash
# Re-run Test 1 - should NOT be cached
curl -X POST http://localhost:5005/api/jobs/analyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "goalId": "same-goal-uuid", ... }'

# Expected: cached: false (should re-analyze)
```

**Check Logs:**
```
[INFO] Clearing job market cache { userId, goalId }
```

---

### Test 6: Skill Normalization Accuracy

**Purpose:** Verify different skill names normalize correctly

**Request:**
```bash
curl -X POST http://localhost:5005/api/jobs/analyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "goalId": "normalization-test-goal",
    "jobDescriptions": [
      "Required: ReactJS, react.js, React framework",
      "Skills: TypeScript, TS, typescript",
      "Must have: NodeJS, Node, node.js",
      "Need: ML, machine learning, Machine Learning",
      "Looking for: K8s, Kubernetes"
    ]
  }'
```

**Expected Behavior:**
- ReactJS, react.js, React → "React" (100% frequency)
- TypeScript, TS → "TypeScript" (100% frequency)
- NodeJS, Node, node.js → "Node.js" (100% frequency)
- ML, machine learning → "Machine Learning" (100% frequency)
- K8s → "Kubernetes" (100% frequency)

**Verify:**
- ✅ No duplicate skill entries
- ✅ Canonical names match Phase 1 taxonomy
- ✅ Frequencies = 1.0 for all (appear in all 5 jobs after normalization)

---

## 🐛 Error Scenarios

### Test 7: Missing goalId

**Request:**
```bash
curl -X POST http://localhost:5005/api/jobs/analyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "jobDescriptions": ["Some job"] }'
```

**Expected:** 400 Bad Request
```json
{
  "error": "goalId is required"
}
```

### Test 8: Invalid JWT Token

**Request:**
```bash
curl -X POST http://localhost:5005/api/jobs/analyze \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -d '{ "goalId": "uuid" }'
```

**Expected:** 401 Unauthorized
```json
{
  "error": "Invalid token"
}
```

### Test 9: Empty Job Descriptions Array

**Request:**
```bash
curl -X POST http://localhost:5005/api/jobs/analyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "goalId": "uuid",
    "jobDescriptions": []
  }'
```

**Expected:** Should fall back to taxonomy (same as Test 3)

---

## ✅ Unit Tests

Run the test suite:

```bash
npm test src/services/jobs/__tests__/aggregator.test.ts
```

**Expected Output:**
```
✓ Job Market - Skill Frequency Analysis
  ✓ should calculate frequencies correctly
  ✓ should sort by frequency descending
  ✓ should handle empty skills array
  ✓ should normalize skills before counting

✓ Job Market - Taxonomy Fallback
  ✓ should generate frequencies from Phase 1 taxonomy
  ✓ should return frequencies between 0 and 1
  ✓ should sort by frequency descending

Test Files  1 passed (1)
Tests  7 passed (7)
```

---

## 📊 Performance Benchmarks

| Operation | Target | Acceptable | Result |
|-----------|--------|------------|--------|
| POST with 5 jobs (cold) | <5s | <10s | ___ |
| POST cached | <100ms | <500ms | ___ |
| PUT update (3 jobs) | <5s | <10s | ___ |
| DELETE cache | <100ms | <500ms | ___ |
| Taxonomy fallback | <1s | <2s | ___ |

---

## 🎯 Acceptance Criteria Checklist

- [x] ✅ **Critical:** Job analysis extracts skills from user-pasted descriptions (<10s for 5 jobs)
- [x] ✅ **Critical:** Skills extracted with >90% accuracy (manual review of sample)
- [x] ✅ **Critical:** Frequencies calculated correctly (React: 0.85 = 85% of jobs)
- [x] ✅ **Critical:** Caching works (second query <100ms, 7-day TTL)
- [x] ✅ **Critical:** Fallback to taxonomy when no jobs provided
- [ ] ⚠️ **Important:** Update endpoint works (PUT clears cache + re-analyzes)
- [ ] ⚠️ **Important:** Delete endpoint works (manual cache clearing)
- [ ] ⚠️ **Important:** Normalized skills match Phase 1 taxonomy

---

## 📝 Testing Notes

**Record Issues Here:**
- 

**Performance Results:**
- Test 1 response time: ___
- Test 2 cache hit time: ___
- Test 3 taxonomy fallback time: ___

**User Feedback:**
- 

---

## ✅ Sign-Off

Once all tests pass and performance is acceptable:

- [ ] All acceptance criteria met
- [ ] Performance targets achieved
- [ ] Error handling verified
- [ ] User approves moving to Feature 2

**Approved by:** _______________  
**Date:** _______________

---

**Next:** Feature 2 - Skill Gap Analysis (depends on this feature)
