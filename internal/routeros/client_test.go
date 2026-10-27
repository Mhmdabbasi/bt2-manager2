package routerosadapter

import "testing"

func TestParseMajorVersion(t *testing.T) {
	cases := []struct {
		version string
		want    int
	}{
		{"6.49.19 (long-term)", 6}, {"7.15.3 (stable)", 7}, {" 7.1 ", 7}}
	for _, tc := range cases {
		got, err := ParseMajorVersion(tc.version)
		if err != nil || got != tc.want {
			t.Fatalf("ParseMajorVersion(%q) = %d, %v; want %d", tc.version, got, err, tc.want)
		}
	}
}

func TestParseMajorVersionRejectsUnknown(t *testing.T) {
	for _, version := range []string{"", "unknown", "0.1", "v7.1"} {
		if _, err := ParseMajorVersion(version); err == nil {
			t.Errorf("ParseMajorVersion(%q) should fail", version)
		}
	}
}
