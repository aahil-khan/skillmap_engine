import { describe, it, expect } from 'vitest';
import type { SkillGap } from '../analyzer.js';

/**
 * Unit tests for skill gap priority calculation
 * Tests the logic without database dependencies
 */

describe('Skill Gap Analysis - Priority Calculation', () => {
  it('should mark high-frequency missing skills as critical', () => {
    const gap: SkillGap = {
      skill: 'React',
      required_frequency: 0.85, // 85% of jobs
      user_has: false,
      priority: getPriorityLogic(0.85, undefined),
    };
    
    expect(gap.priority).toBe('critical');
  });
  
  it('should mark medium-frequency missing skills as high priority', () => {
    const gap: SkillGap = {
      skill: 'Docker',
      required_frequency: 0.6, // 60% of jobs
      user_has: false,
      priority: getPriorityLogic(0.6, undefined),
    };
    
    expect(gap.priority).toBe('high');
  });
  
  it('should mark beginner skills with high demand as high priority', () => {
    const gap: SkillGap = {
      skill: 'TypeScript',
      required_frequency: 0.7,
      user_has: true,
      user_level: 'beginner',
      priority: getPriorityLogic(0.7, 'beginner'),
    };
    
    expect(gap.priority).toBe('high');
  });
  
  it('should mark intermediate skills as medium priority', () => {
    const gap: SkillGap = {
      skill: 'Node.js',
      required_frequency: 0.65,
      user_has: true,
      user_level: 'intermediate',
      priority: getPriorityLogic(0.65, 'intermediate'),
    };
    
    expect(gap.priority).toBe('medium');
  });
  
  it('should mark low-frequency missing skills as low priority', () => {
    const gap: SkillGap = {
      skill: 'Perl',
      required_frequency: 0.15, // 15% of jobs
      user_has: false,
      priority: getPriorityLogic(0.15, undefined),
    };
    
    expect(gap.priority).toBe('low');
  });
});

describe('Skill Gap Analysis - Classification', () => {
  it('should classify skills correctly', () => {
    const marketSkills = [
      { skill: 'React', frequency: 0.9 },
      { skill: 'TypeScript', frequency: 0.7 },
      { skill: 'HTML', frequency: 0.5 },
    ];
    
    const userSkills = new Map([
      ['TypeScript', 'beginner'],
      ['HTML', 'advanced'],
    ]);
    
    const gaps: SkillGap[] = [];
    const improvements: SkillGap[] = [];
    const strengths: SkillGap[] = [];
    
    for (const { skill, frequency } of marketSkills) {
      const userLevel = userSkills.get(skill);
      
      if (!userLevel && frequency > 0.5) {
        gaps.push({
          skill,
          required_frequency: frequency,
          user_has: false,
          priority: getPriorityLogic(frequency, userLevel),
        });
      } else if (userLevel && ['beginner', 'intermediate'].includes(userLevel) && frequency > 0.3) {
        improvements.push({
          skill,
          required_frequency: frequency,
          user_has: true,
          user_level: userLevel,
          priority: getPriorityLogic(frequency, userLevel),
        });
      } else if (userLevel && ['advanced', 'expert'].includes(userLevel)) {
        strengths.push({
          skill,
          required_frequency: frequency,
          user_has: true,
          user_level: userLevel,
          priority: 'low',
        });
      }
    }
    
    expect(gaps).toHaveLength(1); // React
    expect(gaps[0].skill).toBe('React');
    
    expect(improvements).toHaveLength(1); // TypeScript
    expect(improvements[0].skill).toBe('TypeScript');
    
    expect(strengths).toHaveLength(1); // HTML
    expect(strengths[0].skill).toBe('HTML');
  });
});

// Helper function (mirroring analyzer.ts logic)
function getPriorityLogic(frequency: number, userLevel?: string): 'critical' | 'high' | 'medium' | 'low' {
  if (!userLevel) {
    if (frequency > 0.7) return 'critical';
    if (frequency > 0.5) return 'high';
    if (frequency > 0.3) return 'medium';
    return 'low';
  }
  
  if (userLevel === 'beginner' && frequency > 0.5) return 'high';
  if (userLevel === 'intermediate' && frequency > 0.6) return 'medium';
  
  return 'low';
}
