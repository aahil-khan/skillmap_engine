-- Fix schema mismatch: ensure resumes table matches Phase 1 spec
-- This aligns with Phase 1 spec and all other tables

-- Temporarily disable RLS to avoid permission issues
ALTER TABLE resumes DISABLE ROW LEVEL SECURITY;

-- Conditionally rename userid to user_id if userid exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'resumes' AND column_name = 'userid'
  ) THEN
    ALTER TABLE resumes RENAME COLUMN userid TO user_id;
    RAISE NOTICE 'Renamed userid to user_id';
  ELSE
    RAISE NOTICE 'Column userid does not exist, skipping rename';
  END IF;
END $$;

-- Drop and recreate the index with correct name
DROP INDEX IF EXISTS idx_resumes_userid;
DROP INDEX IF EXISTS idx_resumes_user_id;
CREATE INDEX idx_resumes_user_id ON resumes(user_id);

-- Update the schema to match Phase 1 spec - add missing columns
ALTER TABLE resumes
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS raw_text TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS parsed_data JSONB,
  ADD COLUMN IF NOT EXISTS parse_version TEXT DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT true;

-- Rename file_size_bytes if it exists (old schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'resumes' AND column_name = 'file_size_bytes'
  ) THEN
    ALTER TABLE resumes DROP COLUMN file_size_bytes;
  END IF;
END $$;

-- Rename resume_text to parsed_data if needed (old schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'resumes' AND column_name = 'resume_text'
  ) THEN
    ALTER TABLE resumes RENAME COLUMN resume_text TO parsed_data;
  END IF;
END $$;

-- Remove ats_score column (not in Phase 1 spec)
ALTER TABLE resumes DROP COLUMN IF EXISTS ats_score;

-- Make required columns NOT NULL (match spec)
ALTER TABLE resumes 
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN file_name SET NOT NULL,
  ALTER COLUMN raw_text DROP NOT NULL; -- Allow NULL temporarily for existing records

-- Re-enable RLS
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for resumes table
DROP POLICY IF EXISTS "Users can view their own resumes" ON resumes;
CREATE POLICY "Users can view their own resumes" ON resumes
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own resumes" ON resumes;
CREATE POLICY "Users can insert their own resumes" ON resumes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own resumes" ON resumes;
CREATE POLICY "Users can update their own resumes" ON resumes
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own resumes" ON resumes;
CREATE POLICY "Users can delete their own resumes" ON resumes
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE resumes IS 'User resumes with parsed data and metadata';
COMMENT ON COLUMN resumes.user_id IS 'Foreign key to auth.users';
COMMENT ON COLUMN resumes.content_hash IS 'SHA256 hash for deduplication and caching';
COMMENT ON COLUMN resumes.is_current IS 'Whether this is the active resume';
