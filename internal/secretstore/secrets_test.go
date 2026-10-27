package secretstore

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestEncryptDecryptAndAuthenticate(t *testing.T) {
	store, err := Open(t.TempDir())
	if err != nil { t.Fatal(err) }
	plaintext := []byte("voucher-secret-9841")
	ciphertext, err := store.Encrypt(plaintext)
	if err != nil { t.Fatal(err) }
	if bytes.Contains(ciphertext, plaintext) { t.Fatal("ciphertext contains plaintext") }
	decrypted, err := store.Decrypt(ciphertext)
	if err != nil { t.Fatal(err) }
	if !bytes.Equal(decrypted, plaintext) { t.Fatalf("Decrypt() = %q; want %q", decrypted, plaintext) }
	ciphertext[len(ciphertext)-1] ^= 1
	if _, err := store.Decrypt(ciphertext); err == nil { t.Fatal("tampered ciphertext should not authenticate") }
}

func TestKeyIsCreatedOnceAndReused(t *testing.T) {
	dir := t.TempDir()
	first, err := Open(dir); if err != nil { t.Fatal(err) }
	keyPath := filepath.Join(dir,"local-secret.key")
	keyBefore, err := os.ReadFile(keyPath); if err != nil { t.Fatal(err) }
	second, err := Open(dir); if err != nil { t.Fatal(err) }
	keyAfter, err := os.ReadFile(keyPath); if err != nil { t.Fatal(err) }
	if !bytes.Equal(keyBefore,keyAfter) { t.Fatal("key changed between opens") }
	ciphertext, err := first.Encrypt([]byte("restore-me")); if err != nil { t.Fatal(err) }
	decrypted, err := second.Decrypt(ciphertext); if err != nil { t.Fatal(err) }
	if string(decrypted)!="restore-me" { t.Fatalf("unexpected decrypted value: %q",decrypted) }
}
