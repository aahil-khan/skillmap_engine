import { Hono } from 'hono';
import '../types/hono.js'; // Type declarations for Hono context
import { authenticate } from '../middleware/auth.js';
import { processResume } from '../services/resume/index.js';
import { ValidationError } from '../utils/errors.js';
import { createClient } from '@supabase/supabase-js';

const app = new Hono();

app.post('/upload', authenticate, async (c) => {
  const userId = c.get('userId');
  
  // Get file from multipart form
  const body = await c.req.parseBody();
  const file = body['resume'] as File;
  
  if (!file) {
    throw new ValidationError('Resume file is required');
  }
  
  if (file.type !== 'application/pdf') {
    throw new ValidationError('Only PDF files are supported');
  }
  
  if (file.size > 5 * 1024 * 1024) { // 5MB limit
    throw new ValidationError('File size must be less than 5MB');
  }
  
  // Convert to Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  const result = await processResume(userId, buffer, file.name);
  
  return c.json({
    message: 'Resume processed successfully',
    ...result,
  });
});

app.get('/', authenticate, async (c) => {
  const userId = c.get('userId');
  
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  // Get resume
  const { data: resume, error: resumeError } = await supabase
    .from('resumes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (resumeError || !resume) {
    return c.json({ error: 'No resume found for this user' }, 404);
  }
  
  // Get skills
  const { data: skills } = await supabase
    .from('user_skills')
    .select(`
      *,
      skill:skills_taxonomy(*)
    `)
    .eq('user_id', userId);
  
  // Get work experience
  const { data: workExperience } = await supabase
    .from('work_experience')
    .select('*')
    .eq('user_id', userId)
    .order('start_date', { ascending: false });
  
  // Get projects
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId);
  
  // Get education
  const { data: education } = await supabase
    .from('education')
    .select('*')
    .eq('user_id', userId)
    .order('start_date', { ascending: false });
  
  return c.json({
    resume: {
      id: resume.id,
      filename: resume.filename,
      content_hash: resume.content_hash,
      created_at: resume.created_at,
    },
    skills: skills || [],
    work_experience: workExperience || [],
    projects: projects || [],
    education: education || [],
  });
});

export default app;
