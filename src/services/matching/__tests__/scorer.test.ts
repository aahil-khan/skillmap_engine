import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateMatchScore } from '../scorer.js';
import { supabase } from '../../../lib/db/supabase.js';
import { createEmbedding } from '../../../lib/llm/openai.js';

vi.mock('../../../lib/db/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('../../../lib/llm/openai.js', () => ({
  createEmbedding: vi.fn(),
}));

describe('Scorer Service', () => {
  const mockUserId = 'user-123';
  const mockCandidateId = 'candidate-456';
  const mockCandidatePayload = {
    skills_vector: Array(1536).fill(0.5),
    goals_vector: Array(1536).fill(0.6),
    experience_vector: Array(1536).fill(0.4),
    experience_level: '1-3years',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create proper Supabase chain mocks
  const createSupabaseMock = (config: {
    userSkills?: any[];
    candidateSkills?: any[];
    learningGoals?: any[];
    userProfile?: any;
    userPreferences?: any;
    candidatePreferences?: any;
  }) => {
    let skillsCallCount = 0;
    let prefsCallCount = 0;

    return vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'user_skills') {
        const data = skillsCallCount === 0 
          ? (config.userSkills || [])
          : (config.candidateSkills || []);
        skillsCallCount++;
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data }),
          }),
        } as any;
      }
      
      if (table === 'learning_goals') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: config.learningGoals || [] }),
            }),
          }),
        } as any;
      }
      
      if (table === 'user_profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ 
                data: config.userProfile || { experience_level: 'entry' } 
              }),
            }),
          }),
        } as any;
      }
      
      if (table === 'peer_preferences') {
        const data = prefsCallCount === 0
          ? config.userPreferences
          : config.candidatePreferences;
        prefsCallCount++;
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data }),
            }),
          }),
        } as any;
      }
      
      return {} as any;
    });
  };

  describe('calculateMatchScore', () => {
    it('should calculate 100% shared skills when all skills overlap', async () => {
      // Mock user and candidate with identical skills
      const mockSkills = [
        { skill_id: 'skill-1', skill_level: 'intermediate' },
        { skill_id: 'skill-2', skill_level: 'advanced' },
      ];

      createSupabaseMock({
        userSkills: mockSkills,
        candidateSkills: mockSkills,
      });

      const result = await calculateMatchScore(mockUserId, mockCandidateId, mockCandidatePayload);

      expect(result.factors.shared_skills_score).toBe(100);
    });

    it('should calculate 50% shared skills with partial overlap', async () => {
      // User has 4 skills, 2 overlap with candidate
      const userSkills = [
        { skill_id: 'skill-1', skill_level: 'intermediate' },
        { skill_id: 'skill-2', skill_level: 'advanced' },
        { skill_id: 'skill-3', skill_level: 'beginner' },
        { skill_id: 'skill-4', skill_level: 'intermediate' },
      ];

      const candidateSkills = [
        { skill_id: 'skill-1', skill_level: 'intermediate' },
        { skill_id: 'skill-2', skill_level: 'advanced' },
        { skill_id: 'skill-5', skill_level: 'expert' },
      ];

      createSupabaseMock({
        userSkills,
        candidateSkills,
      });

      const result = await calculateMatchScore(mockUserId, mockCandidateId, mockCandidatePayload);

      expect(result.factors.shared_skills_score).toBe(50); // 2 out of 4 skills shared
    });

    it('should calculate complementary skills using semantic matching', async () => {
      const mockGoalsEmbedding = Array(1536).fill(0.7);
      
      vi.mocked(createEmbedding).mockResolvedValue(mockGoalsEmbedding);

      const learningGoals = [
        { refined_goal: 'Learn React and frontend development', original_goal: 'React' },
      ];

      createSupabaseMock({
        userSkills: [],
        candidateSkills: [],
        learningGoals,
      });

      const result = await calculateMatchScore(mockUserId, mockCandidateId, mockCandidatePayload);

      // Should call createEmbedding for user's goals
      expect(createEmbedding).toHaveBeenCalledWith('Learn React and frontend development');
      
      // Should have some complementary score (not exactly predictable due to cosine similarity)
      expect(result.factors.complementary_skills_score).toBeGreaterThanOrEqual(0);
      expect(result.factors.complementary_skills_score).toBeLessThanOrEqual(100);
    });

    it('should use neutral complementary score when no learning goals', async () => {
      createSupabaseMock({
        userSkills: [],
        candidateSkills: [],
        learningGoals: [],
      });

      const result = await calculateMatchScore(mockUserId, mockCandidateId, mockCandidatePayload);

      expect(result.factors.complementary_skills_score).toBe(50); // Neutral fallback
      expect(createEmbedding).not.toHaveBeenCalled();
    });

    it('should calculate 100% experience compatibility for same level', async () => {
      createSupabaseMock({
        userSkills: [],
        candidateSkills: [],
        userProfile: { experience_level: '1-3years' },
      });

      const result = await calculateMatchScore(mockUserId, mockCandidateId, mockCandidatePayload);

      expect(result.factors.experience_compatibility_score).toBe(100);
    });

    it('should penalize experience compatibility for large gaps', async () => {
      const largeDiffPayload = {
        ...mockCandidatePayload,
        experience_level: '5+years', // Level 3, user is 'entry' (level 0) = 3 level gap
      };

      createSupabaseMock({
        userSkills: [],
        candidateSkills: [],
        userProfile: { experience_level: 'entry' }, // Level 0
      });

      const result = await calculateMatchScore(mockUserId, mockCandidateId, largeDiffPayload);

      // Gap of 3 levels: 100 - (3 * 25) = 25
      expect(result.factors.experience_compatibility_score).toBe(25);
    });
  });

  describe('Availability Matching', () => {
    it('should calculate availability match based on overlapping days', async () => {
      const userPrefs = {
        available_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
        preferred_time_slots: ['morning'],
      };
      const candidatePrefs = {
        available_days: ['Monday', 'Tuesday'],
        preferred_time_slots: ['morning'],
      };

      createSupabaseMock({
        userSkills: [],
        candidateSkills: [],
        userPreferences: userPrefs,
        candidatePreferences: candidatePrefs,
      });

      const result = await calculateMatchScore(mockUserId, mockCandidateId, mockCandidatePayload);

      // 2 overlapping days out of 4 user days = 50%
      expect(result.factors.availability_match_score).toBe(50);
    });

    it('should use neutral availability score when no preferences set', async () => {
      createSupabaseMock({
        userSkills: [],
        candidateSkills: [],
        userPreferences: null,
        candidatePreferences: null,
      });

      const result = await calculateMatchScore(mockUserId, mockCandidateId, mockCandidatePayload);

      expect(result.factors.availability_match_score).toBe(50); // Neutral default
    });
  });

  describe('Weighted Total Score', () => {
    it('should calculate weighted total score correctly', async () => {
      createSupabaseMock({
        userSkills: [],
        candidateSkills: [],
      });

      const result = await calculateMatchScore(mockUserId, mockCandidateId, mockCandidatePayload);

      // Verify total is weighted sum
      const expectedTotal =
        result.factors.shared_skills_score * 0.30 +
        result.factors.complementary_skills_score * 0.25 +
        result.factors.goal_alignment_score * 0.20 +
        result.factors.experience_compatibility_score * 0.15 +
        result.factors.availability_match_score * 0.10;

      expect(result.total_score).toBeCloseTo(expectedTotal, 1);
    });

    it('should return scores between 0 and 100', async () => {
      createSupabaseMock({
        userSkills: [],
        candidateSkills: [],
      });

      const result = await calculateMatchScore(mockUserId, mockCandidateId, mockCandidatePayload);

      expect(result.total_score).toBeGreaterThanOrEqual(0);
      expect(result.total_score).toBeLessThanOrEqual(100);
      
      Object.values(result.factors).forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });
    });
  });
});
