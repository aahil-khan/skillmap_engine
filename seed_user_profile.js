import { openai, qdrant } from "./config.js";
import "dotenv/config";
import express from 'express';
import cors from 'cors';


const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

const COLLECTION_NAME = 'user_profiles';

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
            
            // Create indexes for filterable fields
            await qdrant.createPayloadIndex(COLLECTION_NAME, {
                field_name: 'user_name',
                field_schema: 'keyword'
            });
            
            await qdrant.createPayloadIndex(COLLECTION_NAME, {
                field_name: 'skills_count',
                field_schema: 'integer'
            });

            await qdrant.createPayloadIndex(COLLECTION_NAME, {
                field_name: 'skills_description',
                field_schema: 'text'
            });
            
            await qdrant.createPayloadIndex(COLLECTION_NAME, {
                field_name: 'projects_count',
                field_schema: 'integer'
            });
            
            await qdrant.createPayloadIndex(COLLECTION_NAME, {
                field_name: 'experience_count',
                field_schema: 'integer'
            });
            
            await qdrant.createPayloadIndex(COLLECTION_NAME, {
                field_name: 'has_learning_goal',
                field_schema: 'bool'
            });
            
            await qdrant.createPayloadIndex(COLLECTION_NAME, {
                field_name: 'created_at',
                field_schema: 'datetime'
            });
            
            console.log(`Collection ${COLLECTION_NAME} created successfully with indexes`);
        } else {
            console.log(`Collection ${COLLECTION_NAME} already exists`);
        }
    } catch (error) {
        console.error('Error ensuring collection:', error);
        throw error;
    }
}


app.post('/send_user_profile', async (req, res) => {
    try {
        await ensureCollection();
        
        const data = req.body;
        const { name, technical_skills, inferred_areas_of_strength, goal, experience, projects } = data;

        const existing = await qdrant.search(COLLECTION_NAME, {
            vector: new Array(1536).fill(0), // dummy vector of dimension 1536
            filter: {
            must: [
                {
                key: "user_name",
                match: { value: name }
                }
            ]
            },
            limit: 1
        });
        if (existing && existing.length > 0) {
            return res.status(409).json({ error: 'User profile already exists' });
        }
        
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        
        // Build comprehensive user profile text
        let profileText = `Name: ${name}\n`;
        
        // Add skills section
        const skillsListwithlevel = {};
        if (technical_skills && Array.isArray(technical_skills)) {
            const skillList = [];
            for (const category of technical_skills) {
            for (const skill of category.skills) {
                skillsListwithlevel[skill.name] = skill.level;
                skillList.push(skill.name);
            }
            }
            if (skillList.length > 0) {
                profileText += `Skills: ${skillList.join(', ')}\n`;
            }
        }
        
        // Add projects section
        // if (projects && Array.isArray(projects)) {
        //     const projectDescriptions = projects.map(project => 
        //         `${project.name} using ${project.technologies.join(', ')}`
        //     );
        //     if (projectDescriptions.length > 0) {
        //         profileText += `Projects: ${projectDescriptions.join('. ')}\n`;
        //     }
        // }
        
        // Add experience section
        // if (experience && Array.isArray(experience)) {
        //     const experienceDescriptions = experience.map(exp => 
        //         `${exp.duration} ${exp.role} at ${exp.company} (${exp.technologies.join(', ')})`
        //     );
        //     if (experienceDescriptions.length > 0) {
        //         profileText += `Experience: ${experienceDescriptions.join('. ')}\n`;
        //     }
        // }
        
        // Add learning goals
        if (goal) {
            profileText += `Learning Goals: ${goal}\n`;
        }
        
        // Add areas of strength
        if (inferred_areas_of_strength && Array.isArray(inferred_areas_of_strength)) {
            profileText += `Areas of Strength: ${inferred_areas_of_strength.join(', ')}\n`;
        }

        // Create single embedding for the complete profile
        const embedding = await embedText(profileText);
        
        const point = {
            id: Date.now(),
            vector: embedding,
            payload: {
                user_name: name,
                profile_text: profileText,
                skills_count: technical_skills ? technical_skills.reduce((total, cat) => total + cat.skills.length, 0) : 0,
                skills_list_with_level: skillsListwithlevel,
                // projects_count: projects ? projects.length : 0,
                // experience_count: experience ? experience.length : 0,
                learning_goal: goal || '',
                created_at: new Date().toISOString()
            }
        };
        
        // Insert to Qdrant
        await qdrant.upsert(COLLECTION_NAME, {
            wait: true,
            points: [point]
        });
        
        console.log(`Successfully stored user profile embedding for: ${name}`);
        console.log(`Profile text:\n${profileText}`);
        
        res.json({
            success: true,
            message: `User profile processed successfully`,
            user: name,
            profile_text: profileText
        });
        
    } catch (error) {
        console.error('Error in /send_user_profile:', error);
        res.status(500).json({ error: 'Failed to send user profile' });
    }
});

async function embedText(text) {
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
    });
    return response.data[0].embedding;
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'User profile service is running' });
});

// Start server
app.listen(PORT, () => {
    console.log(`User profile server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Send profile endpoint: http://localhost:${PORT}/send_user_profile`);
});