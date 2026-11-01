package usermanager

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestReadUsersRouterOS6UsesLegacyPathsAndSafeFields(t *testing.T) {
	calls := make([]string, 0)
	read := func(_ context.Context, command, properties string) ([]map[string]string, error) {
		calls = append(calls, command)
		if strings.Contains(strings.ToLower(properties), "password") || strings.Contains(strings.ToLower(properties), "otp-secret") {
			t.Fatalf("sensitive user property requested: %q", properties)
		}
		switch command {
		case "/tool/user-manager/user/print":
			return []map[string]string{{".id": "*1", "customer": "admin", "username": "voucher-1", "password": "must-not-escape", "actual-profile": "day", "disabled": "no", "download-used": "1500", "upload-used": "900", "uptime-used": "5h"}}, nil
		case "/tool/user-manager/user/profile/print":
			return []map[string]string{{".id": "*2", "customer": "admin", "user": "voucher-1", "profile": "day", "state": "running active", "end-time": "2026-12-01 12:00:00"}}, nil
		default:
			t.Fatalf("unexpected command %q", command)
			return nil, nil
		}
	}

	got, err := readUsers(context.Background(), "6.49.17", read)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(calls, []string{"/tool/user-manager/user/print", "/tool/user-manager/user/profile/print"}) {
		t.Fatalf("unexpected RouterOS 6 commands: %#v", calls)
	}
	if len(got.Users) != 1 || got.Users[0].Name != "voucher-1" || got.Users[0].ActualProfile != "day" || got.Users[0].Customer != "admin" {
		t.Fatalf("unexpected normalized user: %#v", got.Users)
	}
	if got.Users[0].DownloadUsed != "1500" || got.Users[0].UploadUsed != "900" || got.Users[0].UptimeUsed != "5h" {
		t.Fatalf("legacy usage fields were not retained: %#v", got.Users[0])
	}
	if len(got.UserProfiles) != 1 || got.UserProfiles[0].State != "running active" || !got.ProfileAssignmentsAvailable {
		t.Fatalf("unexpected user profile assignment snapshot: %#v", got)
	}
	encoded := strings.ToLower(got.Users[0].Name + got.Users[0].Comment + got.Users[0].ActualProfile)
	if strings.Contains(encoded, "must-not-escape") {
		t.Fatal("sensitive value escaped into the normalized user")
	}
}

func TestReadUsersAllowsSameUsernameAcrossDifferentCustomers(t *testing.T) {
	read := func(_ context.Context, command, _ string) ([]map[string]string, error) {
		switch command {
		case "/tool/user-manager/user/print":
			return []map[string]string{{".id": "*1", "customer": "alpha", "username": "shared"}, {".id": "*2", "customer": "beta", "username": "shared"}}, nil
		case "/tool/user-manager/user/profile/print":
			return []map[string]string{{".id": "*3", "customer": "alpha", "user": "shared", "profile": "day"}, {".id": "*4", "customer": "beta", "user": "shared", "profile": "week"}}, nil
		default:
			return nil, errors.New("unexpected command: " + command)
		}
	}
	got, err := readUsers(context.Background(), "6.49.17", read)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Users) != 2 || got.Users[0].Name != "shared" || got.Users[1].Name != "shared" {
		t.Fatalf("users across customers were lost: %#v", got.Users)
	}
	if got.Users[0].Customer == got.Users[1].Customer {
		t.Fatalf("customer identity was not retained: %#v", got.Users)
	}
}

func TestReadUsersFallsBackToProfileAssignmentsWithoutStateFields(t *testing.T) {
	read := func(_ context.Context, command, properties string) ([]map[string]string, error) {
		if command == "/user-manager/user/print" {
			return []map[string]string{{".id": "*1", "name": "alice"}}, nil
		}
		if strings.Contains(properties, "state") || strings.Contains(properties, "end-time") {
			return nil, errors.New("unsupported property")
		}
		return []map[string]string{{".id": "*2", "user": "alice", "profile": "day"}}, nil
	}
	got, err := readUsers(context.Background(), "7.20", read)
	if err != nil {
		t.Fatal(err)
	}
	if !got.ProfileAssignmentsAvailable || len(got.UserProfiles) != 1 || got.ProfileAssignmentsWarning == "" {
		t.Fatalf("fallback profile assignment should be marked partial: %#v", got)
	}
}

func TestReadUsersRouterOS7UsesCurrentPathsAndDoesNotInventUsage(t *testing.T) {
	read := func(_ context.Context, command, properties string) ([]map[string]string, error) {
		if strings.Contains(strings.ToLower(properties), "password") || strings.Contains(strings.ToLower(properties), "otp-secret") {
			t.Fatalf("sensitive user property requested: %q", properties)
		}
		switch command {
		case "/user-manager/user/print":
			return []map[string]string{{".id": "*7", "name": "alice", "group": "default", "disabled": "yes"}}, nil
		case "/user-manager/user-profile/print":
			return []map[string]string{{".id": "*8", "user": "alice", "profile": "weekly", "state": "used", "end-time": "2026-10-01 00:00:00"}}, nil
		default:
			return nil, errors.New("unexpected command: " + command)
		}
	}
	got, err := readUsers(context.Background(), "7.20", read)
	if err != nil {
		t.Fatal(err)
	}
	if got.Users[0].Name != "alice" || !got.Users[0].Disabled || got.Users[0].Group != "default" {
		t.Fatalf("unexpected normalized user: %#v", got.Users[0])
	}
	if got.Users[0].DownloadUsed != "" || got.Users[0].UploadUsed != "" || got.Users[0].UptimeUsed != "" {
		t.Fatalf("RouterOS 7 usage was inferred instead of left absent: %#v", got.Users[0])
	}
	if got.UserProfiles[0].State != "used" {
		t.Fatalf("expired profile state was lost: %#v", got.UserProfiles[0])
	}
}

func TestReadUsersKeepsAccountsWhenProfileAssignmentReadFails(t *testing.T) {
	read := func(_ context.Context, command, _ string) ([]map[string]string, error) {
		if command == "/user-manager/user/print" {
			return []map[string]string{{".id": "*1", "name": "alice"}}, nil
		}
		return nil, errors.New("menu unavailable")
	}
	got, err := readUsers(context.Background(), "7.1", read)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Users) != 1 || got.ProfileAssignmentsAvailable || got.ProfileAssignmentsWarning == "" {
		t.Fatalf("user list should survive an unavailable assignment menu: %#v", got)
	}
}

func TestReadSessionsNormalizesRouterOS6FieldsAndActiveFlag(t *testing.T) {
	read := func(_ context.Context, command, properties string) ([]map[string]string, error) {
		if command != "/tool/user-manager/session/print" {
			t.Fatalf("unexpected command %q", command)
		}
		if strings.Contains(strings.ToLower(properties), "password") {
			t.Fatalf("unexpected sensitive property: %q", properties)
		}
		return []map[string]string{
			{".id": "*1", "customer": "admin", "user": "alice", "active": "yes", "status": "start,interim", "from-time": "2026-11-02 10:00:00", "till-time": "2026-11-02 12:00:00", "user-ip": "10.0.0.4", "host-ip": "10.0.0.1", "calling-station-id": "AA:BB", "upload": "12", "download": "34"},
			{".id": "*2", "user": "bob", "status": "stop", "from-time": "2026-11-01 10:00:00", "user-ip": "10.0.0.5"},
		}, nil
	}
	got, err := readSessions(context.Background(), "6.49.17", read)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Sessions) != 2 || !got.Sessions[0].Active || got.Sessions[1].Active {
		t.Fatalf("active session state was not normalized: %#v", got.Sessions)
	}
	active := got.Sessions[0]
	if active.Started == "" || active.ScheduledEnd == "" || active.UserAddress != "10.0.0.4" || active.NASAddress != "10.0.0.1" || active.Customer != "admin" {
		t.Fatalf("legacy session properties were not normalized: %#v", active)
	}
	if active.Ended != "" {
		t.Fatalf("till-time must not be reported as actual session end time: %#v", active)
	}
}

func TestReadSessionsFallsBackToSafeCommonFields(t *testing.T) {
	read := func(_ context.Context, command, properties string) ([]map[string]string, error) {
		if command != "/tool/user-manager/session/print" {
			t.Fatalf("unexpected command %q", command)
		}
		if strings.Contains(properties, "till-time") || strings.Contains(properties, "terminate-cause") {
			return nil, errors.New("unsupported property")
		}
		return []map[string]string{{".id": "*1", "user": "alice", "status": "start,interim", "from-time": "2026-11-02 10:00:00"}}, nil
	}
	got, err := readSessions(context.Background(), "6.49.17", read)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Sessions) != 1 || !got.Sessions[0].Active || got.Warning == "" {
		t.Fatalf("fallback session fields should be marked partial: %#v", got)
	}
}

func TestReadSessionsRouterOS7EndedSessionIsInactive(t *testing.T) {
	read := func(_ context.Context, command, _ string) ([]map[string]string, error) {
		if command != "/user-manager/session/print" {
			t.Fatalf("unexpected command %q", command)
		}
		return []map[string]string{{".id": "*3", "user": "alice", "status": "expired", "ended": "2026-10-30 11:00:00", "user-address": "192.0.2.5", "nas-ip-address": "192.0.2.1"}}, nil
	}
	got, err := readSessions(context.Background(), "7.20", read)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Sessions) != 1 || got.Sessions[0].Active || got.Sessions[0].Ended == "" || got.Sessions[0].UserAddress != "192.0.2.5" {
		t.Fatalf("unexpected RouterOS 7 session: %#v", got.Sessions)
	}
}
