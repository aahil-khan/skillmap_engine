import { openai } from '../config/openai.js';
import { qdrant } from '../config/qdrant.js';
import { ensureCollection } from '../utils/vectorStore.js';
import { supabase } from '../config/supabase.js';
import { atsScore } from './atsService.js';

const COLLECTION_NAME = 'user_profiles';

/**
 * Create or update user profile in vector database
 * @param {Object} profileData - User profile data
 * @returns {Object} Result of the operation
 */
export async function createUserProfile(profileData) {
  try {
    await ensureCollection(COLLECTION_NAME);
    
    const { user_id, name, technical_skills, inferred_areas_of_strength, goal, experience, projects } = profileData;
    
    // Check if user profile already exists
    const existing = await qdrant.search(COLLECTION_NAME, {
      vector: new Array(1536).fill(0), // dummy vector
      filter: {
        must: [{ key: "user_id", match: { value: user_id } }]
      },
      limit: 1
    });
    
    let existingProfileId = null;
    let isUpdate = false;
    
    if (existing && existing.length > 0) {
      existingProfileId = existing[0].id;
      isUpdate = true;
      console.log(`Updating existing profile for user: ${user_id} ${name}`);
    } else {
      console.log(`Creating new profile for user: ${user_id} ${name}`);
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
        user_id,
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

    if (user_id && goal) {
      try {
        console.log("updating goal in database");
        const { data, error } = await supabase
          .from('resumes')
          .update({ current_goal: goal })
          .eq('userid', user_id);

        if (error) {
          console.error('Error storing goal in database:', error);
        } else {
          console.log('Goal successfully stored/updated in database for user:', user_id);
        }
      } catch (dbError) {
        console.error('Database operation failed:', dbError);
      }
    } else {
      console.log("didnt find user ID or goal");
    }

    //calculate and store ats score
    const ats_score_raw = await atsScore(user_id);

    const ats_score_value = typeof ats_score_raw === 'string'
      ? Number(ats_score_raw.replace('%', '').trim())
      : Number(ats_score_raw);


    if (typeof ats_score_value === 'number') {
      console.log('ATS Score calculated successfully:', ats_score_value);

      //store/update ats score
      try {
        console.log("updating ats score in database");
        const { data, error } = await supabase
          .from('resumes')
          .update({ ats_score: ats_score_value })
          .eq('userid', user_id);

        if (error) {
          console.error('Error storing ATS score in database:', error);
        } else {
          console.log('ATS score successfully stored/updated in database for user:', user_id);
        }
      } catch (dbError) {
        console.error('Database operation failed:', dbError);
      }
    } else {
      console.log('Failed to calculate ATS Score');
    }

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
      if (category.skills && Array.isArray(category.skills)) {
        for (const skill of category.skills) {
          skillsList.push(`${skill.level} in ${skill.name}`);
        }
      }
    }
    if (skillsList.length > 0) {
      profileText += `Skills: ${skillsList.join(', ')}\n`;
    }
  }
  
  // Add projects section
  if (projects && Array.isArray(projects)) {
    const projectDescriptions = projects.map(project => {
      let techString = 'various technologies';
      if (Array.isArray(project.technologies)) {
        techString = project.technologies.join(', ');
      } else if (typeof project.technologies === 'string') {
        techString = project.technologies;
      }
      return `${project.name} using ${techString}`;
    });
    if (projectDescriptions.length > 0) {
      profileText += `Projects: ${projectDescriptions.join('. ')}\n`;
    }
  }
  
  // Add experience section
  if (experience && Array.isArray(experience)) {
    const experienceDescriptions = experience.map(exp => {
      let techString = 'various technologies';
      if (Array.isArray(exp.technologies)) {
        techString = exp.technologies.join(', ');
      } else if (typeof exp.technologies === 'string') {
        techString = exp.technologies;
      }
      return `${exp.duration || ''} ${exp.role} at ${exp.company} (${techString})`;
    });
    if (experienceDescriptions.length > 0) {
      profileText += `Experience: ${experienceDescriptions.join('. ')}\n`;
    }
  }
  
  // Add learning goals
  if (goal) {
    profileText += `Learning Goals: ${goal}\n`;
  }
  
  // Add areas of strength
  if (inferred_areas_of_strength) {
    let strengthString = '';
    if (Array.isArray(inferred_areas_of_strength)) {
      strengthString = inferred_areas_of_strength.join(', ');
    } else if (typeof inferred_areas_of_strength === 'string') {
      strengthString = inferred_areas_of_strength;
    }
    if (strengthString) {
      profileText += `Areas of Strength: ${strengthString}\n`;
    }
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
