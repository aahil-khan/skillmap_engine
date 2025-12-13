import { z } from 'zod';

export const ProfileUpdateSchema = z.object({
  display_name: z.string().min(2).max(100).optional(),
  bio: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  timezone: z.string().optional(),
  experience_level: z.enum(['entry', '1-3years', '3-5years', '5+years']).optional(),
  is_searchable: z.boolean().optional(),
});

export const PeerPreferencesSchema = z.object({
  available_days: z.array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])).optional(),
  preferred_time_slots: z.array(z.enum(['morning', 'afternoon', 'evening', 'night'])).optional(),
  preferred_collaboration_types: z.array(z.enum(['project', 'study', 'mentor', 'learn'])).optional(),
  communication_preferences: z.array(z.string()).optional(),
  is_accepting_requests: z.boolean().optional(),
});

export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;
export type PeerPreferences = z.infer<typeof PeerPreferencesSchema>;
