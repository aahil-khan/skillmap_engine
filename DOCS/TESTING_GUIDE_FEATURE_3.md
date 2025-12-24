# Feature 3 Testing Guide - LeetCode Pattern Analysis

**Estimated Time:** 30-45 minutes  
**Prerequisites:** Valid LeetCode username with submission history

---

## 🔧 Setup

### Step 1: Run Database Schema
```sql
-- In Supabase SQL Editor:
-- Run scripts/phase2-feature3-schema.sql
```

**Verify:**
```sql
-- Check columns exist:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'leetcode_profiles'
  AND column_name IN ('pattern_analysis', 'acceptance_rate');
```

### Step 2: Get JWT Token
```bash
node ./scripts/get-test-token.js
# Copy the JWT token
```

### Step 3: Set Postman Environment
- Open Postman
- Set `jwt_token` variable with your token
- Set `base_url` to `http://localhost:5005`

---

## 📝 Test Scenarios

### Test 1: First-Time Sync (Happy Path)

**Endpoint:** `POST /api/leetcode/sync`

**Body:**
```json
{
  "username": "your_leetcode_username",
  "force": false
}
```

**Expected Result:**
- Status: 200
- Response time: 8-15s (API fetch + LLM analysis)
- Response includes:
  ```json
  {
    "profile": {
      "username": "...",
      "totalSolved": 100,
      "easySolved": 40,
      "mediumSolved": 45,
      "hardSolved": 15,
      "ranking": 12345,
      "acceptanceRate": 75.23
    },
    "patterns": {
      "strength_patterns": [...],
      "weak_patterns": [...],
      "comfort_level": "Medium",
      "consistency_score": 78,
      "growth_trend": "improving",
      "recommended_focus": [...]
    },
    "message": "LeetCode profile synced successfully",
    "synced_at": "2025-12-24T..."
  }
  ```

**Manual Checks:**
1. Open Supabase → `leetcode_profiles` table
2. Verify row created with your `user_id`
3. Check `pattern_analysis` column is populated (JSONB)
4. Verify `acceptance_rate` is a number (e.g., 75.23)

---

### Test 2: Get Profile (Cached)

**Endpoint:** `GET /api/leetcode/profile`

**Expected Result:**
- Status: 200
- Response time: <200ms (cached)
- Response includes:
  ```json
  {
    "profile": {...},
    "patterns": {...},
    "lastSynced": "2025-12-24T10:00:00Z",
    "needsResync": false
  }
  ```

**Manual Checks:**
- `needsResync` should be `false` (synced <24h ago)
- Profile data matches Test 1 results

---

### Test 3: Smart Sync (>24h Old)

**Setup:**
- Manually update `last_synced_at` in DB:
  ```sql
  UPDATE leetcode_profiles 
  SET last_synced_at = NOW() - INTERVAL '25 hours'
  WHERE user_id = 'your-user-id';
  ```

**Endpoint:** `GET /api/leetcode/profile`

**Expected Result:**
- Status: 200
- Response time: <500ms
- Response includes `needsResync: true`
- Check server logs for "Profile outdated, triggering background re-sync"

**Manual Checks:**
- Wait 10-15 seconds
- Query DB again - `last_synced_at` should be updated
- `pattern_analysis` should be refreshed

---

### Test 4: Re-Analyze Patterns

**Scenario:** You solved 5 new LeetCode problems since last sync

**Endpoint:** `POST /api/leetcode/analyze`

**Expected Result:**
- Status: 200
- Response time: 10-20s (LLM analysis)
- Response includes:
  ```json
  {
    "patterns": {...},
    "message": "Pattern analysis updated successfully",
    "analyzed_at": "2025-12-24T..."
  }
  ```

**Manual Checks:**
1. Compare `patterns` to Test 1 results
2. Verify new problems reflected (e.g., `problem_count` increased for certain patterns)
3. Check if `growth_trend` changed (e.g., "plateau" → "improving")

---

### Test 5: Find Study Partners

**Setup:**
- Need at least 2 users with LeetCode profiles synced
- Or use test data (seed multiple profiles)

**Endpoint:** `GET /api/leetcode/study-partners?limit=10`

**Expected Result:**
- Status: 200
- Response time: <2s
- Response includes:
  ```json
  {
    "matches": [
      {
        "user_id": "uuid-123",
        "score": 0.85,
        "patterns": {
          "strengths": ["Graph Theory", "Dynamic Programming"],
          "weaknesses": ["Backtracking"],
          "comfort_level": "Medium",
          "consistency": 75,
          "trend": "improving"
        }
      }
    ],
    "count": 5,
    "message": "Found study partners with complementary skills"
  }
  ```

**Manual Checks:**
- Verify matches have strengths in your weakness areas
- Check scores are reasonable (>0.7 for good matches)
- Ensure your own `user_id` is NOT in results

---

### Test 6: Invalid Username

**Endpoint:** `POST /api/leetcode/sync`

**Body:**
```json
{
  "username": "this_user_does_not_exist_12345"
}
```

**Expected Result:**
- Status: 500 (or 404)
- Error message: "LeetCode user '...' not found"

---

### Test 7: Force Sync (Clear Cache)

**Endpoint:** `POST /api/leetcode/sync`

**Body:**
```json
{
  "username": "your_leetcode_username",
  "force": true
}
```

**Expected Result:**
- Status: 200
- Response time: 8-15s (cache cleared, fetches fresh data)
- Check server logs for "LeetCode cache cleared"

---

### Test 8: Profile Not Found Error

**Setup:**
- Use a new JWT token for a user who hasn't synced yet

**Endpoint:** `GET /api/leetcode/profile`

**Expected Result:**
- Status: 404
- Error message: "LeetCode profile not found. Please sync your profile first using POST /api/leetcode/sync"

---

## 🔍 Pattern Analysis Quality Check

### Manual Review of LLM Output

After Test 1, check `pattern_analysis` in DB:

**Strengths Check:**
- [ ] Patterns match user's actual strong topics (e.g., if you solved 50 DP problems, "Dynamic Programming" should be in strengths)
- [ ] Proficiency levels are accurate (beginner/intermediate/advanced/expert)
- [ ] Evidence is factual (e.g., "Solved 45 DP problems" should match reality)

**Weaknesses Check:**
- [ ] Patterns identify gaps (e.g., topics with <10 solves)
- [ ] Recommended problems are valid LeetCode IDs (check a few manually)
- [ ] Focus areas make sense for career goals

**Comfort Level:**
- [ ] If >50% Hard problems solved → "Hard"
- [ ] If mostly Medium → "Medium"
- [ ] If mostly Easy → "Easy"

**Consistency Score:**
- [ ] High streak (30+ days) + many active days → score >80
- [ ] Low streak (<7 days) → score <50

**Growth Trend:**
- [ ] If recent problems are harder than average → "improving"
- [ ] If recent activity is low → "declining"

---

## 🐛 Common Issues

### Issue: "Failed to save LeetCode profile"
**Possible Causes:**
- RLS policies not created
- JWT token doesn't match `user_id` in request

**Fix:**
```sql
-- Verify RLS policies exist:
SELECT * FROM pg_policies WHERE tablename = 'leetcode_profiles';
```

### Issue: "LeetCode API rate limited"
**Possible Causes:**
- Too many requests in short time

**Fix:**
- Wait 60 seconds
- Code already has exponential backoff (should auto-retry)

### Issue: "Pattern analysis failed"
**Possible Causes:**
- OpenAI API key missing/invalid
- No submission history (new LeetCode account)

**Fix:**
- Verify `OPENAI_API_KEY` in `.env`
- Use account with at least 10+ problems solved

### Issue: "No study partners found"
**Possible Causes:**
- Only 1 user in database
- No complementary skills exist

**Fix:**
- Seed test users with diverse skill sets
- Or test with production data (multiple real users)

---

## 📊 Performance Benchmarks

| Operation | Target | Actual | Pass? |
|-----------|--------|--------|-------|
| Initial Sync | 8-15s | ___s | [ ] |
| Profile GET (cached) | <200ms | ___ms | [ ] |
| Re-Analysis | 10-20s | ___s | [ ] |
| Study Partners | <2s | ___s | [ ] |
| Force Sync | 8-15s | ___s | [ ] |

---

## ✅ Acceptance Checklist

- [ ] All 8 test scenarios pass
- [ ] Pattern analysis is accurate (manual review)
- [ ] Caching works (cached requests <200ms)
- [ ] Rate limiting prevents API errors
- [ ] Study partner matching returns relevant users
- [ ] Error handling works for invalid usernames
- [ ] Performance benchmarks met

---

## 🚀 Next Steps

**After Testing:**
1. Review `DOCS/FEATURE_3_SUMMARY.md` for implementation details
2. Provide feedback or approve in `DOCS/phase_2_implementation_progress.md`
3. If approved, proceed to Feature 4 (Match Quality Feedback)

**Questions?** Check `FEATURE_3_SUMMARY.md` or ask!
