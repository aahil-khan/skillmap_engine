-- ============================================
-- PEER MESSAGING SCHEMA
-- Simple messaging between connected peers
-- ============================================

-- Messages table
CREATE TABLE IF NOT EXISTS peer_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Connection reference
  connection_id UUID NOT NULL REFERENCES peer_connections(id) ON DELETE CASCADE,
  
  -- Message details
  sender_userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_userid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Content
  message_text TEXT NOT NULL,
  
  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT no_self_message CHECK (sender_userid != receiver_userid)
);

-- Indexes for peer_messages
CREATE INDEX IF NOT EXISTS idx_peer_messages_connection ON peer_messages(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_peer_messages_sender ON peer_messages(sender_userid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_peer_messages_receiver ON peer_messages(receiver_userid, is_read, created_at DESC);

COMMENT ON TABLE peer_messages IS 'Messages between connected peers';
COMMENT ON COLUMN peer_messages.connection_id IS 'References the peer connection';

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE peer_messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages they sent or received
CREATE POLICY "Users can view their own messages" ON peer_messages
  FOR SELECT
  USING (auth.uid() = sender_userid OR auth.uid() = receiver_userid);

-- Users can send messages if connection is accepted
CREATE POLICY "Users can send messages to connected peers" ON peer_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_userid 
    AND EXISTS (
      SELECT 1 FROM peer_connections 
      WHERE id = connection_id 
      AND status = 'accepted'
      AND (sender_userid = auth.uid() OR receiver_userid = auth.uid())
    )
  );

-- Users can mark their received messages as read
CREATE POLICY "Users can update received messages" ON peer_messages
  FOR UPDATE
  USING (auth.uid() = receiver_userid)
  WITH CHECK (auth.uid() = receiver_userid);

-- ============================================
-- HELPER FUNCTION: Update read status
-- ============================================

CREATE OR REPLACE FUNCTION mark_messages_as_read(p_connection_id UUID, p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE peer_messages
  SET 
    is_read = TRUE,
    read_at = NOW()
  WHERE 
    connection_id = p_connection_id
    AND receiver_userid = p_user_id
    AND is_read = FALSE;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION mark_messages_as_read IS 'Mark all unread messages in a connection as read';

-- ============================================
-- HELPER VIEW: Connection with unread count
-- ============================================

CREATE OR REPLACE VIEW peer_connections_with_unread AS
SELECT 
  pc.*,
  COALESCE(unread_sender.unread_count, 0) AS unread_from_receiver,
  COALESCE(unread_receiver.unread_count, 0) AS unread_from_sender
FROM peer_connections pc
LEFT JOIN (
  SELECT connection_id, receiver_userid, COUNT(*) AS unread_count
  FROM peer_messages
  WHERE is_read = FALSE
  GROUP BY connection_id, receiver_userid
) unread_sender ON pc.id = unread_sender.connection_id AND pc.sender_userid = unread_sender.receiver_userid
LEFT JOIN (
  SELECT connection_id, receiver_userid, COUNT(*) AS unread_count
  FROM peer_messages
  WHERE is_read = FALSE
  GROUP BY connection_id, receiver_userid
) unread_receiver ON pc.id = unread_receiver.connection_id AND pc.receiver_userid = unread_receiver.receiver_userid;

COMMENT ON VIEW peer_connections_with_unread IS 'Connections with unread message counts for both parties';
