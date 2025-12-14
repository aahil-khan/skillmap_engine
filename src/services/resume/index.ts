import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { CacheKeys, CacheTTL, getJSON, setJSON } from '../../lib/cache/redis.js';
import { extractTextFromPDF } from './parser.js';
import { extractResumeData } from './extractor.js';
import { normalizeSkills } from '../taxonomy/normalizer.js';
import logger from '../../utils/logger.js';
import type { ResumeExtraction } from '../../schemas/resume.js';

export async function processResume(
  userId: string,
  pdfBuffer: Buffer,
  fileName: string,
  userToken: string
) {
  // Use service role key to bypass RLS - we've already validated the user via middleware
  // The userId from authenticate middleware guarantees this is the correct user
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  
  console.log('=== RESUME SERVICE DEBUG ===');
  console.log('SUPABASE_URL:', supabaseUrl);
  console.log('SERVICE_ROLE_KEY exists:', !!serviceRoleKey);
  console.log('SERVICE_ROLE_KEY length:', serviceRoleKey?.length);
  console.log('SERVICE_ROLE_KEY starts with:', serviceRoleKey?.substring(0, 20));
  console.log('User ID:', userId);
  
  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  
  logger.info('Processing resume with service role client', { userId });

  try {
    // 1. Extract text from PDF
    const resumeText = await extractTextFromPDF(pdfBuffer);
    
    // 2. Generate content hash for deduplication
    const contentHash = crypto.createHash('sha256').update(resumeText).digest('hex');
    
    // 3. Check if resume already exists in database (by content_hash)
    const { data: existingResume } = await supabase
      .from('resumes')
      .select()
      .eq('content_hash', contentHash)
      .single();
    
    if (existingResume) {
      logger.info('Resume already exists in database', {
        resumeId: existingResume.id,
        contentHash,
      });
      
      // Mark it as current
      await supabase
        .from('resumes')
        .update({ is_current: true })
        .eq('id', existingResume.id);
      
      // Mark all other resumes as not current
      await supabase
        .from('resumes')
        .update({ is_current: false })
        .eq('user_id', userId)
        .neq('id', existingResume.id);
      
      return {
        resumeId: existingResume.id,
        status: 'existing',
        message: 'Resume already processed',
      };
    }
    
    // 4. Check cache for parsed data (avoid re-processing with LLM)
    const cacheKey = CacheKeys.resumeParsed(contentHash);
    let parsedData = await getJSON<ResumeExtraction>(cacheKey);
    
    if (!parsedData) {
      logger.info('Cache miss - parsing resume', { contentHash });
      
      // PASS 1: Extract data AS-IS (temperature=0 for determinism)
      parsedData = await extractResumeData(resumeText);
      
      // Cache the raw extraction (30 days)
      await setJSON(cacheKey, parsedData, CacheTTL.RESUME);
    } else {
      logger.info('Cache hit - using cached parsed data', { contentHash });
    }
    
    // PASS 2: Normalize skills using vector similarity
    const rawSkillNames = [
      ...parsedData.skills.map(s => s.name),
      ...parsedData.work_experience.flatMap(e => e.technologies),
      ...parsedData.projects.flatMap(p => p.technologies),
    ];
    
    const normalizedSkills = await normalizeSkills(rawSkillNames);
    
    // Separate matched and unmatched skills
    const matchedSkills = normalizedSkills.filter(s => s.confidence >= 0.7 && s.skill_id);
    const unmatchedSkills = normalizedSkills.filter(s => s.confidence < 0.7 || !s.skill_id);
    
    // For unmatched skills, create entries in skill_taxonomy with category "Others"
    const createdSkillIds: Record<string, string> = {};
    
    if (unmatchedSkills.length > 0) {
      logger.info('Creating taxonomy entries for unmatched skills', {
        count: unmatchedSkills.length,
        skills: unmatchedSkills.map(s => s.original),
      });
      
      for (const skill of unmatchedSkills) {
        // Check if skill already exists in taxonomy (case-insensitive)
        const { data: existing } = await supabase
          .from('skills_taxonomy')
          .select('id')
          .ilike('canonical_name', skill.original)
          .single();
        
        if (existing) {
          createdSkillIds[skill.original] = existing.id;
        } else {
          // Create new taxonomy entry
          const { data: created, error } = await supabase
            .from('skills_taxonomy')
            .insert({
              canonical_name: skill.original,
              category: 'Others',
              aliases: [skill.original.toLowerCase()],
            })
            .select('id')
            .single();
          
          if (error) {
            logger.error('Failed to create taxonomy entry', {
              skill: skill.original,
              error: error.message,
            });
          } else if (created) {
            createdSkillIds[skill.original] = created.id;
          }
        }
      }
    }
    
    // Combine matched skills and newly created unmatched skills
    const skillsToInsert = [
      ...matchedSkills.map(s => ({
        canonical_name: s.canonical,
        skill_id: s.skill_id!,
        confidence: s.confidence,
      })),
      ...unmatchedSkills
        .filter(s => createdSkillIds[s.original])
        .map(s => ({
          canonical_name: s.original,
          skill_id: createdSkillIds[s.original],
          confidence: 0,
        })),
    ];
    
    logger.info('Skills processed', {
      total: rawSkillNames.length,
      matched: matchedSkills.length,
      unmatchedCreated: Object.keys(createdSkillIds).length,
      toInsert: skillsToInsert.length,
    });
    
    // 5. Mark previous resumes as not current
    await supabase
      .from('resumes')
      .update({ is_current: false })
      .eq('user_id', userId);
    
    // 6. Insert resume record
    const { data: resumeRecord, error: resumeError } = await supabase
      .from('resumes')
      .insert({
        user_id: userId,
        file_name: fileName,
        file_size_bytes: pdfBuffer.length,
        raw_text: resumeText,
        content_hash: contentHash,
        parsed_data: parsedData as any,
        is_current: true,
      })
      .select()
      .single();
    
    if (resumeError) {
      logger.error('Resume insert failed', {
        userId,
        errorMessage: resumeError.message,
        errorCode: resumeError.code,
      });
      throw resumeError;
    }
    
    // 7. Insert/Update user skills
    if (skillsToInsert.length > 0) {
      const userSkills = skillsToInsert.map(s => ({
        user_id: userId,
        skill_id: s.skill_id!,
        skill_level: 'intermediate' as const, // Default level
      }));
      
      const { error: skillsError } = await supabase
        .from('user_skills')
        .upsert(userSkills, {
          onConflict: 'user_id,skill_id',
          ignoreDuplicates: true,
        });
      
      if (skillsError) {
        logger.error('User skills upsert failed', {
          userId,
          errorMessage: skillsError.message,
          errorCode: skillsError.code,
        });
        throw skillsError;
      }
    }
    
    // 8. Replace work experience (delete old, insert new)
    // Delete all existing work experience first
    await supabase
      .from('work_experience')
      .delete()
      .eq('user_id', userId);
    
    if (parsedData.work_experience.length > 0) {
      const workExperience = parsedData.work_experience.map(exp => ({
        user_id: userId,
        company_name: exp.company,
        job_title: exp.title,
        location: exp.location,
        // Schema requires start_date NOT NULL; fall back to today's date when missing
        start_date: parseDate(exp.start_date) ?? new Date().toISOString().split('T')[0],
        end_date: exp.end_date ? parseDate(exp.end_date) : null,
        is_current: exp.is_current,
        description: exp.description,
        technologies: exp.technologies,
      }));
      
      const { error: expError } = await supabase
        .from('work_experience')
        .insert(workExperience);
      
      if (expError) {
        logger.error('Work experience insert failed', {
          userId,
          message: expError.message,
          details: expError,
        });
        throw expError;
      }
    }
    
    // 9. Replace projects (delete old, insert new)
    // Delete all existing projects first
    await supabase
      .from('projects')
      .delete()
      .eq('user_id', userId);
    
    if (parsedData.projects.length > 0) {
      const projects = parsedData.projects.map(proj => ({
        user_id: userId,
        project_name: proj.name,
        description: proj.description,
        project_url: proj.url,
        github_url: proj.github_url,
        technologies: proj.technologies,
        start_date: proj.start_date ? parseDate(proj.start_date) : null,
        end_date: proj.end_date ? parseDate(proj.end_date) : null,
      }));
      
      const { error: projError } = await supabase
        .from('projects')
        .insert(projects);
      
      if (projError) {
        logger.error('Projects insert failed', {
          userId,
          message: projError.message,
          details: projError,
        });
        throw projError;
      }
    }
    
    // 10. Replace education (delete old, insert new)
    // Delete all existing education first
    await supabase
      .from('education')
      .delete()
      .eq('user_id', userId);
    
    if (parsedData.education.length > 0) {
      const education = parsedData.education.map(edu => ({
        user_id: userId,
        institution_name: edu.institution,
        degree: edu.degree,
        field_of_study: edu.field_of_study,
        start_date: edu.start_date ? parseDate(edu.start_date) : null,
        end_date: edu.end_date ? parseDate(edu.end_date) : null,
        grade: edu.grade,
      }));
      
      const { error: eduError } = await supabase
        .from('education')
        .insert(education);
      
      if (eduError) {
        logger.error('Education insert failed', {
          userId,
          message: eduError.message,
          details: eduError,
        });
        throw eduError;
      }
    }
    
    logger.info('Resume processing complete', {
      userId,
      resumeId: resumeRecord.id,
      skills: skillsToInsert.length,
      experience: parsedData.work_experience.length,
      projects: parsedData.projects.length,
      education: parsedData.education.length,
    });
    
    return {
      resumeId: resumeRecord.id,
      contentHash,
      extracted: {
        skills: skillsToInsert.length,
        experience: parsedData.work_experience.length,
        projects: parsedData.projects.length,
        education: parsedData.education.length,
      },
      cached: parsedData !== null,
    };
  } catch (error) {
    logger.error('Resume processing failed', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      details: error,
      userId 
    });
    throw error;
  }
}

// Helper: Parse various date formats
function parseDate(dateStr: string): string | null {
  try {
    // Handle "2020-01", "January 2020", "01/2020", etc.
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}
