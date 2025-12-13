import { Hono } from 'hono';
import { normalizeSkills } from '../services/taxonomy/normalizer.js';
import { z } from 'zod';

const testRoutes = new Hono();

// Schema for request validation
const normalizeSkillsSchema = z.object({
  skills: z.array(z.string()).min(1, 'At least one skill is required'),
});

// Test endpoint for skill normalization
testRoutes.post('/normalize-skills', async (c) => {
  try {
    const body = await c.req.json();
    
    // Validate request
    const parsed = normalizeSkillsSchema.parse(body);
    
    // Normalize skills
    const results = await normalizeSkills(parsed.skills);
    
    return c.json(results);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return c.json(
        { error: 'Validation failed', details: error.errors },
        400
      );
    }
    
    return c.json(
      { error: 'Normalization failed', message: error.message },
      500
    );
  }
});

export default testRoutes;
