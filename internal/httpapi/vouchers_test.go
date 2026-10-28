package httpapi

import (
	"strings"
	"testing"
)

func TestRandomCodeModes(t *testing.T) {
	for _, test := range []struct {
		mode    string
		allowed string
	}{
		{mode: "letters", allowed: "ABCDEFGHIJKLMNOPQRSTUVWXYZ"},
		{mode: "numbers", allowed: "0123456789"},
		{mode: "alphanumeric", allowed: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"},
	} {
		code, err := randomCode(24, test.mode)
		if err != nil {
			t.Fatalf("randomCode(%q): %v", test.mode, err)
		}
		if len(code) != 24 {
			t.Fatalf("randomCode(%q) length = %d, want 24", test.mode, len(code))
		}
		for _, symbol := range code {
			if !strings.ContainsRune(test.allowed, symbol) {
				t.Fatalf("randomCode(%q) returned disallowed symbol %q", test.mode, symbol)
			}
		}
	}
}

func TestRandomCodeRejectsInvalidArguments(t *testing.T) {
	for _, test := range []struct {
		length int
		mode   string
	}{
		{length: 0, mode: "alphanumeric"},
		{length: 33, mode: "alphanumeric"},
		{length: 8, mode: "symbols"},
	} {
		if _, err := randomCode(test.length, test.mode); err == nil {
			t.Fatalf("randomCode(%d, %q) should fail", test.length, test.mode)
		}
	}
}

func TestSafeFailureDoesNotInsertRedactionForEmptyPassword(t *testing.T) {
	if got, want := safeFailure("router error", ""), "router error"; got != want {
		t.Fatalf("safeFailure() = %q, want %q", got, want)
	}
}
