-- Check the current schema of the resumes table
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'resumes'
ORDER BY ordinal_position;
