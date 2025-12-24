-- Migration: Remove UNIQUE constraint from leetcode_username
-- Date: 2025-12-25
-- Reason: Allow multiple users to track the same public LeetCode profile
--         Prevents username squatting where someone could block the actual owner

-- Drop the unique constraint on leetcode_username
ALTER TABLE leetcode_profiles 
DROP CONSTRAINT IF EXISTS leetcode_profiles_leetcode_username_key;

-- The index remains for query performance
-- (idx_leetcode_profiles_username already exists as a non-unique index)

-- Verify the change
SELECT 
  conname AS constraint_name,
  contype AS constraint_type
FROM pg_constraint
WHERE conrelid = 'leetcode_profiles'::regclass
  AND contype = 'u';  -- 'u' = unique constraint

-- Expected result: Should NOT show leetcode_profiles_leetcode_username_key
-- Only leetcode_profiles_user_id_key should remain (one profile per user)
