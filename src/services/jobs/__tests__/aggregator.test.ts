import { describe, it, expect, beforeAll } from 'vitest';
import { analyzeSkillFrequencies } from '../aggregator.js';
import { generateTaxonomyBasedFrequencies } from '../taxonomyFallback.js';

describe('Job Market - Skill Frequency Analysis', () => {
  it('should calculate frequencies correctly', async () => {
    const skills = ['React', 'React', 'TypeScript', 'React', 'Node.js'];
    const totalJobs = 4;
    
    const frequencies = await analyzeSkillFrequencies(skills, totalJobs);
    
    // React appears 3 times out of 4 jobs = 0.75
    expect(frequencies.length).toBeGreaterThan(0);
    
    const react = frequencies.find(f => f.canonical_name === 'React');
    expect(react).toBeDefined();
    expect(react?.frequency).toBeCloseTo(0.75, 2);
    expect(react?.occurrences).toBe(3);
  });

  it('should sort by frequency descending', async () => {
    const skills = ['React', 'React', 'React', 'TypeScript', 'TypeScript', 'Node.js'];
    const frequencies = await analyzeSkillFrequencies(skills, 3);
    
    // React should be first (3 occurrences)
    expect(frequencies[0].canonical_name).toBe('React');
    expect(frequencies[0].frequency).toBe(1.0); // 3/3 = 100%
  });

  it('should handle empty skills array', async () => {
    const frequencies = await analyzeSkillFrequencies([], 5);
    expect(frequencies).toEqual([]);
  });

  it('should normalize skills before counting', async () => {
    // Test that ReactJS, React, react.js all normalize to "React"
    const skills = ['ReactJS', 'React', 'react.js', 'TypeScript'];
    const frequencies = await analyzeSkillFrequencies(skills, 4);
    
    // Should have normalized all React variants
    const reactCount = frequencies.filter(f => 
      f.canonical_name.toLowerCase().includes('react')
    ).length;
    
    // Should result in 1 canonical "React" entry
    expect(reactCount).toBeLessThanOrEqual(1);
  });
});

describe('Job Market - Taxonomy Fallback', () => {
  it('should generate frequencies from Phase 1 taxonomy', () => {
    const frequencies = generateTaxonomyBasedFrequencies('Frontend Developer');
    
    expect(frequencies.length).toBeGreaterThan(0);
    expect(frequencies[0]).toHaveProperty('canonical_name');
    expect(frequencies[0]).toHaveProperty('frequency');
    expect(frequencies[0]).toHaveProperty('source', 'taxonomy');
  });

  it('should return frequencies between 0 and 1', () => {
    const frequencies = generateTaxonomyBasedFrequencies();
    
    frequencies.forEach(f => {
      expect(f.frequency).toBeGreaterThanOrEqual(0);
      expect(f.frequency).toBeLessThanOrEqual(1);
    });
  });

  it('should sort by frequency descending', () => {
    const frequencies = generateTaxonomyBasedFrequencies();
    
    for (let i = 0; i < frequencies.length - 1; i++) {
      expect(frequencies[i].frequency).toBeGreaterThanOrEqual(frequencies[i + 1].frequency);
    }
  });
});
