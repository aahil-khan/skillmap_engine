BEGIN;

-- ============================================================================
-- Test User ID (already exists in auth.users)
-- ============================================================================
-- 91508235-5ec9-4ebc-b976-03b36324ce4c
-- ============================================================================

-- ---------------------------------------------------------
-- Clean up existing test data
-- ---------------------------------------------------------
DELETE FROM peer_preferences WHERE user_id = '91508235-5ec9-4ebc-b976-03b36324ce4c';
DELETE FROM learning_goals   WHERE user_id = '91508235-5ec9-4ebc-b976-03b36324ce4c';
DELETE FROM education       WHERE user_id = '91508235-5ec9-4ebc-b976-03b36324ce4c';
DELETE FROM projects        WHERE user_id = '91508235-5ec9-4ebc-b976-03b36324ce4c';
DELETE FROM work_experience WHERE user_id = '91508235-5ec9-4ebc-b976-03b36324ce4c';
DELETE FROM user_skills     WHERE user_id = '91508235-5ec9-4ebc-b976-03b36324ce4c';
DELETE FROM user_profiles   WHERE user_id = '91508235-5ec9-4ebc-b976-03b36324ce4c';

-- ---------------------------------------------------------
-- User profile
-- ---------------------------------------------------------
INSERT INTO user_profiles (
  user_id,
  display_name,
  email,
  bio,
  location,
  timezone,
  experience_level,
  is_active,
  is_searchable,
  profile_completed,
  avatar_url
)
VALUES (
  '91508235-5ec9-4ebc-b976-03b36324ce4c',
  'Test User',
  'test.user@skillmap.dev',
  'Full-stack developer testing SkillMap features',
  'San Francisco, CA',
  'America/Los_Angeles',
  '3-5years',
  TRUE,
  TRUE,
  TRUE,
  'https://api.dicebear.com/7.x/avataaars/svg?seed=test'
);

-- ---------------------------------------------------------
-- User skills (taxonomy must already contain these)
-- ---------------------------------------------------------
INSERT INTO user_skills (
  user_id,
  skill_id,
  skill_level,
  years_experience,
  source
)
SELECT
  '91508235-5ec9-4ebc-b976-03b36324ce4c',
  id,
  'intermediate',
  2,
  'resume'
FROM skills_taxonomy
WHERE canonical_name IN ('React', 'TypeScript', 'Node.js', 'PostgreSQL')
ON CONFLICT (user_id, skill_id) DO NOTHING;

-- ---------------------------------------------------------
-- Work experience
-- ---------------------------------------------------------
INSERT INTO work_experience (
  user_id,
  company_name,
  job_title,
  start_date,
  end_date,
  is_current,
  description,
  technologies
)
VALUES (
  '91508235-5ec9-4ebc-b976-03b36324ce4c',
  'TestCorp',
  'Full Stack Developer',
  '2022-01-01',
  NULL,
  TRUE,
  'Worked on scalable web systems using modern JS stacks',
  ARRAY['React', 'TypeScript', 'Node.js']
);

-- ---------------------------------------------------------
-- Project
-- ---------------------------------------------------------
INSERT INTO projects (
  user_id,
  project_name,
  description,
  technologies,
  start_date,
  end_date,
  is_featured
)
VALUES (
  '91508235-5ec9-4ebc-b976-03b36324ce4c',
  'SkillMap Test Project',
  'Internal project for testing matching and resume parsing',
  ARRAY['React', 'PostgreSQL', 'Supabase'],
  '2023-01-01',
  NULL,
  TRUE
);

-- ---------------------------------------------------------
-- Education
-- ---------------------------------------------------------
INSERT INTO education (
  user_id,
  institution_name,
  degree,
  field_of_study,
  start_date,
  end_date
)
VALUES (
  '91508235-5ec9-4ebc-b976-03b36324ce4c',
  'Test University',
  'Bachelor',
  'Computer Science',
  '2018-08-01',
  '2022-05-31'
);

-- ---------------------------------------------------------
-- Learning goal
-- ---------------------------------------------------------
INSERT INTO learning_goals (
  user_id,
  original_goal,
  refined_goal,
  target_role,
  status,
  progress_percentage
)
VALUES (
  '91508235-5ec9-4ebc-b976-03b36324ce4c',
  'Improve system design',
  'Learn scalable backend and distributed systems',
  'Senior Software Engineer',
  'active',
  25
);

-- ---------------------------------------------------------
-- Peer preferences
-- ---------------------------------------------------------
INSERT INTO peer_preferences (
  user_id,
  available_days,
  preferred_time_slots,
  preferred_collaboration_types,
  communication_preferences,
  is_accepting_requests
)
VALUES (
  '91508235-5ec9-4ebc-b976-03b36324ce4c',
  ARRAY['monday', 'wednesday', 'friday'],
  ARRAY['evening'],
  ARRAY['project', 'study'],
  ARRAY['discord'],
  TRUE
);

COMMIT;