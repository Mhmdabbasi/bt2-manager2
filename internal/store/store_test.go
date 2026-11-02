package store

import (
	"database/sql"
	"testing"
)

func TestOpenAppliesMigrationsAndEnforcesForeignKeys(t *testing.T) {
	st, err := Open(":memory:")
	if err != nil { t.Fatal(err) }
	defer st.Close()
	var count int
	if err := st.DB().QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&count); err != nil { t.Fatal(err) }
	files, err := migrationFiles.ReadDir("migrations")
	if err != nil { t.Fatal(err) }
	if count != len(files) { t.Fatalf("got %d applied migrations, want %d", count, len(files)) }
	if _, err := st.DB().Exec(`INSERT INTO service_profiles(id,router_id,service_type,remote_id,name,last_seen_at) VALUES('p','missing','hotspot','r','default','now')`); err == nil {
		t.Fatal("foreign key constraint should reject unknown router")
	}
}

func TestUserManagerSyncStateStoresSuccessfulReadMetadata(t *testing.T) {
	st, err := Open(":memory:")
	if err != nil { t.Fatal(err) }
	defer st.Close()
	if _, err := st.DB().Exec(`INSERT INTO routers(id,name,address,port,created_at) VALUES('router-1','test','192.0.2.1',8728,'now')`); err != nil { t.Fatal(err) }
	if _, err := st.DB().Exec(`INSERT INTO user_manager_sync_state(router_id,major_version,synced_at) VALUES('router-1',7,'2026-11-02T12:00:00Z')`); err != nil { t.Fatal(err) }
	var major int
	var syncedAt string
	if err := st.DB().QueryRow(`SELECT major_version,synced_at FROM user_manager_sync_state WHERE router_id='router-1'`).Scan(&major,&syncedAt); err != nil { t.Fatal(err) }
	if major != 7 || syncedAt != "2026-11-02T12:00:00Z" { t.Fatalf("got version %d at %q", major, syncedAt) }
}

func TestOpenCreatesFileAndIsIdempotent(t *testing.T) {
	path := t.TempDir()+"/app.sqlite"
	first, err := Open(path); if err != nil { t.Fatal(err) }; if err := first.Close(); err != nil { t.Fatal(err) }
	second, err := Open(path); if err != nil { t.Fatal(err) }; defer second.Close()
	var got string
	if err := second.DB().QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name='vouchers'`).Scan(&got); err != nil && err != sql.ErrNoRows { t.Fatal(err) }
	if got != "vouchers" { t.Fatalf("table name = %q", got) }
}
