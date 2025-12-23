# Job Market Integration - User-Paste Approach

**Decision Date:** December 23, 2025  
**Reason:** Adzuna API is NOT free (discovered during Phase 2 planning)

---

## 🎯 The Better Solution

Instead of fetching jobs from Adzuna API, **users paste 3-10 job descriptions** they're targeting. This provides:

### ✅ Benefits

1. **More Accurate** - Jobs user ACTUALLY wants (not generic market data)
2. **Zero Cost** - No API fees ($0 vs ~$50/mo)
3. **Global Coverage** - Works with any job board (LinkedIn, Indeed, Glassdoor, etc.)
4. **No Rate Limits** - Process unlimited jobs
5. **Privacy-Friendly** - No external API sees user data
6. **Better UX** - Same workflow synergy with ATS scoring (Feature 5)
7. **More Reliable** - No API downtime or dependency issues

### 🔄 Smart Fallback

If user doesn't provide job descriptions:
- Use **Phase 1 taxonomy** (65 curated skills)
- Each skill has `job_demand_frequency` (0.1-0.9)
- Still provides value without external data

---

## 🏗️ Implementation

### Routes

```typescript
// POST /api/jobs/analyze
{
  "goalId": "uuid",
  "targetRole": "Frontend Developer", // optional
  "jobDescriptions": [
    "We need a Senior Frontend Developer with React, TypeScript...",
    "Frontend Engineer: Next.js, GraphQL, AWS experience required..."
  ]
}

// Response
{
  "skills": [
    { "canonical_name": "React", "frequency": 0.90, "occurrences": 9 },
    { "canonical_name": "TypeScript", "frequency": 0.85, "occurrences": 8.5 }
  ],
  "totalJobs": 10,
  "source": "jobs", // or "taxonomy"
  "cached": false,
  "message": "Analyzed 10 job descriptions"
}
```

### Service Structure

```
src/services/jobs/
├── taxonomyFallback.ts  # Phase 1 taxonomy frequencies
├── scraper.ts           # LLM skill extraction (accepts job array)
├── aggregator.ts        # Frequency calculator
└── index.ts             # Orchestrator
```

### Database Schema

```sql
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
```

---

## 📊 User Flow Examples

### Scenario A: User Pastes Jobs

```
1. User sets goal: "I want to become a Senior Frontend Developer"
   ↓
2. System prompts: "Paste 3-10 job descriptions you're targeting"
   ↓
3. User copies 5 job postings from LinkedIn
   ↓
4. POST /api/jobs/analyze { jobDescriptions: [...], goalId }
   → LLM extracts: React (90%), TypeScript (85%), Next.js (70%)
   → Normalizes to Phase 1 taxonomy
   → Cache 7 days
   ↓
5. POST /api/gaps/analyze { goalId }
   → Gaps identified: Next.js (missing), TypeScript (needs level up)
   ↓
6. System generates learning path + matches with mentors
```

### Scenario B: User Skips (Taxonomy Fallback)

```
1. User sets goal: "I want to become a Senior Frontend Developer"
   ↓
2. System prompts: "Paste jobs (or skip to use curated taxonomy)"
   ↓
3. User clicks "Skip" or leaves empty
   ↓
4. POST /api/jobs/analyze { goalId, targetRole: "Frontend Developer" }
   → Returns taxonomy frequencies:
      React: 0.85, TypeScript: 0.78, Next.js: 0.68
   → source: 'taxonomy'
   ↓
5. POST /api/gaps/analyze { goalId }
   → Gaps identified based on taxonomy demand scores
   ↓
6. System generates learning path + matches with mentors
```

---

## 🧪 Testing Strategy

### Determinism Validation

```typescript
// Test 10 runs with same job descriptions
const jobDescriptions = ['...same 5 jobs...'];

for (let i = 0; i < 10; i++) {
  const result = await extractSkillsFromJobDescriptions(jobDescriptions);
  // All 10 results should be identical (Instructor temp=0, seed=42)
}
```

### Edge Cases

1. **Empty job descriptions** → Fallback to taxonomy
2. **Invalid job text** → LLM validation + error handling
3. **Very short descriptions** → Minimum skill threshold
4. **Skills not in taxonomy** → Soft match via vector similarity

---

## 💰 Cost Comparison

| Approach | Cost (1000 users/mo) | Pros | Cons |
|----------|----------------------|------|------|
| **Adzuna API** | ~$50/mo + LLM costs | Automated, fresh data | Generic, limited countries, rate limits |
| **User-Paste** | LLM costs only (~$3/mo) | Personalized, accurate, global | Requires user input |
| **Taxonomy Fallback** | $0 | Always available, validated | Static data |

---

## 🚀 Implementation Checklist

- [x] Remove Adzuna API references from docs
- [x] Update database schema (user_id + goal_id instead of role + seniority)
- [x] Create `taxonomyFallback.ts` helper
- [x] Update `scraper.ts` to accept job description array
- [x] Change route from `GET /api/jobs/skills/:role` to `POST /api/jobs/analyze`
- [x] Update caching keys (userId + goalId instead of role + seniority)
- [ ] Implement route handler with fallback logic
- [ ] Add frontend UI for job paste textarea
- [ ] Test determinism (10 runs = identical output)
- [ ] Test taxonomy fallback
- [ ] Update integration tests

---

## 📚 Phase 1 Taxonomy Reference

**File:** `src/data/core-skills.ts`

Each skill has:
- `name`: Canonical name (e.g., "React")
- `aliases`: ["ReactJS", "React.js", "react"]
- `category`: "Frontend Framework"
- `job_demand_frequency`: 0.1-0.9 (how often it appears in jobs)
- `value_weight`: 0.7-1.5 (importance multiplier)
- `commonly_paired_with`: ["TypeScript", "Next.js"]

**Usage for fallback:**
```typescript
// Convert job_demand_frequency to frequency format
const frequency = skill.job_demand_frequency; // 0.85 = 85%
const occurrences = Math.round(frequency * 65); // 55 out of 65 skills
```

---

## 🔗 Related Documentation

- [PHASE_2_IMPLEMENTATION_GUIDE.md](./PHASE_2_IMPLEMENTATION_GUIDE.md) - Full implementation details
- [PHASE_2_QUICK_REFERENCE.md](./PHASE_2_QUICK_REFERENCE.md) - Quick reference summary
- [../../.github/copilot-instructions.md](../../.github/copilot-instructions.md) - Phase 1 architecture

---

## ❓ FAQ

**Q: What if users don't paste enough jobs?**  
A: Taxonomy fallback kicks in (65 validated skills with demand scores)

**Q: How many jobs should users paste?**  
A: Recommend 3-10 for statistical significance, but 1+ works

**Q: Can we add Adzuna later?**  
A: Yes! Treat it as optional enhancement (hybrid approach)

**Q: What about other job APIs?**  
A: JSearch API (RapidAPI) offers 50 free searches/month if needed

**Q: How does this affect Skill Gap Analysis (Feature 2)?**  
A: No changes needed! Gap analyzer works with any skill frequency source

---

**Status:** ✅ **APPROVED** - Proceeding with user-paste + taxonomy fallback approach
