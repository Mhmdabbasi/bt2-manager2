ALTER TABLE packages ADD COLUMN distributor_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (distributor_price_minor >= 0);
ALTER TABLE distributors ADD COLUMN all_packages_enabled INTEGER NOT NULL DEFAULT 1 CHECK (all_packages_enabled IN (0, 1));

CREATE TABLE IF NOT EXISTS distributor_package_settings (
    distributor_id TEXT NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
    package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    allowed INTEGER NOT NULL DEFAULT 1 CHECK (allowed IN (0, 1)),
    username_prefix_override TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY(distributor_id, package_id)
);
CREATE INDEX IF NOT EXISTS distributor_package_settings_package_idx ON distributor_package_settings(package_id, allowed);
