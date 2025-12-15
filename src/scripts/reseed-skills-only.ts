import { supabase } from '../lib/db/supabase.js';
import { upsertProfileEmbedding } from '../services/profile/embedder.js';

// User emails to skill mappings
const userSkills: Record<string, Array<{ name: string; level: string }>> = {
  'alice.webdev@test.com': [
    { name: 'React', level: 'advanced' },
    { name: 'TypeScript', level: 'advanced' },
    { name: 'Next.js', level: 'intermediate' },
    { name: 'Tailwind CSS', level: 'advanced' },
    { name: 'JavaScript', level: 'advanced' },
    { name: 'HTML', level: 'advanced' },
    { name: 'CSS', level: 'advanced' },
  ],
  'bob.fullstack@test.com': [
    { name: 'Node.js', level: 'advanced' },
    { name: 'React', level: 'intermediate' },
    { name: 'Express.js', level: 'advanced' },
    { name: 'PostgreSQL', level: 'intermediate' },
    { name: 'MongoDB', level: 'intermediate' },
    { name: 'JavaScript', level: 'advanced' },
    { name: 'Docker', level: 'intermediate' },
  ],
  'carol.backend@test.com': [
    { name: 'Python', level: 'advanced' },
    { name: 'Django', level: 'advanced' },
    { name: 'FastAPI', level: 'advanced' },
    { name: 'PostgreSQL', level: 'advanced' },
    { name: 'Redis', level: 'intermediate' },
    { name: 'REST API', level: 'advanced' },
    { name: 'AWS', level: 'intermediate' },
  ],
  'dave.junior@test.com': [
    { name: 'HTML', level: 'intermediate' },
    { name: 'CSS', level: 'intermediate' },
    { name: 'JavaScript', level: 'beginner' },
    { name: 'React', level: 'beginner' },
  ],
  'emily.mleng@test.com': [
    { name: 'Python', level: 'advanced' },
    { name: 'TensorFlow', level: 'advanced' },
    { name: 'PyTorch', level: 'intermediate' },
    { name: 'Machine Learning', level: 'advanced' },
    { name: 'SQL', level: 'intermediate' },
    { name: 'Docker', level: 'intermediate' },
  ],
  'frank.datascience@test.com': [
    { name: 'Python', level: 'advanced' },
    { name: 'Pandas', level: 'advanced' },
    { name: 'NumPy', level: 'advanced' },
    { name: 'SQL', level: 'advanced' },
    { name: 'Machine Learning', level: 'intermediate' },
  ],
  'grace.airesearch@test.com': [
    { name: 'Python', level: 'advanced' },
    { name: 'PyTorch', level: 'advanced' },
    { name: 'TensorFlow', level: 'advanced' },
    { name: 'Machine Learning', level: 'advanced' },
  ],
  'hannah.mlops@test.com': [
    { name: 'Python', level: 'advanced' },
    { name: 'Docker', level: 'advanced' },
    { name: 'Kubernetes', level: 'advanced' },
    { name: 'AWS', level: 'advanced' },
    { name: 'TensorFlow', level: 'intermediate' },
    { name: 'CI/CD', level: 'advanced' },
  ],
  'ivan.devops@test.com': [
    { name: 'Docker', level: 'advanced' },
    { name: 'Kubernetes', level: 'advanced' },
    { name: 'AWS', level: 'advanced' },
    { name: 'Terraform', level: 'advanced' },
    { name: 'Linux', level: 'advanced' },
    { name: 'Bash', level: 'advanced' },
    { name: 'Python', level: 'intermediate' },
  ],
  'julia.sre@test.com': [
    { name: 'Kubernetes', level: 'advanced' },
    { name: 'AWS', level: 'advanced' },
    { name: 'Terraform', level: 'intermediate' },
    { name: 'Python', level: 'intermediate' },
    { name: 'Linux', level: 'advanced' },
  ],
  'kevin.mobile@test.com': [
    { name: 'React', level: 'advanced' },
    { name: 'TypeScript', level: 'intermediate' },
    { name: 'JavaScript', level: 'advanced' },
    { name: 'Node.js', level: 'intermediate' },
  ],
  'laura.ios@test.com': [
    { name: 'Swift', level: 'advanced' },
  ],
  'mike.beginner@test.com': [
    { name: 'HTML', level: 'beginner' },
    { name: 'CSS', level: 'beginner' },
    { name: 'JavaScript', level: 'beginner' },
  ],
  'nina.aibeginner@test.com': [
    { name: 'Python', level: 'intermediate' },
    { name: 'Pandas', level: 'intermediate' },
    { name: 'NumPy', level: 'intermediate' },
    { name: 'SQL', level: 'advanced' },
  ],
};

async function reseedSkills() {
  console.log('🔄 Reseeding skills for existing users...\n');

  for (const [email, skills] of Object.entries(userSkills)) {
    try {
      // Get user ID from email
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('user_id, display_name')
        .eq('email', email)
        .single();

      if (!profile) {
        console.log(`⚠️  User not found: ${email}`);
        continue;
      }

      const userId = profile.user_id;
      console.log(`Processing: ${profile.display_name} (${email})`);

      // Insert skills
      for (const skill of skills) {
        // Find skill in taxonomy
        const { data: existingSkill } = await supabase
          .from('skills_taxonomy')
          .select('id')
          .ilike('canonical_name', skill.name)
          .single();

        if (!existingSkill) {
          console.log(`  ⚠️  Skill not found in taxonomy: ${skill.name}`);
          continue;
        }

        // Insert user skill
        const { error } = await supabase.from('user_skills').upsert({
          user_id: userId,
          skill_id: existingSkill.id,
          skill_level: skill.level,
          source: 'manual',
        }, {
          onConflict: 'user_id,skill_id',
        });

        if (error) {
          console.log(`  ❌ Error adding ${skill.name}: ${error.message}`);
        }
      }
      console.log(`  ✓ ${skills.length} skills added`);

      // Regenerate embeddings
      console.log(`  ⏳ Regenerating embeddings...`);
      await upsertProfileEmbedding(userId);
      console.log(`  ✅ Complete\n`);

    } catch (error: any) {
      console.error(`❌ Failed for ${email}:`, error.message, '\n');
    }
  }

  console.log('🎉 Reseeding complete!');
}

reseedSkills().catch(console.error);
