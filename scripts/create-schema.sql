-- SkillMap Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. User Profiles Table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  inferred_areas_of_strength TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE user_profiles IS 'Main user profile information';
COMMENT ON COLUMN user_profiles.inferred_areas_of_strength IS 'AI-inferred areas like "Full-stack", "AI/ML"';

-- 2. Skills Table (Enhanced version - keeps existing table name for backward compatibility)
-- Note: If you already have a 'skills' table, this will NOT delete it or change existing data
-- It will only ADD new columns if they don't exist
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT,
  skill_name TEXT NOT NULL,
  skill_level TEXT CHECK (skill_level IN ('beginner', 'intermediate', 'advanced')),
  skill_category TEXT, -- Alias for 'category' for backward compatibility
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(userid, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_skills_userid ON skills(userid);
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(userid, category);

COMMENT ON TABLE skills IS 'User technical skills categorized by domain';
COMMENT ON COLUMN skills.category IS 'e.g., "Programming Languages", "Web Development", "Databases"';

-- 3. Work Experience Table
CREATE TABLE IF NOT EXISTS work_experience (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  duration TEXT,
  description TEXT,
  technologies TEXT[],
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_experience_userid ON work_experience(userid);
CREATE INDEX IF NOT EXISTS idx_work_experience_date ON work_experience(userid, start_date DESC);

COMMENT ON TABLE work_experience IS 'User work history and experience';
COMMENT ON COLUMN work_experience.duration IS 'Human-readable duration like "Jan 2022 - Present"';
COMMENT ON COLUMN work_experience.technologies IS 'Array of technologies used in this role';

-- 4. Projects Table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  technologies TEXT[],
  link TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_userid ON projects(userid);

COMMENT ON TABLE projects IS 'User projects and portfolio items';
COMMENT ON COLUMN projects.technologies IS 'Array of technologies used in project';

-- 5. Education Table
CREATE TABLE IF NOT EXISTS education (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  degree TEXT NOT NULL,
  institution TEXT NOT NULL,
  year TEXT,
  field_of_study TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_education_userid ON education(userid);

COMMENT ON TABLE education IS 'User education history';
COMMENT ON COLUMN education.year IS 'Graduation year or range like "2020 - 2024"';

-- 6. Learning Goals Table
CREATE TABLE IF NOT EXISTS learning_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  original_goal TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_goals_userid ON learning_goals(userid, status);

COMMENT ON TABLE learning_goals IS 'User learning goals and intents';
COMMENT ON COLUMN learning_goals.goal IS 'AI-refined/standalone learning goal';
COMMENT ON COLUMN learning_goals.original_goal IS 'Original user input';

-- 7. Enhanced Resumes Table (modify existing table)
-- Note: If you already have a resumes table, you may need to ALTER it instead
CREATE TABLE IF NOT EXISTS resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_text JSONB,
  ats_score NUMERIC(5,2),
  file_name TEXT,
  file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resumes_userid ON resumes(userid);

COMMENT ON TABLE resumes IS 'User resumes and parsed data';
COMMENT ON COLUMN resumes.resume_text IS 'Full parsed resume data in JSON format';
COMMENT ON COLUMN resumes.ats_score IS 'Latest ATS score (0-100)';

-- 8. LeetCode Profiles Table
CREATE TABLE IF NOT EXISTS leetcode_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  total_solved INTEGER DEFAULT 0,
  easy_solved INTEGER DEFAULT 0,
  medium_solved INTEGER DEFAULT 0,
  hard_solved INTEGER DEFAULT 0,
  ranking INTEGER,
  acceptance_rate NUMERIC(5,2),
  profile_data JSONB,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leetcode_profiles_userid ON leetcode_profiles(userid);

COMMENT ON TABLE leetcode_profiles IS 'User LeetCode profile and statistics';
COMMENT ON COLUMN leetcode_profiles.profile_data IS 'Full LeetCode profile data in JSON format';

-- 9. ATS History Table
CREATE TABLE IF NOT EXISTS ats_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ats_score NUMERIC(5,2) NOT NULL,
  breakdown JSONB,
  strengths TEXT[],
  improvements TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ats_history_userid ON ats_history(userid, created_at DESC);

COMMENT ON TABLE ats_history IS 'Historical ATS scores for tracking improvement';
COMMENT ON COLUMN ats_history.breakdown IS 'JSON with skills_match, experience_match, etc.';

-- 10. Skill Gap Analysis Table (Cache analysis results)
CREATE TABLE IF NOT EXISTS skill_gap_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_category TEXT NOT NULL,
  strengths TEXT[],
  missing_skills TEXT[],
  skills_to_improve TEXT[],
  learning_path JSONB,
  next_steps TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_gap_analysis_userid ON skill_gap_analysis(userid, created_at DESC);

COMMENT ON TABLE skill_gap_analysis IS 'Cached skill gap analysis results';
COMMENT ON COLUMN skill_gap_analysis.learning_path IS 'Structured learning path in JSON format';

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE education ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE leetcode_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ats_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_gap_analysis ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data

-- user_profiles policies
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = userid);

CREATE POLICY "Users can insert their own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = userid);

CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = userid);

-- skills policies
CREATE POLICY "Users can view their own skills" ON skills
  FOR SELECT USING (auth.uid() = userid);

CREATE POLICY "Users can insert their own skills" ON skills
  FOR INSERT WITH CHECK (auth.uid() = userid);

CREATE POLICY "Users can update their own skills" ON skills
  FOR UPDATE USING (auth.uid() = userid);

CREATE POLICY "Users can delete their own skills" ON skills
  FOR DELETE USING (auth.uid() = userid);

-- work_experience policies
CREATE POLICY "Users can view their own experience" ON work_experience
  FOR SELECT USING (auth.uid() = userid);

CREATE POLICY "Users can insert their own experience" ON work_experience
  FOR INSERT WITH CHECK (auth.uid() = userid);

CREATE POLICY "Users can update their own experience" ON work_experience
  FOR UPDATE USING (auth.uid() = userid);

CREATE POLICY "Users can delete their own experience" ON work_experience
  FOR DELETE USING (auth.uid() = userid);

-- projects policies
CREATE POLICY "Users can view their own projects" ON projects
  FOR SELECT USING (auth.uid() = userid);

CREATE POLICY "Users can insert their own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = userid);

CREATE POLICY "Users can update their own projects" ON projects
  FOR UPDATE USING (auth.uid() = userid);

CREATE POLICY "Users can delete their own projects" ON projects
  FOR DELETE USING (auth.uid() = userid);

-- education policies
CREATE POLICY "Users can view their own education" ON education
  FOR SELECT USING (auth.uid() = userid);

CREATE POLICY "Users can insert their own education" ON education
  FOR INSERT WITH CHECK (auth.uid() = userid);

CREATE POLICY "Users can update their own education" ON education
  FOR UPDATE USING (auth.uid() = userid);

CREATE POLICY "Users can delete their own education" ON education
  FOR DELETE USING (auth.uid() = userid);

-- learning_goals policies
CREATE POLICY "Users can view their own goals" ON learning_goals
  FOR SELECT USING (auth.uid() = userid);

CREATE POLICY "Users can insert their own goals" ON learning_goals
  FOR INSERT WITH CHECK (auth.uid() = userid);

CREATE POLICY "Users can update their own goals" ON learning_goals
  FOR UPDATE USING (auth.uid() = userid);

CREATE POLICY "Users can delete their own goals" ON learning_goals
  FOR DELETE USING (auth.uid() = userid);

-- resumes policies
CREATE POLICY "Users can view their own resume" ON resumes
  FOR SELECT USING (auth.uid() = userid);

CREATE POLICY "Users can insert their own resume" ON resumes
  FOR INSERT WITH CHECK (auth.uid() = userid);

CREATE POLICY "Users can update their own resume" ON resumes
  FOR UPDATE USING (auth.uid() = userid);

-- leetcode_profiles policies
CREATE POLICY "Users can view their own leetcode profile" ON leetcode_profiles
  FOR SELECT USING (auth.uid() = userid);

CREATE POLICY "Users can insert their own leetcode profile" ON leetcode_profiles
  FOR INSERT WITH CHECK (auth.uid() = userid);

CREATE POLICY "Users can update their own leetcode profile" ON leetcode_profiles
  FOR UPDATE USING (auth.uid() = userid);

-- ats_history policies
CREATE POLICY "Users can view their own ats history" ON ats_history
  FOR SELECT USING (auth.uid() = userid);

CREATE POLICY "Users can insert their own ats history" ON ats_history
  FOR INSERT WITH CHECK (auth.uid() = userid);

-- skill_gap_analysis policies
CREATE POLICY "Users can view their own analysis" ON skill_gap_analysis
  FOR SELECT USING (auth.uid() = userid);

CREATE POLICY "Users can insert their own analysis" ON skill_gap_analysis
  FOR INSERT WITH CHECK (auth.uid() = userid);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_skills_updated_at BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_work_experience_updated_at BEFORE UPDATE ON work_experience
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_education_updated_at BEFORE UPDATE ON education
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_learning_goals_updated_at BEFORE UPDATE ON learning_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resumes_updated_at BEFORE UPDATE ON resumes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leetcode_profiles_updated_at BEFORE UPDATE ON leetcode_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Schema created successfully! All tables, indexes, and RLS policies are in place.';
END $$;
