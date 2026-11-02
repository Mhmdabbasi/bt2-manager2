package usermanager

import (
	"context"
	"fmt"
	"strings"

	ros "github.com/Mhmdabbasi/routeros-api-Go"
)

type User struct {
	SourceID       string       `json:"source_id"`
	Name           string       `json:"name"`
	Customer       string       `json:"customer,omitempty"`
	Disabled       bool         `json:"disabled"`
	Comment        string       `json:"comment,omitempty"`
	Group          string       `json:"group,omitempty"`
	SharedUsers    string       `json:"shared_users,omitempty"`
	CallerID       string       `json:"caller_id,omitempty"`
	ActualProfile  string       `json:"actual_profile,omitempty"`
	ActiveSessions string       `json:"active_sessions,omitempty"`
	DownloadUsed   string       `json:"download_used,omitempty"`
	UploadUsed     string       `json:"upload_used,omitempty"`
	UptimeUsed     string       `json:"uptime_used,omitempty"`
	LastSeen       string       `json:"last_seen,omitempty"`
	LocalOrigin    *LocalOrigin `json:"local_origin,omitempty"`
}

type LocalOrigin struct {
	PackageName     string `json:"package_name"`
	BatchID         string `json:"batch_id"`
	DistributorName string `json:"distributor_name,omitempty"`
}

type UserProfile struct {
	SourceID string `json:"source_id"`
	User     string `json:"user"`
	Customer string `json:"customer,omitempty"`
	Profile  string `json:"profile"`
	State    string `json:"state,omitempty"`
	EndTime  string `json:"end_time,omitempty"`
}

type UserDirectory struct {
	MajorVersion                int           `json:"major_version"`
	Users                       []User        `json:"users"`
	UserProfiles                []UserProfile `json:"user_profiles"`
	ProfileAssignmentsAvailable bool          `json:"profile_assignments_available"`
	ProfileAssignmentsWarning   string        `json:"profile_assignments_warning,omitempty"`
	LocalOriginMappingAvailable bool          `json:"local_origin_mapping_available"`
	LocalOriginMappingWarning   string        `json:"local_origin_mapping_warning,omitempty"`
}

type Session struct {
	SourceID          string `json:"source_id"`
	User              string `json:"user"`
	Customer          string `json:"customer,omitempty"`
	Active            bool   `json:"active"`
	Status            string `json:"status,omitempty"`
	Started           string `json:"started,omitempty"`
	Ended             string `json:"ended,omitempty"`
	ScheduledEnd      string `json:"scheduled_end,omitempty"`
	Uptime            string `json:"uptime,omitempty"`
	Download           string `json:"download,omitempty"`
	Upload             string `json:"upload,omitempty"`
	CallingStationID  string `json:"calling_station_id,omitempty"`
	UserAddress       string `json:"user_address,omitempty"`
	NASAddress        string `json:"nas_address,omitempty"`
	NASIdentifier     string `json:"nas_identifier,omitempty"`
	NASPortID         string `json:"nas_port_id,omitempty"`
	NASPortType       string `json:"nas_port_type,omitempty"`
	LastAccounting    string `json:"last_accounting_packet,omitempty"`
	TerminateCause    string `json:"terminate_cause,omitempty"`
}

type SessionSnapshot struct {
	MajorVersion int       `json:"major_version"`
	Sessions     []Session `json:"sessions"`
	Warning      string    `json:"warning,omitempty"`
}

type rowReader func(context.Context, string, string) ([]map[string]string, error)

type userPaths struct {
	users, profiles, sessions                                          string
	userProperties, userProfileProperties, userProfileFallbackProperties string
	sessionProperties, sessionFallbackProperties                        string
}

func userPathsForMajor(major int) (userPaths, error) {
	switch major {
	case 6:
		return userPaths{
			users:                 "/tool/user-manager/user/print",
			profiles:              "/tool/user-manager/user/profile/print",
			sessions:              "/tool/user-manager/session/print",
			userProperties:                 ".id,customer,username,actual-profile,disabled,comment,shared-users,caller-id,download-used,upload-used,uptime-used,last-seen",
			userProfileProperties:          ".id,customer,user,profile,state,end-time",
			userProfileFallbackProperties:  ".id,customer,user,profile",
			sessionProperties:             ".id,customer,user,acct-session-id,active,status,from-time,till-time,uptime,download,upload,calling-station-id,user-ip,host-ip,nas-port-id,nas-port-type,terminate-cause",
			sessionFallbackProperties:     ".id,customer,user,acct-session-id,status,from-time,uptime,download,upload,calling-station-id,user-ip,host-ip",
		}, nil
	case 7:
		return userPaths{
			users:                 "/user-manager/user/print",
			profiles:              "/user-manager/user-profile/print",
			sessions:              "/user-manager/session/print",
			userProperties:                 ".id,name,disabled,comment,group,shared-users,caller-id",
			userProfileProperties:          ".id,user,profile,state,end-time",
			userProfileFallbackProperties:  ".id,user,profile",
			sessionProperties:             ".id,user,acct-session-id,active,status,started,ended,uptime,download,upload,calling-station-id,user-address,nas-ip-address,nas-identifier,nas-port-id,nas-port-type,last-accounting-packet,terminate-cause",
			sessionFallbackProperties:     ".id,user,acct-session-id,active,status,started,ended,uptime,download,upload,calling-station-id,user-address,nas-ip-address",
		}, nil
	default:
		return userPaths{}, ErrUnsupportedVersion
	}
}

// ReadUsers reads only an explicit allowlist of non-secret user fields. Profile
// assignment reads are optional so accounts remain visible when profiles are not
// configured or the router exposes a different assignment menu.
func ReadUsers(ctx context.Context, api *ros.API, version string) (UserDirectory, error) {
	return readUsers(ctx, version, func(ctx context.Context, command, properties string) ([]map[string]string, error) {
		return readRows(ctx, api, command, properties)
	})
}

func readUsers(ctx context.Context, version string, read rowReader) (UserDirectory, error) {
	major, err := parseMajor(version)
	if err != nil {
		return UserDirectory{}, err
	}
	p, err := userPathsForMajor(major)
	if err != nil {
		return UserDirectory{}, err
	}
	usersRaw, err := read(ctx, p.users, p.userProperties)
	if err != nil {
		return UserDirectory{}, fmt.Errorf("read User Manager users: %w", err)
	}

	result := UserDirectory{
		MajorVersion: major,
		Users:        make([]User, 0, len(usersRaw)),
		UserProfiles: make([]UserProfile, 0),
	}
	seen := make(map[string]struct{}, len(usersRaw))
	for _, row := range usersRaw {
		name := firstValue(row, "name", "username")
		customer := strings.TrimSpace(row["customer"])
		if name == "" {
			return UserDirectory{}, fmt.Errorf("%w: User Manager user is missing its username", ErrInvalidSnapshot)
		}
		key := userRecordKey(customer, name)
		if _, exists := seen[key]; exists {
			return UserDirectory{}, fmt.Errorf("%w: duplicate User Manager user identity", ErrInvalidSnapshot)
		}
		seen[key] = struct{}{}
		// A fallback is only a display identity and is never used as a RouterOS mutation target.
		id := sourceIdentity(row, key)
		result.Users = append(result.Users, User{
			SourceID:       id,
			Name:           name,
			Customer:       customer,
			Disabled:       parseBoolean(row["disabled"]),
			Comment:        strings.TrimSpace(row["comment"]),
			Group:          strings.TrimSpace(row["group"]),
			SharedUsers:    firstValue(row, "shared-users"),
			CallerID:       strings.TrimSpace(row["caller-id"]),
			ActualProfile:  strings.TrimSpace(row["actual-profile"]),
			ActiveSessions: firstValue(row, "active-sessions"),
			DownloadUsed:   firstValue(row, "download-used"),
			UploadUsed:     firstValue(row, "upload-used"),
			UptimeUsed:     firstValue(row, "uptime-used"),
			LastSeen:       firstValue(row, "last-seen"),
		})
	}

	profilesRaw, err := read(ctx, p.profiles, p.userProfileProperties)
	if err != nil {
		profilesRaw, err = read(ctx, p.profiles, p.userProfileFallbackProperties)
		if err != nil {
			result.ProfileAssignmentsAvailable = false
			result.ProfileAssignmentsWarning = "تعذر قراءة إسنادات الملفات من الراوتر؛ بيانات المستخدمين الأساسية ما زالت معروضة."
			return result, nil
		}
		result.ProfileAssignmentsWarning = "أعاد الراوتر إسنادات الملفات دون بعض حقول الحالة/الانتهاء؛ القيم غير المتاحة لن تُستنتج."
	}
	result.ProfileAssignmentsAvailable = true
	result.UserProfiles = make([]UserProfile, 0, len(profilesRaw))
	profileIDs := make(map[string]struct{}, len(profilesRaw))
	for index, row := range profilesRaw {
		user := firstValue(row, "user", "username")
		profile := strings.TrimSpace(row["profile"])
		if user == "" || profile == "" {
			return UserDirectory{}, fmt.Errorf("%w: User Manager profile assignment is incomplete", ErrInvalidSnapshot)
		}
		id := sourceIdentity(row, fmt.Sprintf("%s|%s|%d", userRecordKey(strings.TrimSpace(row["customer"]), user), profile, index))
		if _, exists := profileIDs[id]; exists {
			return UserDirectory{}, fmt.Errorf("%w: duplicate User Manager profile assignment ID", ErrInvalidSnapshot)
		}
		profileIDs[id] = struct{}{}
		result.UserProfiles = append(result.UserProfiles, UserProfile{
			SourceID: id,
			User:     user,
			Customer: strings.TrimSpace(row["customer"]),
			Profile:  profile,
			State:    firstValue(row, "state", "status"),
			EndTime:  firstValue(row, "end-time", "end-time-local"),
		})
	}
	return result, nil
}

// ReadSessions reads the RouterOS User Manager accounting/session list. It does
// not send any command that changes or terminates a session.
func ReadSessions(ctx context.Context, api *ros.API, version string) (SessionSnapshot, error) {
	return readSessions(ctx, version, func(ctx context.Context, command, properties string) ([]map[string]string, error) {
		return readRows(ctx, api, command, properties)
	})
}

func readSessions(ctx context.Context, version string, read rowReader) (SessionSnapshot, error) {
	major, err := parseMajor(version)
	if err != nil {
		return SessionSnapshot{}, err
	}
	p, err := userPathsForMajor(major)
	if err != nil {
		return SessionSnapshot{}, err
	}
	rows, err := read(ctx, p.sessions, p.sessionProperties)
	warning := ""
	if err != nil {
		rows, err = read(ctx, p.sessions, p.sessionFallbackProperties)
		if err != nil {
			return SessionSnapshot{}, fmt.Errorf("read User Manager sessions: %w", err)
		}
		warning = "أعاد الراوتر مجموعة فرعية من حقول الجلسات؛ الحقول غير المتاحة لم تُستنتج."
	}
	result := SessionSnapshot{MajorVersion: major, Sessions: make([]Session, 0, len(rows)), Warning: warning}
	for index, row := range rows {
		user := firstValue(row, "user", "username")
		customer := strings.TrimSpace(row["customer"])
		if user == "" {
			return SessionSnapshot{}, fmt.Errorf("%w: User Manager session is missing its user", ErrInvalidSnapshot)
		}
		started := firstValue(row, "started", "from-time")
		ended := strings.TrimSpace(row["ended"])
		status := strings.TrimSpace(row["status"])
		fallbackID := firstValue(row, "acct-session-id")
		if fallbackID == "" {
			fallbackID = fmt.Sprintf("%s|%s|%d", userRecordKey(customer, user), started, index)
		}
		id := sourceIdentity(row, fallbackID)
		result.Sessions = append(result.Sessions, Session{
			SourceID:         id,
			User:             user,
			Customer:         customer,
			Active:           sessionIsActive(row["active"], status, ended),
			Status:           status,
			Started:          started,
			Ended:            ended,
			ScheduledEnd:     strings.TrimSpace(row["till-time"]),
			Uptime:           strings.TrimSpace(row["uptime"]),
			Download:         strings.TrimSpace(row["download"]),
			Upload:           strings.TrimSpace(row["upload"]),
			CallingStationID: strings.TrimSpace(row["calling-station-id"]),
			UserAddress:      firstValue(row, "user-address", "user-ip"),
			NASAddress:       firstValue(row, "nas-ip-address", "host-ip"),
			NASIdentifier:    strings.TrimSpace(row["nas-identifier"]),
			NASPortID:        strings.TrimSpace(row["nas-port-id"]),
			NASPortType:      strings.TrimSpace(row["nas-port-type"]),
			LastAccounting:   strings.TrimSpace(row["last-accounting-packet"]),
			TerminateCause:   strings.TrimSpace(row["terminate-cause"]),
		})
	}
	return result, nil
}

func userRecordKey(customer, name string) string {
	if customer == "" {
		return name
	}
	return customer + "|" + name
}

func firstValue(row map[string]string, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(row[key]); value != "" {
			return value
		}
	}
	return ""
}

func parseBoolean(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "yes", "true", "1", "enabled":
		return true
	default:
		return false
	}
}

func sessionIsActive(value, status, ended string) bool {
	if value = strings.TrimSpace(value); value != "" {
		return parseBoolean(value)
	}
	if strings.TrimSpace(ended) != "" {
		return false
	}
	statuses := strings.FieldsFunc(strings.ToLower(status), func(r rune) bool {
		return r == ',' || r == ' ' || r == ';'
	})
	for _, item := range statuses {
		switch item {
		case "stop", "stopped", "close-acked", "expired":
			return false
		}
	}
	for _, item := range statuses {
		if item == "start" || item == "interim" {
			return true
		}
	}
	return false
}
