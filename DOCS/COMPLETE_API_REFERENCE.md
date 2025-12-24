# Complete API Reference

**Status:** ✅ Production Ready  
**Last Updated:** December 25, 2025  
**Base URL:** `http://localhost:5005/api`

---

## Overview

**Key Features:**
- ✅ Resume parsing with deterministic extraction
- ✅ Profile management with vector embeddings
- ✅ AI-powered peer matching
- ✅ Connection management (like/dislike/skip)
- ✅ Real-time messaging
- ✅ Notifications system
- ✅ Skill gap analysis
- ✅ Job market analysis
- ✅ LeetCode integration
- ✅ Skill taxonomy with normalization

---

## Authentication

All endpoints require JWT authentication via Supabase Auth.

**Header Required:**
```
Authorization: Bearer <jwt_token>
```

---

## 1. Resume Management

### POST /api/resume/upload
Upload and parse resume PDF with AI extraction.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `file` (PDF)

**Response:**
```json
{
  "resume_id": "uuid",
  "content_hash": "sha256",
  "parsed_at": "timestamp",
  "skills": [...],
  "work_experience": [...],
  "projects": [...]
}
```

**Features:**
- Deterministic extraction (temperature=0, seed=42)
- Two-pass skill normalization
- SHA-256 content deduplication
- 30-day cache

### GET /api/resume
Retrieve user's latest parsed resume.

**Response:** Same as upload response

---

## 2. Profile Management

### GET /api/profile
Get current user's complete profile.

**Response:**
```json
{
  "user_id": "uuid",
  "display_name": "string",
  "bio": "string",
  "email": "string",
  "experience_level": "entry|1-3years|3-5years|5+years",
  "skills": [...],
  "work_experience": [...],
  "projects": [...],
  "learning_goals": [...],
  "preferences": {...}
}
```

### PATCH /api/profile
Update profile fields (triggers async embedding regeneration).

**Request:**
```json
{
  "display_name": "string",
  "bio": "string",
  "experience_level": "string"
}
```

### GET /api/profile/preferences
Get peer matching preferences.

**Response:**
```json
{
  "matching_preference": "mentor|peer|mentee|balanced",
  "available_days": ["Monday", "Wednesday"],
  "preferred_time_slots": ["evening"],
  "communication_preferences": ["video_call", "chat"],
  "preferred_collaboration_types": ["pair_programming"]
}
```

### PATCH /api/profile/preferences
Update peer preferences.

### GET /api/profile/skills
Get user's skills with taxonomy details.

**Response:**
```json
{
  "skills": [
    {
      "skill_id": "uuid",
      "canonical_name": "React",
      "category": "Frontend",
      "skill_level": "advanced",
      "years_experience": 3
    }
  ]
}
```

### PATCH /api/profile/skills
Bulk update user skills.

**Request:**
```json
{
  "skills": [
    {
      "skill_id": "uuid",
      "skill_level": "advanced",
      "years_experience": 3
    }
  ]
}
```

### GET /api/profile/:userId
Get public profile of another user (cached 15 min).

**Response:** Same as GET /api/profile but excludes sensitive fields (email, phone, is_searchable, is_active)

---

## 3. Skills Taxonomy

### GET /api/skills/search
Search skills with vector similarity.

**Query Params:**
- `query` (string, required): Search term
- `limit` (number, optional): Max results (default: 10)

**Response:**
```json
{
  "skills": [
    {
      "id": "uuid",
      "canonical_name": "React",
      "category": "Frontend",
      "aliases": ["reactjs", "react.js"],
      "score": 0.95
    }
  ]
}
```

### GET /api/skills
List all skills in taxonomy.

**Query Params:**
- `category` (string, optional): Filter by category
- `limit` (number, optional): Max results (default: 100)

---

## 4. Peer Matching

### GET /api/peer/matches
Get AI-powered peer match candidates.

**Query Params:**
- `limit` (number, optional): Max results (default: 10)

**Response:**
```json
{
  "matches": [
    {
      "candidate_id": "uuid",
      "display_name": "Alice Chen",
      "bio": "string",
      "experience_level": "3-5years",
      "match_score": 0.87,
      "shared_skills": ["React", "TypeScript"],
      "complementary_skills": ["GraphQL"],
      "goal_alignment": 0.92,
      "availability_overlap": true,
      "skills": [...]
    }
  ],
  "cached": false
}
```

**Features:**
- Multi-vector strategy (skills_only, with_goals, weighted_avg)
- Multi-factor scoring (shared/complementary skills, goal alignment, experience, availability, domain)
- Preference-aware weights (mentor/peer/mentee/balanced)
- 15-min cache

### POST /api/peer/matches/:candidateId/action
Swipe action on match candidate.

**Request:**
```json
{
  "action": "like|dislike|skip",
  "connection_type": "mentor|peer|mentee",
  "match_score": 0.87
}
```

**Actions:**
- **like**: Creates connection request + records feedback
- **dislike**: Records feedback (permanent filter)
- **skip**: Records feedback (7-day filter)

**Response:**
```json
{
  "success": true,
  "connection_id": "uuid",
  "status": "pending"
}
```

---

## 5. Connections Management

### GET /api/connections
List user's connections with filters.

**Query Params:**
- `status` (string, optional): `pending|accepted|rejected`
- `type` (string, optional): `sent|received`

**Response:**
```json
{
  "connections": [
    {
      "connection_id": "uuid",
      "sender_id": "uuid",
      "receiver_id": "uuid",
      "status": "accepted",
      "connection_type": "peer",
      "match_score": 0.87,
      "peer": {
        "user_id": "uuid",
        "display_name": "Bob Martinez",
        "avatar_url": "url"
      },
      "created_at": "timestamp",
      "responded_at": "timestamp"
    }
  ]
}
```

### GET /api/connections/stats
Get connection statistics.

**Response:**
```json
{
  "total": 15,
  "pending_sent": 3,
  "pending_received": 2,
  "accepted": 8,
  "rejected": 2
}
```

### GET /api/connections/:connectionId
Get single connection details.

### POST /api/connections/:connectionId/respond
Accept or reject connection request.

**Request:**
```json
{
  "action": "accept|reject"
}
```

### DELETE /api/connections/:connectionId
Delete/cancel connection.

---

## 6. Messaging

### POST /api/connections/:connectionId/messages
Send message in connection.

**Request:**
```json
{
  "content": "Hey, want to pair on that React project?"
}
```

**Response:**
```json
{
  "message_id": "uuid",
  "sender_id": "uuid",
  "content": "string",
  "sent_at": "timestamp"
}
```

### GET /api/connections/:connectionId/messages
Get message history with pagination.

**Query Params:**
- `limit` (number, optional): Default 50
- `before` (string, optional): Cursor for pagination

**Response:**
```json
{
  "messages": [
    {
      "message_id": "uuid",
      "sender_id": "uuid",
      "content": "string",
      "sent_at": "timestamp",
      "read_at": "timestamp",
      "sender": {
        "user_id": "uuid",
        "display_name": "string",
        "avatar_url": "string"
      }
    }
  ],
  "next_cursor": "timestamp"
}
```

**Features:**
- Auto-marks messages as read when fetched
- Cursor-based pagination

### PATCH /api/connections/:connectionId/messages/read
Mark all messages in connection as read.

### GET /api/messages/unread
Get unread message count across all connections.

**Response:**
```json
{
  "unread_count": 5
}
```

---

## 7. Notifications

### GET /api/notifications
Get user notifications.

**Query Params:**
- `unread_only` (boolean, optional): Default false
- `limit` (number, optional): Default 50

**Response:**
```json
{
  "notifications": [
    {
      "notification_id": "uuid",
      "type": "connection_request|connection_accepted|new_message",
      "title": "New Connection Request",
      "message": "Alice Chen wants to connect as peers",
      "related_user": {
        "user_id": "uuid",
        "display_name": "Alice Chen",
        "avatar_url": "url"
      },
      "related_connection_id": "uuid",
      "read_at": null,
      "created_at": "timestamp"
    }
  ]
}
```

### GET /api/notifications/unread/count
Get unread notification count.

**Response:**
```json
{
  "unread_count": 3
}
```

### PATCH /api/notifications/:notificationId/read
Mark single notification as read.

### PATCH /api/notifications/read-all
Mark all notifications as read.

### DELETE /api/notifications/:notificationId
Delete notification.

---

## 8. Skill Gap Analysis

### POST /api/gaps/analyze
Analyze skill gaps for a learning goal.

**Request:**
```json
{
  "goal_id": "uuid"
}
```

**Response:**
```json
{
  "goal_id": "uuid",
  "analysis": {
    "missing_skills": ["GraphQL", "Apollo Client"],
    "weak_skills": ["TypeScript"],
    "strong_skills": ["React", "JavaScript"],
    "recommended_learning_path": [...]
  },
  "analyzed_at": "timestamp"
}
```

### GET /api/gaps/:goalId/path
Get learning path for goal.

**Response:**
```json
{
  "goal": {...},
  "learning_path": [
    {
      "skill": "GraphQL",
      "priority": 1,
      "estimated_time": "2-3 months",
      "resources": [...]
    }
  ]
}
```

### POST /api/gaps/:goalId/regenerate
Regenerate skill gap analysis.

---

## 9. Job Market Analysis

### POST /api/jobs/analyze
Analyze job market for learning goal.

**Request:**
```json
{
  "goal_id": "uuid"
}
```

**Response:**
```json
{
  "goal_id": "uuid",
  "market_analysis": {
    "in_demand_skills": ["React", "TypeScript"],
    "emerging_skills": ["Next.js 14"],
    "salary_range": "$80k-$120k",
    "job_count": 1247
  }
}
```

### PUT /api/jobs/analyze
Update job market analysis for goal.

### DELETE /api/jobs/:goalId
Delete job market analysis.

---

## 10. LeetCode Integration

### GET /api/leetcode/profile
Get user's LeetCode profile data.

**Query Params:**
- `username` (string, required): LeetCode username

**Response:**
```json
{
  "username": "alice_chen",
  "profile": {
    "ranking": 12543,
    "problems_solved": 287,
    "acceptance_rate": 0.67,
    "easy": 124,
    "medium": 142,
    "hard": 21
  },
  "cached": true
}
```

### POST /api/leetcode/sync
Sync LeetCode data to profile.

**Request:**
```json
{
  "username": "alice_chen"
}
```

### POST /api/leetcode/analyze
Analyze coding patterns and suggest improvements.

**Request:**
```json
{
  "username": "alice_chen"
}
```

**Response:**
```json
{
  "strengths": ["Arrays", "Two Pointers"],
  "weaknesses": ["Dynamic Programming", "Graphs"],
  "recommended_problems": [...],
  "skill_progress": {...}
}
```

### GET /api/leetcode/study-partners
Find peers with similar LeetCode progress.

**Query Params:**
- `username` (string, required)
- `limit` (number, optional): Default 10

---

## 11. Feedback & Analytics

### POST /api/feedback/matches/:candidateId/feedback
Record feedback on match candidate.

**Request:**
```json
{
  "action": "like|dislike|skip",
  "match_score": 0.87
}
```

### GET /api/feedback/analytics
Get feedback analytics for current user.

**Response:**
```json
{
  "total_actions": 45,
  "likes": 12,
  "dislikes": 8,
  "skips": 25,
  "conversion_rate": 0.27
}
```

---

## 12. Testing (Development Only)

### GET /api/test/supabase
Test Supabase connection.

### GET /api/test/qdrant
Test Qdrant vector DB connection.

### GET /api/test/redis
Test Redis cache connection.

---

## Database Architecture

**Supabase (PostgreSQL):**
- auth.users (Supabase Auth)
- user_profiles
- user_skills
- skills_taxonomy
- work_experience, projects, learning_goals
- peer_preferences, peer_connections
- messages, notifications
- match_feedback
- skill_gaps, job_market_insights

**Qdrant (Vector DB):**
- user_profiles (multi-vector: skills_only, with_goals, weighted_avg)
- skill_taxonomy (embeddings + aliases)

**Redis (Upstash):**
- Resume parsing (30d TTL)
- Match candidates (15m TTL)
- User profiles (15m TTL)
- Skills (7d TTL)
- LeetCode data (24h TTL)

---

## Key Technical Patterns

### 1. Query Pattern (No FK Hints)
All queries fetch base table first, then related data separately:
```typescript
// Base query
const { data } = await supabase.from('table').select('*').eq(...)

// Extract IDs
const userIds = [...new Set(data?.map(item => item.user_id) || [])];

// Fetch profiles
const { data: profiles } = await supabase
  .from('user_profiles')
  .select('user_id, display_name, avatar_url')
  .in('user_id', userIds);

// Map in-memory
const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
return data.map(item => ({
  ...item,
  user: profileMap.get(item.user_id) || { user_id: item.user_id, display_name: 'Unknown' }
}));
```

### 2. Caching Pattern
```typescript
// Check cache
const cached = await getJSON<T>(cacheKey);
if (cached) return cached;

// Compute
const result = await expensiveOperation();

// Cache result
await setJSON(cacheKey, result, CacheTTL.PROFILE);
return result;
```

### 3. Deterministic AI Extraction
```typescript
const extraction = await instructor.chat.completions.create({
  model: MODELS.STRUCTURED_OUTPUT,
  temperature: 0,      // Critical for determinism
  seed: 42,
  response_model: { schema: ZodSchema, name: 'SchemaName' },
  max_retries: 3,
});
```

### 4. Error Handling
```typescript
import { ValidationError, NotFoundError, AuthenticationError } from '../utils/errors.js';

// In routes:
if (!data) throw new NotFoundError('Resource not found');
if (!valid) throw new ValidationError('Invalid input');

// Global error handler catches and formats
```

---

## Environment Variables Required

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Qdrant
QDRANT_URL=https://xxx.qdrant.io
QDRANT_API_KEY=xxx

# Upstash Redis
REDIS_URL=https://xxx.upstash.io
REDIS_TOKEN=xxx

# OpenAI
OPENAI_API_KEY=sk-xxx

# Server
PORT=5005
NODE_ENV=development
```

---

## Development Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Seed skill taxonomy (required first time)
npm run seed-taxonomy

# Seed test users
npx tsx src/scripts/seed-test-users.ts

# Get test token
node scripts/get-test-token.js

# Run tests
npm test
npm run test:ui
```

---

## Postman Collection

Import `postman/SkillMap-Phase1.postman_collection.json` for complete API testing suite.

**Environment Variables:**
- `base_url`: http://localhost:5005
- `supabase_url`: Your Supabase URL
- `supabase_anon_key`: Your anon key
- `jwt_token`: Auto-populated on login
- `user_id`: Auto-populated on login

---

## Production Readiness Checklist

- ✅ All endpoints use `/api` prefix
- ✅ JWT authentication on all protected routes
- ✅ Foreign key query pattern (no FK hints)
- ✅ Redis caching with appropriate TTLs
- ✅ Error handling with custom error classes
- ✅ Structured logging (Pino)
- ✅ Deterministic AI extraction
- ✅ Multi-vector embeddings
- ✅ Content deduplication (SHA-256)
- ✅ Async embedding updates
- ✅ Cursor-based pagination
- ✅ Health checks
- ✅ Postman collection updated

---

