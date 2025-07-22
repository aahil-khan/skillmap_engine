import OpenAI from 'openai';
import { QdrantClient } from '@qdrant/js-client-rest';
import 'dotenv/config';

/** OpenAI config */
if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI API key is missing or invalid.");
export const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
});

/** Qdrant config */
if (!process.env.QDRANT_URL) throw new Error("Qdrant URL is missing or invalid.");
export const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY
});
