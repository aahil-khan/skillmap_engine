/**
 * Validation Schemas using Zod
 * Defines input validation for all API endpoints
 */

import { z } from 'zod';

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
  skills: z.array(z.string().min(1)).min(1, 'At least one skill is required'),
});

const experienceSchema = z.object({
  company: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  duration: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  technologies: z.array(z.string()).optional(),
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
  
  experience: z.array(experienceSchema)
    .optional(),
  
  projects: z.array(projectSchema)
    .optional(),
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
    try {
      const validated = schema.parse(req.body);
      req.validatedBody = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError(
          'Validation failed',
          error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          }))
        );
        next(validationError);
      } else {
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
          error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          }))
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
          error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          }))
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
