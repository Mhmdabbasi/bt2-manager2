ALTER TABLE batches ADD COLUMN distributor_id TEXT REFERENCES distributors(id);
ALTER TABLE batches ADD COLUMN generation_options_json TEXT NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS batches_distributor_idx ON batches(distributor_id, created_at);
