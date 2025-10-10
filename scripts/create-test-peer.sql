-- 🧪 CREATE TEST PEER FOR MATCHING
-- Run this in Supabase SQL Editor to create a test user to match with

-- Step 1: Create a test user profile (if not exists)
-- Replace 'test-user-001' with a unique ID
INSERT INTO user_profiles (userid, name, email, created_at, updated_at)
VALUES (
  'test-user-001',
  'Alex Johnson',
  'alex.johnson@example.com',
  NOW(),
  NOW()
)
ON CONFLICT (userid) DO NOTHING;

-- Step 2: Add some skills for the test user
INSERT INTO skills (userid, skill_name, skill_level, skill_category, created_at)
VALUES
  ('test-user-001', 'React', 'advanced', 'Frontend Development', NOW()),
  ('test-user-001', 'Node.js', 'intermediate', 'Backend Development', NOW()),
  ('test-user-001', 'TypeScript', 'advanced', 'Programming Languages', NOW()),
  ('test-user-001', 'PostgreSQL', 'intermediate', 'Databases', NOW()),
  ('test-user-001', 'Docker', 'beginner', 'DevOps', NOW()),
  ('test-user-001', 'AWS', 'intermediate', 'Cloud', NOW())
ON CONFLICT (userid, skill_name) DO NOTHING;

-- Step 3: Add learning goals
INSERT INTO learning_goals (userid, original_goal, refined_goal, goal_category, status, priority, created_at)
VALUES
  ('test-user-001', 'Learn GraphQL', 'Master GraphQL API design and implementation', 'Backend Development', 'active', 'high', NOW()),
  ('test-user-001', 'System Design', 'Study distributed systems and microservices architecture', 'System Design', 'active', 'medium', NOW())
ON CONFLICT (userid, original_goal) DO NOTHING;

-- Step 4: Create peer profile (THE IMPORTANT PART!)
INSERT INTO peer_profiles (
  userid,
  display_name,
  title,
  bio,
  experience_level,
  availability,
  looking_for,
  skill_tags,
  interest_areas,
  is_open_to_connections,
  is_active,
  created_at,
  updated_at
)
VALUES (
  'test-user-001',
  'Alex Johnson',
  'Senior Full Stack Developer',
  'Passionate about building scalable web applications with React and Node.js. Love mentoring junior developers and collaborating on open-source projects. Currently exploring GraphQL and microservices architecture.',
  '3-5 years',
  'Flexible',
  ARRAY['project', 'mentorship'],
  ARRAY['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Docker', 'AWS'],
  ARRAY['Web Development', 'Cloud Computing', 'System Design'],
  true,
  true,
  NOW(),
  NOW()
)
ON CONFLICT (userid) DO UPDATE SET
  is_active = true,
  is_open_to_connections = true,
  updated_at = NOW();

-- Step 5: (Optional) Add LeetCode profile for DSA matching
INSERT INTO leetcode_profiles (
  userid,
  leetcode_username,
  total_solved,
  easy_solved,
  medium_solved,
  hard_solved,
  profile_data,
  created_at,
  updated_at
)
VALUES (
  'test-user-001',
  'alex_codes',
  287,
  156,
  98,
  33,
  '{"ranking": 45678, "contribution_points": 234}',
  NOW(),
  NOW()
)
ON CONFLICT (userid) DO NOTHING;

-- ✅ VERIFICATION QUERIES

-- Check if peer profile was created
SELECT 
  userid,
  display_name,
  title,
  experience_level,
  availability,
  looking_for,
  array_length(skill_tags, 1) as skill_count,
  is_active,
  is_open_to_connections
FROM peer_profiles
WHERE userid = 'test-user-001';

-- Count total active peer profiles
SELECT COUNT(*) as total_active_peers
FROM peer_profiles
WHERE is_active = true AND is_open_to_connections = true;

-- Expected result: Should see at least 2 active peers (you + test user)
-- If you see 2+, matches should start appearing!

-- 🎯 WHAT THIS CREATES:
-- Name: Alex Johnson
-- Title: Senior Full Stack Developer  
-- Experience: 3-5 years
-- Availability: Flexible
-- Looking for: Project partners + Mentorship
-- Skills: React, Node.js, TypeScript, PostgreSQL, Docker, AWS
-- Interests: Web Development, Cloud Computing, System Design
-- LeetCode: 287 problems solved (156 easy, 98 medium, 33 hard)

-- 🔄 TO CREATE MORE TEST USERS:
-- Just copy this script and change:
-- - userid: 'test-user-002', 'test-user-003', etc.
-- - display_name, email, title, bio (make them different)
-- - skills, goals, leetcode stats (vary them for better matching)

-- 🧹 TO REMOVE TEST USER (if needed):
-- DELETE FROM peer_connections WHERE sender_userid = 'test-user-001' OR receiver_userid = 'test-user-001';
-- DELETE FROM peer_match_scores WHERE user1_id = 'test-user-001' OR user2_id = 'test-user-001';
-- DELETE FROM peer_interactions WHERE userid = 'test-user-001' OR peer_userid = 'test-user-001';
-- DELETE FROM peer_profiles WHERE userid = 'test-user-001';
-- DELETE FROM leetcode_profiles WHERE userid = 'test-user-001';
-- DELETE FROM learning_goals WHERE userid = 'test-user-001';
-- DELETE FROM skills WHERE userid = 'test-user-001';
-- DELETE FROM user_profiles WHERE userid = 'test-user-001';
