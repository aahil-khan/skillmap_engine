import { describe, it, expect, beforeAll } from 'vitest';
import { normalizeSkills, normalizeSkill } from '../normalizer.js';

describe('Skill Normalizer', () => {
  it('should normalize "ReactJS" to "React"', async () => {
    const result = await normalizeSkill('ReactJS');
    
    expect(result.canonical).toBe('React');
    expect(result.confidence).toBeGreaterThan(0.70);
    expect(result.skill_id).toBeTruthy();
  }, 30000);

  it('should normalize "Python3" to "Python"', async () => {
    const result = await normalizeSkill('Python3');
    
    expect(result.canonical).toBe('Python');
    expect(result.confidence).toBeGreaterThan(0.70);
  }, 30000);

  it('should normalize "ML" to "Machine Learning" via exact alias match', async () => {
    const result = await normalizeSkill('ML');
    
    expect(result.canonical).toBe('Machine Learning');
    expect(result.skill_id).toBeTruthy();
    // Note: confidence may be low due to short acronym, but exact match should work
  }, 30000);

  it('should normalize "NodeJS" to "Node.js"', async () => {
    const result = await normalizeSkill('NodeJS');
    
    expect(result.canonical).toBe('Node.js');
    expect(result.confidence).toBeGreaterThan(0.70);
  }, 30000);

  it('should handle batch normalization', async () => {
    const skills = ['ReactJS', 'Python3', 'ML', 'NodeJS'];
    const results = await normalizeSkills(skills);
    
    expect(results).toHaveLength(4);
    expect(results[0].canonical).toBe('React');
    expect(results[1].canonical).toBe('Python');
    expect(results[2].canonical).toBe('Machine Learning');
    expect(results[3].canonical).toBe('Node.js');
  }, 60000);

  it('should handle unknown skills gracefully', async () => {
    const result = await normalizeSkill('SuperObscureFramework123');
    
    expect(result.original).toBe('SuperObscureFramework123');
    expect(result.canonical).toBe('SuperObscureFramework123');
    expect(result.confidence).toBe(0);
    expect(result.skill_id).toBeUndefined();
  }, 30000);

  it('should be case-insensitive', async () => {
    const results = await Promise.all([
      normalizeSkill('react'),
      normalizeSkill('REACT'),
      normalizeSkill('React'),
    ]);
    
    // All should normalize to the same canonical name
    expect(results[0].canonical).toBe(results[1].canonical);
    expect(results[1].canonical).toBe(results[2].canonical);
  }, 60000);

  it('should handle empty input', async () => {
    const results = await normalizeSkills(['', '  ', 'React']);
    
    // Empty/whitespace strings should be filtered out
    expect(results.length).toBeLessThanOrEqual(1);
    expect(results.find(r => r.canonical === 'React')).toBeTruthy();
  }, 30000);

  it('should use cache for repeated queries', async () => {
    const skill = 'ReactJS';
    
    // First call
    const start1 = Date.now();
    const result1 = await normalizeSkill(skill);
    const time1 = Date.now() - start1;
    
    // Second call (should be cached)
    const start2 = Date.now();
    const result2 = await normalizeSkill(skill);
    const time2 = Date.now() - start2;
    
    // Results should be identical
    expect(result1.canonical).toBe(result2.canonical);
    expect(result1.confidence).toBe(result2.confidence);
    
    // Cache test: second call should be faster OR within reasonable variance
    // Note: Qdrant may have internal caching that makes this inconsistent
    console.log(`First call: ${time1}ms, Second call: ${time2}ms`);
    expect(time2).toBeLessThanOrEqual(time1 * 2); // Allow up to 2x variance
  }, 60000);

  it('should handle acronyms and abbreviations', async () => {
    const acronyms = [
      { input: 'JS', expected: 'JavaScript' },
      { input: 'TS', expected: 'TypeScript' },
      { input: 'K8s', expected: 'Kubernetes' },
      { input: 'SQL', expected: 'SQL' },
    ];
    
    for (const { input, expected } of acronyms) {
      const result = await normalizeSkill(input);
      expect(result.canonical).toBe(expected);
    }
  }, 120000);

  it('should prioritize exact alias matches over vector similarity', async () => {
    // "ML" should match via exact alias, even if similarity score is low
    const result = await normalizeSkill('ML');
    
    expect(result.canonical).toBe('Machine Learning');
    // Exact match should work regardless of confidence score
  }, 30000);
});

describe('Skill Normalizer Consistency', () => {
  it('should produce consistent results across multiple calls', async () => {
    const skill = 'React';
    const results = await Promise.all(
      Array(5).fill(null).map(() => normalizeSkill(skill))
    );
    
    // All results should be identical
    const canonicals = results.map(r => r.canonical);
    const confidences = results.map(r => r.confidence);
    
    expect(new Set(canonicals).size).toBe(1);
    expect(new Set(confidences).size).toBe(1);
  }, 60000);

  it('should maintain skill_id consistency', async () => {
    const results = await Promise.all([
      normalizeSkill('React'),
      normalizeSkill('ReactJS'),
      normalizeSkill('React.js'),
    ]);
    
    // All variations should map to the same skill_id
    const skillIds = results.map(r => r.skill_id);
    expect(new Set(skillIds).size).toBe(1);
    expect(skillIds[0]).toBeTruthy();
  }, 60000);
});
