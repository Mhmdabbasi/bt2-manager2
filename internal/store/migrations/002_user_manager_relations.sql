CREATE TABLE IF NOT EXISTS user_manager_profile_limitations (
    id TEXT PRIMARY KEY,
    router_id TEXT NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
    profile_remote_id TEXT NOT NULL,
    limitation_remote_id TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    attributes_json TEXT NOT NULL DEFAULT '{}',
    present INTEGER NOT NULL DEFAULT 1 CHECK (present IN (0, 1)),
    last_seen_at TEXT NOT NULL,
    UNIQUE(router_id, profile_remote_id, limitation_remote_id, position)
);
