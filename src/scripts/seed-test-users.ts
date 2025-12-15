import { supabase } from '../lib/db/supabase.js';
import { upsertProfileEmbedding } from '../services/profile/embedder.js';

// Test user profiles with diverse backgrounds
const testUsers = [
  // Web Development Group
  {
    email: 'alice.webdev@test.com',
    password: 'TestPass123!',
    profile: {
      display_name: 'Alice Chen',
      bio: 'Frontend developer passionate about React and modern web technologies',
      experience_level: '3-5years',
      is_active: true,
      is_searchable: true,
    },
    skills: [
      { name: 'React', level: 'advanced', category: 'Frontend' },
      { name: 'TypeScript', level: 'advanced', category: 'Programming Languages' },
      { name: 'Next.js', level: 'intermediate', category: 'Frontend' },
      { name: 'Tailwind CSS', level: 'advanced', category: 'Frontend' },
      { name: 'JavaScript', level: 'advanced', category: 'Programming Languages' },
      { name: 'HTML', level: 'advanced', category: 'Frontend' },
      { name: 'CSS', level: 'advanced', category: 'Frontend' },
    ],
    learning_goals: [
      {
        original_goal: 'Learn GraphQL and Apollo Client',
        refined_goal: 'Master GraphQL API design and Apollo Client for React applications',
        target_timeline: '3-6months',
      },
    ],
    preferences: {
      available_days: ['Monday', 'Wednesday', 'Friday'],
      preferred_time_slots: ['evening'],
      communication_preferences: ['video_call', 'chat'],
      preferred_collaboration_types: ['pair_programming', 'code_review'],
    },
  },
  {
    email: 'bob.fullstack@test.com',
    password: 'TestPass123!',
    profile: {
      display_name: 'Bob Martinez',
      bio: 'Full-stack developer with Node.js and React expertise',
      experience_level: '3-5years',
      is_active: true,
      is_searchable: true,
    },
    skills: [
      { name: 'Node.js', level: 'advanced', category: 'Backend' },
      { name: 'React', level: 'intermediate', category: 'Frontend' },
      { name: 'Express.js', level: 'advanced', category: 'Backend' },
      { name: 'PostgreSQL', level: 'intermediate', category: 'Database' },
      { name: 'MongoDB', level: 'intermediate', category: 'Database' },
      { name: 'JavaScript', level: 'advanced', category: 'Programming Languages' },
      { name: 'Docker', level: 'intermediate', category: 'DevOps' },
    ],
    learning_goals: [
      {
        original_goal: 'Learn Kubernetes and microservices',
        refined_goal: 'Build scalable microservices architecture with Kubernetes',
        target_timeline: '6-12months',
      },
    ],
    preferences: {
      available_days: ['Tuesday', 'Thursday', 'Saturday'],
      preferred_time_slots: ['afternoon', 'evening'],
      communication_preferences: ['video_call'],
      preferred_collaboration_types: ['pair_programming', 'project_collaboration'],
    },
  },
  {
    email: 'carol.backend@test.com',
    password: 'TestPass123!',
    profile: {
      display_name: 'Carol Johnson',
      bio: 'Backend engineer specializing in API design and database optimization',
      experience_level: '5+years',
      is_active: true,
      is_searchable: true,
    },
    skills: [
      { name: 'Python', level: 'advanced', category: 'Programming Languages' },
      { name: 'Django', level: 'advanced', category: 'Backend' },
      { name: 'FastAPI', level: 'advanced', category: 'Backend' },
      { name: 'PostgreSQL', level: 'advanced', category: 'Database' },
      { name: 'Redis', level: 'intermediate', category: 'Database' },
      { name: 'REST API', level: 'advanced', category: 'Backend' },
      { name: 'AWS', level: 'intermediate', category: 'Cloud' },
    ],
    learning_goals: [
      {
        original_goal: 'Learn frontend frameworks',
        refined_goal: 'Build full-stack applications with React and Next.js',
        target_timeline: '3-6months',
      },
    ],
    preferences: {
      available_days: ['Monday', 'Wednesday', 'Friday'],
      preferred_time_slots: ['morning', 'afternoon'],
      communication_preferences: ['video_call', 'chat'],
      preferred_collaboration_types: ['code_review', 'knowledge_sharing'],
    },
  },
  {
    email: 'dave.junior@test.com',
    password: 'TestPass123!',
    profile: {
      display_name: 'Dave Lee',
      bio: 'Junior developer learning web development',
      experience_level: '1-3years',
      is_active: true,
      is_searchable: true,
    },
    skills: [
      { name: 'HTML', level: 'intermediate', category: 'Frontend' },
      { name: 'CSS', level: 'intermediate', category: 'Frontend' },
      { name: 'JavaScript', level: 'beginner', category: 'Programming Languages' },
      { name: 'React', level: 'beginner', category: 'Frontend' },
      { name: 'Git', level: 'intermediate', category: 'DevOps' },
    ],
    learning_goals: [
      {
        original_goal: 'Become proficient in React and TypeScript',
        refined_goal: 'Build production-ready React applications with TypeScript',
        target_timeline: '6-12months',
      },
    ],
    preferences: {
      available_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      preferred_time_slots: ['evening'],
      communication_preferences: ['video_call', 'chat', 'screen_sharing'],
      preferred_collaboration_types: ['pair_programming', 'mentorship'],
    },
  },

  // AI/ML Group
  {
    email: 'emily.mleng@test.com',
    password: 'TestPass123!',
    profile: {
      display_name: 'Emily Zhang',
      bio: 'Machine Learning Engineer with focus on NLP and computer vision',
      experience_level: '3-5years',
      is_active: true,
      is_searchable: true,
    },
    skills: [
      { name: 'Python', level: 'advanced', category: 'Programming Languages' },
      { name: 'TensorFlow', level: 'advanced', category: 'AI/ML' },
      { name: 'PyTorch', level: 'advanced', category: 'AI/ML' },
      { name: 'scikit-learn', level: 'advanced', category: 'AI/ML' },
      { name: 'Natural Language Processing', level: 'advanced', category: 'AI/ML' },
      { name: 'Computer Vision', level: 'intermediate', category: 'AI/ML' },
      { name: 'Pandas', level: 'advanced', category: 'Data Science' },
      { name: 'NumPy', level: 'advanced', category: 'Data Science' },
    ],
    learning_goals: [
      {
        original_goal: 'Learn Large Language Models and transformers',
        refined_goal: 'Fine-tune and deploy LLMs for production applications',
        target_timeline: '6-12months',
      },
    ],
    preferences: {
      available_days: ['Tuesday', 'Thursday', 'Saturday'],
      preferred_time_slots: ['afternoon', 'evening'],
      communication_preferences: ['video_call', 'chat'],
      preferred_collaboration_types: ['project_collaboration', 'code_review'],
    },
  },
  {
    email: 'frank.datascience@test.com',
    password: 'TestPass123!',
    profile: {
      display_name: 'Frank Wilson',
      bio: 'Data Scientist specializing in predictive modeling and analytics',
      experience_level: '3-5years',
      is_active: true,
      is_searchable: true,
    },
    skills: [
      { name: 'Python', level: 'advanced', category: 'Programming Languages' },
      { name: 'R', level: 'intermediate', category: 'Programming Languages' },
      { name: 'Pandas', level: 'advanced', category: 'Data Science' },
      { name: 'scikit-learn', level: 'advanced', category: 'AI/ML' },
      { name: 'SQL', level: 'advanced', category: 'Database' },
      { name: 'Tableau', level: 'intermediate', category: 'Data Science' },
      { name: 'Statistics', level: 'advanced', category: 'Data Science' },
    ],
    learning_goals: [
      {
        original_goal: 'Learn deep learning frameworks',
        refined_goal: 'Build and deploy deep learning models with PyTorch',
        target_timeline: '3-6months',
      },
    ],
    preferences: {
      available_days: ['Monday', 'Wednesday', 'Friday'],
      preferred_time_slots: ['morning', 'afternoon'],
      communication_preferences: ['video_call'],
      preferred_collaboration_types: ['knowledge_sharing', 'project_collaboration'],
    },
  },
  {
    email: 'grace.airesearch@test.com',
    password: 'TestPass123!',
    profile: {
      display_name: 'Grace Kim',
      bio: 'AI Researcher working on reinforcement learning and model optimization',
      experience_level: '5+years',
      is_active: true,
      is_searchable: true,
    },
    skills: [
      { name: 'Python', level: 'advanced', category: 'Programming Languages' },
      { name: 'PyTorch', level: 'advanced', category: 'AI/ML' },
      { name: 'Reinforcement Learning', level: 'advanced', category: 'AI/ML' },
      { name: 'CUDA', level: 'intermediate', category: 'AI/ML' },
      { name: 'C++', level: 'intermediate', category: 'Programming Languages' },
      { name: 'JAX', level: 'intermediate', category: 'AI/ML' },
      { name: 'MLOps', level: 'intermediate', category: 'AI/ML' },
    ],
    learning_goals: [
      {
        original_goal: 'Study multimodal AI systems',
        refined_goal: 'Develop expertise in building multimodal AI architectures',
        target_timeline: 'ongoing',
      },
    ],
    preferences: {
      available_days: ['Tuesday', 'Thursday'],
      preferred_time_slots: ['afternoon'],
      communication_preferences: ['video_call', 'chat'],
      preferred_collaboration_types: ['research', 'knowledge_sharing'],
    },
  },
  {
    email: 'hannah.mlops@test.com',
    password: 'TestPass123!',
    profile: {
      display_name: 'Hannah Patel',
      bio: 'MLOps engineer focused on model deployment and monitoring',
      experience_level: '3-5years',
      is_active: true,
      is_searchable: true,
    },
    skills: [
      { name: 'Python', level: 'advanced', category: 'Programming Languages' },
      { name: 'Docker', level: 'advanced', category: 'DevOps' },
      { name: 'Kubernetes', level: 'advanced', category: 'DevOps' },
      { name: 'TensorFlow', level: 'intermediate', category: 'AI/ML' },
      { name: 'PyTorch', level: 'intermediate', category: 'AI/ML' },
      { name: 'AWS', level: 'advanced', category: 'Cloud' },
      { name: 'MLflow', level: 'advanced', category: 'AI/ML' },
    ],
    learning_goals: [
      {
        original_goal: 'Learn advanced ML model optimization',
        refined_goal: 'Master model quantization and edge deployment techniques',
        target_timeline: '3-6months',
      },
    ],
    preferences: {
      available_days: ['Monday', 'Wednesday', 'Friday', 'Saturday'],
      preferred_time_slots: ['evening'],
      communication_preferences: ['chat', 'video_call'],
      preferred_collaboration_types: ['pair_programming', 'code_review'],
    },
  },

  // DevOps/Cloud Group
  {
    email: 'ivan.devops@test.com',
    password: 'TestPass123!',
    profile: {
      display_name: 'Ivan Rodriguez',
      bio: 'DevOps engineer specializing in CI/CD and infrastructure automation',
      experience_level: '5+years',
      is_active: true,
      is_searchable: true,
    },
    skills: [
      { name: 'Docker', level: 'advanced', category: 'DevOps' },
      { name: 'Kubernetes', level: 'advanced', category: 'DevOps' },
      { name: 'Terraform', level: 'advanced', category: 'DevOps' },
      { name: 'AWS', level: 'advanced', category: 'Cloud' },
      { name: 'Jenkins', level: 'advanced', category: 'DevOps' },
      { name: 'Bash', level: 'advanced', category: 'Programming Languages' },
      { name: 'Python', level: 'intermediate', category: 'Programming Languages' },
    ],
    learning_goals: [
      {
        original_goal: 'Learn Rust for system programming',
        refined_goal: 'Build high-performance DevOps tools with Rust',
        target_timeline: '6-12months',
      },
    ],
    preferences: {
      available_days: ['Tuesday', 'Thursday', 'Saturday'],
      preferred_time_slots: ['morning', 'afternoon'],
      communication_preferences: ['video_call', 'chat'],
      preferred_collaboration_types: ['code_review', 'knowledge_sharing'],
    },
  },
  {
    email: 'julia.sre@test.com',
    password: 'TestPass123!',
    profile: {
      display_name: 'Julia Anderson',
      bio: 'Site Reliability Engineer focused on monitoring and incident response',
      experience_level: '3-5years',
      is_active: true,
      is_searchable: true,
    },
    skills: [
      { name: 'Kubernetes', level: 'advanced', category: 'DevOps' },
      { name: 'Prometheus', level: 'advanced', category: 'DevOps' },
      { name: 'Grafana', level: 'advanced', category: 'DevOps' },
      { name: 'Go', level: 'intermediate', category: 'Programming Languages' },
      { name: 'Python', level: 'advanced', category: 'Programming Languages' },
      { name: 'AWS', level: 'intermediate', category: 'Cloud' },
      { name: 'Terraform', level: 'intermediate', category: 'DevOps' },
    ],
    learning_goals: [
      {
        original_goal: 'Learn chaos engineering practices',
        refined_goal: 'Implement chaos engineering for resilient systems',
        target_timeline: '3-6months',
      },
    ],
    preferences: {
      available_days: ['Monday', 'Wednesday', 'Friday'],
      preferred_time_slots: ['afternoon', 'evening'],
      communication_preferences: ['video_call'],
      preferred_collaboration_types: ['knowledge_sharing', 'project_collaboration'],
    },
  },

  // Mobile Development Group
  {
    email: 'kevin.mobile@test.com',
    password: 'TestPass123!',
    profile: {
      display_name: 'Kevin Nguyen',
      bio: 'Mobile developer building cross-platform apps with React Native',
      experience_level: '3-5years',
      is_active: true,
      is_searchable: true,
    },
    skills: [
      { name: 'React Native', level: 'advanced', category: 'Mobile' },
      { name: 'JavaScript', level: 'advanced', category: 'Programming Languages' },
      { name: 'TypeScript', level: 'advanced', category: 'Programming Languages' },
      { name: 'React', level: 'advanced', category: 'Frontend' },
      { name: 'iOS', level: 'intermediate', category: 'Mobile' },
      { name: 'Android', level: 'intermediate', category: 'Mobile' },
      { name: 'Redux', level: 'advanced', category: 'Frontend' },
    ],
    learning_goals: [
      {
        original_goal: 'Learn native iOS development with Swift',
        refined_goal: 'Build native iOS apps and understand platform-specific optimizations',
        target_timeline: '6-12months',
      },
    ],
    preferences: {
      available_days: ['Tuesday', 'Thursday', 'Saturday'],
      preferred_time_slots: ['evening'],
      communication_preferences: ['chat', 'video_call'],
      preferred_collaboration_types: ['pair_programming', 'code_review'],
    },
  },
  {
    email: 'laura.ios@test.com',
    password: 'TestPass123!',
    profile: {
      display_name: 'Laura Thompson',
      bio: 'iOS developer passionate about SwiftUI and app architecture',
      experience_level: '3-5years',
      is_active: true,
      is_searchable: true,
    },
    skills: [
      { name: 'Swift', level: 'advanced', category: 'Programming Languages' },
      { name: 'SwiftUI', level: 'advanced', category: 'Mobile' },
      { name: 'iOS', level: 'advanced', category: 'Mobile' },
      { name: 'Xcode', level: 'advanced', category: 'Mobile' },
      { name: 'Core Data', level: 'intermediate', category: 'Mobile' },
      { name: 'Combine', level: 'intermediate', category: 'Mobile' },
    ],
    learning_goals: [
      {
        original_goal: 'Learn backend development to build full apps',
        refined_goal: 'Master Node.js and REST API development for iOS apps',
        target_timeline: '3-6months',
      },
    ],
    preferences: {
      available_days: ['Monday', 'Wednesday', 'Friday'],
      preferred_time_slots: ['afternoon'],
      communication_preferences: ['video_call', 'screen_sharing'],
      preferred_collaboration_types: ['pair_programming', 'mentorship'],
    },
  },

  // Beginner/Career Switcher Group
  {
    email: 'mike.beginner@test.com',
    password: 'TestPass123!',
    profile: {
      display_name: 'Mike Chen',
      bio: 'Career switcher learning programming from scratch',
      experience_level: 'entry',
      is_active: true,
      is_searchable: true,
    },
    skills: [
      { name: 'HTML', level: 'beginner', category: 'Frontend' },
      { name: 'CSS', level: 'beginner', category: 'Frontend' },
      { name: 'JavaScript', level: 'beginner', category: 'Programming Languages' },
      { name: 'Git', level: 'beginner', category: 'DevOps' },
    ],
    learning_goals: [
      {
        original_goal: 'Get my first developer job',
        refined_goal: 'Build a portfolio of projects and master web development fundamentals',
        target_timeline: '6-12months',
      },
    ],
    preferences: {
      available_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      preferred_time_slots: ['evening'],
      communication_preferences: ['video_call', 'chat', 'screen_sharing'],
      preferred_collaboration_types: ['mentorship', 'pair_programming'],
    },
  },
  {
    email: 'nina.aibeginner@test.com',
    password: 'TestPass123!',
    profile: {
      display_name: 'Nina Williams',
      bio: 'Data analyst transitioning to machine learning',
      experience_level: '1-3years',
      is_active: true,
      is_searchable: true,
    },
    skills: [
      { name: 'Python', level: 'intermediate', category: 'Programming Languages' },
      { name: 'Pandas', level: 'intermediate', category: 'Data Science' },
      { name: 'NumPy', level: 'intermediate', category: 'Data Science' },
      { name: 'SQL', level: 'advanced', category: 'Database' },
      { name: 'Excel', level: 'advanced', category: 'Data Science' },
      { name: 'scikit-learn', level: 'beginner', category: 'AI/ML' },
    ],
    learning_goals: [
      {
        original_goal: 'Learn deep learning and neural networks',
        refined_goal: 'Understand and implement neural networks for real-world problems',
        target_timeline: '6-12months',
      },
    ],
    preferences: {
      available_days: ['Tuesday', 'Thursday', 'Saturday'],
      preferred_time_slots: ['morning', 'afternoon'],
      communication_preferences: ['video_call', 'chat'],
      preferred_collaboration_types: ['mentorship', 'knowledge_sharing'],
    },
  },
];

async function seedTestUsers() {
  console.log('🌱 Starting test user seeding...\n');

  for (const userData of testUsers) {
    try {
      console.log(`Creating user: ${userData.profile.display_name} (${userData.email})`);

      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: true,
      });

      if (authError) {
        console.error(`  ❌ Auth error: ${authError.message}`);
        continue;
      }

      const userId = authData.user.id;
      console.log(`  ✓ Auth user created: ${userId}`);

      // 2. Create user profile
      const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: userId,
          email: userData.email,
          ...userData.profile,
          profile_completed: true,
        });

      if (profileError) {
        console.error(`  ❌ Profile error: ${profileError.message}`);
        continue;
      }
      console.log(`  ✓ Profile created`);

      // 3. Normalize and insert skills
      for (const skill of userData.skills) {
        // Find or create skill in taxonomy
        const { data: existingSkill } = await supabase
          .from('skills_taxonomy')
          .select('id')
          .ilike('canonical_name', skill.name)
          .single();

        let skillId = existingSkill?.id;

        if (!skillId) {
          const { data: newSkill, error: skillError } = await supabase
            .from('skills_taxonomy')
            .insert({
              canonical_name: skill.name,
              category: skill.category,
              aliases: [skill.name.toLowerCase()],
            })
            .select('id')
            .single();

          if (skillError) {
            console.error(`  ⚠️  Skill creation error for ${skill.name}: ${skillError.message}`);
            continue;
          }
          skillId = newSkill.id;
        }

        // Insert user skill
        await supabase.from('user_skills').insert({
          user_id: userId,
          skill_id: skillId,
          skill_level: skill.level,
          source: 'manual',
        });
      }
      console.log(`  ✓ ${userData.skills.length} skills added`);

      // 4. Create learning goals
      for (const goal of userData.learning_goals) {
        await supabase.from('learning_goals').insert({
          user_id: userId,
          ...goal,
          status: 'active',
        });
      }
      console.log(`  ✓ Learning goals created`);

      // 5. Create peer preferences
      await supabase.from('peer_preferences').insert({
        user_id: userId,
        ...userData.preferences,
      });
      console.log(`  ✓ Preferences set`);

      // 6. Generate embeddings
      console.log(`  ⏳ Generating embeddings...`);
      await upsertProfileEmbedding(userId);
      console.log(`  ✓ Embeddings generated`);

      console.log(`✅ ${userData.profile.display_name} seeded successfully\n`);
    } catch (error: any) {
      console.error(`❌ Failed to seed ${userData.email}:`, error.message, '\n');
    }
  }

  console.log('🎉 Seeding complete!');
  console.log('\n📊 Summary:');
  console.log('  - Web Dev: Alice, Bob, Carol, Dave (4 users)');
  console.log('  - AI/ML: Emily, Frank, Grace, Hannah, Nina (5 users)');
  console.log('  - DevOps: Ivan, Julia (2 users)');
  console.log('  - Mobile: Kevin, Laura (2 users)');
  console.log('  - Beginners: Mike (1 user)');
}

seedTestUsers().catch(console.error);