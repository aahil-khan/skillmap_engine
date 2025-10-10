-- SkillMap Database Schema - DESTRUCTIVE MIGRATION
-- ⚠️ WARNING: This will DELETE ALL existing data and tables!
-- Run this ONLY if you want to start fresh with a clean schema

-- ============================================
-- STEP 1: DROP ALL EXISTING TABLES
-- ============================================

-- Drop tables in reverse order of dependencies (children first, then parents)
DROP TABLE IF EXISTS skill_gap_analysis CASCADE;
DROP TABLE IF EXISTS ats_history CASCADE;
DROP TABLE IF EXISTS leetcode_profiles CASCADE;
DROP TABLE IF EXISTS resumes CASCADE;
DROP TABLE IF EXISTS learning_goals CASCADE;
DROP TABLE IF EXISTS education CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS work_experience CASCADE;
DROP TABLE IF EXISTS skills CASCADE;
DROP TABLE IF EXISTS technical_skills CASCADE; -- Just in case
DROP TABLE IF EXISTS user_profiles CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- STEP 2: CREATE NEW NORMALIZED SCHEMA
-- ============================================

-- 1. User Profiles Table (Main profile information)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  inferred_areas_of_strength TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE user_profiles IS 'Main user profile information extracted from resume';
COMMENT ON COLUMN user_profiles.inferred_areas_of_strength IS 'AI-inferred areas like "Full-stack Development", "Machine Learning"';

-- 2. Skills Table (User technical skills)
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  skill_level TEXT NOT NULL CHECK (skill_level IN ('beginner', 'intermediate', 'advanced')),
  skill_category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(userid, skill_name)
);

CREATE INDEX idx_skills_userid ON skills(userid);
CREATE INDEX idx_skills_category ON skills(userid, skill_category);

COMMENT ON TABLE skills IS 'User technical skills with proficiency levels';
COMMENT ON COLUMN skills.skill_category IS 'Category like "Programming Languages", "Web Development", "Databases"';

-- 3. Work Experience Table
CREATE TABLE work_experience (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN DEFAULT FALSE,
  duration TEXT,
  description TEXT,
  responsibilities TEXT[],
  technologies TEXT[],
  achievements TEXT[],
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_work_experience_userid ON work_experience(userid);
CREATE INDEX idx_work_experience_dates ON work_experience(userid, start_date DESC NULLS LAST);

COMMENT ON TABLE work_experience IS 'User work history with detailed information';
COMMENT ON COLUMN work_experience.duration IS 'Human-readable duration like "Jan 2022 - Present" or "2 years"';

-- 4. Projects Table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  description TEXT,
  role TEXT,
  technologies TEXT[],
  github_url TEXT,
  live_url TEXT,
  start_date DATE,
  end_date DATE,
  highlights TEXT[],
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_userid ON projects(userid);

COMMENT ON TABLE projects IS 'User projects and portfolio items';

-- 5. Education Table
CREATE TABLE education (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  degree TEXT NOT NULL,
  institution TEXT NOT NULL,
  location TEXT,
  field_of_study TEXT,
  graduation_year TEXT,
  start_year TEXT,
  gpa TEXT,
  honors TEXT[],
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_education_userid ON education(userid);

COMMENT ON TABLE education IS 'User education history';

-- 6. Certifications Table (New!)
CREATE TABLE certifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  certification_name TEXT NOT NULL,
  issuing_organization TEXT NOT NULL,
  issue_date DATE,
  expiry_date DATE,
  credential_id TEXT,
  credential_url TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_certifications_userid ON certifications(userid);

COMMENT ON TABLE certifications IS 'User certifications and credentials';

-- 7. Learning Goals Table
CREATE TABLE learning_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_goal TEXT NOT NULL,
  refined_goal TEXT NOT NULL,
  goal_category TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'in_progress', 'completed', 'archived')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  target_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_learning_goals_userid ON learning_goals(userid, status);

COMMENT ON TABLE learning_goals IS 'User learning goals and objectives';
COMMENT ON COLUMN learning_goals.original_goal IS 'Original user input';
COMMENT ON COLUMN learning_goals.refined_goal IS 'AI-refined standalone goal';

-- 8. Resumes Table (Enhanced with metadata)
CREATE TABLE resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT,
  raw_text TEXT,
  parsed_data JSONB NOT NULL,
  ats_score NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resumes_userid ON resumes(userid);

COMMENT ON TABLE resumes IS 'Uploaded resumes with parsed data and metadata';
COMMENT ON COLUMN resumes.parsed_data IS 'Complete parsed resume data in structured JSON format';
COMMENT ON COLUMN resumes.raw_text IS 'Extracted text from PDF for reference';

-- 9. ATS History Table (Track score changes over time)
CREATE TABLE ats_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
  overall_score NUMERIC(5,2) NOT NULL,
  skills_match NUMERIC(5,2),
  experience_match NUMERIC(5,2),
  education_match NUMERIC(5,2),
  formatting_score NUMERIC(5,2),
  keyword_optimization NUMERIC(5,2),
  strengths TEXT[],
  weaknesses TEXT[],
  improvements TEXT[],
  recommendations TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ats_history_userid ON ats_history(userid, created_at DESC);
CREATE INDEX idx_ats_history_resume ON ats_history(resume_id);

COMMENT ON TABLE ats_history IS 'Historical ATS scores for tracking improvement over time';

-- 10. Skill Gap Analysis Table
CREATE TABLE skill_gap_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES learning_goals(id) ON DELETE CASCADE,
  goal_category TEXT NOT NULL,
  current_skills TEXT[],
  required_skills TEXT[],
  missing_skills TEXT[],
  skills_to_improve TEXT[],
  strengths TEXT[],
  learning_path JSONB,
  recommended_resources JSONB,
  estimated_timeline TEXT,
  next_steps TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_skill_gap_analysis_userid ON skill_gap_analysis(userid, created_at DESC);
CREATE INDEX idx_skill_gap_analysis_goal ON skill_gap_analysis(goal_id);

COMMENT ON TABLE skill_gap_analysis IS 'AI-generated skill gap analyses';
COMMENT ON COLUMN skill_gap_analysis.learning_path IS 'Structured learning path with milestones';

-- 11. LeetCode Profiles Table
CREATE TABLE leetcode_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  leetcode_username TEXT NOT NULL,
  total_solved INTEGER DEFAULT 0,
  easy_solved INTEGER DEFAULT 0,
  medium_solved INTEGER DEFAULT 0,
  hard_solved INTEGER DEFAULT 0,
  acceptance_rate NUMERIC(5,2),
  ranking INTEGER,
  reputation INTEGER,
  contribution_points INTEGER,
  profile_data JSONB,
  recent_submissions JSONB,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leetcode_profiles_userid ON leetcode_profiles(userid);
CREATE INDEX idx_leetcode_profiles_username ON leetcode_profiles(leetcode_username);

COMMENT ON TABLE leetcode_profiles IS 'LeetCode profile integration and statistics';

-- 12. Problem Recommendations Table (New!)
CREATE TABLE problem_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_title TEXT NOT NULL,
  problem_url TEXT NOT NULL,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  topics TEXT[],
  companies TEXT[],
  reasoning TEXT,
  relevance_score NUMERIC(3,2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'attempted', 'solved', 'skipped')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_problem_recommendations_userid ON problem_recommendations(userid, status);

COMMENT ON TABLE problem_recommendations IS 'AI-recommended LeetCode problems based on user goals';

-- ============================================
-- STEP 3: ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE education ENABLE ROW LEVEL SECURITY;
ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ats_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_gap_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE leetcode_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_recommendations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 4: CREATE RLS POLICIES
-- ============================================

-- User Profiles
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = userid);
CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = userid);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = userid);
CREATE POLICY "Users can delete own profile" ON user_profiles FOR DELETE USING (auth.uid() = userid);

-- Skills
CREATE POLICY "Users can view own skills" ON skills FOR SELECT USING (auth.uid() = userid);
CREATE POLICY "Users can insert own skills" ON skills FOR INSERT WITH CHECK (auth.uid() = userid);
CREATE POLICY "Users can update own skills" ON skills FOR UPDATE USING (auth.uid() = userid);
CREATE POLICY "Users can delete own skills" ON skills FOR DELETE USING (auth.uid() = userid);

-- Work Experience
CREATE POLICY "Users can view own experience" ON work_experience FOR SELECT USING (auth.uid() = userid);
CREATE POLICY "Users can insert own experience" ON work_experience FOR INSERT WITH CHECK (auth.uid() = userid);
CREATE POLICY "Users can update own experience" ON work_experience FOR UPDATE USING (auth.uid() = userid);
CREATE POLICY "Users can delete own experience" ON work_experience FOR DELETE USING (auth.uid() = userid);

-- Projects
CREATE POLICY "Users can view own projects" ON projects FOR SELECT USING (auth.uid() = userid);
CREATE POLICY "Users can insert own projects" ON projects FOR INSERT WITH CHECK (auth.uid() = userid);
CREATE POLICY "Users can update own projects" ON projects FOR UPDATE USING (auth.uid() = userid);
CREATE POLICY "Users can delete own projects" ON projects FOR DELETE USING (auth.uid() = userid);

-- Education
CREATE POLICY "Users can view own education" ON education FOR SELECT USING (auth.uid() = userid);
CREATE POLICY "Users can insert own education" ON education FOR INSERT WITH CHECK (auth.uid() = userid);
CREATE POLICY "Users can update own education" ON education FOR UPDATE USING (auth.uid() = userid);
CREATE POLICY "Users can delete own education" ON education FOR DELETE USING (auth.uid() = userid);

-- Certifications
CREATE POLICY "Users can view own certifications" ON certifications FOR SELECT USING (auth.uid() = userid);
CREATE POLICY "Users can insert own certifications" ON certifications FOR INSERT WITH CHECK (auth.uid() = userid);
CREATE POLICY "Users can update own certifications" ON certifications FOR UPDATE USING (auth.uid() = userid);
CREATE POLICY "Users can delete own certifications" ON certifications FOR DELETE USING (auth.uid() = userid);

-- Learning Goals
CREATE POLICY "Users can view own goals" ON learning_goals FOR SELECT USING (auth.uid() = userid);
CREATE POLICY "Users can insert own goals" ON learning_goals FOR INSERT WITH CHECK (auth.uid() = userid);
CREATE POLICY "Users can update own goals" ON learning_goals FOR UPDATE USING (auth.uid() = userid);
CREATE POLICY "Users can delete own goals" ON learning_goals FOR DELETE USING (auth.uid() = userid);

-- Resumes
CREATE POLICY "Users can view own resume" ON resumes FOR SELECT USING (auth.uid() = userid);
CREATE POLICY "Users can insert own resume" ON resumes FOR INSERT WITH CHECK (auth.uid() = userid);
CREATE POLICY "Users can update own resume" ON resumes FOR UPDATE USING (auth.uid() = userid);
CREATE POLICY "Users can delete own resume" ON resumes FOR DELETE USING (auth.uid() = userid);

-- ATS History
CREATE POLICY "Users can view own ats history" ON ats_history FOR SELECT USING (auth.uid() = userid);
CREATE POLICY "Users can insert own ats history" ON ats_history FOR INSERT WITH CHECK (auth.uid() = userid);

-- Skill Gap Analysis
CREATE POLICY "Users can view own analysis" ON skill_gap_analysis FOR SELECT USING (auth.uid() = userid);
CREATE POLICY "Users can insert own analysis" ON skill_gap_analysis FOR INSERT WITH CHECK (auth.uid() = userid);

-- LeetCode Profiles
CREATE POLICY "Users can view own leetcode profile" ON leetcode_profiles FOR SELECT USING (auth.uid() = userid);
CREATE POLICY "Users can insert own leetcode profile" ON leetcode_profiles FOR INSERT WITH CHECK (auth.uid() = userid);
CREATE POLICY "Users can update own leetcode profile" ON leetcode_profiles FOR UPDATE USING (auth.uid() = userid);

-- Problem Recommendations
CREATE POLICY "Users can view own recommendations" ON problem_recommendations FOR SELECT USING (auth.uid() = userid);
CREATE POLICY "Users can insert own recommendations" ON problem_recommendations FOR INSERT WITH CHECK (auth.uid() = userid);
CREATE POLICY "Users can update own recommendations" ON problem_recommendations FOR UPDATE USING (auth.uid() = userid);
CREATE POLICY "Users can delete own recommendations" ON problem_recommendations FOR DELETE USING (auth.uid() = userid);

-- ============================================
-- STEP 5: CREATE TRIGGERS FOR AUTO-TIMESTAMPS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

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

CREATE TRIGGER update_certifications_updated_at BEFORE UPDATE ON certifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_learning_goals_updated_at BEFORE UPDATE ON learning_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resumes_updated_at BEFORE UPDATE ON resumes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leetcode_profiles_updated_at BEFORE UPDATE ON leetcode_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_problem_recommendations_updated_at BEFORE UPDATE ON problem_recommendations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 6: CREATE HELPER VIEWS
-- ============================================

-- View for complete user profile
CREATE OR REPLACE VIEW user_complete_profile AS
SELECT 
  up.userid,
  up.name,
  up.email,
  up.inferred_areas_of_strength,
  r.ats_score as latest_ats_score,
  r.file_name as resume_file_name,
  lp.leetcode_username,
  lp.total_solved as leetcode_total_solved,
  COUNT(DISTINCT s.id) as total_skills,
  COUNT(DISTINCT we.id) as total_work_experiences,
  COUNT(DISTINCT p.id) as total_projects,
  COUNT(DISTINCT e.id) as total_education_entries,
  up.created_at,
  up.updated_at
FROM user_profiles up
LEFT JOIN resumes r ON up.userid = r.userid
LEFT JOIN leetcode_profiles lp ON up.userid = lp.userid
LEFT JOIN skills s ON up.userid = s.userid
LEFT JOIN work_experience we ON up.userid = we.userid
LEFT JOIN projects p ON up.userid = p.userid
LEFT JOIN education e ON up.userid = e.userid
GROUP BY up.userid, up.name, up.email, up.inferred_areas_of_strength, 
         r.ats_score, r.file_name, lp.leetcode_username, lp.total_solved,
         up.created_at, up.updated_at;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Schema created successfully!';
  RAISE NOTICE '📊 Tables created: 12';
  RAISE NOTICE '🔒 RLS policies enabled on all tables';
  RAISE NOTICE '⚡ Indexes created for performance';
  RAISE NOTICE '🔄 Auto-update triggers configured';
  RAISE NOTICE '👁️ Helper views created';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  All previous data has been deleted!';
  RAISE NOTICE '🆕 Ready for fresh data import';
END $$;
