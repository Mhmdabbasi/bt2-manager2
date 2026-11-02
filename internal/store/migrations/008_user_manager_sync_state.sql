CREATE TABLE IF NOT EXISTS user_manager_sync_state (
    router_id TEXT PRIMARY KEY REFERENCES routers(id) ON DELETE CASCADE,
    major_version INTEGER NOT NULL,
    synced_at TEXT NOT NULL
);
