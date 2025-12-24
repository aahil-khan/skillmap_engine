-- ============================================
-- MESSAGES SCHEMA (for peer_connections)
-- Messages between users with accepted connections
-- ============================================

-- Drop old messages table if exists (references old connections table)
DROP TABLE IF EXISTS messages CASCADE;

-- Create messages table for new peer_connections architecture
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Connection reference (must be accepted)
  connection_id UUID NOT NULL REFERENCES peer_connections(id) ON DELETE CASCADE,
  
  -- Sender and receiver (denormalized for query performance)
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Message content
  content TEXT NOT NULL CHECK (LENGTH(content) > 0 AND LENGTH(content) <= 5000),
  
  -- Read status
  read_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CHECK (sender_id != receiver_id)
);

-- Indexes for performance
CREATE INDEX idx_messages_connection_created ON messages(connection_id, created_at DESC);
CREATE INDEX idx_messages_receiver_unread ON messages(receiver_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_messages_sender ON messages(sender_id, created_at DESC);

-- Comments
COMMENT ON TABLE messages IS 'Direct messages between connected peers';
COMMENT ON COLUMN messages.connection_id IS 'Reference to peer_connections (must be accepted)';
COMMENT ON COLUMN messages.read_at IS 'Timestamp when receiver marked message as read';

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages they sent or received
CREATE POLICY "Users can view their own messages"
  ON messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Users can insert messages they send
CREATE POLICY "Users can send messages"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Users can update read_at only on messages they received
CREATE POLICY "Users can mark received messages as read"
  ON messages FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_messages_updated_at();
