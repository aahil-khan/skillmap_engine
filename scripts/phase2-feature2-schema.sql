-- Phase 2 Feature 2: Skill Gap Analysis & Learning Paths
-- Run this in Supabase SQL Editor

-- Learning paths table
CREATE TABLE IF NOT EXISTS learning_paths (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES learning_goals(id) ON DELETE CASCADE,
  path_data JSONB NOT NULL, -- Structured learning path from LLM
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, goal_id, version)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_learning_paths_user_goal ON learning_paths(user_id, goal_id);
CREATE INDEX IF NOT EXISTS idx_learning_paths_created ON learning_paths(created_at DESC);

-- Enable RLS (service role key bypasses this)
ALTER TABLE learning_paths ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own learning paths" ON learning_paths
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own learning paths" ON learning_paths
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own learning paths" ON learning_paths
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own learning paths" ON learning_paths
  FOR DELETE USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE learning_paths IS 'Phase 2: Personalized learning paths generated from skill gap analysis';
COMMENT ON COLUMN learning_paths.path_data IS 'Structured JSON from LLM: { steps: [...], total_estimated_weeks: N, key_milestones: [...] }';
COMMENT ON COLUMN learning_paths.version IS 'Incremented when path is regenerated (e.g., after user adds new skills)';
