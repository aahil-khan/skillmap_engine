/**
 * AI Response Validation Schemas
 * 
 * Zod schemas to validate OpenAI responses and prevent crashes from
 * malformed, incomplete, or hallucinated outputs.
 */

import { z } from 'zod';
import logger from '../utils/logger.js';

/**
 * Safely extract content from OpenAI response
 * @param {Object} response - OpenAI API response
 * @returns {string} Message content
 * @throws {Error} If response structure is invalid
 */
export function extractOpenAIContent(response) {
  if (!response) {
    throw new Error('OpenAI response is null or undefined');
  }

  // Validate response structure
  if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
    logger.error('Invalid OpenAI response structure', { 
      hasChoices: !!response.choices,
      choicesType: typeof response.choices,
      choicesLength: response.choices?.length,
      responseKeys: Object.keys(response || {})
    });
    throw new Error('Invalid response from OpenAI: missing or empty choices array');
  }

  if (!response.choices[0].message || !response.choices[0].message.content) {
    logger.error('Invalid OpenAI message structure', {
      hasMessage: !!response.choices[0].message,
      hasContent: !!response.choices[0].message?.content,
      messageKeys: Object.keys(response.choices[0].message || {})
    });
    throw new Error('Invalid response from OpenAI: missing message content');
  }

  return response.choices[0].message.content;
}

/**
 * Resume Analysis Schema
 * Validates the structure of resume parsing results
 */
export const resumeAnalysisSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  
  technical_skills: z.array(
    z.object({
      category: z.string().min(1),
      skills: z.array(z.string().min(1)).min(1, 'At least one skill required per category'),
      level: z.enum(['Beginner', 'Intermediate', 'Advanced']),
    })
  ).min(1, 'At least one technical skill category required'),
  
  inferred_areas_of_strength: z.array(z.string().min(1)).default([]),
  
  experience: z.object({
    total_years: z.number().min(0).max(70),
    recent_roles: z.array(
      z.object({
        title: z.string().min(1),
        company: z.string().min(1),
        duration: z.string().min(1),
      })
    ).default([]),
  }).default({ total_years: 0, recent_roles: [] }),
  
  projects: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      technologies: z.array(z.string()).default([]),
    })
  ).default([]),
  
  education: z.array(
    z.object({
      degree: z.string().min(1),
      institution: z.string().min(1),
      year: z.string().optional(),
    })
  ).default([]),
});

/**
 * Skill Gap Analysis Schema
 * Validates skill gap analysis results
 */
export const skillGapAnalysisSchema = z.object({
  goal_category: z.string().min(1, 'Goal category is required'),
  
  strengths: z.array(z.string()).default([]),
  
  strengths_summary: z.string().default(''),
  
  missing_skills: z.array(
    z.object({
      skill: z.string().min(1),
      reason: z.string().min(1),
    })
  ).default([]),
  
  skills_to_improve: z.array(
    z.object({
      skill: z.string().min(1),
      current_level: z.string().min(1),
      advice: z.string().min(1),
    })
  ).default([]),
  
  learning_path: z.array(z.string()).default([]),
  
  next_steps: z.string().default(''),
});

/**
 * ATS Score Schema
 * Validates ATS scoring results
 */
export const atsScoreSchema = z.object({
  overall_score: z.number().min(0).max(100),
  
  breakdown: z.object({
    skills_match: z.number().min(0).max(100),
    experience_match: z.number().min(0).max(100),
    education_match: z.number().min(0).max(100).optional(), // Optional for flexibility
    keyword_match: z.number().min(0).max(100).optional(),   // Optional fallback
    formatting: z.number().min(0).max(100).optional(),      // Optional fallback
  }),
  
  strengths: z.array(z.string()).min(1, 'At least one strength required'),
  
  improvements: z.array(z.string()).min(1, 'At least one improvement required'),
  
  missing_keywords: z.array(z.string()).default([]),
  
  recommendations: z.array(z.string()).default([]),
});

/**
 * Standalone Goal Conversion Schema
 * Validates converted goal text
 */
export const standaloneGoalSchema = z.object({
  original_goal: z.string().min(1),
  
  standalone_goal: z.string().min(5, 'Standalone goal too short'),
  
  key_requirements: z.array(z.string()).default([]),
  
  suggested_skills: z.array(z.string()).default([]),
});

/**
 * LeetCode Problem Suggestion Schema
 * Validates problem recommendations
 */
export const leetcodeSuggestionSchema = z.object({
  problems: z.array(
    z.object({
      title: z.string().min(1),
      difficulty: z.enum(['Easy', 'Medium', 'Hard']),
      topics: z.array(z.string()).min(1),
      reason: z.string().min(1),
      priority: z.enum(['High', 'Medium', 'Low']).default('Medium'),
      leetcode_link: z.string().url().optional(),
    })
  ).min(1, 'At least one problem suggestion required').max(10, 'Too many suggestions'),
  
  focus_areas: z.array(z.string()).default([]),
  
  learning_path: z.array(z.string()).default([]),
});

/**
 * Helper function to validate and parse AI response
 * @param {Object} response - Raw AI response
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {string} context - Context for error messages
 * @returns {Object} Validated data
 * @throws {ValidationError} If validation fails
 */
export function validateAIResponse(response, schema, context = 'AI response') {
  try {
    // Try to parse if it's a string
    const data = typeof response === 'string' ? JSON.parse(response) : response;
    
    // Validate with schema
    const result = schema.safeParse(data);
    
    if (!result.success) {
      console.error(`${context} validation failed:`, result.error.format());
      
      // Get first error message safely
      const firstError = result.error.errors?.[0];
      const errorMessage = firstError 
        ? `${firstError.path.join('.')}: ${firstError.message}`
        : 'Unknown validation error';
      
      throw new Error(`Invalid ${context} structure: ${errorMessage}`);
    }
    
    return result.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${context}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Helper function to safely extract JSON from AI response
 * Sometimes AI wraps JSON in markdown code blocks
 * @param {string} text - Raw AI response text
 * @returns {Object} Parsed JSON
 */
export function extractJSON(text) {
  // Remove markdown code blocks if present
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cleanedText = jsonMatch ? jsonMatch[1].trim() : text.trim();
  
  try {
    return JSON.parse(cleanedText);
  } catch (error) {
    // Try to find JSON object in the text
    const objectMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }
    throw new Error('No valid JSON found in response');
  }
}

/**
 * Create a fallback response for when AI fails
 */
export const FALLBACK_RESPONSES = {
  resumeAnalysis: {
    name: 'Unknown',
    technical_skills: [{
      category: 'General',
      skills: ['Unable to extract skills'],
      level: 'Beginner'
    }],
    inferred_areas_of_strength: [],
    experience: { total_years: 0, recent_roles: [] },
    projects: [],
    education: [],
  },
  
  skillGapAnalysis: {
    goal: 'Unknown Goal',
    current_skills: [],
    required_skills: [],
    skill_gaps: [{
      skill: 'Unable to analyze',
      importance: 'Low',
      learning_resources: []
    }],
    matched_skills: [],
    recommendations: ['Please try again with more details'],
    estimated_time_to_goal: 'Unknown',
  },
  
  atsScore: {
    overall_score: 0,
    breakdown: {
      keyword_match: 0,
      experience_match: 0,
      skills_match: 0,
      formatting: 0,
    },
    strengths: ['Unable to analyze'],
    improvements: ['Please try again'],
    missing_keywords: [],
    recommendations: [],
  },
};

export default {
  resumeAnalysisSchema,
  skillGapAnalysisSchema,
  atsScoreSchema,
  standaloneGoalSchema,
  leetcodeSuggestionSchema,
  validateAIResponse,
  extractJSON,
  FALLBACK_RESPONSES,
};
