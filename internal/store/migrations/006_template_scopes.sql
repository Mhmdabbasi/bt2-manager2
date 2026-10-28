ALTER TABLE templates ADD COLUMN service_type TEXT NOT NULL DEFAULT 'hotspot';
ALTER TABLE templates ADD COLUMN package_id TEXT REFERENCES packages(id) ON DELETE SET NULL;
ALTER TABLE templates ADD COLUMN distributor_id TEXT REFERENCES distributors(id) ON DELETE SET NULL;
ALTER TABLE templates ADD COLUMN scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'package', 'distributor'));
ALTER TABLE templates ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1));
CREATE INDEX IF NOT EXISTS templates_scope_idx ON templates(scope, package_id, distributor_id, archived);
