package usermanager

import (
	"errors"
	"strings"
	"testing"

	ros "github.com/Mhmdabbasi/routeros-api-Go"
)

func TestPathsForSupportedRouterOSVersions(t *testing.T) {
	v6, err := pathsForMajor(6)
	if err != nil {
		t.Fatal(err)
	}
	if v6.profiles != "/tool/user-manager/profile/print" || v6.relations != "/tool/user-manager/profile/profile-limitation/print" {
		t.Fatalf("unexpected v6 paths: %+v", v6)
	}
	v7, err := pathsForMajor(7)
	if err != nil {
		t.Fatal(err)
	}
	if v7.profiles != "/user-manager/profile/print" || v7.relations != "/user-manager/profile-limitation/print" {
		t.Fatalf("unexpected v7 paths: %+v", v7)
	}
	if _, err := pathsForMajor(8); !errors.Is(err, ErrUnsupportedVersion) {
		t.Fatalf("expected unsupported version, got %v", err)
	}
}

func TestSafePropertiesDropsSecrets(t *testing.T) {
	row := map[string]string{".id": "*1", "name": "Gold", "validity": "1d", "password": "secret", "shared-secret": "secret2"}
	got := safeProperties(row, ".id,name,validity,password,shared-secret")
	if got["name"] != "Gold" || got["validity"] != "1d" {
		t.Fatalf("unexpected safe values: %#v", got)
	}
	if _, ok := got["password"]; ok {
		t.Fatal("password was retained")
	}
	if _, ok := got["shared-secret"]; ok {
		t.Fatal("shared secret was retained")
	}
}

func TestRelationshipResolutionUsesReferenceAndOwner(t *testing.T) {
	profiles := []Profile{
		{SourceID: "*1", Name: "Gold", Properties: map[string]string{"owner": "owner-a"}},
		{SourceID: "*2", Name: "Gold", Properties: map[string]string{"owner": "owner-b"}},
	}
	if _, ok := matchProfile(profiles, "Gold", ""); ok {
		t.Fatal("ambiguous name without owner must not be resolved")
	}
	if got, ok := matchProfile(profiles, "Gold", "owner-b"); !ok || got.SourceID != "*2" {
		t.Fatalf("owner should disambiguate: %#v %v", got, ok)
	}
	if got, ok := matchProfile(profiles, "*1", ""); !ok || got.SourceID != "*1" {
		t.Fatalf("RouterOS ID reference should resolve: %#v %v", got, ok)
	}
}

func TestLimitationRelationshipCanResolveRouterOSID(t *testing.T) {
	limitations := []Limitation{{SourceID: "*7", Name: "Daily"}}
	if got, ok := matchLimitation(limitations, "*7", ""); !ok || got.Name != "Daily" {
		t.Fatalf("RouterOS ID reference should resolve: %#v %v", got, ok)
	}
}

func TestIncompleteRelationshipKeepsProfilesAndAddsWarnings(t *testing.T) {
	snapshot := Snapshot{
		Profiles:           []Profile{{SourceID: "*10", Name: "Gold"}},
		Limitations:        []Limitation{{SourceID: "*20", Name: "Daily"}},
		ProfileLimitations: make([]ProfileLimitation, 0),
		Warnings:           make([]string, 0),
	}
	resolveRelationships(&snapshot, []map[string]string{{".id": "*1"}}, ".id,profile,limitation")
	if len(snapshot.Profiles) != 1 || snapshot.Profiles[0].Name != "Gold" {
		t.Fatalf("incomplete relationship must not discard profiles: %#v", snapshot.Profiles)
	}
	if len(snapshot.ProfileLimitations) != 0 {
		t.Fatalf("incomplete relationship must not create a guessed link: %#v", snapshot.ProfileLimitations)
	}
	joined := strings.Join(snapshot.Warnings, " | ")
	if !strings.Contains(joined, "*1") || !strings.Contains(joined, "Gold") || !strings.Contains(joined, "Limitation") {
		t.Fatalf("expected relation and unlinked-profile warnings, got %q", joined)
	}
}

func TestValidRelationshipIsKeptWithoutWarnings(t *testing.T) {
	snapshot := Snapshot{
		Profiles:           []Profile{{SourceID: "*10", Name: "Gold"}},
		Limitations:        []Limitation{{SourceID: "*20", Name: "Daily"}},
		ProfileLimitations: make([]ProfileLimitation, 0),
		Warnings:           make([]string, 0),
	}
	resolveRelationships(&snapshot, []map[string]string{{".id": "*1", "profile": "*10", "limitation": "*20"}}, ".id,profile,limitation")
	if len(snapshot.ProfileLimitations) != 1 || snapshot.ProfileLimitations[0].ProfileName != "Gold" || snapshot.ProfileLimitations[0].LimitationName != "Daily" {
		t.Fatalf("valid relationship was not preserved: %#v", snapshot.ProfileLimitations)
	}
	if len(snapshot.Warnings) != 0 {
		t.Fatalf("valid relationship should not produce warnings: %#v", snapshot.Warnings)
	}
}

func TestParseRowsPreservesSuccessfulReplies(t *testing.T) {
	responses := []*ros.Response{
		{Type: ros.ResponseReply, Data: map[string]string{".id": "*1", "name": "Gold"}},
		{Type: ros.ResponseDone},
	}
	got, err := parseRows("/user-manager/profile/print", responses)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0]["name"] != "Gold" {
		t.Fatalf("unexpected rows: %#v", got)
	}
}

func TestParseRowsDoesNotTreatRouterOSTrapAsAnEmptyList(t *testing.T) {
	responses := []*ros.Response{{Type: ros.ResponseTrap, Message: "no such command"}}
	got, err := parseRows("/user-manager/profile/print", responses)
	if err == nil {
		t.Fatal("expected RouterOS trap to be returned as an error")
	}
	if got != nil {
		t.Fatalf("trap must not turn into a successful empty list: %#v", got)
	}
	if !strings.Contains(err.Error(), "no such command") || !strings.Contains(err.Error(), "/user-manager/profile/print") {
		t.Fatalf("command context missing from error: %v", err)
	}
}

func TestParseRowsDoesNotTreatFatalAsAnEmptyList(t *testing.T) {
	responses := []*ros.Response{{Type: ros.ResponseFatal, Message: "fatal api error"}}
	if _, err := parseRows("/tool/user-manager/profile/print", responses); err == nil {
		t.Fatal("expected RouterOS fatal response to be returned as an error")
	}
}
