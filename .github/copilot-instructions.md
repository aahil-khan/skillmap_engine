# SkillMap Engine - AI Coding Agent Instructions

## Architecture Overview
**Skill analysis and peer-learning platform** built with TypeScript + Hono (fast web framework). Production-ready Phase 1 implementation features deterministic resume parsing, vector-based skill normalization, multi-vector profile embeddings, and cached peer matching.

**Stack:** Hono (Node) + Supabase (Postgres + Auth) + Qdrant Cloud (vectors) + Upstash Redis (cache) + OpenAI (LLM/embeddings) + Vitest (testing)

### Critical Data Flow Pattern
1. **Resume upload** → PDF extraction (`pdf-parse`) → Instructor structured extraction (`temperature=0`, `seed=42`) → Two-pass skill normalization (as-is → vector similarity via Qdrant) → Supabase storage → Async profile embedding update → Redis cache by content hash (SHA-256)
2. **Profile embedding** → Multi-vector strategy: `skills_only` (skills list), `with_goals` (skills + learning goal), `weighted_avg` (composite vector for matching)
3. **Peer matching** → Qdrant vector search (user's `weighted_avg`) → Multi-factor scoring with preference compatibility (mentor/peer/mentee/balanced) → Redis cache (15min TTL) → Paginated results

## Repository Structure (Phase 1 Refactor)

```
src/
  index.ts              # Entry point
  server.ts             # Hono app (routes, middleware, health checks)
  routes/               # HTTP handlers (resume, profile, matching, test)
  services/             # Domain logic (resume/, taxonomy/, profile/, matching/)
    └── __tests__/      # Vitest unit tests per service
  lib/                  # Clients (supabase.ts, qdrant.ts, openai.ts, redis.ts)
  schemas/              # Zod validation (resume.ts, profile.ts)
  data/                 # core-skills.ts (65 curated skills with value_weight)
  middleware/           # auth.ts (Supabase JWT), errors.ts
  utils/                # logger.ts (Pino), errors.ts (custom classes)
scripts/                # SQL + TypeScript maintenance scripts
```

**Key Pattern:** Services handle domain logic and return data; routes handle HTTP. Services never reference `Context` or call response methods.

## AI Model Configuration

Models are defined in [src/lib/llm/openai.ts](src/lib/llm/openai.ts):
- **`gpt-4o-mini`**: Default for structured extraction (resume parsing, skill analysis) - used via `MODELS.STRUCTURED_OUTPUT`
- **`gpt-4o`**: High-quality chat (not yet used) - available as `MODELS.CHAT_HIGH_QUALITY`
- **`text-embedding-3-small`**: All embeddings (1536 dimensions) - used via `createEmbedding()`

**When adding AI calls:** Use `MODELS` constants. For structured outputs, use Instructor with `temperature=0` and `seed=42` for determinism (see [extractor.ts](src/services/resume/extractor.ts)).

## Determinism Pattern (Critical for Resume Parsing)

**Problem:** LLMs are non-deterministic by default (same input → different outputs).

**Solution:** Instructor + Zod + temperature control ([src/services/resume/extractor.ts](src/services/resume/extractor.ts)):

```typescript
import Instructor from '@instructor-ai/instructor';
import { ResumeExtractionSchema } from '../../schemas/resume.js';

const extraction = await instructor.chat.completions.create({
  messages: [/* ... */],
  model: MODELS.STRUCTURED_OUTPUT,
  temperature: 0,       // CRITICAL: Deterministic
  seed: 42,             // Additional determinism control
  response_model: {
    schema: ResumeExtractionSchema,
    name: 'ResumeExtraction',
  },
  max_retries: 3,
});
```

**Why two-pass skill normalization?** LLM extraction is deterministic but extracts skills "as written" (e.g., "ReactJS", "react", "React.js"). Vector similarity normalizes these to canonical forms (e.g., "React") via Qdrant search with exact alias matching ([src/services/taxonomy/normalizer.ts](src/services/taxonomy/normalizer.ts)).

## Error Handling Pattern

Custom error classes from [src/utils/errors.ts](src/utils/errors.ts) with Hono's error handler ([src/middleware/errors.ts](src/middleware/errors.ts)):

```typescript
import { ValidationError, NotFoundError, AuthenticationError } from '../utils/errors.js';

// In routes:
app.post('/endpoint', authenticate, async (c) => {
  const body = await c.req.json();
  if (!body.field) throw new ValidationError('Field required');
  // ...
});
```

**Never use `c.json({ error: '...' }, 400)`** - throw custom errors and let the error handler standardize responses.

## Logging Strategy

Use [src/utils/logger.ts](src/utils/logger.ts) (Pino) instead of `console.log`:

```typescript
import logger from '../utils/logger.js';

logger.info('Resume processing started', { userId, filename });
logger.error('OpenAI request failed', { error: error.message });
logger.debug('Embedding generated', { dimension: embedding.length }); // Only in dev
```

**Structured logging is critical** - always include contextual metadata for production debugging.

## Authentication Pattern

All protected routes use Supabase JWT validation via [src/middleware/auth.ts](src/middleware/auth.ts):

```typescript
import { authenticate } from '../middleware/auth.js';

app.post('/endpoint', authenticate, async (c) => {
  const userId = c.get('userId'); // Populated by authenticate middleware
  // ...
});
```

**Don't manually verify tokens** - use the `authenticate` middleware. It extracts `Bearer` tokens and attaches `userId` to context.

## Caching Strategy (Redis)

All cache operations via [src/lib/cache/redis.ts](src/lib/cache/redis.ts) (Upstash Redis):

```typescript
import { CacheKeys, CacheTTL, getJSON, setJSON } from '../lib/cache/redis.js';

// Check cache first
const cached = await getJSON<ResultType>(CacheKeys.matchCandidates(userId));
if (cached) return cached;

// ... compute expensive operation ...

// Cache result
await setJSON(CacheKeys.matchCandidates(userId), result, CacheTTL.MATCHES);
```

**Cache keys:** Resume (30d), Matches (15m), Skills (7d), LeetCode (24h), Profile (15m). See `CacheTTL` for all durations.

## Database Schema Conventions

**Supabase Tables** (see [scripts/create-schema.sql](scripts/create-schema.sql)):
- All tables use `uuid_generate_v4()` for primary keys
- User references: `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`
- Always include `created_at TIMESTAMPTZ DEFAULT NOW()` and `updated_at TIMESTAMPTZ DEFAULT NOW()`
- Use CHECK constraints for enums (e.g., `skill_level IN ('beginner', 'intermediate', 'advanced')`)

**Qdrant Collections:**
- **user_profiles**: Multi-vector embeddings (`skills_only`, `with_goals`, `weighted_avg`) with payload filters (user_id, is_active, skills_count)
- **skill_taxonomy**: 65 core skills with embeddings, aliases, categories, value_weight (0.7-1.5)

**Service role key pattern:** Resume processing uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS (user already validated by middleware). See [src/services/resume/index.ts](src/services/resume/index.ts) lines 14-36.

## Vector Search Pattern

When querying Qdrant, use payload filters for performance ([src/lib/vector/qdrant.ts](src/lib/vector/qdrant.ts)):

```typescript
const results = await qdrant.search(COLLECTIONS.USER_PROFILES, {
  vector: embedding,
  filter: {
    must: [
      { key: "user_id", match: { value: userId } },
      { key: "is_active", match: { value: true } }
    ],
    must_not: [
      { key: "user_id", match: { value: excludeUserId } }
    ]
  },
  limit: 100,
  with_payload: true,
});
```

See [src/services/matching/scorer.ts](src/services/matching/scorer.ts) for multi-factor scoring (shared skills, complementary skills, goal alignment, experience, availability, domain).

## Testing Pattern

Vitest tests in `__tests__/` folders per service. Run with `npm test` or `npm run test:ui`.

Key test examples:
- **Determinism:** [src/services/resume/__tests__/determinism.test.ts](src/services/resume/__tests__/determinism.test.ts) - validates identical outputs across 10 runs
- **Skill normalization:** [src/services/taxonomy/__tests__/normalizer.test.ts](src/services/taxonomy/__tests__/normalizer.test.ts) - vector similarity + exact alias matching

## Development Workflow

```bash
# Start local development (tsx with watch mode)
npm run dev

# Seed skill taxonomy (REQUIRED before first use)
npm run seed-taxonomy

# Run tests
npm test
npm run test:ui  # Interactive test UI

# Clear taxonomy (for re-seeding)
npm run clear-taxonomy
```

**Environment variables required:** `OPENAI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `REDIS_TOKEN`

## Common Patterns to Follow

1. **Content deduplication:** Always hash content (SHA-256) before processing. Check for existing records by `content_hash` (see [src/services/resume/index.ts](src/services/resume/index.ts) lines 43-69)
2. **Async profile updates:** Resume processing triggers async profile embedding update. Don't block the response waiting for embeddings.
3. **Preference-aware matching:** Scoring weights change based on user preference (mentor/peer/mentee/balanced). See [src/services/matching/scorer.ts](src/services/matching/scorer.ts) lines 14-62 for weight calculation.
4. **Curated skill taxonomy:** 65 core skills in [src/data/core-skills.ts](src/data/core-skills.ts) with metadata (category, aliases, job_demand_frequency, value_weight, commonly_paired_with)

## Current Priorities (from TODO.md)

When refactoring or optimizing:
- **LLMOps techniques:** Prompt engineering, caching, model selection strategies
- **Cost optimization:** Batch embeddings, cache frequent queries, use `gpt-4o-mini` where possible
- **Code structure:** Services are domain-separated; maintain this boundary

## Quick Reference

- **Add new endpoint:** Create route handler in `src/routes/`, import in [src/server.ts](src/server.ts), implement logic in `src/services/`
- **Add AI feature:** Use Instructor with `temperature=0` + Zod schema for determinism
- **Add vector search:** Use `COLLECTIONS` constants from [src/lib/vector/qdrant.ts](src/lib/vector/qdrant.ts), add payload filters
- **Add caching:** Use `CacheKeys` + `CacheTTL` from [src/lib/cache/redis.ts](src/lib/cache/redis.ts)
- **Debug production:** Check Pino logs with structured metadata
