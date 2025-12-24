import { CORE_SKILLS } from '../../data/core-skills.js';
import logger from '../../utils/logger.js';

export interface SkillFrequency {
  skill: string;
  canonical_name: string;
  frequency: number;
  occurrences: number;
  source: 'taxonomy' | 'jobs';
}

/**
 * Generate skill frequencies from Phase 1 taxonomy when user doesn't provide jobs
 * Uses job_demand_frequency and value_weight from core-skills.ts
 */
export function generateTaxonomyBasedFrequencies(
  targetRole?: string
): SkillFrequency[] {
  logger.info({  targetRole  }, 'Using taxonomy fallback for skill frequencies');
  
  // Map taxonomy skills to frequency format
  // job_demand_frequency: 0.1-0.9 scale → convert to 10-90% frequency
  const frequencies: SkillFrequency[] = CORE_SKILLS.map(skill => ({
    skill: skill.canonical_name,
    canonical_name: skill.canonical_name,
    frequency: skill.job_demand_frequency / 100, // Convert 0-100 scale to 0-1
    occurrences: Math.round(skill.job_demand_frequency), // Simulated count
    source: 'taxonomy' as const,
  }));
  
  // Sort by frequency (demand) descending
  frequencies.sort((a, b) => b.frequency - a.frequency);
  
  logger.info({  
    skillCount: frequencies.length,
    topSkill: frequencies[0]?.canonical_name,
    topFrequency: frequencies[0]?.frequency
   }, 'Taxonomy frequencies generated');
  
  return frequencies;
}
