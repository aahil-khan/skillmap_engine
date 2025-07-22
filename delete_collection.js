import { qdrant } from "./config.js";

const COLLECTION_NAME = 'user_profiles';

async function deleteCollection() {
    try {
        await qdrant.deleteCollection(COLLECTION_NAME);
        console.log(`Collection ${COLLECTION_NAME} deleted successfully`);
    } catch (error) {
        console.error('Error deleting collection:', error);
    }
}

deleteCollection();