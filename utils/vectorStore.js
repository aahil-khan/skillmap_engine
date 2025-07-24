import { qdrant } from '../config/qdrant.js';

/**
 * Ensure a collection exists with proper configuration
 * @param {string} collectionName - Name of the collection
 * @param {Object} config - Collection configuration
 */
export async function ensureCollection(collectionName, config = {}) {
  try {
    // Check if collection exists
    const collections = await qdrant.getCollections();
    const collectionExists = collections.collections.some(
      collection => collection.name === collectionName
    );
    
    if (!collectionExists) {
      console.log(`Creating collection: ${collectionName}`);
      
      const defaultConfig = {
        vectors: {
          size: 1536, // text-embedding-3-small dimension
          distance: 'Cosine'
        }
      };
      
      await qdrant.createCollection(collectionName, { ...defaultConfig, ...config });
      
      // Create indexes for common filterable fields if it's user_profiles
      if (collectionName === 'user_profiles') {
        await createUserProfileIndexes(collectionName);
      }
      
      console.log(`Collection ${collectionName} created successfully`);
    } else {
      console.log(`Collection ${collectionName} already exists - skipping creation`);
    }
    
  } catch (error) {
    console.error(`Error ensuring collection ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Create indexes for user profile collection
 * @param {string} collectionName - Name of the collection
 */
async function createUserProfileIndexes(collectionName) {
  const indexes = [
    { field_name: 'user_name', field_schema: 'keyword' },
    { field_name: 'skills_count', field_schema: 'integer' },
    { field_name: 'projects_count', field_schema: 'integer' },
    { field_name: 'experience_count', field_schema: 'integer' },
    { field_name: 'has_learning_goal', field_schema: 'bool' },
    { field_name: 'created_at', field_schema: 'datetime' }
  ];
  
  for (const index of indexes) {
    try {
      await qdrant.createPayloadIndex(collectionName, index);
      console.log(`Created index for ${index.field_name}`);
    } catch (error) {
      console.warn(`Failed to create index for ${index.field_name}:`, error.message);
    }
  }
}

/**
 * Delete a collection
 * @param {string} collectionName - Name of the collection to delete
 */
export async function deleteCollection(collectionName) {
  try {
    await qdrant.deleteCollection(collectionName);
    console.log(`Collection ${collectionName} deleted successfully`);
  } catch (error) {
    console.error(`Error deleting collection ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Get collection info
 * @param {string} collectionName - Name of the collection
 * @returns {Object} Collection information
 */
export async function getCollectionInfo(collectionName) {
  try {
    const info = await qdrant.getCollection(collectionName);
    return info;
  } catch (error) {
    console.error(`Error getting collection info for ${collectionName}:`, error);
    throw error;
  }
}
