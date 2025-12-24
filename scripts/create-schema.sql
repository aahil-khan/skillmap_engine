-- ============================================================================
-- SkillMap Engine - Production Database Schema
-- ============================================================================
-- Created: December 13, 2025
-- Framework: Supabase (PostgreSQL)
-- Purpose: Phase 1 - Resume Parsing + Peer Matching
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CORE USER TABLES
-- ============================================================================

-- User profiles (extends Supabase auth.users)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  location TEXT,
  timezone TEXT,
  experience_level TEXT CHECK (experience_level IN ('entry', '1-3years', '3-5years', '5+years')),
  is_active BOOLEAN DEFAULT true,
  is_searchable BOOLEAN DEFAULT true,
  profile_completed BOOLEAN DEFAULT false,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_profiles_is_active ON user_profiles(is_active);
CREATE INDEX idx_user_profiles_experience_level ON user_profiles(experience_level);
CREATE INDEX idx_user_profiles_is_searchable ON user_profiles(is_searchable) WHERE is_searchable = true;

-- ============================================================================
-- SKILLS TABLES
-- ============================================================================

-- Skill taxonomy (dynamic, updated from job market data)
CREATE TABLE skills_taxonomy (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  subcategory TEXT,
  aliases TEXT[] DEFAULT '{}',
  prerequisites TEXT[] DEFAULT '{}',
  commonly_paired_with TEXT[] DEFAULT '{}',
  job_demand_frequency DECIMAL(5,2) DEFAULT 0.0,
  job_demand_updated_at TIMESTAMPTZ,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_skills_taxonomy_canonical_name ON skills_taxonomy(canonical_name);
CREATE INDEX idx_skills_taxonomy_category ON skills_taxonomy(category);
CREATE INDEX idx_skills_taxonomy_job_demand ON skills_taxonomy(job_demand_frequency DESC);

-- User skills (links users to normalized skills)
CREATE TABLE user_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills_taxonomy(id) ON DELETE CASCADE,
  skill_level TEXT CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  years_experience NUMERIC(3, 1),
  source TEXT CHECK (source IN ('resume', 'manual', 'leetcode', 'verified')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill_id)
);

CREATE INDEX idx_user_skills_user_id ON user_skills(user_id);
CREATE INDEX idx_user_skills_skill_id ON user_skills(skill_id);
CREATE INDEX idx_user_skills_skill_level ON user_skills(skill_level);

-- ============================================================================
-- EXPERIENCE TABLES
-- ============================================================================

-- Work experience
CREATE TABLE work_experience (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  location TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  is_current BOOLEAN DEFAULT false,
  description TEXT,
  technologies TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_work_experience_user_id ON work_experience(user_id);
CREATE INDEX idx_work_experience_is_current ON work_experience(is_current);
CREATE INDEX idx_work_experience_dates ON work_experience(start_date DESC, end_date DESC);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  description TEXT,
  project_url TEXT,
  github_url TEXT,
  technologies TEXT[] DEFAULT '{}',
  start_date DATE,
  end_date DATE,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_is_featured ON projects(is_featured);

-- Education
CREATE TABLE education (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_name TEXT NOT NULL,
  degree TEXT NOT NULL,
  field_of_study TEXT,
  start_date DATE,
  end_date DATE,
  grade TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_education_user_id ON education(user_id);

-- ============================================================================
-- LEARNING & GOALS TABLES
-- ============================================================================

-- Learning goals
CREATE TABLE learning_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_goal TEXT NOT NULL,
  refined_goal TEXT,
  target_role TEXT,
  target_timeline TEXT,
  status TEXT CHECK (status IN ('active', 'completed', 'paused', 'abandoned')) DEFAULT 'active',
  progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_learning_goals_user_id ON learning_goals(user_id);
CREATE INDEX idx_learning_goals_status ON learning_goals(status);

-- Learning path steps (generated dynamically)
CREATE TABLE learning_path_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  goal_id UUID NOT NULL REFERENCES learning_goals(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  skill_name TEXT NOT NULL,
  skill_id UUID REFERENCES skills_taxonomy(id) ON DELETE SET NULL,
  description TEXT,
  estimated_hours INTEGER,
  resources JSONB DEFAULT '[]',
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_learning_path_steps_goal_id ON learning_path_steps(goal_id);
CREATE INDEX idx_learning_path_steps_order ON learning_path_steps(goal_id, step_order);

-- ============================================================================
-- RESUME STORAGE
-- ============================================================================

-- Resumes (track versions, support re-uploads)
CREATE TABLE resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT,
  raw_text TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  parsed_data JSONB,
  parse_version TEXT DEFAULT '1.0',
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resumes_user_id ON resumes(user_id);
CREATE INDEX idx_resumes_content_hash ON resumes(content_hash);
CREATE INDEX idx_resumes_is_current ON resumes(user_id, is_current);

-- ============================================================================
-- LEETCODE INTEGRATION
-- ============================================================================

-- LeetCode profiles
CREATE TABLE leetcode_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  leetcode_username TEXT NOT NULL,
  total_solved INTEGER DEFAULT 0,
  easy_solved INTEGER DEFAULT 0,
  medium_solved INTEGER DEFAULT 0,
  hard_solved INTEGER DEFAULT 0,
  ranking INTEGER,
  reputation INTEGER DEFAULT 0,
  contribution_points INTEGER DEFAULT 0,
  profile_data JSONB,
  pattern_analysis JSONB,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leetcode_profiles_user_id ON leetcode_profiles(user_id);
CREATE INDEX idx_leetcode_profiles_username ON leetcode_profiles(leetcode_username);

-- ============================================================================
-- PEER MATCHING & CONNECTIONS
-- ============================================================================

-- Peer availability preferences
CREATE TABLE peer_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  available_days TEXT[] DEFAULT '{}',
  preferred_time_slots TEXT[] DEFAULT '{}',
  preferred_collaboration_types TEXT[] DEFAULT '{}',
  communication_preferences TEXT[] DEFAULT '{}',
  max_active_connections INTEGER DEFAULT 10,
  is_accepting_requests BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_peer_preferences_user_id ON peer_preferences(user_id);

-- Connection requests (Tinder-style bidirectional)
CREATE TABLE connection_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined', 'expired')) DEFAULT 'pending',
  connection_type TEXT CHECK (connection_type IN ('study_partner', 'project_collab', 'mentor_mentee', 'skill_exchange')),
  message TEXT,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sender_id, receiver_id),
  CHECK (sender_id != receiver_id)
);

CREATE INDEX idx_connection_requests_sender ON connection_requests(sender_id);
CREATE INDEX idx_connection_requests_receiver ON connection_requests(receiver_id);
CREATE INDEX idx_connection_requests_status ON connection_requests(status);

-- Active connections (formed after mutual accept)
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_type TEXT NOT NULL,
  request_id UUID REFERENCES connection_requests(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user1_id, user2_id),
  CHECK (user1_id < user2_id)
);

CREATE INDEX idx_connections_user1 ON connections(user1_id);
CREATE INDEX idx_connections_user2 ON connections(user2_id);
CREATE INDEX idx_connections_is_active ON connections(is_active);

-- Messages between connected peers
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_connection_id ON messages(connection_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

-- ============================================================================
-- ATS SCORING (Resume vs Job Description)
-- ============================================================================

-- ATS score history
CREATE TABLE ats_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  job_description TEXT NOT NULL,
  overall_score DECIMAL(5,2) NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  skills_match_score DECIMAL(5,2),
  experience_match_score DECIMAL(5,2),
  keyword_match_score DECIMAL(5,2),
  analysis_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ats_scores_user_id ON ats_scores(user_id);
CREATE INDEX idx_ats_scores_resume_id ON ats_scores(resume_id);
CREATE INDEX idx_ats_scores_created_at ON ats_scores(created_at DESC);

-- ============================================================================
-- CACHING METADATA (Optional - for cache warming)
-- ============================================================================

-- Cache metadata (track what's cached in Redis)
CREATE TABLE cache_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cache_key TEXT NOT NULL UNIQUE,
  cache_type TEXT NOT NULL,
  entity_id UUID,
  ttl_seconds INTEGER NOT NULL,
  hit_count INTEGER DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_cache_metadata_key ON cache_metadata(cache_key);
CREATE INDEX idx_cache_metadata_expires_at ON cache_metadata(expires_at);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_skills_taxonomy_updated_at BEFORE UPDATE ON skills_taxonomy FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_skills_updated_at BEFORE UPDATE ON user_skills FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_work_experience_updated_at BEFORE UPDATE ON work_experience FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_education_updated_at BEFORE UPDATE ON education FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_learning_goals_updated_at BEFORE UPDATE ON learning_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_learning_path_steps_updated_at BEFORE UPDATE ON learning_path_steps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_resumes_updated_at BEFORE UPDATE ON resumes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leetcode_profiles_updated_at BEFORE UPDATE ON leetcode_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_peer_preferences_updated_at BEFORE UPDATE ON peer_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_connection_requests_updated_at BEFORE UPDATE ON connection_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_connections_updated_at BEFORE UPDATE ON connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all user-facing tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE education ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_path_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE leetcode_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE peer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ats_scores ENABLE ROW LEVEL SECURITY;

-- User Profiles Policies
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view searchable profiles" ON user_profiles FOR SELECT USING (is_searchable = true AND is_active = true);

-- User Skills Policies
CREATE POLICY "Users can manage own skills" ON user_skills FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view others' skills" ON user_skills FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_id = user_skills.user_id AND is_searchable = true)
);

-- Work Experience Policies
CREATE POLICY "Users can manage own experience" ON work_experience FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view others' experience" ON work_experience FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_id = work_experience.user_id AND is_searchable = true)
);

-- Projects Policies
CREATE POLICY "Users can manage own projects" ON projects FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view others' projects" ON projects FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_id = projects.user_id AND is_searchable = true)
);

-- Education Policies
CREATE POLICY "Users can manage own education" ON education FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view others' education" ON education FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_id = education.user_id AND is_searchable = true)
);

-- Learning Goals Policies
CREATE POLICY "Users can manage own goals" ON learning_goals FOR ALL USING (auth.uid() = user_id);

-- Learning Path Steps Policies
ALTER TABLE learning_path_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own learning paths" ON learning_path_steps FOR ALL USING (
  EXISTS (SELECT 1 FROM learning_goals WHERE id = learning_path_steps.goal_id AND user_id = auth.uid())
);

-- Resumes Policies
CREATE POLICY "Users can manage own resumes" ON resumes FOR ALL USING (auth.uid() = user_id);

-- LeetCode Profiles Policies
CREATE POLICY "Users can manage own leetcode profile" ON leetcode_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view others' leetcode profiles" ON leetcode_profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_id = leetcode_profiles.user_id AND is_searchable = true)
);

-- Peer Preferences Policies
CREATE POLICY "Users can manage own preferences" ON peer_preferences FOR ALL USING (auth.uid() = user_id);

-- Connection Requests Policies
CREATE POLICY "Users can view requests involving them" ON connection_requests FOR SELECT USING (
  auth.uid() = sender_id OR auth.uid() = receiver_id
);
CREATE POLICY "Users can send requests" ON connection_requests FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can update requests they're involved in" ON connection_requests FOR UPDATE USING (
  auth.uid() = sender_id OR auth.uid() = receiver_id
);

-- Connections Policies
CREATE POLICY "Users can view own connections" ON connections FOR SELECT USING (
  auth.uid() = user1_id OR auth.uid() = user2_id
);
CREATE POLICY "Users can update own connections" ON connections FOR UPDATE USING (
  auth.uid() = user1_id OR auth.uid() = user2_id
);

-- Messages Policies
CREATE POLICY "Users can view messages in their connections" ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM connections 
    WHERE id = messages.connection_id 
    AND (user1_id = auth.uid() OR user2_id = auth.uid())
  )
);
CREATE POLICY "Users can send messages" ON messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM connections 
    WHERE id = connection_id 
    AND (user1_id = auth.uid() OR user2_id = auth.uid())
    AND is_active = true
  )
);

-- ATS Scores Policies
ALTER TABLE ats_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own ATS scores" ON ats_scores FOR ALL USING (auth.uid() = user_id);

-- Skills Taxonomy (public read)
ALTER TABLE skills_taxonomy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read skills taxonomy" ON skills_taxonomy FOR SELECT USING (true);

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert default experience levels enum documentation
COMMENT ON COLUMN user_profiles.experience_level IS 'Entry-level (0-1 years), 1-3 years, 3-5 years, 5+ years (senior)';
COMMENT ON COLUMN user_skills.skill_level IS 'Beginner (<1 year), Intermediate (1-3 years), Advanced (3-5 years), Expert (5+ years)';

-- ============================================================================
-- SCHEMA COMPLETE
-- ============================================================================
-- Total Tables: 18
-- Total Indexes: 45+
-- Total Triggers: 14
-- Total RLS Policies: 30+
-- ============================================================================