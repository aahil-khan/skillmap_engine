# Postman Collections for SkillMap Engine

This directory contains Postman collections and environments for testing the SkillMap Engine API.

## Files

- **SkillMap-Phase1.postman_collection.json** - Complete Phase 1 flow collection
- **SkillMap-Local.postman_environment.json** - Local development environment variables

## Setup Instructions

### 1. Import into Postman

1. Open Postman
2. Click **Import** in the top left
3. Drag both JSON files into the import window
4. Click **Import**

### 2. Configure Environment

1. Select **SkillMap - Local Development** from the environment dropdown (top right)
2. Click the eye icon to view/edit variables
3. Update these required variables:
   - `supabase_url`: Your Supabase project URL (e.g., `https://xxxxx.supabase.co`)
   - `supabase_anon_key`: Your Supabase anon key (from Project Settings → API)
   - `test_user_email`: Email for testing (default: `testuser1@example.com`)
   - `test_user_password`: Password for testing (default: `TestPassword123!`)

### 3. Test Flow Sequence

The collection is organized in the order you should execute requests:

#### **1. Authentication**
- **Sign Up** - Create a new user (first time only)
- **Sign In** - Use for existing users
- ✅ Auto-saves JWT token to environment

#### **2. Resume Upload & Processing**
- **Upload Resume** - Upload a PDF file
  - ⚠️ Update the file path in the request body
  - Skills are automatically extracted and normalized
  - Unmatched skills added to taxonomy with "Others" category
- **Get Resume Data** - Verify uploaded data

#### **3. Profile Management (Step 1 - Skills)**
- **Get Skills List** - View all extracted skills
- **Update Skills Proficiency** - Set proficiency levels
  - Copy skill IDs from GET response
  - Valid levels: `beginner`, `intermediate`, `advanced`, `expert`

#### **4. Profile Management (Step 2 - Goals & Bio)**
- **Get Profile** - View current profile state
- **Update Profile** - Complete profile with:
  - Display name and bio
  - Experience level: `entry`, `1-3years`, `3-5years`, `5+years`
  - Learning goals with timeframes
  - Availability preferences
- ✅ Triggers async embedding generation

#### **5. Peer Matching**
- **Get Match Recommendations** - Find compatible peers
  - Returns top 10 matches by default
  - Cached for 1 hour
  - Shows all 5 scoring factors

#### **6. Additional Utilities**
- **Health Check** - Verify API is running
- **Search Skills** - Query skill taxonomy

## Testing Multiple Users

To test peer matching, you need at least 2 users with profiles:

### Create User 1:
1. Set `test_user_email` to `user1@test.com`
2. Run **Sign Up** → **Upload Resume** → **Update Skills** → **Update Profile**

### Create User 2:
1. Set `test_user_email` to `user2@test.com`
2. Run **Sign Up** → **Upload Resume** → **Update Skills** → **Update Profile**

### Test Matching:
1. Sign in as User 1
2. Run **Get Match Recommendations**
3. Should see User 2 in results (if compatible)

## Sample Profile Data

### Frontend Developer Profile
```json
{
  "display_name": "Sarah Frontend",
  "bio": "Frontend developer specializing in React. Looking to learn backend technologies and system design.",
  "experience_level": "1-3years",
  "learning_goals": [
    {
      "original_goal": "Learn Node.js",
      "refined_goal": "Build REST APIs with Express and Node.js",
      "target_proficiency": "intermediate",
      "timeframe": "3months"
    }
  ],
  "preferences": {
    "available_days": ["Monday", "Wednesday", "Friday"],
    "preferred_time_slots": ["evening"],
    "is_searchable": true
  }
}
```

### Backend Developer Profile
```json
{
  "display_name": "Mike Backend",
  "bio": "Backend engineer with Node.js expertise. Want to learn React and frontend best practices.",
  "experience_level": "3-5years",
  "learning_goals": [
    {
      "original_goal": "Learn React",
      "refined_goal": "Master React hooks, state management, and component architecture",
      "target_proficiency": "advanced",
      "timeframe": "6months"
    }
  ],
  "preferences": {
    "available_days": ["Monday", "Wednesday", "Friday"],
    "preferred_time_slots": ["evening"],
    "is_searchable": true
  }
}
```

These two users should match well:
- **Shared Skills**: Both have JavaScript/web development experience
- **Complementary Skills**: Sarah wants Node.js (Mike has it), Mike wants React (Sarah has it)
- **Availability**: Both available Mon/Wed/Fri evenings

## Troubleshooting

### Authentication Errors
- Verify `supabase_url` and `supabase_anon_key` are correct
- Check that sign up worked (should auto-save `jwt_token`)
- Token expires after 1 hour - run **Sign In** again

### Resume Upload Fails
- Ensure file path is absolute and file exists
- Only PDF files supported
- File must be <10MB

### Matching Returns Empty
- Need at least 2 users with completed profiles
- Both users must have `is_searchable: true`
- Embeddings take a few seconds to generate (async)
- Wait 5-10 seconds after profile update before matching

### Skills Not Found
- Use **Search Skills** to verify skill exists in taxonomy
- Unmatched skills from resume are auto-added with "Others" category

## Environment Variables Reference

| Variable | Description | Auto-populated |
|----------|-------------|----------------|
| `base_url` | API server URL | No |
| `supabase_url` | Supabase project URL | No |
| `supabase_anon_key` | Supabase anon key | No |
| `test_user_email` | Test user email | No |
| `test_user_password` | Test user password | No |
| `jwt_token` | Auth JWT token | Yes (after sign up/in) |
| `user_id` | Current user UUID | Yes (after sign up/in) |
| `user_email` | Current user email | Yes (after sign up/in) |
| `resume_id` | Resume UUID | Yes (after upload) |

## Notes

- All requests except Authentication and Health Check require `Authorization: Bearer {{jwt_token}}`
- Environment variables use `{{variable_name}}` syntax
- Postman test scripts automatically save tokens and IDs
- Check Console tab for detailed logs after each request
