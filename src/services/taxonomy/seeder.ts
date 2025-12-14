import { supabase } from '../../lib/db/supabase.js';
import { qdrant, COLLECTIONS } from '../../lib/vector/qdrant.js';
import { createBatchEmbeddings } from '../../lib/llm/openai.js';
import { CORE_SKILLS } from '../../data/core-skills.js';
import logger from '../../utils/logger.js';

export async function seedSkillTaxonomy() {
  logger.info('Starting skill taxonomy seeding...');

  try {
    // Step 1: Insert skills into Supabase
    logger.info('Inserting skills into Supabase...');
    
    const skillsToInsert = CORE_SKILLS.map(skill => ({
      canonical_name: skill.canonical_name,
      category: skill.category,
      subcategory: skill.subcategory,
      aliases: skill.aliases,
      job_demand_frequency: skill.job_demand_frequency,
      value_weight: skill.value_weight,
      commonly_paired_with: skill.commonly_paired_with || [],
      prerequisites: skill.prerequisites || [],
    }));

    const { data: insertedSkills, error: insertError } = await supabase
      .from('skills_taxonomy')
      .upsert(skillsToInsert, {
        onConflict: 'canonical_name',
        ignoreDuplicates: false,
      })
      .select();

    if (insertError) {
      throw insertError;
    }

    logger.info(`Inserted ${insertedSkills.length} skills into Supabase`);

    // Step 2: Generate embeddings for skills (including aliases for better matching)
    logger.info('Generating embeddings...');
    
    // Create embedding text that emphasizes aliases for better matching
    const skillTexts = insertedSkills.map(skill => {
      // Combine canonical name with all aliases for rich semantic matching
      const allNames = [skill.canonical_name, ...skill.aliases].join(', ');
      return allNames;
    });

    const embeddings = await createBatchEmbeddings(skillTexts);
    
    logger.info(`Generated ${embeddings.length} embeddings`);

    // Step 3: Upsert embeddings to Qdrant
    logger.info('Upserting embeddings to Qdrant...');
    
    const points = insertedSkills.map((skill, index) => ({
      id: skill.id,
      vector: embeddings[index],
      payload: {
        skill_id: skill.id,
        canonical_name: skill.canonical_name,
        category: skill.category,
        aliases: skill.aliases,
        job_demand_frequency: skill.job_demand_frequency,
      },
    }));

    await qdrant.upsert(COLLECTIONS.SKILL_TAXONOMY, {
      wait: true,
      points,
    });

    logger.info(`Upserted ${points.length} skill vectors to Qdrant`);
    logger.info('✅ Skill taxonomy seeding complete!');

    return {
      supabaseCount: insertedSkills.length,
      qdrantCount: points.length,
    };
  } catch (error) {
    logger.error('Skill taxonomy seeding failed', { error });
    throw error;
  }
}
