-- ============================================
-- PEER MATCHING DATABASE SCHEMA
-- ============================================
-- Run this in Supabase SQL Editor
-- This creates tables for the peer matching MVP

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. PEER PROFILES TABLE
-- ============================================
-- Public opt-in profiles for peer matching
CREATE TABLE IF NOT EXISTS peer_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  userid UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Basic Info
  display_name TEXT NOT NULL,
  title TEXT NOT NULL,
  bio TEXT NOT NULL,
  avatar_url TEXT,
  
  -- Location & Availability
  location TEXT,
  timezone TEXT,
  experience_level TEXT CHECK (experience_level IN ('Entry Level', '1-3 years', '3-5 years', '5+ years', 'Student')),
  availability TEXT CHECK (availability IN ('Full-time', 'Part-time', 'Weekends only', 'Evenings', 'Flexible')),
  
  -- What they're looking for
  looking_for TEXT[], -- ['Project Collaborators', 'Study Partners', 'Mentorship', etc.]
  
  -- Social Links
  github_url TEXT,
  linkedin_url TEXT,
  portfolio_url TEXT,
  
  -- Profile Status
  is_active BOOLEAN DEFAULT true,
  is_open_to_connections BOOLEAN DEFAULT true,
  
  -- Matching Metadata (for faster queries)
  skill_tags TEXT[], -- Top skills for quick matching
  interest_areas TEXT[], -- ['Web Dev', 'Mobile', 'ML', 'DSA', etc.]
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for peer_profiles
CREATE INDEX IF NOT EXISTS idx_peer_profiles_userid ON peer_profiles(userid);
CREATE INDEX IF NOT EXISTS idx_peer_profiles_active ON peer_profiles(is_active, is_open_to_connections) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_peer_profiles_skill_tags ON peer_profiles USING GIN(skill_tags);
CREATE INDEX IF NOT EXISTS idx_peer_profiles_interest_areas ON peer_profiles USING GIN(interest_areas);
CREATE INDEX IF NOT EXISTS idx_peer_profiles_experience ON peer_profiles(experience_level) WHERE is_active = true;

COMMENT ON TABLE peer_profiles IS 'Public opt-in profiles for peer matching';
COMMENT ON COLUMN peer_profiles.skill_tags IS 'Top 10 skills for quick filtering';
COMMENT ON COLUMN peer_profiles.interest_areas IS 'Areas like Web Dev, Mobile, ML, DSA, etc.';

-- ============================================
-- 2. PEER CONNECTIONS TABLE
-- ============================================
-- Connection requests between users (Tinder-style)
CREATE TABLE IF NOT EXISTS peer_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Connection Parties
  sender_userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Connection Type
  connection_type TEXT CHECK (connection_type IN ('project_partner', 'study_partner', 'mentorship', 'general')),
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
  
  -- Messages
  sender_message TEXT, -- Optional message with connection request
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  
  -- Prevent duplicate connections
  CONSTRAINT unique_connection UNIQUE(sender_userid, receiver_userid),
  
  -- Prevent self-connections
  CONSTRAINT no_self_connection CHECK (sender_userid != receiver_userid)
);

-- Indexes for peer_connections
CREATE INDEX IF NOT EXISTS idx_peer_connections_sender ON peer_connections(sender_userid, status);
CREATE INDEX IF NOT EXISTS idx_peer_connections_receiver ON peer_connections(receiver_userid, status);
CREATE INDEX IF NOT EXISTS idx_peer_connections_status ON peer_connections(status, created_at DESC);

COMMENT ON TABLE peer_connections IS 'Connection requests between users (Tinder-style matching)';
COMMENT ON COLUMN peer_connections.sender_message IS 'Optional message sent with connection request';

-- ============================================
-- 3. PEER MATCH SCORES TABLE
-- ============================================
-- Pre-computed match scores for performance
CREATE TABLE IF NOT EXISTS peer_match_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- The two users being matched
  user1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Match Scores (0-100)
  overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  skill_overlap_score INTEGER CHECK (skill_overlap_score >= 0 AND skill_overlap_score <= 100),
  complementary_score INTEGER CHECK (complementary_score >= 0 AND complementary_score <= 100),
  goal_alignment_score INTEGER CHECK (goal_alignment_score >= 0 AND goal_alignment_score <= 100),
  experience_compatibility INTEGER CHECK (experience_compatibility >= 0 AND experience_compatibility <= 100),
  
  -- Match Details
  shared_skills TEXT[],
  complementary_skills TEXT[], -- Skills user2 has that user1 wants to learn
  shared_interests TEXT[],
  
  -- Match Type
  match_type TEXT CHECK (match_type IN ('project', 'dsa', 'both')),
  
  -- Cache Management
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'), -- Recalculate weekly
  
  -- Prevent duplicates
  CONSTRAINT unique_match_pair UNIQUE(user1_id, user2_id),
  
  -- Prevent self-matching
  CONSTRAINT no_self_match CHECK (user1_id != user2_id)
);

-- Indexes for peer_match_scores
CREATE INDEX IF NOT EXISTS idx_peer_match_scores_user1 ON peer_match_scores(user1_id, overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_peer_match_scores_user2 ON peer_match_scores(user2_id, overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_peer_match_scores_expires ON peer_match_scores(expires_at);
CREATE INDEX IF NOT EXISTS idx_peer_match_scores_type ON peer_match_scores(match_type, overall_score DESC);

COMMENT ON TABLE peer_match_scores IS 'Pre-computed match scores cached for 7 days';
COMMENT ON COLUMN peer_match_scores.complementary_skills IS 'Skills that complement each other for learning';

-- ============================================
-- 4. PEER INTERACTIONS TABLE
-- ============================================
-- Track user interactions for algorithm improvement
CREATE TABLE IF NOT EXISTS peer_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- User and the peer they interacted with
  userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  peer_userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Interaction Type
  action TEXT NOT NULL CHECK (action IN ('view', 'skip', 'connect', 'block')),
  
  -- Context
  match_score INTEGER, -- What was the match score when they interacted?
  interaction_context TEXT, -- 'project', 'dsa', etc.
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for peer_interactions
CREATE INDEX IF NOT EXISTS idx_peer_interactions_userid ON peer_interactions(userid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_peer_interactions_peer ON peer_interactions(peer_userid);
CREATE INDEX IF NOT EXISTS idx_peer_interactions_action ON peer_interactions(action, created_at DESC);

COMMENT ON TABLE peer_interactions IS 'Track user interactions (view/skip/connect) for algorithm learning';
COMMENT ON COLUMN peer_interactions.match_score IS 'Match score at time of interaction';

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all peer matching tables
ALTER TABLE peer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE peer_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE peer_match_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE peer_interactions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES - PEER PROFILES
-- ============================================

-- Anyone can view active public profiles
CREATE POLICY "Anyone can view active peer profiles" ON peer_profiles
  FOR SELECT USING (is_active = true AND is_open_to_connections = true);

-- Users can view their own profile (even if inactive)
CREATE POLICY "Users can view their own peer profile" ON peer_profiles
  FOR SELECT USING (auth.uid() = userid);

-- Users can insert their own profile
CREATE POLICY "Users can create their own peer profile" ON peer_profiles
  FOR INSERT WITH CHECK (auth.uid() = userid);

-- Users can update their own profile
CREATE POLICY "Users can update their own peer profile" ON peer_profiles
  FOR UPDATE USING (auth.uid() = userid);

-- Users can delete their own profile
CREATE POLICY "Users can delete their own peer profile" ON peer_profiles
  FOR DELETE USING (auth.uid() = userid);

-- ============================================
-- RLS POLICIES - PEER CONNECTIONS
-- ============================================

-- Users can view connections where they are sender or receiver
CREATE POLICY "Users can view their own connections" ON peer_connections
  FOR SELECT USING (auth.uid() = sender_userid OR auth.uid() = receiver_userid);

-- Users can create connections as sender
CREATE POLICY "Users can send connection requests" ON peer_connections
  FOR INSERT WITH CHECK (auth.uid() = sender_userid);

-- Receivers can update status (accept/decline)
CREATE POLICY "Receivers can respond to requests" ON peer_connections
  FOR UPDATE USING (auth.uid() = receiver_userid);

-- Users can delete their own sent connections (withdraw request)
CREATE POLICY "Senders can delete their own requests" ON peer_connections
  FOR DELETE USING (auth.uid() = sender_userid);

-- ============================================
-- RLS POLICIES - PEER MATCH SCORES
-- ============================================

-- Users can view their own match scores
CREATE POLICY "Users can view their matches" ON peer_match_scores
  FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- System can insert match scores (no user policy needed for INSERT)
-- Match scores are calculated by backend service

-- ============================================
-- RLS POLICIES - PEER INTERACTIONS
-- ============================================

-- Users can view their own interactions
CREATE POLICY "Users can view their own interactions" ON peer_interactions
  FOR SELECT USING (auth.uid() = userid);

-- Users can insert their own interactions
CREATE POLICY "Users can insert their own interactions" ON peer_interactions
  FOR INSERT WITH CHECK (auth.uid() = userid);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at on peer_profiles
CREATE OR REPLACE FUNCTION update_peer_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_peer_profiles_updated_at
  BEFORE UPDATE ON peer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_peer_profiles_updated_at();

-- Update responded_at on peer_connections when status changes
CREATE OR REPLACE FUNCTION update_peer_connections_responded_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status != OLD.status AND NEW.status IN ('accepted', 'declined', 'blocked') THEN
    NEW.responded_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_peer_connections_responded_at
  BEFORE UPDATE ON peer_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_peer_connections_responded_at();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to clean up expired match scores
CREATE OR REPLACE FUNCTION cleanup_expired_match_scores()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM peer_match_scores WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_match_scores IS 'Delete match scores older than 7 days';

-- Function to get active peer count
CREATE OR REPLACE FUNCTION get_active_peer_count()
RETURNS INTEGER AS $$
DECLARE
  count INTEGER;
BEGIN
  SELECT COUNT(*) INTO count 
  FROM peer_profiles 
  WHERE is_active = true AND is_open_to_connections = true;
  RETURN count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_active_peer_count IS 'Get count of active peers available for matching';

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
DECLARE
  peer_count INTEGER;
BEGIN
  peer_count := get_active_peer_count();
  
  RAISE NOTICE '✅ Peer Matching Schema Created Successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Tables Created:';
  RAISE NOTICE '  - peer_profiles (public opt-in profiles)';
  RAISE NOTICE '  - peer_connections (connection requests)';
  RAISE NOTICE '  - peer_match_scores (pre-computed matches)';
  RAISE NOTICE '  - peer_interactions (algorithm learning)';
  RAISE NOTICE '';
  RAISE NOTICE '🔒 Row Level Security (RLS) enabled on all tables';
  RAISE NOTICE '📈 Indexes created for optimal query performance';
  RAISE NOTICE '⚡ Triggers set up for automatic timestamps';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Next Steps:';
  RAISE NOTICE '  1. Verify tables in Supabase Dashboard';
  RAISE NOTICE '  2. Build backend services (peerMatchingService.js)';
  RAISE NOTICE '  3. Create API routes (routes/peerMatching.js)';
  RAISE NOTICE '';
  RAISE NOTICE '👥 Active Peers: %', peer_count;
END $$;
