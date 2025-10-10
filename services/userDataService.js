import { supabase } from '../config/supabase.js';
import { AppError } from '../utils/errors.js';

/**
 * Fetch complete user profile with all related data
 * @param {string} userid - User ID
 * @returns {Object} Complete user profile
 */
async function getUserProfile(userid) {
  try {
    // Fetch all data in parallel
    const [
      profileResult,
      skillsResult,
      experienceResult,
      projectsResult,
      educationResult,
      goalsResult,
      resumeResult,
      leetcodeResult
    ] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('userid', userid).single(),
      supabase.from('skills').select('*').eq('userid', userid),
      supabase.from('work_experience').select('*').eq('userid', userid).order('start_date', { ascending: false }),
      supabase.from('projects').select('*').eq('userid', userid).order('display_order', { ascending: true }),
      supabase.from('education').select('*').eq('userid', userid).order('display_order', { ascending: true }),
      supabase.from('learning_goals').select('*').eq('userid', userid).eq('status', 'active'),
      supabase.from('resumes').select('*').eq('userid', userid).single(),
      supabase.from('leetcode_profiles').select('*').eq('userid', userid).single()
    ]);

    // Handle errors for each query
    if (profileResult.error && profileResult.error.code !== 'PGRST116') {
      throw new AppError(`Error fetching profile: ${profileResult.error.message}`, 500);
    }

    if (skillsResult.error) {
      throw new AppError(`Error fetching skills: ${skillsResult.error.message}`, 500);
    }

    if (experienceResult.error) {
      throw new AppError(`Error fetching experience: ${experienceResult.error.message}`, 500);
    }

    if (projectsResult.error) {
      throw new AppError(`Error fetching projects: ${projectsResult.error.message}`, 500);
    }

    if (educationResult.error) {
      throw new AppError(`Error fetching education: ${educationResult.error.message}`, 500);
    }

    if (goalsResult.error) {
      throw new AppError(`Error fetching goals: ${goalsResult.error.message}`, 500);
    }

    // Group skills by category
    const groupedSkills = {};
    if (skillsResult.data) {
      skillsResult.data.forEach(skill => {
        if (!groupedSkills[skill.category]) {
          groupedSkills[skill.category] = [];
        }
        groupedSkills[skill.category].push({
          name: skill.skill_name,
          level: skill.skill_level
        });
      });
    }

    // Convert grouped skills to array format
    const technical_skills = Object.entries(groupedSkills).map(([category, skills]) => ({
      category,
      skills
    }));

    return {
      profile: profileResult.data || null,
      technical_skills,
      work_experience: experienceResult.data || [],
      projects: projectsResult.data || [],
      education: educationResult.data || [],
      learning_goals: goalsResult.data || [],
      resume: resumeResult.data || null,
      leetcode: leetcodeResult.data || null
    };
  } catch (error) {
    console.error('[getUserProfile] Error:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to fetch user profile', 500);
  }
}

/**
 * Fetch user's technical skills grouped by category
 * @param {string} userid - User ID
 * @returns {Array} Skills grouped by category
 */
async function getUserSkills(userid) {
  try {
    const { data, error } = await supabase
      .from('skills')
      .select('*')
      .eq('userid', userid)
      .order('category', { ascending: true });

    if (error) {
      throw new AppError(`Error fetching skills: ${error.message}`, 500);
    }

    // Group by category
    const groupedSkills = {};
    data.forEach(skill => {
      if (!groupedSkills[skill.category]) {
        groupedSkills[skill.category] = [];
      }
      groupedSkills[skill.category].push({
        id: skill.id,
        name: skill.skill_name,
        level: skill.skill_level,
        created_at: skill.created_at
      });
    });

    // Convert to array format
    return Object.entries(groupedSkills).map(([category, skills]) => ({
      category,
      skills
    }));
  } catch (error) {
    console.error('[getUserSkills] Error:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to fetch skills', 500);
  }
}

/**
 * Fetch user's work experience
 * @param {string} userid - User ID
 * @returns {Array} Work experience records
 */
async function getUserExperience(userid) {
  try {
    const { data, error } = await supabase
      .from('work_experience')
      .select('*')
      .eq('userid', userid)
      .order('start_date', { ascending: false });

    if (error) {
      throw new AppError(`Error fetching experience: ${error.message}`, 500);
    }

    return data || [];
  } catch (error) {
    console.error('[getUserExperience] Error:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to fetch experience', 500);
  }
}

/**
 * Fetch user's projects
 * @param {string} userid - User ID
 * @returns {Array} Project records
 */
async function getUserProjects(userid) {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('userid', userid)
      .order('display_order', { ascending: true });

    if (error) {
      throw new AppError(`Error fetching projects: ${error.message}`, 500);
    }

    return data || [];
  } catch (error) {
    console.error('[getUserProjects] Error:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to fetch projects', 500);
  }
}

/**
 * Fetch user's education
 * @param {string} userid - User ID
 * @returns {Array} Education records
 */
async function getUserEducation(userid) {
  try {
    const { data, error } = await supabase
      .from('education')
      .select('*')
      .eq('userid', userid)
      .order('display_order', { ascending: true });

    if (error) {
      throw new AppError(`Error fetching education: ${error.message}`, 500);
    }

    return data || [];
  } catch (error) {
    console.error('[getUserEducation] Error:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to fetch education', 500);
  }
}

/**
 * Fetch user's learning goals
 * @param {string} userid - User ID
 * @param {string} status - Filter by status (default: 'active')
 * @returns {Array} Learning goal records
 */
async function getUserGoals(userid, status = 'active') {
  try {
    let query = supabase
      .from('learning_goals')
      .select('*')
      .eq('userid', userid);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new AppError(`Error fetching goals: ${error.message}`, 500);
    }

    return data || [];
  } catch (error) {
    console.error('[getUserGoals] Error:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to fetch goals', 500);
  }
}

/**
 * Fetch user's resume data
 * @param {string} userid - User ID
 * @returns {Object} Resume record
 */
async function getUserResume(userid) {
  try {
    const { data, error } = await supabase
      .from('resumes')
      .select('*')
      .eq('userid', userid)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new AppError(`Error fetching resume: ${error.message}`, 500);
    }

    return data || null;
  } catch (error) {
    console.error('[getUserResume] Error:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to fetch resume', 500);
  }
}

/**
 * Fetch user's LeetCode profile
 * @param {string} userid - User ID
 * @returns {Object} LeetCode profile record
 */
async function getLeetCodeProfile(userid) {
  try {
    const { data, error } = await supabase
      .from('leetcode_profiles')
      .select('*')
      .eq('userid', userid)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new AppError(`Error fetching LeetCode profile: ${error.message}`, 500);
    }

    return data || null;
  } catch (error) {
    console.error('[getLeetCodeProfile] Error:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to fetch LeetCode profile', 500);
  }
}

/**
 * Fetch user's ATS score history
 * @param {string} userid - User ID
 * @param {number} limit - Number of records to fetch (default: 10)
 * @returns {Array} ATS history records
 */
async function getATSHistory(userid, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('ats_history')
      .select('*')
      .eq('userid', userid)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new AppError(`Error fetching ATS history: ${error.message}`, 500);
    }

    return data || [];
  } catch (error) {
    console.error('[getATSHistory] Error:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to fetch ATS history', 500);
  }
}

/**
 * Fetch user's latest skill gap analysis
 * @param {string} userid - User ID
 * @returns {Object} Latest skill gap analysis
 */
async function getLatestSkillGapAnalysis(userid) {
  try {
    const { data, error } = await supabase
      .from('skill_gap_analysis')
      .select('*')
      .eq('userid', userid)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new AppError(`Error fetching skill gap analysis: ${error.message}`, 500);
    }

    return data || null;
  } catch (error) {
    console.error('[getLatestSkillGapAnalysis] Error:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to fetch skill gap analysis', 500);
  }
}

export {
  getUserProfile,
  getUserSkills,
  getUserExperience,
  getUserProjects,
  getUserEducation,
  getUserGoals,
  getUserResume,
  getLeetCodeProfile,
  getATSHistory,
  getLatestSkillGapAnalysis
};
