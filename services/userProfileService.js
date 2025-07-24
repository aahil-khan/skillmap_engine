import { openai } from '../config/openai.js';
import { qdrant } from '../config/qdrant.js';
import { ensureCollection } from '../utils/vectorStore.js';

const COLLECTION_NAME = 'user_profiles';

/**
 * Create or update user profile in vector database
 * @param {Object} profileData - User profile data
 * @returns {Object} Result of the operation
 */
export async function createUserProfile(profileData) {
  try {
    await ensureCollection(COLLECTION_NAME);
    
    const { name, technical_skills, inferred_areas_of_strength, goal, experience, projects } = profileData;
    
    // Check if user profile already exists
    const existing = await qdrant.search(COLLECTION_NAME, {
      vector: new Array(1536).fill(0), // dummy vector
      filter: {
        must: [{ key: "user_name", match: { value: name } }]
      },
      limit: 1
    });
    
    let existingProfileId = null;
    let isUpdate = false;
    
    if (existing && existing.length > 0) {
      existingProfileId = existing[0].id;
      isUpdate = true;
      console.log(`Updating existing profile for user: ${name}`);
    } else {
      console.log(`Creating new profile for user: ${name}`);
    }

    // Build comprehensive user profile text
    const profileText = buildProfileText({
      name,
      technical_skills,
      inferred_areas_of_strength,
      goal,
      experience,
      projects
    });

    // Create skills list with levels for easy matching
    const skillsListWithLevel = {};
    if (technical_skills && Array.isArray(technical_skills)) {
      for (const category of technical_skills) {
        for (const skill of category.skills) {
          skillsListWithLevel[skill.name] = skill.level;
        }
      }
    }

    // Create embedding for the profile
    const embedding = await embedText(profileText);
    
    const point = {
      id: existingProfileId || Date.now(),
      vector: embedding,
      payload: {
        user_name: name,
        profile_text: profileText,
        skills_count: technical_skills ? technical_skills.reduce((total, cat) => total + cat.skills.length, 0) : 0,
        skills_list_with_level: skillsListWithLevel,
        projects_count: projects ? projects.length : 0,
        experience_count: experience ? experience.length : 0,
        learning_goal: goal || '',
        has_learning_goal: !!goal,
        created_at: isUpdate ? existing[0].payload.created_at : new Date().toISOString(),
        updated_at: isUpdate ? new Date().toISOString() : undefined
      }
    };
    
    // Insert or update to Qdrant
    await qdrant.upsert(COLLECTION_NAME, {
      wait: true,
      points: [point]
    });
    
    console.log(`Successfully ${isUpdate ? 'updated' : 'stored'} user profile embedding for: ${name}`);
    
    return {
      success: true,
      message: `User profile ${isUpdate ? 'updated' : 'created'} successfully`,
      user: name,
      profile_text: profileText,
      action: isUpdate ? 'updated' : 'created'
    };
    
  } catch (error) {
    console.error('Error in createUserProfile:', error);
    throw new Error(`Failed to create/update user profile: ${error.message}`);
  }
}

/**
 * Update existing user profile
 * @param {string} name - User name
 * @param {Object} updates - Profile updates
 * @returns {Object} Result of the operation
 */
export async function updateUserProfile(name, updates) {
  // For now, just call createUserProfile which handles updates
  return createUserProfile({ name, ...updates });
}

/**
 * Build profile text for embedding
 * @param {Object} data - Profile data
 * @returns {string} Formatted profile text
 */
function buildProfileText({ name, technical_skills, inferred_areas_of_strength, goal, experience, projects }) {
  let profileText = `Name: ${name}\n`;
  
  // Add skills section
  if (technical_skills && Array.isArray(technical_skills)) {
    const skillsList = [];
    for (const category of technical_skills) {
      for (const skill of category.skills) {
        skillsList.push(`${skill.level} in ${skill.name}`);
      }
    }
    if (skillsList.length > 0) {
      profileText += `Skills: ${skillsList.join(', ')}\n`;
    }
  }
  
  // Add projects section
  if (projects && Array.isArray(projects)) {
    const projectDescriptions = projects.map(project => 
      `${project.name} using ${project.technologies?.join(', ') || 'various technologies'}`
    );
    if (projectDescriptions.length > 0) {
      profileText += `Projects: ${projectDescriptions.join('. ')}\n`;
    }
  }
  
  // Add experience section
  if (experience && Array.isArray(experience)) {
    const experienceDescriptions = experience.map(exp => 
      `${exp.duration || ''} ${exp.role} at ${exp.company} (${exp.technologies?.join(', ') || 'various technologies'})`
    );
    if (experienceDescriptions.length > 0) {
      profileText += `Experience: ${experienceDescriptions.join('. ')}\n`;
    }
  }
  
  // Add learning goals
  if (goal) {
    profileText += `Learning Goals: ${goal}\n`;
  }
  
  // Add areas of strength
  if (inferred_areas_of_strength && Array.isArray(inferred_areas_of_strength)) {
    profileText += `Areas of Strength: ${inferred_areas_of_strength.join(', ')}\n`;
  }

  return profileText;
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
