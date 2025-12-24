-- ============================================
-- NOTIFICATIONS SCHEMA
-- User notifications for connection events and messages
-- ============================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- User receiving the notification
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Notification type
  type TEXT NOT NULL CHECK (type IN ('connection_request', 'connection_accepted', 'connection_rejected', 'new_message')),
  
  -- Notification content
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Related entities (optional)
  related_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  related_connection_id UUID REFERENCES peer_connections(id) ON DELETE CASCADE,
  related_message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  
  -- Read status
  read_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_type ON notifications(type);

-- Comments
COMMENT ON TABLE notifications IS 'User notifications for connection and message events';
COMMENT ON COLUMN notifications.type IS 'Type of notification: connection_request, connection_accepted, connection_rejected, new_message';

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only view their own notifications
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- System can create notifications (via service role)
CREATE POLICY "Service role can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_notifications_updated_at();
