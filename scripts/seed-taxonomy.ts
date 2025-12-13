import 'dotenv/config';
import { seedSkillTaxonomy } from '../src/services/taxonomy/seeder.js';
import logger from '../src/utils/logger.js';

async function main() {
  try {
    logger.info('🌱 Starting skill taxonomy seed...');
    
    const result = await seedSkillTaxonomy();
    
    logger.info('✅ Seed complete!', {
      supabase: result.supabaseCount,
      qdrant: result.qdrantCount,
    });
    
    process.exit(0);
  } catch (error) {
    logger.error('❌ Seed failed', { error });
    process.exit(1);
  }
}

main();
