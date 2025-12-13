import { describe, it, expect, beforeAll, vi } from 'vitest';
import { getUserProfile, updateUserProfile, updatePeerPreferences, getPeerPreferences } from '../index.js';
import { supabase } from '../../../lib/db/supabase.js';
import { NotFoundError } from '../../../utils/errors.js';

describe('Profile Service', () => {
  describe('getUserProfile', () => {
    it('should retrieve complete profile with related data', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      
      const profile = await getUserProfile(userId);
      
      expect(profile).toBeDefined();
      expect(profile.user_id).toBe(userId);
      expect(profile).toHaveProperty('skills');
      expect(profile).toHaveProperty('work_experience');
      expect(profile).toHaveProperty('projects');
      expect(profile).toHaveProperty('education');
      expect(profile).toHaveProperty('learning_goals');
    }, 30000);

    it('should throw NotFoundError for non-existent user', async () => {
      const userId = 'non-existent-user';
      
      await expect(getUserProfile(userId)).rejects.toThrow(NotFoundError);
    }, 10000);
  });

  describe('updateUserProfile', () => {
    it('should update profile fields', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      const updates = {
        display_name: 'John Doe Updated',
        bio: 'Senior Developer',
        experience_level: '5+years' as const,
      };
      
      const updated = await updateUserProfile(userId, updates);
      
      expect(updated).toBeDefined();
      expect(updated.display_name).toBe(updates.display_name);
      expect(updated.bio).toBe(updates.bio);
      expect(updated.experience_level).toBe(updates.experience_level);
    }, 30000);

    it('should handle partial updates', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      const updates = {
        is_searchable: false,
      };
      
      const updated = await updateUserProfile(userId, updates);
      
      expect(updated).toBeDefined();
      expect(updated.is_searchable).toBe(false);
    }, 30000);

    it('should update timestamp on profile update', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      const beforeUpdate = new Date();
      
      const updates = {
        display_name: 'Test Update',
      };
      
      const updated = await updateUserProfile(userId, updates);
      
      const updatedAt = new Date(updated.updated_at);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    }, 30000);
  });

  describe('updatePeerPreferences', () => {
    it('should create preferences if none exist', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      const preferences = {
        available_days: ['monday', 'wednesday', 'friday'] as const,
        preferred_time_slots: ['evening', 'night'] as const,
        is_accepting_requests: true,
      };
      
      // First clear any existing preferences
      await supabase
        .from('peer_preferences')
        .delete()
        .eq('user_id', userId);
      
      const created = await updatePeerPreferences(userId, preferences);
      
      expect(created).toBeDefined();
      expect(created.user_id).toBe(userId);
      expect(created.available_days).toEqual(preferences.available_days);
      expect(created.is_accepting_requests).toBe(true);
    }, 30000);

    it('should update existing preferences', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      const newPreferences = {
        available_days: ['tuesday', 'thursday'] as const,
        preferred_collaboration_types: ['mentor', 'project'] as const,
      };
      
      const updated = await updatePeerPreferences(userId, newPreferences);
      
      expect(updated).toBeDefined();
      expect(updated.available_days).toEqual(newPreferences.available_days);
    }, 30000);

    it('should handle communication preferences', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      const preferences = {
        communication_preferences: ['discord', 'slack', 'zoom'],
      };
      
      const updated = await updatePeerPreferences(userId, preferences);
      
      expect(updated.communication_preferences).toEqual(preferences.communication_preferences);
    }, 30000);
  });

  describe('getPeerPreferences', () => {
    it('should retrieve existing preferences', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      
      const preferences = await getPeerPreferences(userId);
      
      if (preferences) {
        expect(preferences.user_id).toBe(userId);
        expect(preferences).toHaveProperty('available_days');
        expect(preferences).toHaveProperty('is_accepting_requests');
      }
    }, 30000);

    it('should return null for non-existent preferences', async () => {
      const userId = '00000000-0000-0000-0000-000000000000'; // Valid UUID format but doesn't exist
      
      const preferences = await getPeerPreferences(userId);
      
      expect(preferences).toBeNull();
    }, 10000);
  });
});
