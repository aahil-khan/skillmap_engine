import { skill_taxonomy } from "./skill_taxonomy.js";
import { openai, qdrant } from "./config.js";
import "dotenv/config";

const COLLECTION_NAME = 'skill_embeddings';

async function embedSkillTaxonomy() {
    try {
        // Ensure collection exists
        await ensureCollection();
        
        const points = [];
        let skillId = 1;
        
        // Process each skill
        for (const category of skill_taxonomy) {
            for (const skill of category.skills) {
                const text = `${category.category}: ${skill.name} - ${skill.description}`;
                const embedding = await embedText(text);
                
                points.push({
                    id: skillId++,
                    vector: embedding,
                    payload: {
                        category: category.category,
                        skill: skill.name,
                        description: skill.description,
                        content: text
                    }
                });
                
                console.log(`Processed: ${skill.name}`);
            }
        }
        
        // Insert all embeddings to Qdrant
        await qdrant.upsert(COLLECTION_NAME, {
            wait: true,
            points: points
        });
        
        console.log(`Successfully embedded and stored ${points.length} skills in Qdrant collection: ${COLLECTION_NAME}`);
        
    } catch (error) {
        console.error('Error in embedSkillTaxonomy:', error);
    }
}

async function ensureCollection() {
    try {
        // Check if collection exists
        const collections = await qdrant.getCollections();
        const collectionExists = collections.collections.some(
            collection => collection.name === COLLECTION_NAME
        );
        
        if (!collectionExists) {
            console.log(`Creating collection: ${COLLECTION_NAME}`);
            await qdrant.createCollection(COLLECTION_NAME, {
                vectors: {
                    size: 1536, // text-embedding-3-small dimension
                    distance: 'Cosine'
                }
            });
            console.log(`Collection ${COLLECTION_NAME} created successfully`);
        } else {
            console.log(`Collection ${COLLECTION_NAME} already exists`);
        }
    } catch (error) {
        console.error('Error ensuring collection:', error);
        throw error;
    }
}

async function embedText(text) {
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
    });

    return response.data[0].embedding;
}

embedSkillTaxonomy();