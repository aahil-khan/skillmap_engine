import { skill_taxonomy } from '../taxonomy/skill_taxonomy.js';
import { openai } from '../config/openai.js';
import { qdrant } from '../config/qdrant.js';
import { ensureCollection } from '../utils/vectorStore.js';
import 'dotenv/config';

const COLLECTION_NAME = 'skill_embeddings';

/**
 * Seed the skill taxonomy into the vector database
 */
async function seedSkillTaxonomy() {
  try {
    console.log('🌱 Starting skill taxonomy seeding...');
    
    // Ensure collection exists
    await ensureCollection(COLLECTION_NAME);
    
    const points = [];
    let skillId = 1;
    
    // Process each skill in the taxonomy
    for (const category of skill_taxonomy) {
      console.log(`Processing category: ${category.category}`);
      
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
        
        console.log(`  ✓ Processed: ${skill.name}`);
      }
    }
    
    // Insert all embeddings to Qdrant
    console.log(`💾 Inserting ${points.length} skill embeddings to Qdrant...`);
    
    await qdrant.upsert(COLLECTION_NAME, {
      wait: true,
      points: points
    });
    
    console.log(`✅ Successfully seeded ${points.length} skills in collection: ${COLLECTION_NAME}`);
    
  } catch (error) {
    console.error('❌ Error seeding skill taxonomy:', error);
    process.exit(1);
  }
}

/**
 * Create text embedding using OpenAI
 * @param {string} text - Text to embed
 * @returns {Array} Embedding vector
 */
async function embedText(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

// Run the seeding
seedSkillTaxonomy();
