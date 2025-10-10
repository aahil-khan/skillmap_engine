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
        // Handle both formats: array of strings or array of objects
        const categoryLevel = category.level || 'Intermediate'; // default level
        
        if (Array.isArray(category.skills)) {
          for (const skill of category.skills) {
            if (typeof skill === 'string') {
              // Resume format: skills are strings, level is on category
              skillsListWithLevel[skill] = categoryLevel;
            } else if (skill.name) {
              // Object format: skill has name and level properties
              skillsListWithLevel[skill.name] = skill.level || categoryLevel;
            }
          }
        }
      }
    }

    // Create embedding for the profile
    const embedding = await embedText(profileText);
    
    // Calculate experience count based on format
    let experienceCount = 0;
    if (experience) {
      if (Array.isArray(experience)) {
        experienceCount = experience.length;
      } else if (experience.recent_roles && Array.isArray(experience.recent_roles)) {
        experienceCount = experience.recent_roles.length;
      }
    }
    
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
        experience_count: experienceCount,
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

    // Store learning goal in the learning_goals table (not in resumes)
    if (user_id && goal) {
      try {
        console.log("Storing learning goal in database");
        
        // Check if goal already exists
        const { data: existingGoal } = await supabase
          .from('learning_goals')
          .select('id')
          .eq('userid', user_id)
          .eq('refined_goal', goal)
          .single();

        if (!existingGoal) {
          const { data, error } = await supabase
            .from('learning_goals')
            .insert({
              userid: user_id,
              original_goal: goal,
              refined_goal: goal,
              status: 'active'
            });

          if (error) {
            console.error('Error storing goal in database:', error);
          } else {
            console.log('Goal successfully stored in database for user:', user_id);
          }
        } else {
          console.log('Goal already exists for user:', user_id);
        }
      } catch (dbError) {
        console.error('Database operation failed:', dbError);
      }
    } else {
      console.log("No user ID or goal provided");
    }

    // Calculate and store ATS score (resume should exist by now if user uploaded one)
    if (user_id) {
      try {
        console.log("Calculating ATS score");
        const ats_score_raw = await atsScore(user_id);
        console.log("ATS score raw", ats_score_raw);
        
        // Extract the overall_score from the ATS result object
        const ats_score_value = ats_score_raw?.overall_score 
          ? Number(ats_score_raw.overall_score)
          : (typeof ats_score_raw === 'string'
              ? Number(ats_score_raw.replace('%', '').trim())
              : Number(ats_score_raw));

        if (typeof ats_score_value === 'number' && !isNaN(ats_score_value)) {
          console.log('ATS Score calculated successfully:', ats_score_value);
          // Note: atsService.js already stores the score in both resumes and ats_history tables
        } else {
          console.log('Failed to parse ATS Score value');
        }
      } catch (atsError) {
        console.warn('ATS score calculation failed (user may not have uploaded resume yet):', atsError.message);
        // Don't throw - allow profile creation to continue without ATS score
      }
    }


    //store skills in database
    if (user_id && technical_skills && Array.isArray(technical_skills)) {
      try {
      console.log("storing skills in database");
      // Flatten skills from all categories
      const skillsToUpsert = [];
      for (const category of technical_skills) {
        const categoryLevel = category.level || 'Intermediate'; // Default level from category
        const categoryName = category.category || 'General';
        
        if (category.skills && Array.isArray(category.skills)) {
          for (const skill of category.skills) {
            if (typeof skill === 'string') {
              // String format (after validation transform or resume format)
              skillsToUpsert.push({
                userid: user_id,
                skill_name: skill,
                skill_level: categoryLevel.toLowerCase(), // Normalize to lowercase
                skill_category: categoryName
              });
            } else if (skill.name) {
              // Object format with name/level properties
              skillsToUpsert.push({
                userid: user_id,
                skill_name: skill.name,
                skill_level: (skill.level || categoryLevel).toLowerCase(), // Normalize to lowercase
                skill_category: categoryName
              });
            }
          }
        } else if (category.skills && typeof category.skills === 'object' && category.skills.name) {
          // Handle case where skills is a single object, not array
          skillsToUpsert.push({
            userid: user_id,
            skill_name: category.skills.name,
            skill_level: (category.skills.level || categoryLevel).toLowerCase(),
            skill_category: categoryName
          });
        }
      }

      if (skillsToUpsert.length > 0) {
        console.log('Upserting skills:', skillsToUpsert.length);
        const { data, error } = await supabase
        .from('skills')
        .upsert(
          skillsToUpsert,
          { onConflict: ['userid', 'skill_name'] }
        );

        if (error) {
        console.error('Error storing skills in database:', error);
        } else {
        console.log('Skills successfully stored/updated in database for user:', user_id);
        }
      } else {
        console.log("No skills to upsert for user:", user_id);
      }
      } catch (dbError) {
      console.error('Database operation failed:', dbError);
      }
    } else {
      console.log("didnt find user ID or skills");
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
      const categoryLevel = category.level || 'Intermediate';
      const categoryName = category.category || 'General';
      
      if (category.skills && Array.isArray(category.skills)) {
        for (const skill of category.skills) {
          if (typeof skill === 'string') {
            // Resume format: skills are strings, level is on category
            skillsList.push(`${categoryLevel} in ${skill} (${categoryName})`);
          } else if (skill.name) {
            // Object format: skill has name and level properties
            const skillLevel = skill.level || categoryLevel;
            skillsList.push(`${skillLevel} in ${skill.name} (${categoryName})`);
          }
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
  if (experience) {
    let experienceDescriptions = [];
    
    if (Array.isArray(experience)) {
      // Array format (manual input)
      experienceDescriptions = experience.map(exp => {
        let techString = 'various technologies';
        if (Array.isArray(exp.technologies)) {
          techString = exp.technologies.join(', ');
        } else if (typeof exp.technologies === 'string') {
          techString = exp.technologies;
        }
        return `${exp.duration || ''} ${exp.role} at ${exp.company} (${techString})`;
      });
    } else if (experience.recent_roles && Array.isArray(experience.recent_roles)) {
      // Resume format (object with recent_roles array)
      experienceDescriptions = experience.recent_roles.map(role => 
        `${role.duration} ${role.title} at ${role.company}`
      );
      if (experience.total_years) {
        profileText += `Total Experience: ${experience.total_years} years\n`;
      }
    }
    
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
