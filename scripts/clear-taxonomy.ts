import 'dotenv/config';
import { supabase } from '../src/lib/db/supabase.js';
import { qdrant, COLLECTIONS } from '../src/lib/vector/qdrant.js';
import logger from '../src/utils/logger.js';

async function clearTaxonomy() {
  logger.info('🧹 Clearing skill taxonomy data...');

  try {
    // Step 1: Delete from Supabase
    logger.info('Deleting skills from Supabase...');
    const { error: deleteError } = await supabase
      .from('skills_taxonomy')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      logger.error('Failed to delete from Supabase', { error: deleteError });
      throw deleteError;
    }
    logger.info('✅ Cleared Supabase skills_taxonomy table');

    // Step 2: Delete Qdrant collection and recreate it
    logger.info('Recreating Qdrant skill_taxonomy collection...');
    try {
      await qdrant.deleteCollection(COLLECTIONS.SKILL_TAXONOMY);
      logger.info('Deleted existing collection');
    } catch (error: any) {
      if (error?.status === 404) {
        logger.info('Collection already deleted or does not exist');
      } else {
        throw error;
      }
    }

    // Recreate the collection
    await qdrant.createCollection(COLLECTIONS.SKILL_TAXONOMY, {
      vectors: {
        size: 1536,
        distance: 'Cosine',
      },
    });

    // Add payload indexes
    await qdrant.createPayloadIndex(COLLECTIONS.SKILL_TAXONOMY, {
      field_name: 'canonical_name',
      field_schema: 'keyword',
    });

    await qdrant.createPayloadIndex(COLLECTIONS.SKILL_TAXONOMY, {
      field_name: 'category',
      field_schema: 'keyword',
    });

    logger.info('✅ Recreated Qdrant skill_taxonomy collection');
    logger.info('🎉 Taxonomy cleared successfully! Ready for re-seeding.');
  } catch (error) {
    logger.error('Failed to clear taxonomy', { error });
    process.exit(1);
  }
}

clearTaxonomy();
