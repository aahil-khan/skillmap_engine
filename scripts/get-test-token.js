import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SECRET_KEY // Fallback to secret key
);

const email = 'test@test.com';
const password = '12345'; // Set this password for your test user

console.log('Attempting to sign in...');
console.log('Email:', email);

const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password
});

if (error) {
  console.error('❌ Error:', error.message);
  console.log('\nTo set password, run this SQL in Supabase:');
  console.log(`UPDATE auth.users SET encrypted_password = crypt('${password}', gen_salt('bf')) WHERE email = '${email}';`);
  process.exit(1);
}

console.log('\n✅ Sign in successful!');
console.log('\n📋 JWT Token (copy this):');
console.log('─'.repeat(80));
console.log(data.session.access_token);
console.log('─'.repeat(80));
console.log('\n🔍 Token Info:');
console.log('User ID:', data.user.id);
console.log('Email:', data.user.email);
console.log('Expires:', new Date(data.session.expires_at * 1000).toLocaleString());
console.log('\n📝 Test commands:');
console.log(`
# Get profile
curl http://localhost:5005/profile \\
  -H "Authorization: Bearer ${data.session.access_token}"

# Update profile
curl -X PATCH http://localhost:5005/profile \\
  -H "Authorization: Bearer ${data.session.access_token}" \\
  -H "Content-Type: application/json" \\
  -d '{"display_name": "Updated Test User", "bio": "Testing profile updates"}'

# Get preferences
curl http://localhost:5005/profile/preferences \\
  -H "Authorization: Bearer ${data.session.access_token}"

# Update preferences
curl -X PATCH http://localhost:5005/profile/preferences \\
  -H "Authorization: Bearer ${data.session.access_token}" \\
  -H "Content-Type: application/json" \\
  -d '{"available_days": ["monday", "tuesday"], "is_accepting_requests": true}'
`);
