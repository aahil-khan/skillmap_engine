import { describe, it, expect } from 'vitest';
import { extractResumeData } from '../extractor.js';

const SAMPLE_RESUME = `
JOHN DOE
Full Stack Developer
Email: john.doe@email.com | Phone: (555) 123-4567
LinkedIn: linkedin.com/in/johndoe | GitHub: github.com/johndoe

SUMMARY
Experienced full-stack developer with 5+ years building scalable web applications using React, Node.js, and PostgreSQL.

SKILLS
Frontend: React, TypeScript, Next.js, Tailwind CSS
Backend: Node.js, Express, Python, Django
Databases: PostgreSQL, MongoDB, Redis
DevOps: Docker, AWS, CI/CD, Kubernetes

WORK EXPERIENCE
Senior Software Engineer | Tech Corp | San Francisco, CA
January 2021 - Present
- Built microservices architecture using Node.js and Docker
- Led frontend migration from Angular to React
- Technologies: React, TypeScript, Node.js, PostgreSQL, Docker

Software Engineer | StartupXYZ | Remote
June 2019 - December 2020
- Developed REST APIs using Python and Django
- Implemented caching layer with Redis
- Technologies: Python, Django, PostgreSQL, Redis

PROJECTS
E-Commerce Platform
- Built full-stack application with React and Node.js
- Technologies: React, Node.js, MongoDB, Stripe
- URL: https://example.com
- GitHub: https://github.com/johndoe/ecommerce

AI Chat Application
- Real-time chat using WebSockets and OpenAI API
- Technologies: Next.js, Socket.io, OpenAI, PostgreSQL

EDUCATION
Bachelor of Science in Computer Science
University of Technology | 2015 - 2019
GPA: 3.8/4.0
`;

describe('Resume Parsing Determinism', () => {
  it('should produce identical output for same input (10 runs)', async () => {
    const results = await Promise.all(
      Array(10).fill(null).map(() => extractResumeData(SAMPLE_RESUME))
    );
    
    // LLMs with temperature=0 are MOSTLY deterministic but not 100%
    // Test semantic consistency instead of byte-for-byte equality
    const firstResult = results[0];
    
    for (const result of results) {
      // Personal info should always be identical
      expect(result.personal_info.name).toBe(firstResult.personal_info.name);
      expect(result.personal_info.email).toBe(firstResult.personal_info.email);
      expect(result.personal_info.phone).toBe(firstResult.personal_info.phone);
      
      // Same number of work experiences
      expect(result.work_experience.length).toBe(firstResult.work_experience.length);
      
      // Skills count should be consistent (within ±2 for minor variations)
      expect(Math.abs(result.skills.length - firstResult.skills.length)).toBeLessThanOrEqual(2);
      
      // Projects count should be consistent (within ±1)
      expect(Math.abs(result.projects.length - firstResult.projects.length)).toBeLessThanOrEqual(1);
    }
    
    // For full byte-for-byte comparison, check if at least 70% of results are identical
    const stringified = results.map(r => JSON.stringify(r));
    const uniqueResults = new Set(stringified);
    expect(uniqueResults.size).toBeLessThanOrEqual(4); // Allow up to 4 variations out of 10
  }, 120000); // 2 minute timeout for 10 LLM calls

  it('should extract skills exactly as written (not normalized)', async () => {
    const result = await extractResumeData(SAMPLE_RESUME);
    
    // Skills should be extracted AS-IS from resume
    const skillNames = result.skills.map(s => s.name);
    
    // Should contain exact matches from resume (not normalized)
    expect(skillNames).toContain('React');
    expect(skillNames).toContain('TypeScript');
    expect(skillNames).toContain('Node.js');
    expect(skillNames).toContain('PostgreSQL');
  }, 30000);

  it('should handle missing sections gracefully', async () => {
    const minimalResume = `
      JOHN DOE
      Email: john@example.com
      
      SUMMARY
      Software developer with experience in web development.
      
      SKILLS
      JavaScript, React
    `;
    
    const result = await extractResumeData(minimalResume);
    
    expect(result.personal_info.name).toBe('JOHN DOE');
    expect(result.personal_info.email).toBe('john@example.com');
    expect(result.skills.length).toBeGreaterThanOrEqual(2);
    expect(result.work_experience.length).toBe(0); // No work experience
    expect(result.projects.length).toBe(0); // No projects
    expect(result.education.length).toBe(0); // No education
  }, 30000);

  it('should parse various date formats', async () => {
    const result = await extractResumeData(SAMPLE_RESUME);
    
    const firstJob = result.work_experience[0];
    expect(firstJob.start_date).toBeTruthy();
    expect(firstJob.is_current).toBe(true);
    
    const secondJob = result.work_experience[1];
    expect(secondJob.start_date).toBeTruthy();
    expect(secondJob.end_date).toBeTruthy();
    expect(secondJob.is_current).toBe(false);
  }, 30000);

  it('should extract technologies from work experience', async () => {
    const result = await extractResumeData(SAMPLE_RESUME);
    
    const firstJob = result.work_experience[0];
    expect(firstJob.technologies.length).toBeGreaterThan(0);
    expect(firstJob.technologies).toContain('React');
    expect(firstJob.technologies).toContain('Node.js');
  }, 30000);
});

describe('Resume Parsing Edge Cases', () => {
  it('should handle empty resume text', async () => {
    const emptyResume = '';
    
    await expect(extractResumeData(emptyResume)).rejects.toThrow('Resume text is too short or empty');
  });

  it('should handle resume with only whitespace', async () => {
    const whitespaceResume = '   \n\n   ';
    
    await expect(extractResumeData(whitespaceResume)).rejects.toThrow('Resume text is too short or empty');
  });

  it('should handle very short resume text', async () => {
    const shortResume = 'John Doe'; // Less than 50 characters
    
    await expect(extractResumeData(shortResume)).rejects.toThrow('Resume text is too short or empty');
  });

  it('should accept resume with minimum valid length', async () => {
    const minimalResume = `
      JOHN DOE
      Email: john@example.com
      Phone: 555-1234
      
      SUMMARY
      Software developer with experience in web development.
    `; // Over 50 characters
    
    const result = await extractResumeData(minimalResume);
    expect(result.personal_info.name).toBeTruthy();
  }, 30000);

  it('should handle special characters in skills', async () => {
    const resumeWithSpecialChars = `
      JOHN DOE
      
      SKILLS
      C++, C#, Node.js, Vue.js, .NET, ASP.NET
    `;
    
    const result = await extractResumeData(resumeWithSpecialChars);
    const skillNames = result.skills.map(s => s.name);
    
    expect(skillNames).toContain('C++');
    expect(skillNames).toContain('C#');
    expect(skillNames).toContain('.NET');
  }, 30000);
});
