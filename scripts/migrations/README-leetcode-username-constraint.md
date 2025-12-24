# LeetCode Username Constraint Removal Migration

## Summary
Removed the `UNIQUE` constraint from `leetcode_username` column in the `leetcode_profiles` table.

## Rationale
1. **Prevents username squatting**: Without this change, any user could claim a LeetCode username and prevent the actual owner from linking their profile
2. **Allows comparison tracking**: Multiple users can now track the same public LeetCode profile for learning/comparison purposes
3. **Public data**: LeetCode profiles are public, so there's no privacy concern with multiple users referencing the same username

## What Changed

### Before:
```sql
leetcode_username TEXT NOT NULL UNIQUE
```
- Only ONE user could link to username "johndoe"
- If User A claimed it, User B (the actual owner) would get a database error

### After:
```sql
leetcode_username TEXT NOT NULL
```
- Multiple users can link to username "johndoe"
- Each user still has only ONE LeetCode profile (enforced by `user_id UNIQUE`)
- The non-unique index remains for query performance

## Migration Steps

### For Existing Databases:
```bash
# Run the migration script
psql -h your-supabase-host -U postgres -d postgres -f scripts/migrations/remove-leetcode-username-unique-constraint.sql
```

### For New Databases:
The updated `scripts/create-schema.sql` already has the constraint removed. Just run the normal setup:
```bash
psql -h your-supabase-host -U postgres -d postgres -f scripts/create-schema.sql
```

## Code Impact
✅ **No code changes needed** - The upsert logic already uses `onConflict: 'user_id'`, not username:

```typescript
await supabase
  .from('leetcode_profiles')
  .upsert({ user_id: userId, leetcode_username: username, ... }, {
    onConflict: 'user_id'  // ✅ Correct - updates based on user, not username
  });
```

## Testing
To verify the migration worked:
1. User A syncs with username "test_user" → ✅ Success
2. User B syncs with username "test_user" → ✅ Success (previously would fail)
3. User A syncs again with username "test_user" → ✅ Updates User A's profile
4. User B tries to create a second profile → ❌ Fails (user_id UNIQUE still enforced)

## Rollback
If needed, to restore the unique constraint:
```sql
-- Add back the unique constraint
ALTER TABLE leetcode_profiles 
ADD CONSTRAINT leetcode_profiles_leetcode_username_key UNIQUE (leetcode_username);
```

⚠️ **Warning**: This will fail if multiple users already have the same username in the database.
