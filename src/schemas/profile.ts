import { z } from 'zod';

export const LearningGoalSchema = z.object({
  original_goal: z.string().min(1),
  refined_goal: z.string().optional(),
  target_proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  timeframe: z.enum(['1month', '3months', '6months', '1year', 'ongoing']).optional(),
});

export const ProfileUpdateSchema = z.object({
  display_name: z.string().min(2).max(100).optional(),
  bio: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  timezone: z.string().optional(),
  experience_level: z.enum(['entry', '1-3years', '3-5years', '5+years']).optional(),
  is_searchable: z.boolean().optional(),
  learning_goals: z.array(LearningGoalSchema).optional(),
  preferences: z.object({
    available_days: z.array(z.string()).optional(),
    preferred_time_slots: z.array(z.string()).optional(),
    preferred_collaboration_types: z.array(z.string()).optional(),
    communication_preferences: z.array(z.string()).optional(),
    is_accepting_requests: z.boolean().optional(),
  }).optional(),
});

export const PeerPreferencesSchema = z.object({
  available_days: z.array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])).optional(),
  preferred_time_slots: z.array(z.enum(['morning', 'afternoon', 'evening', 'night'])).optional(),
  preferred_collaboration_types: z.array(z.enum(['project', 'study', 'mentor', 'learn'])).optional(),
  communication_preferences: z.array(z.string()).optional(),
  is_accepting_requests: z.boolean().optional(),
  matching_preference: z.enum(['mentor', 'peer', 'mentee', 'balanced']).optional(),
});

export type LearningGoal = z.infer<typeof LearningGoalSchema>;
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;
export type PeerPreferences = z.infer<typeof PeerPreferencesSchema>;
