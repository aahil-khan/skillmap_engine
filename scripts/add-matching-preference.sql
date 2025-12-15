-- Add matching_preference to peer_preferences table
-- This allows users to customize how matches are weighted

ALTER TABLE peer_preferences
ADD COLUMN matching_preference TEXT 
CHECK (matching_preference IN ('mentor', 'peer', 'mentee', 'balanced'))
DEFAULT 'balanced';

COMMENT ON COLUMN peer_preferences.matching_preference IS 
'User preference for match type:
- mentor: Looking to learn from others (boosts complementary skills)
- peer: Looking for equals at similar level (boosts shared skills)
- mentee: Looking to teach/help others (boosts helping opportunities)
- balanced: Default mix of all factors';
