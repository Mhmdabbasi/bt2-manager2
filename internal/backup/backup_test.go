package backup

import (
	"bytes"
	"errors"
	"testing"
)

func TestEncryptedBackupRoundTrip(t *testing.T) {
	database := []byte("SQLite snapshot bytes")
	localKey := bytes.Repeat([]byte{0x5a}, 32)
	encrypted, err := Encrypt(database, localKey, "correct horse battery")
	if err != nil { t.Fatal(err) }
	gotDB, gotKey, err := Decrypt(encrypted, "correct horse battery")
	if err != nil { t.Fatal(err) }
	if !bytes.Equal(gotDB, database) || !bytes.Equal(gotKey, localKey) { t.Fatal("decrypted contents do not match") }
}

func TestEncryptedBackupRejectsWrongPasswordAndTampering(t *testing.T) {
	encrypted, err := Encrypt([]byte("database"), bytes.Repeat([]byte{1}, 32), "correct horse battery")
	if err != nil { t.Fatal(err) }
	if _, _, err := Decrypt(encrypted, "incorrect horse battery"); !errors.Is(err, ErrInvalidBackup) { t.Fatalf("wrong password err = %v", err) }
	encrypted[len(encrypted)-1] ^= 0xff
	if _, _, err := Decrypt(encrypted, "correct horse battery"); !errors.Is(err, ErrInvalidBackup) { t.Fatalf("tampered backup err = %v", err) }
}

func TestEncryptRequiresStrongPasswordAndKey(t *testing.T) {
	if _, err := Encrypt([]byte("database"), bytes.Repeat([]byte{1}, 32), "weak"); err == nil { t.Fatal("expected short password to fail") }
	if _, err := Encrypt([]byte("database"), []byte("short"), "correct horse battery"); err == nil { t.Fatal("expected invalid local key to fail") }
}
