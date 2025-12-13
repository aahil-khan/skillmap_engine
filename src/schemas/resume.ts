import { z } from 'zod';

// Pass 1: Raw extraction from resume (as-is, no normalization)
export const ResumeExtractionSchema = z.object({
  personal_info: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin_url: z.string().optional(), // Allow URLs without protocol (common in resumes)
    github_url: z.string().optional(),
    portfolio_url: z.string().optional(),
  }),
  summary: z.string().optional(),
  skills: z.array(z.object({
    name: z.string(),
    proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  })),
  work_experience: z.array(z.object({
    company: z.string(),
    title: z.string(),
    location: z.string().optional(),
    start_date: z.string(), // "2020-01" or "January 2020"
    end_date: z.string().optional(),
    is_current: z.boolean().default(false),
    description: z.string().optional(),
    technologies: z.array(z.string()).default([]),
  })),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    url: z.string().optional(), // Allow URLs without protocol
    github_url: z.string().optional(),
    technologies: z.array(z.string()).default([]),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
  })).default([]),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    field_of_study: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    grade: z.string().optional(),
  })).default([]),
});

export type ResumeExtraction = z.infer<typeof ResumeExtractionSchema>;
