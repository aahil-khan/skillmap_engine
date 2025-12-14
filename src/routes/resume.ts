import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import { processResume } from '../services/resume/index.js';
import { ValidationError } from '../utils/errors.js';

const app = new Hono();

app.post('/upload', authenticate, async (c) => {
  const userId = c.get('userId');
  const authHeader = c.req.header('Authorization');
  const userToken = authHeader?.substring(7); // Remove 'Bearer '
  
  if (!userToken) {
    throw new ValidationError('Missing authentication token');
  }
  
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
  
  const result = await processResume(userId, buffer, file.name, userToken);
  
  return c.json({
    message: 'Resume processed successfully',
    ...result,
  });
});

export default app;
