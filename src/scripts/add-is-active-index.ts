import { qdrant, COLLECTIONS } from '../lib/vector/qdrant.js';

async function addIsActiveIndex() {
  try {
    console.log('Creating is_active index...');
    
    await qdrant.createPayloadIndex(COLLECTIONS.USER_PROFILES, {
      field_name: 'is_active',
      field_schema: 'bool',
    });
    
    console.log('✓ Index created successfully');
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log('✓ Index already exists');
    } else {
      console.error('Failed to create index:', error.message);
      throw error;
    }
  }
}

addIsActiveIndex().catch(console.error);
