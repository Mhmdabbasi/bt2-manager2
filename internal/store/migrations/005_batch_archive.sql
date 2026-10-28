ALTER TABLE batches ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE batches ADD COLUMN outlet_name TEXT NOT NULL DEFAULT '';
ALTER TABLE batches ADD COLUMN printed_at TEXT NOT NULL DEFAULT '';
ALTER TABLE batches ADD COLUMN print_count INTEGER NOT NULL DEFAULT 0 CHECK (print_count >= 0);
ALTER TABLE batches ADD COLUMN package_name_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE batches ADD COLUMN service_type_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE batches ADD COLUMN profile_name_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE batches ADD COLUMN validity_label_snapshot TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS batches_created_idx ON batches(created_at, id);
