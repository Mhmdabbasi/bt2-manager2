CREATE TABLE IF NOT EXISTS routers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
    use_tls INTEGER NOT NULL DEFAULT 1 CHECK (use_tls IN (0, 1)),
    last_version TEXT NOT NULL DEFAULT '',
    last_identity TEXT NOT NULL DEFAULT '',
    last_seen_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS routers_address_port_uq ON routers(address, port);

CREATE TABLE IF NOT EXISTS service_profiles (
    id TEXT PRIMARY KEY,
    router_id TEXT NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL CHECK (service_type IN ('hotspot', 'user_manager')),
    remote_id TEXT NOT NULL,
    name TEXT NOT NULL,
    attributes_json TEXT NOT NULL DEFAULT '{}',
    present INTEGER NOT NULL DEFAULT 1 CHECK (present IN (0, 1)),
    last_seen_at TEXT NOT NULL,
    UNIQUE(router_id, service_type, remote_id)
);

CREATE TABLE IF NOT EXISTS packages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    service_type TEXT NOT NULL CHECK (service_type IN ('hotspot', 'user_manager')),
    profile_name TEXT NOT NULL,
    username_prefix TEXT NOT NULL DEFAULT 'BT',
    validity_label TEXT NOT NULL DEFAULT '',
    price_minor INTEGER NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
    currency TEXT NOT NULL DEFAULT 'YER',
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    router_id TEXT NOT NULL REFERENCES routers(id),
    package_id TEXT NOT NULL REFERENCES packages(id),
    state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'partial', 'completed', 'needs_review', 'failed')),
    requested_count INTEGER NOT NULL CHECK (requested_count BETWEEN 1 AND 500),
    succeeded_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    template_version_id TEXT REFERENCES template_versions(id),
    created_at TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vouchers (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    router_id TEXT NOT NULL REFERENCES routers(id),
    package_id TEXT NOT NULL REFERENCES packages(id),
    remote_id TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL,
    password_ciphertext BLOB NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'active', 'failed', 'missing', 'disabled')),
    failure_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(router_id, username)
);

CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS template_versions (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    document_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(template_id, version)
);

CREATE TABLE IF NOT EXISTS distributors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    contact TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_events (
    id TEXT PRIMARY KEY,
    voucher_id TEXT NOT NULL REFERENCES vouchers(id),
    distributor_id TEXT REFERENCES distributors(id),
    from_distributor_id TEXT REFERENCES distributors(id),
    event_type TEXT NOT NULL CHECK (event_type IN ('issue', 'allocate', 'transfer', 'return', 'adjustment')),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    reference TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS stock_events_distributor_idx ON stock_events(distributor_id, created_at);
CREATE INDEX IF NOT EXISTS vouchers_batch_idx ON vouchers(batch_id);
