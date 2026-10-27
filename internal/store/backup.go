package store

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"
)

// Snapshot returns a consistent SQLite database image without copying the live
// database or WAL files directly.
func (s *Store) Snapshot(ctx context.Context) ([]byte, error) { return SnapshotDB(ctx, s.db) }

func SnapshotDB(ctx context.Context, db *sql.DB) ([]byte, error) {
	file, err := os.CreateTemp("", "bt2-manager2-*.sqlite")
	if err != nil {
		return nil, fmt.Errorf("create database snapshot: %w", err)
	}
	path := file.Name()
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return nil, fmt.Errorf("close temporary snapshot: %w", err)
	}
	if err := os.Remove(path); err != nil {
		return nil, fmt.Errorf("prepare temporary snapshot: %w", err)
	}
	defer os.Remove(path)

	quotedPath := strings.ReplaceAll(path, "'", "''")
	if _, err := db.ExecContext(ctx, `VACUUM INTO '`+quotedPath+`'`); err != nil {
		return nil, fmt.Errorf("create consistent database snapshot: %w", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read database snapshot: %w", err)
	}
	return data, nil
}
