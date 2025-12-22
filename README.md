# SkillMap Engine API

Production refactor (Phase 1 implemented): deterministic resume parsing, vector-based skill normalization, multi-vector profile embeddings, and fast peer matching with caching.

## Tech Stack

- **API**: TypeScript + Hono (Node)
- **Auth + DB**: Supabase (Postgres + JWT)
- **Vector DB**: Qdrant Cloud
- **Cache**: Upstash Redis
- **LLM**: OpenAI (`gpt-4o-mini` structured extraction, `text-embedding-3-small` embeddings)
- **Testing**: Vitest
- **Logging**: Pino

## Repo Layout (Current)

High-level overview (see `src/` for the real implementation):

```
src/
  index.ts              # Entry point (starts the server)
  server.ts             # Hono app (routes/middleware)
  routes/               # HTTP routes
  services/             # Domain services (resume, taxonomy, profile, matching)
  lib/                  # Clients (Supabase, Qdrant, OpenAI, Redis)
  schemas/              # Zod schemas
  data/                 # Curated core skills
  middleware/           # Auth + error handling
  utils/                # Logger + errors
scripts/                # SQL + seed/maintenance scripts
```

## Quick Start

### 1) Install

```bash
npm install
```

### 2) Configure environment

Create a `.env` file (use `.env.example` as your source of truth). Required variables are:

```bash
# SERVER
NODE_ENV=development
PORT=5005
CORS_ORIGIN=http://localhost:3000

# OPENAI
OPENAI_API_KEY=...
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_HIGH_QUALITY_MODEL=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# QDRANT
QDRANT_URL=...
QDRANT_API_KEY=...

# SUPABASE
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# UPSTASH REDIS
REDIS_URL=...
REDIS_TOKEN=...
```

### 3) Ensure database schema

Use the SQL scripts in `scripts/` (Supabase SQL editor):

- `scripts/create-schema.sql`
- `scripts/enable-rls.sql` / `scripts/disable-rls.sql` (as needed)

### 4) Seed skill taxonomy

```bash
npm run seed-taxonomy
```

### 5) Run dev server

```bash
npm run dev
```

Health check:

```http
GET /health
```

## API Endpoints (Phase 1)

All endpoints require `Authorization: Bearer <supabase_jwt>` unless stated otherwise.

### Health

```http
GET /health
```

### Resume

```http
POST /api/resume
Content-Type: multipart/form-data
Authorization: Bearer <token>

# Body: PDF file
```

What it does:

- Extracts text from PDF (`pdf-parse`)
- Deterministic structured extraction (Instructor + Zod, `temperature=0`, `seed=42`)
- Two-pass skill extraction (as-is) → vector normalization via Qdrant
- Writes resume + normalized entities to Supabase
- Updates profile embeddings asynchronously
- Caches by resume content hash (SHA-256)

### Profile

```http
GET /api/profile
PATCH /api/profile
PATCH /api/profile/preferences
Authorization: Bearer <token>
```

### Matching

```http
GET /api/matches?page=1&limit=20
Authorization: Bearer <token>
```

Notes:

- Qdrant search uses the user's `weighted_avg` vector
- Multi-factor scoring includes skill value weights and preference compatibility
- Results are cached (15 minutes) and paginated from cached scored candidates

### Test Routes

```http
GET /api/test
```

## Scripts

Common scripts:

- `npm run dev` (TypeScript watch mode)
- `npm run build` / `npm run start`
- `npm test` / `npm run test:ui`
- `npm run seed-taxonomy`
- `npm run clear-taxonomy`

Useful one-offs:

- `src/scripts/seed-test-users.ts` (creates test users)
- `src/scripts/update-matching-preferences.ts` (sets mentor/peer/mentee/balanced)

## Caching (Phase 1)

Cache keys and TTLs are managed in `src/lib/cache/redis.ts`. Current high-level TTLs:

- Resume parsing: 30 days (by content hash)
- Skill normalization: 7 days
- Match candidates: 15 minutes
- Profile: 15 minutes

## Docs

- `REFACTOR_MASTER_PLAN.md` (architecture plan)
- `DOCS/PHASE_1_IMPLEMENTATION_SUMMARY.md` (what Phase 1 actually implements)

## Error Handling

Errors are normalized via custom error classes in `src/utils/errors.ts` and returned as JSON from the global error handler.
