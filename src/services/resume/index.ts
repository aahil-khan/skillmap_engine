import crypto from 'crypto';
import { supabase } from '../../lib/db/supabase.js';
import { CacheKeys, CacheTTL, getJSON, setJSON } from '../../lib/cache/redis.js';
import { extractTextFromPDF } from './parser.js';
import { extractResumeData } from './extractor.js';
import { normalizeSkills } from '../taxonomy/normalizer.js';
import logger from '../../utils/logger.js';
import type { ResumeExtraction } from '../../schemas/resume.js';

export async function processResume(userId: string, pdfBuffer: Buffer, fileName: string) {
  try {
    // 1. Extract text from PDF
    const resumeText = await extractTextFromPDF(pdfBuffer);
    
    // 2. Generate content hash for deduplication
    const contentHash = crypto.createHash('sha256').update(resumeText).digest('hex');
    
    // 3. Check cache (avoid re-processing same resume)
    const cacheKey = CacheKeys.resumeParsed(contentHash);
    let parsedData = await getJSON<ResumeExtraction>(cacheKey);
    
    if (!parsedData) {
      logger.info('Cache miss - parsing resume', { contentHash });
      
      // PASS 1: Extract data AS-IS (temperature=0 for determinism)
      parsedData = await extractResumeData(resumeText);
      
      // Cache the raw extraction (30 days)
      await setJSON(cacheKey, parsedData, CacheTTL.RESUME);
    } else {
      logger.info('Cache hit - using cached resume', { contentHash });
    }
    
    // PASS 2: Normalize skills using vector similarity
    const rawSkillNames = [
      ...parsedData.skills.map(s => s.name),
      ...parsedData.work_experience.flatMap(e => e.technologies),
      ...parsedData.projects.flatMap(p => p.technologies),
    ];
    
    const normalizedSkills = await normalizeSkills(rawSkillNames);
    
    // Get skill IDs from taxonomy for skills with good matches (>70% confidence)
    const skillsToInsert = normalizedSkills
      .filter(s => s.confidence >= 0.7 && s.skill_id)
      .map(s => ({
        canonical_name: s.canonical,
        skill_id: s.skill_id,
        confidence: s.confidence,
      }));
    
    logger.info('Skills normalized', {
      total: rawSkillNames.length,
      matched: skillsToInsert.length,
      unmatched: rawSkillNames.length - skillsToInsert.length,
    });
    
    // 4. Mark previous resumes as not current
    await supabase
      .from('resumes')
      .update({ is_current: false })
      .eq('user_id', userId);
    
    // 5. Insert resume record
    const { data: resumeRecord, error: resumeError } = await supabase
      .from('resumes')
      .insert({
        user_id: userId,
        file_name: fileName,
        file_size: pdfBuffer.length,
        content_hash: contentHash,
        parsed_data: parsedData as any,
        is_current: true,
      })
      .select()
      .single();
    
    if (resumeError) throw resumeError;
    
    // 6. Insert/Update user skills
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
      
      if (skillsError) throw skillsError;
    }
    
    // 7. Insert work experience
    if (parsedData.work_experience.length > 0) {
      const workExperience = parsedData.work_experience.map(exp => ({
        user_id: userId,
        company_name: exp.company,
        job_title: exp.title,
        location: exp.location,
        start_date: parseDate(exp.start_date),
        end_date: exp.end_date ? parseDate(exp.end_date) : null,
        is_current: exp.is_current,
        description: exp.description,
        technologies: exp.technologies,
      }));
      
      const { error: expError } = await supabase
        .from('work_experience')
        .insert(workExperience);
      
      if (expError) throw expError;
    }
    
    // 8. Insert projects
    if (parsedData.projects.length > 0) {
      const projects = parsedData.projects.map(proj => ({
        user_id: userId,
        project_name: proj.name,
        description: proj.description,
        url: proj.url,
        github_url: proj.github_url,
        technologies: proj.technologies,
        start_date: proj.start_date ? parseDate(proj.start_date) : null,
        end_date: proj.end_date ? parseDate(proj.end_date) : null,
      }));
      
      const { error: projError } = await supabase
        .from('projects')
        .insert(projects);
      
      if (projError) throw projError;
    }
    
    // 9. Insert education
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
      
      if (eduError) throw eduError;
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
    logger.error('Resume processing failed', { error, userId });
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
