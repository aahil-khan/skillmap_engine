/**
 * Validation Schemas using Zod
 * Defines input validation for all API endpoints
 */

import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Log validation errors to file
 */
function logValidationError(context, body, errors) {
  try {
    const timestamp = new Date().toISOString();
    const logFile = path.join(logsDir, 'validation-errors.log');
    
    const logEntry = {
      timestamp,
      context,
      bodyKeys: Object.keys(body || {}),
      bodyStructure: body,
      errors: errors,
    };
    
    const logLine = `\n${'='.repeat(80)}\n[${timestamp}] ${context}\n${JSON.stringify(logEntry, null, 2)}\n`;
    
    fs.appendFileSync(logFile, logLine, 'utf8');
    console.log(`\n*** VALIDATION ERROR LOGGED TO: ${logFile} ***\n`);
  } catch (err) {
    console.error('[logValidationError] Failed to write log:', err.message);
  }
}

// ============================================
// Common Schemas
// ============================================

const uuidSchema = z.string().uuid('Invalid user ID format');

const skillLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);

const skillSchema = z.object({
  name: z.string().min(1, 'Skill name is required').max(100),
  level: skillLevelSchema.optional(),
});

const technicalSkillCategorySchema = z.object({
  category: z.string().min(1, 'Category name is required').max(100),
  // Support both formats: array of strings OR array of objects with name/level
  skills: z.union([
    z.array(z.string().min(1)),  // Resume format: ["Python", "Java"]
    z.array(z.object({           // Skills page format: [{name: "Python", level: "beginner"}]
      name: z.string().min(1),
      level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    }))
  ]),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced']).optional(), // Category-level for resume format
});

const experienceSchema = z.object({
  company: z.string().min(1).max(200).optional(),
  role: z.string().min(1).max(200).optional(),
  duration: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  technologies: z.array(z.string()).optional(),
  // Also support the resume analysis format
  total_years: z.number().optional(),
  recent_roles: z.array(z.object({
    title: z.string(),
    company: z.string(),
    duration: z.string(),
  })).optional(),
});

const projectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  technologies: z.array(z.string()).optional(),
  link: z.string().url().optional().or(z.literal('')),
});

// ============================================
// Resume Upload Schema
// ============================================

export const resumeUploadSchema = z.object({
  // File validation happens in multer middleware
  // This schema is for any additional body params if needed
});

// ============================================
// User Profile Schema
// ============================================

export const userProfileSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),
  
  technical_skills: z.array(technicalSkillCategorySchema)
    .min(1, 'At least one skill category is required')
    .optional(),
  
  inferred_areas_of_strength: z.array(z.string().max(100))
    .optional(),
  
  goal: z.string()
    .min(10, 'Goal must be at least 10 characters')
    .max(500, 'Goal must be less than 500 characters')
    .optional(),
  
  // Support both array format and object format for experience
  experience: z.union([
    z.array(experienceSchema),
    experienceSchema
  ]).optional(),
  
  projects: z.array(projectSchema)
    .optional(),
  
  // Optional fields from resume analysis
  education: z.array(z.object({
    degree: z.string().optional(),
    institution: z.string().optional(),
    year: z.string().optional(),
  })).optional(),
});

// ============================================
// Skill Gap Analysis Schema
// ============================================

export const skillGapAnalysisSchema = z.object({
  // Uses authenticated user ID, no body params needed
});

// ============================================
// Skill Search Schema
// ============================================

export const skillSearchSchema = z.object({
  query: z.string()
    .min(2, 'Search query must be at least 2 characters')
    .max(200, 'Search query must be less than 200 characters'),
  
  limit: z.number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit must be at most 50')
    .optional()
    .default(10),
});

// ============================================
// Convert to Standalone Schema
// ============================================

export const convertToStandaloneSchema = z.object({
  goal: z.string()
    .min(5, 'Goal must be at least 5 characters')
    .max(500, 'Goal must be less than 500 characters'),
});

// ============================================
// LeetCode Schemas
// ============================================

export const leetcodeUsernameParamSchema = z.object({
  username: z.string()
    .min(1, 'Username is required')
    .max(50, 'Username must be less than 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
});

export const leetcodeUsernameSchema = z.object({
  username: z.string()
    .min(1, 'Username is required')
    .max(50, 'Username must be less than 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
});

export const leetcodeStatsSchema = z.object({
  username: z.string()
    .min(1, 'Username is required')
    .max(50, 'Username must be less than 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
});

export const leetcodeSubmissionsSchema = z.object({
  username: z.string()
    .min(1, 'Username is required')
    .max(50, 'Username must be less than 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  
  limit: z.number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must be at most 100')
    .optional()
    .default(5),
});

// ============================================
// Helper Functions
// ============================================

/**
 * Validate request body against a schema
 * Throws ValidationError if validation fails
 */
export function validateBody(schema) {
  return (req, res, next) => {
    console.log('\n========== VALIDATE BODY CALLED ==========');
    console.log('Request body keys:', Object.keys(req.body || {}));
    
    try {
      const validated = schema.parse(req.body);
      console.log('✓ Validation passed');
      req.validatedBody = validated;
      next();
    } catch (error) {
      console.log('✗ Validation FAILED');
      
      if (error instanceof z.ZodError) {
        console.log('Zod validation errors:', JSON.stringify(error.errors, null, 2));
        
        // Log validation errors to file
        logValidationError('validateBody', req.body, error.errors);
        
        const validationError = new ValidationError(
          'Validation failed',
          error.errors?.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })) || [{ field: 'unknown', message: error.message }]
        );
        next(validationError);
      } else {
        console.error('Non-Zod error:', error.message);
        logValidationError('validateBody - Non-Zod Error', req.body, [{ error: error.message, stack: error.stack }]);
        next(error);
      }
    }
  };
}

/**
 * Validate request params against a schema
 */
export function validateParams(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.params);
      req.validatedParams = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError(
          'Parameter validation failed',
          error.errors?.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })) || [{ field: 'unknown', message: error.message }]
        );
        next(validationError);
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate request query params against a schema
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    try {
      // Convert string query params to appropriate types
      const query = { ...req.query };
      if (query.limit) query.limit = parseInt(query.limit, 10);
      
      const validated = schema.parse(query);
      req.validatedQuery = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError(
          'Query parameter validation failed',
          error.errors?.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })) || [{ field: 'unknown', message: error.message }]
        );
        next(validationError);
      } else {
        next(error);
      }
    }
  };
}

// Import ValidationError from errors.js
import { ValidationError } from '../utils/errors.js';
