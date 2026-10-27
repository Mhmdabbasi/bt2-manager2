// Package backup provides authenticated, password-encrypted application backups.
package backup

import (
	"archive/zip"
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"fmt"
	"io"

	"golang.org/x/crypto/scrypt"
)

var magic = []byte("BT2BKP01")
var ErrInvalidBackup = errors.New("invalid backup or incorrect password")

const (
	saltSize       = 16
	scryptN        = 1 << 15
	scryptR        = 8
	scryptP        = 1
	maxBackupBytes = 512 << 20
)

// Encrypt packages a consistent database snapshot and the local encryption key
// into a single authenticated archive protected by a user-chosen passphrase.
func Encrypt(database, localKey []byte, password string) ([]byte, error) {
	if len(password) < 12 || len(password) > 1024 {
		return nil, fmt.Errorf("backup password must be between 12 and 1024 characters")
	}
	if len(database) == 0 || len(database) > maxBackupBytes || len(localKey) != 32 {
		return nil, fmt.Errorf("invalid backup contents")
	}
	var archive bytes.Buffer
	zw := zip.NewWriter(&archive)
	for _, file := range []struct {
		name string
		data []byte
	}{{"database.sqlite", database}, {"local.key", localKey}} {
		entry, err := zw.Create(file.name)
		if err != nil { return nil, fmt.Errorf("create backup archive: %w", err) }
		if _, err := entry.Write(file.data); err != nil { return nil, fmt.Errorf("write backup archive: %w", err) }
	}
	if err := zw.Close(); err != nil { return nil, fmt.Errorf("finish backup archive: %w", err) }
	if archive.Len() > maxBackupBytes { return nil, fmt.Errorf("backup exceeds size limit") }

	salt := make([]byte, saltSize)
	if _, err := rand.Read(salt); err != nil { return nil, fmt.Errorf("generate backup salt: %w", err) }
	key, err := scrypt.Key([]byte(password), salt, scryptN, scryptR, scryptP, 32)
	if err != nil { return nil, fmt.Errorf("derive backup key: %w", err) }
	block, err := aes.NewCipher(key)
	if err != nil { return nil, fmt.Errorf("initialize backup encryption: %w", err) }
	gcm, err := cipher.NewGCM(block)
	if err != nil { return nil, fmt.Errorf("initialize backup authentication: %w", err) }
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil { return nil, fmt.Errorf("generate backup nonce: %w", err) }
	header := make([]byte, 0, len(magic)+saltSize+len(nonce))
	header = append(header, magic...)
	header = append(header, salt...)
	header = append(header, nonce...)
	return append(header, gcm.Seal(nil, nonce, archive.Bytes(), header)...), nil
}

// Decrypt validates an encrypted backup and returns its database image and key.
func Decrypt(encrypted []byte, password string) ([]byte, []byte, error) {
	if len(password) < 1 || len(password) > 1024 || len(encrypted) < len(magic)+saltSize+12+16 || len(encrypted) > maxBackupBytes+1024 || !bytes.Equal(encrypted[:len(magic)], magic) {
		return nil, nil, ErrInvalidBackup
	}
	headerLength := len(magic) + saltSize + 12
	header := encrypted[:headerLength]
	salt := encrypted[len(magic):len(magic)+saltSize]
	nonce := encrypted[len(magic)+saltSize:headerLength]
	key, err := scrypt.Key([]byte(password), salt, scryptN, scryptR, scryptP, 32)
	if err != nil { return nil, nil, ErrInvalidBackup }
	block, err := aes.NewCipher(key)
	if err != nil { return nil, nil, ErrInvalidBackup }
	gcm, err := cipher.NewGCM(block)
	if err != nil { return nil, nil, ErrInvalidBackup }
	plain, err := gcm.Open(nil, nonce, encrypted[headerLength:], header)
	if err != nil { return nil, nil, ErrInvalidBackup }
	zr, err := zip.NewReader(bytes.NewReader(plain), int64(len(plain)))
	if err != nil || len(zr.File) != 2 { return nil, nil, ErrInvalidBackup }
	contents := map[string][]byte{}
	for _, file := range zr.File {
		if file.UncompressedSize64 > maxBackupBytes { return nil, nil, ErrInvalidBackup }
		if file.Name != "database.sqlite" && file.Name != "local.key" { return nil, nil, ErrInvalidBackup }
		rc, err := file.Open()
		if err != nil { return nil, nil, ErrInvalidBackup }
		data, readErr := io.ReadAll(io.LimitReader(rc, maxBackupBytes+1))
		closeErr := rc.Close()
		if readErr != nil || closeErr != nil || int64(len(data)) > maxBackupBytes { return nil, nil, ErrInvalidBackup }
		contents[file.Name] = data
	}
	database, dbOK := contents["database.sqlite"]
	localKey, keyOK := contents["local.key"]
	if !dbOK || !keyOK || len(database) == 0 || len(localKey) != 32 { return nil, nil, ErrInvalidBackup }
	return database, localKey, nil
}
