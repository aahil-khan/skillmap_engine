-- ============================================
-- PEER CONNECTIONS SCHEMA
-- LinkedIn-style connection requests and accepted connections
-- ============================================

CREATE TABLE IF NOT EXISTS peer_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Sender initiates the connection request
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Receiver receives the connection request
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Connection type (e.g., mentorship, project partnership)
  connection_type TEXT NOT NULL CHECK (connection_type IN ('mentorship', 'project_partner', 'study_partner', 'general')),
  
  -- Connection status: pending (waiting for response), accepted, rejected, blocked
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')) DEFAULT 'pending',
  
  -- Optional message from sender when initiating connection
  sender_message TEXT,
  
  -- When receiver responded to the request
  responded_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(sender_id, receiver_id),
  CHECK (sender_id != receiver_id)
);

-- Indexes for performance
CREATE INDEX idx_peer_connections_sender ON peer_connections(sender_id, status);
CREATE INDEX idx_peer_connections_receiver ON peer_connections(receiver_id, status);
CREATE INDEX idx_peer_connections_status ON peer_connections(status);
CREATE INDEX idx_peer_connections_created ON peer_connections(created_at DESC);

-- Comments
COMMENT ON TABLE peer_connections IS 'Peer connection requests and active connections (LinkedIn-style)';
COMMENT ON COLUMN peer_connections.status IS 'pending: awaiting receiver response, accepted: both users connected, rejected: receiver declined, blocked: sender or receiver blocked';
COMMENT ON COLUMN peer_connections.sender_message IS 'Optional personalized message from sender when initiating connection';

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE peer_connections ENABLE ROW LEVEL SECURITY;

-- Users can view connections they're involved in
CREATE POLICY "Users can view connections involving them"
  ON peer_connections FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Users can insert connections (send request)
CREATE POLICY "Users can send connection requests"
  ON peer_connections FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Users can update connections they're involved in (accept/reject/cancel)
CREATE POLICY "Users can update connections involving them"
  ON peer_connections FOR UPDATE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Users can delete connections they initiated (cancel request)
CREATE POLICY "Users can delete their connection requests"
  ON peer_connections FOR DELETE
  USING (auth.uid() = sender_id);

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_peer_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_peer_connections_updated_at
  BEFORE UPDATE ON peer_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_peer_connections_updated_at();
