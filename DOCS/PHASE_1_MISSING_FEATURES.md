# Phase 1 - Missing Features & Endpoints

**Status:** ⚠️ Critical gaps identified  
**Date:** December 24, 2025  
**Priority:** HIGH - Must complete before full frontend integration

---

## Executive Summary

Phase 1 implemented the **core matching algorithm** successfully, but is **missing critical user interaction endpoints** needed for the Tinder-style swipe flow and connection management.

**What's Working:**
- ✅ GET /peer/matches - Returns ranked match candidates with pagination
- ✅ Multi-factor scoring (6 factors with preference compatibility)
- ✅ Vector search + caching (<1s response time)
- ✅ POST /api/feedback/matches/:candidateId/feedback - Records swipe actions (like/dislike/skip/connect)
- ✅ Profile CRUD - GET/PATCH /profile, GET/PATCH /profile/preferences, GET/PATCH /profile/skills

**What's Missing:**
- ❌ Connection management CRUD (peer_connections table interactions)
- ❌ GET /api/connections - List connections (accepted, pending)
- ❌ POST /api/connections/:id/respond - Accept/reject connection requests
- ❌ GET /profile/:userId - Public profile view (for viewing other users)
- ❌ Match filtering based on previous feedback (disliked users still appear)

---

## 🚨 CRITICAL - Connection Management System

### ✅ PARTIALLY IMPLEMENTED - Swipe Action Endpoint

**Current Implementation:**
- ✅ **Route:** `POST /api/feedback/matches/:candidateId/feedback` (EXISTS)
- ✅ **Service:** `src/services/feedback/index.ts` (EXISTS)

**Request Body:**
```json
{
  "feedbackType": "like" | "dislike" | "skip" | "connect",
  "matchScore": 85.5,
  "scoringFactors": {
    "shared_skills_score": 78,
    "complementary_skills_score": 82,
    // ... other factors
  }
}
```

**Response:**
```json
{
  "message": "Feedback recorded successfully",
  "feedback": {
    "candidate_id": "uuid",
    "type": "like",
    "score": 85.5
  }
}
```

**❌ MISSING - Connection Creation Logic:**
The feedback endpoint records actions but does NOT:
- Check if candidate has already liked this user → Create mutual connection
- Create pending connection request in `peer_connections` table
- Return connection_status ("pending" | "matched")

**What Needs to be Added:**
1. Add mutual connection detection logic to `src/services/feedback/index.ts`
2. Create `peer_connections` record when feedbackType = "like" or "connect"
3. Return connection status in response
4. Update GET /peer/matches to filter out users with "dislike" feedback

---

#### 2. List Connections
**Route:** `GET /api/connections`

**Purpose:** Get user's connections (accepted, pending sent, pending received)

**Query Params:**
- `status=accepted|pending|all` (default: all)
- `type=sent|received` (for pending only)
- `page=1&limit=20`

**Response:**
```json
{
  "accepted": [
    {
      "connection_id": "uuid",
      "peer": {
        "user_id": "uuid",
        "display_name": "Alice",
        "avatar_url": "...",
        "bio": "...",
        "skills": ["React", "TypeScript"],
        ❌ MISSING - "matching_preference": "mentor"
      },
      "match_score": 85.5,
      "connected_at": "2025-12-20T10:00:00Z"
    }
  ],
  "pending_received": [
    {
      "connection_id": "uuid",
      "peer": { /* ... */ },
      "match_score": 78.2,
      "created_at": "2025-12-23T15:30:00Z"
    }
  ],
  "pending_sent": [ /* ... */ ]
}
```

**Implementation Notes:**
- Join `peer_connections` with `user_profiles` to enrich peer data
- Cache with 5-min TTL (connections don't change frequently)
- Include match_score for context (why system suggested them)

---

#### 3. ❌ MISSING - Respond to Connection Request
**Route:** `POST /api/connections/:connectionId/respond`

**Purpose:** Accept or reject a connection request

**Request Body:**
```json
{
  "action": "accept" | "reject"
}
```

**Response:**
```json
{
  "success": true,
  "connection_status": "accepted" | "rejected",
  "message": "You are now connected with Alice" | "Request declined"
}
```

**Implementation Notes:**
- Verify user is the receiver of this connection request
- If accept:
  - Update status to 'accepted'
  - Set `responded_at` timestamp
  - Trigger notification (Phase 3 feature)
- If reject:
  - Update status to 'rejected'
  - Don't show this user again for 30 days

---

#### 4. ❌ MISSING - Get Single Connection
**Route:** `GET /api/connections/:connectionId`

**Purpose:** Fetch details of a specific connection (for chat UI, profile view)

**Response:**
```json
{
  "connection_id": "uuid",
  "status": "accepted",
  "peer": {
    "user_id": "uuid",
    "display_name": "Alice",
    "bio": "...",
    "skills": [...],
    "experience_level": "3-5 years",
    "availability": ["weekends", "evenings"]
  },
  "match_details": {
    "score": 85.5,
    "factors": { /* scoring breakdown */ }
  },
  "connected_at": "2025-12-20T10:00:00Z"
}
```

---

### Implementation Checklist

**Files to Create:**
- [ ] `src/services/connections/index.ts` - Connection CRUD logic (NEW)
- [ ] `src/routes/connections.ts` - Connection endpoints (NEW)

**Files to Modify:**
- [ ] `src/services/feedback/index.ts` - Add mutual connection detection
- [ ] `src/routes/matching.ts` - Filter out disliked users from matches
- [ ] `src/server.ts` - Register connections routes

**Service Methods:**
```typescript
// src/services/connections/index.ts

export async function createConnection(
  senderId: string,
  receiverId: string,
  matchScore: number,
  connectionType: string = 'general'
): Promise<Connection>;

export async function respondToConnection(
  connectionId: string,
  userId: string,
  action: 'accept' | 'reject'
): Promise<Connection>;

export async function getConnections(
  userId: string,
  filters: { status?: string; type?: string }
): Promise<ConnectionList>;

export async function checkMutualLike(
  userId: string,
  c✅ Feedback endpoint exists at `/api/feedback/matches/:candidateId/feedback`
   - ❌ Need to add mutual connection detection
   - ❌ Need to create peer_connections records

2. Update `src/routes/matching.ts`:
   - ❌ Add `previous_action` field to match results (like/dislike/skip/null)
   - ❌ Filter out users with previous `dislike` action
   - ❌ Show "skip" candidates after 7 days

3. Register connectionssrc/routes/matching.ts`:
   - Add `previous_action` field to match results (like/dislike/skip/null)
   - Filter out users with previous `dislike` action
   - Show "skip" candidates after 7 days
✅ MOSTLY COMPLETE - Profile CRUD Endpoints

### Status: Profile routes EXIST at `src/routes/profile.ts`

#### 1. ✅ IMPLEMENTED - Update Profile
**Route:** `PATCH /profile` (implemented at line 26)

## ⚠️ IMPORTANT - Profile CRUD Endpoints

##Implemented Request Body:**
```json
{
  "display_name": "Alice Developer",
  "bio": "Full-stack developer",
  "experience_level": "3-5years",
  "is_searchable": true,
  "is_active": true,
  "learning_goals": [...],
  "preferences": {...}
}
```

**Implementation Notes:**
- ✅ Triggers async profile embedding regeneration
- ✅ Invalidates Qdrant payload for is_searchable/is_active changes
- ✅ Validates with Zod schema (`src/schemas/profile.ts`)
- ✅ Service: `src/services/profile/index.ts::updateUserProfile()`

---

#### 2. ✅ IMPLEMENTED - Get User Profile
**Route:** `GET /profile` (implemented at line 17)

**Implemented Response:**
Returns complete profile with skills, work_experience, projects, education, learning_goals, preferences

**Service:** `src/services/profile/index.ts::getUserProfile()`

---

#### 3. ✅ IMPLEMENTED - Get/Update Preferences
**Routes:** 
- `GET /profile/preferences` (line 51)
- `PATCH /profile/preferences` (line 58)

**Service:** `src/services/profile/index.ts::getPeerPreferences()`, `updatePeerPreferences()`

---

#### 4. ✅ IMPLEMENTED - Get/Update Skills
**Routes:**
- `GET /profile/skills` (line 73)
- `PATCH /profile/skills` (line 106)

**Purpose:** Manage skill proficiency levels

---

#### 5. ❌ MISSING - Get Public Profile (Another User)
**Route:** `GET ed fields
- Trigger embedding regeneration if skills/goals change
- Return updated profile

---

#### 4. Get Public Profile (Another User)
**Route:** `GET /api/profile/:userId`

**Purpose:** View another user's public profile (for match details, connection view)

**Response:** Same as GET /api/profile but filtered for public fields only

**Implementation Notes:**
- Hide sensitive data (email, phone, is_searchable status)
- Show only if user is in requester's matches OR already connected
- Cache with 15-min TTL

---

### Verification Steps

Run these commands to check if routes exist:

```bash
# Check if profile routes exist
grep -r "app.get('/profile" src/routes/
grep -r "app.post('/profile" src/routes/
grep -r "app.patch('/profile" src/routes/

# Check if profile service exists
ls -la src/services/profile/

# Check registered routes in server.ts
grep "profileRoutes" src/server.ts
```

**If routes exist:** ✅ Update this document with confirmation  
**If routes missing:** ❌ Add to implementation checklist below

**Status:** NOT IMPLEMENTED - Need to create this endpoint
**Response:**
```json
{
  "completion_percentage": 65,
  "missing_fields": [
    "bio",
    "projects",
    "learning_goals"
  ]
}
```

---

## 📋 Implementation Priority Order

### MUST COMPLETE (Before Frontend MVP)

**Day 1: Connection Management (4-6 hours)**
1. Create `src/services/connections/index.ts`
2. Create `src/routes/connections.ts`
3. Implement POST /api/matches/:candidateId/swipe
4. Implement GET /api/connections
5. Implement POST /api/connections/:id/respond
6. Test with 2 test users (mutual like flow)

**Day 2: Profile CRUD (2-3 hours)**
1. Ve6ify existing profile routes OR create if missing
2. Ensure POST, GET, PATCH /api/profile all work
3. Add GET /api/profile/:userId for public profiles
4. Test profile update → embedding regeneration flow

### SHOULD COMPLETE (Before Beta Launch)

**Week 1:**
- [ ] Add connection request notifications (basic version)
**Note:** This can be done via PATCH /profile with `{ "is_searchable": false }`

#### 7Add connection search/filter

### CAN DEFER (Phase 3)

- Pro8ile deactivation/deletion
- Profile completion progress tracking
- Connection messaging (separate Phase 3 feature)

---

## 🧪 Testing Checklist

### Swipe Flow Test
```bash
# User A (Alice) views matches
GET /api/matches
# Response: [{ user_id: "bob-id", match_score: 85, ... }]

# Alice likes Bob
POST /api/matches/bob-id/swipe
{ "action": "like", "match_score": 85 }
# Response: { connection_status: "pending" }

# Bob views matches (should see Alice)
GET /api/matches
# Response: [{ user_id: "alice-id", match_score: 82, ... }]

# Bob likes Alice back
POST /api/matches/alice-id/swipe
{ "action": "like", "match_score": 82 }
# Response: { connection_status: "matched" } ← MUTUAL CONNECTION

# B✅ Feedback endpoint exists - Enhance with connection logic
2. Modify `src/services/feedback/index.ts` - Add mutual connection detection
3. Create `src/services/connections/index.ts` - Connection CRUD
4. Create `src/routes/connections.ts` - GET /api/connections, POST /api/connections/:id/respond
5. Update `src/routes/matching.ts` - Filter disliked users
6. Test with 2 test users (mutual like flow)

**Day 2: Public Profile & Match Filtering (2-3 hours)**
1. ✅ Profile CRUD routes confirmed working
2. Add GET /profile/:userId for public profile view
3. Add previous_action field to match results
4. Filter disliked users from match results
5. Test profile viewing and match filtering
PATCH /api/profile
{ "bio": "Updated bio text" }
# Response: { success: true, profile: { bio: "Updated bio text" } }

# Verify embedding regenerated (check logs)
# Should see: "Profile embedding regenerated for user alice-id"

# Verify match cache invalidated
GET /api/matches
# Should return fresh results (not cached from before update)
```

---

## 📊 Success Criteria

**Connection Management:**
- ✅ Swipe action records in <100ms
- ✅ Mutual connection detected immediately
- ✅ GET /connections returns results in <500ms
- ✅ Npeer/matches
# Response: [{ user_id: "bob-id", match_score: 85, ... }]

# Alice likes Bob
POST /api/feedback/matches/bob-id/feedback
{ "feedbackType": "like", "matchScore": 85, "scoringFactors": {...} }
# Current Response: { message: "Feedback recorded" }
# NEEDED Response: { message: "...", connection_status: "pending" }

# Bob views matches (should see Alice)
GET /peer/matches
# Response: [{ user_id: "alice-id", match_score: 82, ... }]

# Bob likes Alice back
POST /api/feedback/matches/alice-id/feedback
{ "feedbackType": "like", "matchScore": 82, "scoringFactors": {...} }
# NEEDED Response: { connection_status: "matched" } ← MUTUAL CONNECTION

# Both users check connections
GET /api/connections?status=accepted
# NEEDED
1. **Database Table Verification:**
   - Run this first: `SELECT * FROM peer_connections LIMIT 1;`
   - If table doesn't exist, use schema from old Express code or create new

2. **profile
# ✅ WORKS: Returns complete profile with all related data

# Update bio
PATCH /profile
{ "bio": "Updated bio text" }
# ✅ WORKS: Updates profile and triggers async embedding regeneration

# Get public profile (MISSING)
GET /profile/bob-id
# ❌ NEEDED: Returns public view of another user's profile

# Verify embedding regenerated (check logs)
# ✅ WORKS: Logs show "Profile embedding regenerated"

# Verify match cache invalidated
GET /peer/matches
# ✅ WEnhance recordFeedback() in src/services/feedback/index.ts:**
   ```typescript
   export async function recordFeedback(...) {
     // Existing: Store in match_feedback table
     await supabase.from('match_feedback').upsert(...);
     
     // NEW: If feedbackType is 'like' or 'connect', handle connections
     if (feedbackType === 'like' || feedbackType === 'connect') {
       // Check if candidate already liked this user
## Summary of Verification Results

### ✅ IMPLEMENTED (Working)
- Feedback/swipe recording: `POST /api/feedback/matches/:candidateId/feedback`
- Profile CRUD: `GET/PATCH /profile`, `GET/PATCH /profile/preferences`, `GET/PATCH /profile/skills`
- Match pagination: `GET /peer/matches?page=1&limit=20`
- Multi-factor scoring with preference compatibility
- Profile embedding regeneration (async)

### ❌ MISSING (Critical)
1. Connection management endpoints (list, respond)
2. Mutual connection detection logic
3. Public profile view (`GET /profile/:userId`)
4. Match filtering based on previous feedback (disliked users still appear)
5. Previous action field in match results

### ⚠️ NEEDS ENHANCEMENT
1. Feedback service needs connection creation logic
2. Matching route needs feedback-based filtering
3. Response structure needs connection_status field

---

**Status:** 🟡 PARTIALLY BLOCKING - Core swipe mechanic exists but connection flow incomplete  
**Estimated Effort:** 1 day (6 hours total) - Less than originally estimated since feedback exists  
**Owner:** Backend team (current session)  
**Next Action:** Enhance feedback service with connection logic, then add connections routes
         return { connection_status: 'matched' };
       } else {
         // Create pending connection request
         await createConnectionRequest(userId, candidateId, matchScore);
         return { connection_status: 'pending' };
       }
     }
     
     return { connection_ Status:**
   - ✅ Feedback endpoint exists for card swipe UI (needs enhancement for connection status)
   - ❌ Connections list endpoint needed for "My Connections" page
   - ✅ Profile endpoints exist for settings page (except public view)
   - ❌ Public profile endpoint
**Status:** 🔴 BLOCKING - Frontend cannot implement core flows without these endpoints  
**Estimated Effort:** 1-2 days (6-9 hours total)  
**Owner:** Backend team (current session)  
**Next Action:** Implement connection management first (highest priority)
Existing Code to Leverage:**
   - ✅ Feedback endpoint at `/api/feedback/matches/:candidateId/feedback` already records actions
   - ✅ Service at `src/services/feedback/index.ts` handles storage
   - ⚠️ Need to enhance with connection creation logic