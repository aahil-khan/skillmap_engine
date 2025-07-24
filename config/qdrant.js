import { QdrantClient } from '@qdrant/js-client-rest';
import 'dotenv/config';

if (!process.env.QDRANT_URL) throw new Error("Qdrant URL is missing or invalid.");
export const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY
});