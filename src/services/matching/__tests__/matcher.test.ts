import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findMatchCandidates } from '../matcher.js';
import { qdrant, COLLECTIONS } from '../../../lib/vector/qdrant.js';

vi.mock('../../../lib/vector/qdrant.js', () => ({
  qdrant: {
    retrieve: vi.fn(),
    search: vi.fn(),
  },
  COLLECTIONS: {
    USER_PROFILES: 'user_profiles',
  },
}));

describe('Matcher Service', () => {
  const mockUserId = 'user-123';
  const mockUserVector = Array(1536).fill(0.1);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findMatchCandidates', () => {
    it('should retrieve user vector and search for similar profiles', async () => {
      // Mock user vector retrieval
      (qdrant.retrieve as any).mockResolvedValue([
        {
          id: mockUserId,
          vector: mockUserVector,
          payload: {},
        },
      ]);

      // Mock search results
      const mockCandidates = [
        {
          id: 'candidate-1',
          score: 0.89,
          payload: { user_id: 'candidate-1', is_active: true },
        },
        {
          id: 'candidate-2',
          score: 0.85,
          payload: { user_id: 'candidate-2', is_active: true },
        },
      ];
      (qdrant.search as any).mockResolvedValue(mockCandidates);

      const results = await findMatchCandidates(mockUserId, 100);

      // Verify retrieve was called correctly
      expect(qdrant.retrieve).toHaveBeenCalledWith(COLLECTIONS.USER_PROFILES, {
        ids: [mockUserId],
        with_vectors: true,
      });

      // Verify search was called with correct filters
      expect(qdrant.search).toHaveBeenCalledWith(
        COLLECTIONS.USER_PROFILES,
        expect.objectContaining({
          vector: mockUserVector,
          limit: 100,
          filter: {
            must: [
              { key: 'is_active', match: { value: true } },
              { key: 'is_searchable', match: { value: true } },
            ],
            must_not: [
              { key: 'user_id', match: { value: mockUserId } },
            ],
          },
        })
      );

      // Verify results structure
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        user_id: 'candidate-1',
        similarity_score: 0.89,
        payload: { user_id: 'candidate-1', is_active: true },
      });
    });

    it('should throw error if user vector not found', async () => {
      (qdrant.retrieve as any).mockResolvedValue([]);

      await expect(findMatchCandidates(mockUserId)).rejects.toThrow(
        'User profile embedding not found'
      );
    });

    it('should exclude self from results', async () => {
      (qdrant.retrieve as any).mockResolvedValue([
        { id: mockUserId, vector: mockUserVector, payload: {} },
      ]);
      (qdrant.search as any).mockResolvedValue([]);

      await findMatchCandidates(mockUserId);

      expect(qdrant.search).toHaveBeenCalledWith(
        COLLECTIONS.USER_PROFILES,
        expect.objectContaining({
          filter: expect.objectContaining({
            must_not: [
              { key: 'user_id', match: { value: mockUserId } },
            ],
          }),
        })
      );
    });

    it('should only return active and searchable users', async () => {
      (qdrant.retrieve as any).mockResolvedValue([
        { id: mockUserId, vector: mockUserVector, payload: {} },
      ]);
      (qdrant.search as any).mockResolvedValue([]);

      await findMatchCandidates(mockUserId);

      expect(qdrant.search).toHaveBeenCalledWith(
        COLLECTIONS.USER_PROFILES,
        expect.objectContaining({
          filter: expect.objectContaining({
            must: [
              { key: 'is_active', match: { value: true } },
              { key: 'is_searchable', match: { value: true } },
            ],
          }),
        })
      );
    });

    it('should respect limit parameter', async () => {
      (qdrant.retrieve as any).mockResolvedValue([
        { id: mockUserId, vector: mockUserVector, payload: {} },
      ]);
      (qdrant.search as any).mockResolvedValue([]);

      await findMatchCandidates(mockUserId, 50);

      expect(qdrant.search).toHaveBeenCalledWith(
        COLLECTIONS.USER_PROFILES,
        expect.objectContaining({
          limit: 50,
        })
      );
    });

    it('should handle empty search results', async () => {
      (qdrant.retrieve as any).mockResolvedValue([
        { id: mockUserId, vector: mockUserVector, payload: {} },
      ]);
      (qdrant.search as any).mockResolvedValue([]);

      const results = await findMatchCandidates(mockUserId);

      expect(results).toEqual([]);
    });
  });
});
