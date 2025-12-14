-- Re-enable RLS with proper policies for authenticated users

-- Enable RLS
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE education ENABLE ROW LEVEL SECURITY;

-- Resumes policies
DROP POLICY IF EXISTS "Users can manage own resumes" ON resumes;
CREATE POLICY "Users can manage own resumes" ON resumes
  FOR ALL USING (auth.uid() = user_id);

-- User skills policies
DROP POLICY IF EXISTS "Users can manage own skills" ON user_skills;
CREATE POLICY "Users can manage own skills" ON user_skills
  FOR ALL USING (auth.uid() = user_id);

-- Work experience policies
DROP POLICY IF EXISTS "Users can manage own experience" ON work_experience;
CREATE POLICY "Users can manage own experience" ON work_experience
  FOR ALL USING (auth.uid() = user_id);

-- Projects policies
DROP POLICY IF EXISTS "Users can manage own projects" ON projects;
CREATE POLICY "Users can manage own projects" ON projects
  FOR ALL USING (auth.uid() = user_id);

-- Education policies
DROP POLICY IF EXISTS "Users can manage own education" ON education;
CREATE POLICY "Users can manage own education" ON education
  FOR ALL USING (auth.uid() = user_id);
