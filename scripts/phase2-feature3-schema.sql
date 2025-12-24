-- ============================================================================
-- PHASE 2 FEATURE 3: LEETCODE PATTERN ANALYSIS - DATABASE SCHEMA
-- ============================================================================
-- Creates table for storing LeetCode profile pattern analysis
-- Enhances existing leetcode_profiles structure (assumed already exists from Phase 1)

-- Note: If leetcode_profiles doesn't exist, uncomment the following:
-- CREATE TABLE leetcode_profiles (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
--   leetcode_username TEXT NOT NULL UNIQUE,
--   total_solved INTEGER DEFAULT 0,
--   easy_solved INTEGER DEFAULT 0,
--   medium_solved INTEGER DEFAULT 0,
--   hard_solved INTEGER DEFAULT 0,
--   ranking INTEGER,
--   reputation INTEGER DEFAULT 0,
--   contribution_points INTEGER DEFAULT 0,
--   profile_data JSONB,
--   pattern_analysis JSONB,
--   last_synced_at TIMESTAMPTZ DEFAULT NOW(),
--   created_at TIMESTAMPTZ DEFAULT NOW(),
--   updated_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- Add pattern_analysis column if table exists but column doesn't
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='leetcode_profiles' AND column_name='pattern_analysis'
    ) THEN
        ALTER TABLE leetcode_profiles ADD COLUMN pattern_analysis JSONB;
    END IF;
END $$;

-- Add acceptance_rate column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='leetcode_profiles' AND column_name='acceptance_rate'
    ) THEN
        ALTER TABLE leetcode_profiles ADD COLUMN acceptance_rate NUMERIC(5,2) DEFAULT 0;
    END IF;
END $$;

-- Update indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_leetcode_profiles_user_id ON leetcode_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_leetcode_profiles_username ON leetcode_profiles(leetcode_username);
CREATE INDEX IF NOT EXISTS idx_leetcode_profiles_last_synced ON leetcode_profiles(last_synced_at);

-- Enable RLS (if not already enabled)
ALTER TABLE leetcode_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent)
DROP POLICY IF EXISTS "Users can view own leetcode profile" ON leetcode_profiles;
DROP POLICY IF EXISTS "Users can insert own leetcode profile" ON leetcode_profiles;
DROP POLICY IF EXISTS "Users can update own leetcode profile" ON leetcode_profiles;

-- Create RLS policies
CREATE POLICY "Users can view own leetcode profile" 
  ON leetcode_profiles FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own leetcode profile" 
  ON leetcode_profiles FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own leetcode profile" 
  ON leetcode_profiles FOR UPDATE 
  USING (auth.uid() = user_id);

-- Add helpful comments
COMMENT ON COLUMN leetcode_profiles.pattern_analysis IS 'LLM-analyzed problem-solving patterns: strength_patterns, weak_patterns, comfort_level, consistency_score, growth_trend';
COMMENT ON COLUMN leetcode_profiles.acceptance_rate IS 'Percentage of accepted submissions out of total submissions';

-- Verify setup
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'leetcode_profiles'
ORDER BY ordinal_position;

-- ============================================================================
-- PHASE 2 FEATURE 3 SCHEMA COMPLETE
-- ============================================================================
-- Next step: Verify table structure, then run Feature 3 implementation
