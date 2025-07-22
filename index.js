import { openai, qdrant } from "./config.js";
import "dotenv/config";

const COLLECTION_NAME = 'skill_embeddings';

async function testSimilaritySearch(query) {
    // Get embedding for the query using OpenAI
    const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Search Qdrant for similar vectors
    const searchResult = await qdrant.search(COLLECTION_NAME, {
        vector: queryEmbedding,
        top: 10,
        withPayload: true,
    });

    console.log("Similarity search results:", searchResult);
}

async function createStandaloneQuestion(query){
    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
            { 
                role: "system", 
                content: "The input is a user's technical background, including their skills and experiences. Summarize this information into a sharp and concise format, inferring the user's proficiency in each skill and returning a response that reflects their expertise level." 
            },
            { role: "user", content: query }
        ],
        max_tokens: 300,
    });

    return response.choices[0].message.content;
}


// Example usage
const query = "Full-stack developer with projects in Flask, Vue.js, and PostgreSQL. Recently worked on an AI song recommender using OpenAI embeddings. Exploring LangChain and vector DBs. Built CI/CD pipelines for college projects.";
const standaloneQuestion = await createStandaloneQuestion(query);
console.log("Standalone Question:", standaloneQuestion);
await testSimilaritySearch(standaloneQuestion);