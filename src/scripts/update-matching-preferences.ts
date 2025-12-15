import { supabase } from '../lib/db/supabase.js';

// User matching preferences
const userPreferences: Record<string, string> = {
  'alice.webdev@test.com': 'mentor',      // Looking to learn GraphQL
  'bob.fullstack@test.com': 'peer',       // Looking for equals
  'carol.backend@test.com': 'mentee',     // Experienced, wants to help others learn frontend
  'dave.junior@test.com': 'mentor',       // Junior looking to learn
  'emily.mleng@test.com': 'peer',         // Looking for ML peers
  'frank.datascience@test.com': 'mentee', // Experienced data scientist
  'grace.airesearch@test.com': 'mentee',  // PhD level, can mentor
  'hannah.mlops@test.com': 'peer',        // Looking for MLOps peers
  'ivan.devops@test.com': 'peer',         // DevOps peers
  'julia.sre@test.com': 'peer',           // SRE peers
  'kevin.mobile@test.com': 'balanced',    // Open to various connections
  'laura.ios@test.com': 'balanced',       // Open to various connections
  'mike.beginner@test.com': 'mentor',     // Career switcher, needs mentorship
  'nina.aibeginner@test.com': 'mentor',   // Beginner in AI, looking to learn
};

async function updateMatchingPreferences() {
  console.log('🔄 Updating matching preferences for users...\n');

  for (const [email, preference] of Object.entries(userPreferences)) {
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
      console.log(`${profile.display_name}: ${preference}`);

      // Update peer preferences
      const { error } = await supabase
        .from('peer_preferences')
        .update({ matching_preference: preference })
        .eq('user_id', userId);

      if (error) {
        console.log(`  ❌ Error: ${error.message}`);
      } else {
        console.log(`  ✓ Updated`);
      }
    } catch (error: any) {
      console.error(`❌ Failed for ${email}:`, error.message);
    }
  }

  console.log('\n🎉 Preferences updated!');
  console.log('\nPreference Distribution:');
  console.log(`  - mentor (looking to learn): 4 users`);
  console.log(`  - peer (looking for equals): 5 users`);
  console.log(`  - mentee (looking to teach): 3 users`);
  console.log(`  - balanced (open to all): 2 users`);
}

updateMatchingPreferences().catch(console.error);
