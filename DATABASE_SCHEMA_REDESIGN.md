# Database Schema Redesign

## Current State (Problems)
1. **Data scattered across localStorage**: profile-data, user-skills, leetcode-profile, etc.
2. **Inconsistent storage**: Some data in Supabase tables, some in Qdrant, some in localStorage
3. **Current Supabase tables**:
   - `resumes` - stores resume_text (JSON), goal, ats_score
   - `skills` - stores individual skills (userid, skill_name, skill_level, skill_category)
4. **Missing structured storage** for:
   - User profile (name, email, etc.)
   - Technical skills (structured with categories)
   - Work experience
   - Projects
   - Education
   - Learning goals/intent
   - LeetCode profile data

## Proposed Schema

### 1. **user_profiles** (Main profile table)
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  inferred_areas_of_strength TEXT[], -- Array of strings
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. **technical_skills** (Replaces current `skills` table)
```sql
CREATE TABLE technical_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- e.g., "Programming Languages", "Web Development"
  skill_name TEXT NOT NULL,
  skill_level TEXT NOT NULL CHECK (skill_level IN ('beginner', 'intermediate', 'advanced')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(userid, skill_name) -- Prevent duplicates
);

CREATE INDEX idx_technical_skills_userid ON technical_skills(userid);
CREATE INDEX idx_technical_skills_category ON technical_skills(userid, category);
```

### 3. **work_experience**
```sql
CREATE TABLE work_experience (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, -- e.g., "Software Engineer"
  company TEXT NOT NULL,
  duration TEXT, -- e.g., "Jan 2022 - Present" or "2 years"
  description TEXT,
  technologies TEXT[], -- Array of technology names
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_work_experience_userid ON work_experience(userid);
```

### 4. **projects**
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  technologies TEXT[], -- Array of technology names
  link TEXT, -- Project URL
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_userid ON projects(userid);
```

### 5. **education**
```sql
CREATE TABLE education (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  degree TEXT NOT NULL,
  institution TEXT NOT NULL,
  year TEXT, -- e.g., "2023" or "2020 - 2024"
  field_of_study TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_education_userid ON education(userid);
```

### 6. **learning_goals**
```sql
CREATE TABLE learning_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL, -- The refined/standalone learning goal
  original_goal TEXT, -- The original user input
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_learning_goals_userid ON learning_goals(userid, status);
```

### 7. **resumes** (Enhanced current table)
```sql
CREATE TABLE resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_text JSONB, -- Full parsed resume data
  ats_score NUMERIC(5,2), -- e.g., 85.50
  file_name TEXT,
  file_path TEXT, -- Path to original PDF file
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resumes_userid ON resumes(userid);
```

### 8. **leetcode_profiles**
```sql
CREATE TABLE leetcode_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  total_solved INTEGER DEFAULT 0,
  easy_solved INTEGER DEFAULT 0,
  medium_solved INTEGER DEFAULT 0,
  hard_solved INTEGER DEFAULT 0,
  ranking INTEGER,
  acceptance_rate NUMERIC(5,2),
  profile_data JSONB, -- Full LeetCode profile data
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leetcode_profiles_userid ON leetcode_profiles(userid);
```

### 9. **ats_history** (Track ATS score changes over time)
```sql
CREATE TABLE ats_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ats_score NUMERIC(5,2) NOT NULL,
  breakdown JSONB, -- {skills_match: 90, experience_match: 80, ...}
  strengths TEXT[],
  improvements TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ats_history_userid ON ats_history(userid, created_at DESC);
```

## New GET Endpoints Needed

### 1. **GET /user-profile** - Get complete user profile
Returns:
```json
{
  "success": true,
  "data": {
    "profile": {
      "id": "uuid",
      "userid": "uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "inferred_areas_of_strength": ["Full-stack", "AI"],
      "created_at": "...",
      "updated_at": "..."
    },
    "technical_skills": [
      {
        "category": "Programming Languages",
        "skills": [
          {"name": "Python", "level": "advanced"},
          {"name": "JavaScript", "level": "intermediate"}
        ]
      }
    ],
    "work_experience": [...],
    "projects": [...],
    "education": [...],
    "learning_goals": [...],
    "resume": {
      "ats_score": 85.5,
      "file_name": "resume.pdf"
    },
    "leetcode": {
      "username": "johndoe",
      "total_solved": 150,
      "easy_solved": 50,
      "medium_solved": 80,
      "hard_solved": 20
    }
  }
}
```

### 2. **GET /skills** - Get user's technical skills (grouped by category)
Returns structured skills data

### 3. **GET /experience** - Get work experience
Returns work experience ordered by date

### 4. **GET /projects** - Get user projects
Returns projects

### 5. **GET /education** - Get education history
Returns education records

### 6. **GET /learning-goals** - Get active learning goals
Returns learning goals

### 7. **GET /leetcode-profile** - Get LeetCode data
Returns LeetCode profile and stats

### 8. **GET /ats-history** - Get ATS score history
Returns historical ATS scores for tracking improvement

## Migration Strategy

1. **Phase 1**: Create new tables in Supabase
2. **Phase 2**: Create GET endpoints (don't touch existing POST endpoints)
3. **Phase 3**: Update frontend to fetch from API instead of localStorage
4. **Phase 4**: Gradually migrate existing data from localStorage to database
5. **Phase 5**: Remove localStorage dependencies

## Benefits

1. ✅ **Single source of truth**: All data in database
2. ✅ **Proper relationships**: Foreign keys and cascading deletes
3. ✅ **Scalability**: Can add new fields easily
4. ✅ **Data persistence**: Survives browser cache clears
5. ✅ **Multi-device sync**: Same data across devices
6. ✅ **Historical tracking**: Can track changes over time (ATS score history)
7. ✅ **Better queries**: Can fetch exactly what's needed
8. ✅ **Type safety**: Proper constraints and validation
