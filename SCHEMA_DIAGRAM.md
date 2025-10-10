# Database Schema Diagram

## Entity Relationship Overview

```
┌─────────────────────┐
│   auth.users        │ (Supabase Auth - Built-in)
│   ─────────────     │
│   • id (PK)         │
│   • email           │
│   • created_at      │
└──────────┬──────────┘
           │
           │ (All tables reference userid)
           │
     ┌─────┴─────────────────────────────────────────────┐
     │                                                     │
     ▼                                                     ▼
┌─────────────────────┐                    ┌───────────────────────┐
│  user_profiles      │                    │  technical_skills     │
│  ─────────────      │                    │  ────────────────     │
│  • id (PK)          │                    │  • id (PK)            │
│  • userid (FK) ─────┼────────────┐       │  • userid (FK)        │
│  • name             │            │       │  • category           │
│  • email            │            │       │  • skill_name         │
│  • strengths[]      │            │       │  • skill_level        │
│  • created_at       │            │       │  • created_at         │
│  • updated_at       │            │       │  • updated_at         │
└─────────────────────┘            │       └───────────────────────┘
                                   │
     ┌─────────────────────────────┼─────────────────────────────────┐
     ▼                             ▼                                 ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌───────────────────────┐
│  work_experience    │   │     projects        │   │     education         │
│  ───────────────    │   │     ────────        │   │     ─────────         │
│  • id (PK)          │   │  • id (PK)          │   │  • id (PK)            │
│  • userid (FK)      │   │  • userid (FK)      │   │  • userid (FK)        │
│  • title            │   │  • name             │   │  • degree             │
│  • company          │   │  • description      │   │  • institution        │
│  • duration         │   │  • technologies[]   │   │  • year               │
│  • description      │   │  • link             │   │  • field_of_study     │
│  • technologies[]   │   │  • display_order    │   │  • display_order      │
│  • start_date       │   │  • created_at       │   │  • created_at         │
│  • end_date         │   │  • updated_at       │   │  • updated_at         │
│  • is_current       │   └─────────────────────┘   └───────────────────────┘
│  • display_order    │
│  • created_at       │
│  • updated_at       │
└─────────────────────┘

     ┌─────────────────────────────┼─────────────────────────────────┐
     ▼                             ▼                                 ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌───────────────────────┐
│  learning_goals     │   │     resumes         │   │  leetcode_profiles    │
│  ──────────────     │   │     ───────         │   │  ─────────────────    │
│  • id (PK)          │   │  • id (PK)          │   │  • id (PK)            │
│  • userid (FK)      │   │  • userid (FK) UNIQUE│   │  • userid (FK) UNIQUE│
│  • goal             │   │  • resume_text (JSON)│   │  • username           │
│  • original_goal    │   │  • ats_score        │   │  • total_solved       │
│  • status           │   │  • file_name        │   │  • easy_solved        │
│  • created_at       │   │  • file_path        │   │  • medium_solved      │
│  • updated_at       │   │  • created_at       │   │  • hard_solved        │
└─────────────────────┘   │  • updated_at       │   │  • ranking            │
                          └─────────────────────┘   │  • acceptance_rate    │
                                                    │  • profile_data (JSON)│
                                                    │  • last_synced_at     │
                                                    │  • created_at         │
                                                    │  • updated_at         │
                                                    └───────────────────────┘

     ┌─────────────────────────────┼─────────────────────────────────┐
     ▼                             ▼
┌─────────────────────┐   ┌──────────────────────────┐
│   ats_history       │   │  skill_gap_analysis      │
│   ────────────      │   │  ──────────────────      │
│  • id (PK)          │   │  • id (PK)               │
│  • userid (FK)      │   │  • userid (FK)           │
│  • ats_score        │   │  • goal_category         │
│  • breakdown (JSON) │   │  • strengths[]           │
│  • strengths[]      │   │  • missing_skills[]      │
│  • improvements[]   │   │  • skills_to_improve[]   │
│  • created_at       │   │  • learning_path (JSON)  │
└─────────────────────┘   │  • next_steps[]          │
                          │  • created_at            │
                          └──────────────────────────┘
```

## Table Purposes

### Core Profile Data
- **user_profiles**: Basic user information (name, email, strengths)
- **technical_skills**: All technical skills organized by category
- **work_experience**: Complete work history
- **projects**: Portfolio projects
- **education**: Educational background

### Goals & Learning
- **learning_goals**: User's learning objectives with status tracking
- **skill_gap_analysis**: AI-generated skill gap analyses (cached)

### Documents & External Data
- **resumes**: Uploaded resume data and ATS scores
- **leetcode_profiles**: LeetCode integration data

### Historical Tracking
- **ats_history**: Track ATS score changes over time

## Key Relationships

1. **One-to-One** (UNIQUE constraint on userid):
   - user → user_profiles
   - user → resumes
   - user → leetcode_profiles

2. **One-to-Many**:
   - user → technical_skills (many skills per user)
   - user → work_experience (multiple jobs per user)
   - user → projects (multiple projects per user)
   - user → education (multiple degrees per user)
   - user → learning_goals (multiple goals per user)
   - user → ats_history (historical tracking)
   - user → skill_gap_analysis (historical analyses)

## Data Flow

```
1. Resume Upload Flow:
   User uploads PDF
   → PDF parsed
   → OpenAI analyzes
   → Store in: resumes, user_profiles, technical_skills, work_experience, projects, education
   → Calculate ATS score
   → Store in: ats_history

2. Goal Setting Flow:
   User sets goal
   → OpenAI refines goal
   → Store in: learning_goals
   → Analyze skill gaps
   → Store in: skill_gap_analysis

3. LeetCode Integration:
   User connects LeetCode
   → Fetch LeetCode stats
   → Store in: leetcode_profiles
   → Update periodically

4. Dashboard Display:
   Frontend requests data
   → GET /user-data/profile
   → Fetches from all tables
   → Returns complete profile
```

## Security

**Row Level Security (RLS)** enabled on all tables:
- Users can only SELECT/INSERT/UPDATE/DELETE their own data
- Enforced by Supabase: `auth.uid() = userid`
- No user can access another user's data

## Indexes

Performance indexes on:
- `technical_skills(userid, category)` - Fast skill lookups
- `work_experience(userid, start_date)` - Ordered experience
- `projects(userid)` - Fast project fetching
- `education(userid)` - Fast education fetching
- `learning_goals(userid, status)` - Active goals only
- `ats_history(userid, created_at)` - Chronological history
- `skill_gap_analysis(userid, created_at)` - Latest analysis

## Data Types

- **Arrays**: `TEXT[]` for lists (strengths, technologies, skills)
- **JSON**: `JSONB` for complex nested data (learning paths, breakdowns)
- **Enums**: `CHECK` constraints for status fields
- **Timestamps**: `TIMESTAMPTZ` with auto-update triggers
- **Numeric**: `NUMERIC(5,2)` for scores (e.g., 85.50)

## Migration from localStorage

| localStorage Key | New Table(s) |
|-----------------|--------------|
| `profile-data` | `user_profiles`, `technical_skills`, `work_experience`, `projects`, `education` |
| `user-skills` | `technical_skills` |
| `leetcode-profile` | `leetcode_profiles` |
| `user-intent` | `learning_goals` |
| `extracted-skills` | `technical_skills` |
| (none) | `ats_history` (NEW - historical tracking) |
| (none) | `skill_gap_analysis` (NEW - cached analyses) |
