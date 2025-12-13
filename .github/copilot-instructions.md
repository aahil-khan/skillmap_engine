# SkillMap Engine - AI Coding Agent Instructions

## Architecture Overview
This is a **skill analysis and peer-learning platform** that combines resume processing, vector search, LeetCode integration, and peer matching. It's an Express.js API with a hybrid storage strategy: **Qdrant for vector embeddings** (skill matching, semantic search) and **Supabase (PostgreSQL)** for relational data (user profiles, connections, resumes).

### Critical Data Flow Pattern
1. **Resume upload** → PDF parsing → OpenAI structured extraction → Supabase normalized storage → Qdrant embedding
2. **User profile creation** → Text assembly → OpenAI embeddings → Qdrant vector storage with payload metadata
3. **Skill analysis** → Vector similarity search (Qdrant) → AI-powered recommendations (OpenAI)
4. **Peer matching** → Multi-factor scoring algorithm (shared/complementary skills, goal alignment, experience, availability)

## Service Layer Architecture

All business logic lives in `/services/`. Follow this pattern when creating/modifying services:

```javascript
// Services handle ONE domain responsibility
// resumeService.js - PDF processing + OpenAI extraction
// userProfileService.js - Profile creation + embedding generation
// peerMatchingService.js - Compatibility scoring (30% shared, 25% complementary, 20% goals, 15% experience, 10% availability)
// skillGapService.js - Goal analysis + gap identification
```

**Key Pattern:** Services return structured data; routes handle HTTP concerns. Never call `res.json()` from a service.

## AI Model Configuration

See [config/ai-models.js](config/ai-models.js) for model selection strategy:
- **gpt-4o-mini**: Default for structured outputs (resume parsing, skill analysis) - 75% cheaper than GPT-4, better JSON adherence than GPT-3.5
- **gpt-4o**: High-quality operations when accuracy > cost (stored in `AI_MODELS.chatHighQuality`)
- **text-embedding-3-small**: All embeddings (1536 dimensions)

**When adding AI calls:** Use `getModelConfig(operationType)` from `ai-models.js` for consistent settings. Never hardcode model names.

## Error Handling Pattern

This codebase uses **custom error classes** from [utils/errors.js](utils/errors.js):

```javascript
import { ValidationError, NotFoundError, AuthenticationError } from '../utils/errors.js';

// In routes, wrap async handlers:
router.post('/endpoint', authenticate, asyncHandler(async (req, res) => {
  if (!req.body.field) throw new ValidationError('Field required');
  // ...
}));
```

**Never use `res.status(400).json({...})`** - throw custom errors and let [middleware/errorHandler.js](middleware/errorHandler.js) standardize responses.

## Logging Strategy

Use [utils/logger.js](utils/logger.js) instead of `console.log`:

```javascript
import logger from '../utils/logger.js';

logger.info('Resume processing started', { userId, filename, requestId: req.id });
logger.error('OpenAI request failed', { error: error.message, attempt, maxAttempts });
logger.debug('Embedding generated', { dimension: embedding.length }); // Only in dev
```

**Structured logging is critical** - always include contextual metadata (userId, requestId, timestamps) for production debugging.

## Authentication Pattern

All protected routes use Supabase JWT validation via [middleware/auth.js](middleware/auth.js):

```javascript
router.post('/endpoint', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id; // req.user populated by authenticate middleware
  // ...
}));
```

**Don't manually verify tokens** - use the `authenticate` middleware. It extracts `Bearer` tokens and attaches `req.user`.

## Database Schema Conventions

**Supabase Tables** (see [scripts/create-schema.sql](scripts/create-schema.sql), [scripts/peer-matching-schema.sql](scripts/peer-matching-schema.sql)):
- All tables use `uuid_generate_v4()` for primary keys
- User references: `userid UUID REFERENCES auth.users(id) ON DELETE CASCADE`
- Always include `created_at TIMESTAMPTZ DEFAULT NOW()` and `updated_at TIMESTAMPTZ DEFAULT NOW()`
- Use CHECK constraints for enums (e.g., `skill_level IN ('beginner', 'intermediate', 'advanced')`)

**Qdrant Collections:**
- **user_profiles**: Comprehensive profile embeddings with filterable payload (user_id, skills_count, projects_count, has_learning_goal)
- **skill_taxonomy**: Skill embeddings for semantic search
- **user_leetcode_embeddings**: LeetCode problem-solving patterns

Use [utils/vectorStore.js](utils/vectorStore.js) helpers: `ensureCollection()` automatically creates indexes for common filters.

## AI Response Validation Pattern

**Critical:** OpenAI responses MUST be validated with Zod schemas from [schemas/ai-response-schemas.js](schemas/ai-response-schemas.js):

```javascript
import { validateAIResponse, resumeAnalysisSchema, extractOpenAIContent } from '../schemas/ai-response-schemas.js';

const response = await openai.chat.completions.create({...});
const jsonText = extractOpenAIContent(response); // Safely extracts content
const validated = validateAIResponse(jsonText, resumeAnalysisSchema, 'resume analysis');
```

**Why this matters:** OpenAI sometimes returns markdown code blocks, incomplete JSON, or hallucinates fields. Validation prevents crashes.

## Vector Search Pattern

When querying Qdrant, use payload filters for performance:

```javascript
const results = await qdrant.search(COLLECTION_NAME, {
  vector: embedding,
  filter: {
    must: [
      { key: "user_id", match: { value: userId } },
      { key: "has_learning_goal", match: { value: true } }
    ]
  },
  limit: 10
});
```

See [services/peerMatchingService.js](services/peerMatchingService.js) for complex multi-factor similarity scoring examples.

## Development Workflow

```bash
# Start local development
npm run dev  # Uses nodemon for auto-reload

# Seed skill taxonomy (required for semantic skill matching)
npm run seed-taxonomy

# Docker development (includes all services)
npm run docker:dev

# Production Docker
npm run docker:prod
```

**Environment variables required:** `OPENAI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Common Patterns to Follow

1. **Retry logic for OpenAI calls:** See [services/resumeService.js](services/resumeService.js) lines 35-75 for timeout handling with exponential backoff
2. **File cleanup:** Always `fs.unlinkSync()` uploaded files after processing (see [routes/resume.js](routes/resume.js))
3. **Request tracking:** `req.id` is available on all requests via [middleware/requestLogger.js](middleware/requestLogger.js)
4. **Rate limiting:** Currently 500 req/15min (marked for production tuning - see [index.js](index.js) line 48)

## Current Priorities (from TODO.md)

When refactoring or optimizing:
- **LLMOps techniques:** Focus on prompt engineering, caching, model selection strategies
- **Cost optimization:** Use `gpt-4o-mini` where possible, batch embeddings, consider caching frequent queries
- **Code structure:** Services are domain-separated; maintain this boundary

## Quick Reference

- **Add new endpoint:** Create route in `/routes/`, use `authenticate` + `asyncHandler`, implement logic in `/services/`
- **Add AI feature:** Get model config from `ai-models.js`, validate response with Zod schema
- **Add vector search:** Use `ensureCollection()`, create payload indexes for filters
- **Debug production:** Check structured logs with `logger.*()`, use `requestId` for request tracing
