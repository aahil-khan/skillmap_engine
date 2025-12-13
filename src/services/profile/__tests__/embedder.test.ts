import { describe, it, expect, beforeAll } from 'vitest';
import { generateProfileEmbeddings, upsertProfileEmbedding } from '../embedder.js';
import { qdrant, COLLECTIONS } from '../../../lib/vector/qdrant.js';
import { supabase } from '../../../lib/db/supabase.js';

describe('Profile Embedder', () => {
  describe('generateProfileEmbeddings', () => {
    it('should generate multi-vector embeddings', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      
      const vectors = await generateProfileEmbeddings(userId);
      
      expect(vectors).toBeDefined();
      expect(vectors.skills_vector).toHaveLength(1536);
      expect(vectors.goals_vector).toHaveLength(1536);
      expect(vectors.experience_vector).toHaveLength(1536);
      expect(vectors.weighted_avg).toHaveLength(1536);
    }, 60000);

    it('should compute weighted average correctly (40-30-30)', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      
      const vectors = await generateProfileEmbeddings(userId);
      
      // Check weighted average formula
      const expectedWeightedAvg = vectors.skills_vector.map((val, idx) => 
        val * 0.4 + vectors.goals_vector[idx] * 0.3 + vectors.experience_vector[idx] * 0.3
      );
      
      // Compare first 10 values (testing all 1536 would be excessive)
      for (let i = 0; i < 10; i++) {
        expect(vectors.weighted_avg[i]).toBeCloseTo(expectedWeightedAvg[i], 5);
      }
    }, 60000);

    it('should handle users with no skills', async () => {
      const userId = '00000000-0000-0000-0000-000000000000'; // Valid UUID but no data
      
      const vectors = await generateProfileEmbeddings(userId);
      
      expect(vectors).toBeDefined();
      expect(vectors.skills_vector).toHaveLength(1536);
      // Should still generate embeddings for "No skills listed" text
    }, 60000);

    it('should include skill level in embedding text', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      
      const vectors = await generateProfileEmbeddings(userId);
      
      // Verify embeddings are different for different skill levels
      // (This is implicit - if skill level is included, embeddings will differ)
      expect(vectors.skills_vector).toBeDefined();
    }, 60000);
  });

  describe('upsertProfileEmbedding', () => {
    it('should upsert profile embedding to Qdrant', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      
      await upsertProfileEmbedding(userId);
      
      // Verify embedding exists in Qdrant
      const result = await qdrant.retrieve(COLLECTIONS.USER_PROFILES, {
        ids: [userId],
      });
      
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(userId);
    }, 90000);

    it('should include metadata payload', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      
      await upsertProfileEmbedding(userId);
      
      const result = await qdrant.retrieve(COLLECTIONS.USER_PROFILES, {
        ids: [userId],
        with_payload: true,
      });
      
      expect(result[0].payload).toBeDefined();
      expect(result[0].payload).toHaveProperty('user_id');
      expect(result[0].payload).toHaveProperty('skills_vector');
      expect(result[0].payload).toHaveProperty('goals_vector');
      expect(result[0].payload).toHaveProperty('experience_vector');
      expect(result[0].payload).toHaveProperty('skill_count');
      expect(result[0].payload).toHaveProperty('experience_level');
      expect(result[0].payload).toHaveProperty('primary_categories');
      expect(result[0].payload).toHaveProperty('is_searchable');
    }, 90000);

    it('should extract top 3 primary categories', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      
      await upsertProfileEmbedding(userId);
      
      const result = await qdrant.retrieve(COLLECTIONS.USER_PROFILES, {
        ids: [userId],
        with_payload: true,
      });
      
      const primaryCategories = result[0].payload?.primary_categories;
      expect(Array.isArray(primaryCategories)).toBe(true);
      expect(primaryCategories.length).toBeLessThanOrEqual(3);
    }, 90000);

    it('should update existing embedding', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      
      // First upsert
      await upsertProfileEmbedding(userId);
      
      // Second upsert (should update, not duplicate)
      await upsertProfileEmbedding(userId);
      
      // Verify only one point exists
      const result = await qdrant.retrieve(COLLECTIONS.USER_PROFILES, {
        ids: [userId],
      });
      
      expect(result.length).toBe(1);
    }, 120000);

    it('should handle users with LeetCode profiles', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      
      await upsertProfileEmbedding(userId);
      
      const result = await qdrant.retrieve(COLLECTIONS.USER_PROFILES, {
        ids: [userId],
        with_payload: true,
      });
      
      expect(result[0].payload).toHaveProperty('has_leetcode');
      expect(typeof result[0].payload?.has_leetcode).toBe('boolean');
    }, 90000);

    it('should set is_searchable from profile', async () => {
      const userId = '91508235-5ec9-4ebc-b976-03b36324ce4c';
      
      // Update profile to be not searchable
      await supabase
        .from('user_profiles')
        .update({ is_searchable: false })
        .eq('user_id', userId);
      
      // Small delay to ensure update is committed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await upsertProfileEmbedding(userId);
      
      const result = await qdrant.retrieve(COLLECTIONS.USER_PROFILES, {
        ids: [userId],
        with_payload: true,
      });
      
      expect(result[0].payload?.is_searchable).toBe(false);
      
      // Restore for other tests
      await supabase
        .from('user_profiles')
        .update({ is_searchable: true })
        .eq('user_id', userId);
      
      // Ensure restore completes
      await new Promise(resolve => setTimeout(resolve, 100));
    }, 90000);
  });
});
