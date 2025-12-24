
-- Phase 2 Feature 1: Job Market Integration
-- Run this in Supabase SQL Editor

-- Job market skills cache table
CREATE TABLE IF NOT EXISTS job_market_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES learning_goals(id) ON DELETE CASCADE,
  skill_frequencies JSONB NOT NULL, -- { "React": 0.85, "TypeScript": 0.72, ... }
  total_jobs_analyzed INT NOT NULL,
  data_source TEXT CHECK (data_source IN ('jobs', 'taxonomy')) NOT NULL,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(user_id, goal_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_job_market_user_goal ON job_market_skills(user_id, goal_id);
CREATE INDEX IF NOT EXISTS idx_job_market_expires ON job_market_skills(expires_at);

-- Add comment
COMMENT ON TABLE job_market_skills IS 'Phase 2: Cached job market skill frequency analysis (user-pasted jobs or taxonomy fallback)';
COMMENT ON COLUMN job_market_skills.data_source IS 'Source of analysis: "jobs" (user-pasted) or "taxonomy" (Phase 1 fallback)';

-- Enable RLS (service role key bypasses this)
ALTER TABLE job_market_skills ENABLE ROW LEVEL SECURITY;

-- RLS Policies (for anon key access if needed later)
CREATE POLICY "Users can view own job market data" ON job_market_skills
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own job market data" ON job_market_skills
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own job market data" ON job_market_skills
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own job market data" ON job_market_skills
  FOR DELETE USING (auth.uid() = user_id);
