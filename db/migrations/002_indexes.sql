CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_rooms_owner ON rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_items_room_pos ON playlist_items(room_id, position);
CREATE INDEX IF NOT EXISTS idx_messages_room_time ON messages(room_id, created_at);
