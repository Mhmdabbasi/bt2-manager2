package routerosadapter

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	ros "github.com/Mhmdabbasi/routeros-api-Go"
	"github.com/Mhmdabbasi/bt2-manager2/internal/usermanager"
)

var ErrNotConnected = errors.New("no active router connection")
var ErrHotspotUserNotFound = errors.New("HotSpot user no longer exists")
var ErrHotspotRouterChanged = errors.New("active router changed before the action")

type ConnectInput struct {
	Name     string `json:"name"`
	Address  string `json:"address"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	TLS      bool   `json:"tls"`
}

type RouterInfo struct {
	Name       string `json:"name"`
	Address    string `json:"address"`
	Port       int    `json:"port"`
	TLS        bool   `json:"tls"`
	Identity   string `json:"identity"`
	Version    string `json:"version"`
	Board      string `json:"board"`
	Model      string `json:"model"`
	Uptime     string `json:"uptime"`
	Connected  bool   `json:"connected"`
	CheckedAt  string `json:"checked_at"`
}

type HotspotProfile struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	AddressPool    string `json:"address_pool"`
	SessionTimeout string `json:"session_timeout"`
	IdleTimeout    string `json:"idle_timeout"`
	SharedUsers    string `json:"shared_users"`
}

type session struct {
	api  *ros.API
	info RouterInfo
}

type Manager struct {
	mu      sync.RWMutex
	current *session
}

func NewManager() *Manager { return &Manager{} }

func (m *Manager) Connect(ctx context.Context, in ConnectInput) (RouterInfo, error) {
	in.Address = strings.TrimSpace(in.Address)
	in.Username = strings.TrimSpace(in.Username)
	in.Name = strings.TrimSpace(in.Name)
	if in.Address == "" || in.Username == "" || in.Password == "" {
		return RouterInfo{}, errors.New("عنوان الراوتر واسم المستخدم وكلمة المرور مطلوبة")
	}
	if strings.ContainsAny(in.Address, "/\\ \t\r\n") || strings.Contains(in.Address, "://") {
		return RouterInfo{}, errors.New("عنوان الراوتر غير صالح")
	}
	if net.ParseIP(in.Address) == nil {
		if len(in.Address) > 253 || strings.ContainsAny(in.Address, "@?#") {
			return RouterInfo{}, errors.New("اسم المضيف غير صالح")
		}
	}
	if in.Port == 0 {
		if in.TLS {
			in.Port = ros.DefaultPortTLS
		} else {
			in.Port = ros.DefaultPort
		}
	}
	if in.Port < 1 || in.Port > 65535 {
		return RouterInfo{}, errors.New("منفذ الاتصال خارج النطاق المسموح")
	}
	if in.Name == "" {
		in.Name = in.Address
	}

	cfg := ros.NewConfig().
		WithAddress(in.Address).
		WithPort(in.Port).
		WithCredentials(in.Username, in.Password).
		WithTimeout(8 * time.Second).
		WithReadTimeout(8 * time.Second).
		WithWriteTimeout(8 * time.Second).
		WithRetry(0, time.Second).
		WithLogLevel(ros.LogLevelNone)
	if in.TLS {
		cfg.WithTLS()
	}
	// TLS certificate verification remains enabled; never set SkipVerify here.

	api, err := ros.NewWithConfig(cfg)
	if err != nil {
		return RouterInfo{}, fmt.Errorf("تهيئة اتصال الراوتر: %w", err)
	}
	if err := api.Connect(); err != nil {
		api.Close()
		return RouterInfo{}, fmt.Errorf("تعذر الاتصال بالراوتر: %w", err)
	}

	readCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	info, err := api.System.GetInfoContext(readCtx)
	if err != nil {
		api.Close()
		return RouterInfo{}, fmt.Errorf("اتصلنا بالراوتر لكن تعذرت قراءة معلومات النظام: %w", err)
	}

	result := RouterInfo{
		Name:      in.Name,
		Address:   in.Address,
		Port:      in.Port,
		TLS:       in.TLS,
		Identity:  info.Identity,
		Version:   info.Version,
		Board:     info.BoardName,
		Model:     info.Model,
		Uptime:    info.Uptime,
		Connected: true,
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
	}
	m.mu.Lock()
	old := m.current
	m.current = &session{api: api, info: result}
	m.mu.Unlock()
	if old != nil {
		_ = old.api.Close()
	}
	return result, nil
}

func (m *Manager) Disconnect() {
	m.mu.Lock()
	old := m.current
	m.current = nil
	m.mu.Unlock()
	if old != nil {
		_ = old.api.Close()
	}
}

func (m *Manager) Active() (RouterInfo, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.current == nil {
		return RouterInfo{}, false
	}
	return m.current.info, true
}

func (m *Manager) Profiles(ctx context.Context) ([]HotspotProfile, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	current := m.current
	if current == nil {
		return nil, ErrNotConnected
	}
	readCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	list, err := ros.NewBaseResource(current.api.Client(), "/ip/hotspot/user/profile").ListContext(readCtx)
	if err != nil {
		return nil, fmt.Errorf("قراءة ملفات HotSpot: %w", err)
	}
	items := list.All()
	profiles := make([]HotspotProfile, 0, len(items))
	for _, item := range items {
		profiles = append(profiles, HotspotProfile{
			ID:             item.ID,
			Name:           item.Get("name"),
			AddressPool:    item.Get("address-pool"),
			SessionTimeout: item.Get("session-timeout"),
			IdleTimeout:    item.Get("idle-timeout"),
			SharedUsers:    item.Get("shared-users"),
		})
	}
	return profiles, nil
}

type HotspotUser struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Profile string `json:"profile"`
	Server  string `json:"server"`
	Disabled bool  `json:"disabled"`
}

func (m *Manager) HotspotServers(ctx context.Context) ([]string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.current == nil { return nil, ErrNotConnected }
	readCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	list, err := ros.NewBaseResource(m.current.api.Client(), "/ip/hotspot").ListContext(readCtx)
	if err != nil { return nil, fmt.Errorf("قراءة خوادم HotSpot: %w", err) }
	seen := map[string]struct{}{}
	servers := make([]string, 0, list.Len())
	for _, item := range list.All() {
		name := strings.TrimSpace(item.Get("name"))
		if name == "" { continue }
		if _, ok := seen[name]; ok { continue }
		seen[name] = struct{}{}
		servers = append(servers, name)
	}
	return servers, nil
}

func (m *Manager) Users(ctx context.Context) ([]HotspotUser, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	current := m.current
	if current == nil {
		return nil, ErrNotConnected
	}
	readCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	list, err := ros.NewBaseResource(current.api.Client(), "/ip/hotspot/user").ListContext(readCtx)
	if err != nil {
		return nil, fmt.Errorf("قراءة مستخدمي HotSpot: %w", err)
	}
	items := list.All()
	users := make([]HotspotUser, 0, len(items))
	for _, item := range items {
		users = append(users, HotspotUser{
			ID: item.ID, Name: item.Get("name"), Profile: item.Get("profile"),
			Server: item.Get("server"), Disabled: item.Get("disabled") == "true",
		})
	}
	return users, nil
}

func (m *Manager) FindUser(ctx context.Context, name string) (HotspotUser, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.current == nil {
		return HotspotUser{}, false, ErrNotConnected
	}
	readCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	resource, err := ros.NewBaseResource(m.current.api.Client(), "/ip/hotspot/user").FindOneContext(readCtx, map[string]string{"name": name})
	if errors.Is(err, ros.ErrResourceNotFound) {
		return HotspotUser{}, false, nil
	}
	if err != nil {
		return HotspotUser{}, false, err
	}
	if resource == nil {
		return HotspotUser{}, false, nil
	}
	return HotspotUser{ID: resource.ID, Name: resource.Get("name"), Profile: resource.Get("profile"), Server: resource.Get("server"), Disabled: resource.Get("disabled") == "true"}, true, nil
}

func (m *Manager) DisableUser(ctx context.Context, id string) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.current == nil { return ErrNotConnected }
	writeCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	return ros.NewBaseResource(m.current.api.Client(), "/ip/hotspot/user").DisableContext(writeCtx, id)
}

func (m *Manager) EnableUser(ctx context.Context, id string) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.current == nil { return ErrNotConnected }
	writeCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	return ros.NewBaseResource(m.current.api.Client(), "/ip/hotspot/user").EnableContext(writeCtx, id)
}

// SetUserDisabled updates one HotSpot user's state only if the currently connected
// router still matches the router displayed by the caller. The manager lock keeps
// a concurrent reconnect from redirecting the action to another router.
func (m *Manager) SetUserDisabled(ctx context.Context, id string, disabled bool, expectedAddress string, expectedPort int, expectedTLS bool) (HotspotUser, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	current := m.current
	if current == nil {
		return HotspotUser{}, ErrNotConnected
	}
	if current.info.Address != expectedAddress || current.info.Port != expectedPort || current.info.TLS != expectedTLS {
		return HotspotUser{}, ErrHotspotRouterChanged
	}
	if strings.TrimSpace(id) == "" {
		return HotspotUser{}, ErrHotspotUserNotFound
	}

	resource := ros.NewBaseResource(current.api.Client(), "/ip/hotspot/user")
	readByID := func(readCtx context.Context) (HotspotUser, bool, error) {
		list, err := resource.ListContext(readCtx)
		if err != nil {
			return HotspotUser{}, false, err
		}
		for _, item := range list.All() {
			if item.ID == id {
				return HotspotUser{ID: item.ID, Name: item.Get("name"), Profile: item.Get("profile"), Server: item.Get("server"), Disabled: item.Get("disabled") == "true"}, true, nil
			}
		}
		return HotspotUser{}, false, nil
	}

	readCtx, cancelRead := context.WithTimeout(ctx, 8*time.Second)
	user, found, err := readByID(readCtx)
	cancelRead()
	if err != nil {
		return HotspotUser{}, fmt.Errorf("قراءة حالة مستخدم HotSpot قبل التغيير: %w", err)
	}
	if !found {
		return HotspotUser{}, ErrHotspotUserNotFound
	}
	if user.Disabled == disabled {
		return user, nil
	}

	writeCtx, cancelWrite := context.WithTimeout(ctx, 8*time.Second)
	var actionErr error
	if disabled {
		actionErr = resource.DisableContext(writeCtx, id)
	} else {
		actionErr = resource.EnableContext(writeCtx, id)
	}
	cancelWrite()

	verifyCtx, cancelVerify := context.WithTimeout(ctx, 8*time.Second)
	verified, exists, verifyErr := readByID(verifyCtx)
	cancelVerify()
	if verifyErr != nil {
		if actionErr != nil {
			return HotspotUser{}, fmt.Errorf("نتيجة الكتابة غير مؤكدة؛ تعذر التحقق من الحالة: %w", actionErr)
		}
		return HotspotUser{}, fmt.Errorf("أُرسل أمر تغيير الحالة لكن تعذر التحقق منه: %w", verifyErr)
	}
	if !exists {
		return HotspotUser{}, ErrHotspotUserNotFound
	}
	if verified.Disabled != disabled {
		if actionErr != nil {
			return HotspotUser{}, actionErr
		}
		return HotspotUser{}, errors.New("لم يؤكد الراوتر الحالة المطلوبة لمستخدم HotSpot")
	}
	return verified, nil
}

func (m *Manager) CreateUser(ctx context.Context, name, password, profile string, server ...string) (HotspotUser, error) {
	if strings.TrimSpace(name) == "" || strings.TrimSpace(profile) == "" {
		return HotspotUser{}, errors.New("اسم المستخدم وملف الخدمة مطلوبان")
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	current := m.current
	if current == nil {
		return HotspotUser{}, ErrNotConnected
	}
	writeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	resource := ros.NewBaseResource(current.api.Client(), "/ip/hotspot/user")
	attributes := map[string]string{"name": name, "profile": profile}
	if password != "" { attributes["password"] = password }
	if len(server) > 0 && strings.TrimSpace(server[0]) != "" && !strings.EqualFold(strings.TrimSpace(server[0]), "all") { attributes["server"] = strings.TrimSpace(server[0]) }
	id, err := resource.AddContext(writeCtx, attributes)
	if err != nil {
		return HotspotUser{}, fmt.Errorf("إنشاء مستخدم HotSpot: %w", err)
	}
	if id == "" {
		created, lookupErr := resource.FindOneContext(writeCtx, map[string]string{"name": name})
		if lookupErr != nil {
			return HotspotUser{}, fmt.Errorf("تم إرسال طلب الإنشاء لكن تعذر تأكيد معرّف المستخدم؛ يلزم التحقق قبل إعادة المحاولة: %w", lookupErr)
		}
		id = created.ID
	}
	if id == "" {
		return HotspotUser{}, errors.New("تم إنشاء المستخدم لكن استجابته لم تتضمن معرّفاً؛ يلزم التحقق قبل أي إجراء لاحق")
	}
	return HotspotUser{ID: id, Name: name, Profile: profile}, nil
}

func (m *Manager) UserManagerSnapshot(ctx context.Context) (usermanager.Snapshot, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.current == nil {
		return usermanager.Snapshot{}, ErrNotConnected
	}
	readCtx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	return usermanager.ReadSnapshot(readCtx, m.current.api, m.current.info.Version)
}

func (m *Manager) UserManagerUsers(ctx context.Context) (usermanager.UserDirectory, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.current == nil {
		return usermanager.UserDirectory{}, ErrNotConnected
	}
	readCtx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	return usermanager.ReadUsers(readCtx, m.current.api, m.current.info.Version)
}

func (m *Manager) UserManagerSessions(ctx context.Context) (usermanager.SessionSnapshot, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.current == nil {
		return usermanager.SessionSnapshot{}, ErrNotConnected
	}
	readCtx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	return usermanager.ReadSessions(readCtx, m.current.api, m.current.info.Version)
}

type HotspotSession struct {
	ID        string `json:"id"`
	User      string `json:"user"`
	Server    string `json:"server,omitempty"`
	Address   string `json:"address,omitempty"`
	MAC       string `json:"mac,omitempty"`
	LoginBy   string `json:"login_by,omitempty"`
	Uptime    string `json:"uptime,omitempty"`
	BytesIn   string `json:"bytes_in,omitempty"`
	BytesOut  string `json:"bytes_out,omitempty"`
	Active    bool   `json:"active"`
}

func (m *Manager) HotspotSessions(ctx context.Context) ([]HotspotSession, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.current == nil {
		return nil, ErrNotConnected
	}
	readCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	list, err := ros.NewBaseResource(m.current.api.Client(), "/ip/hotspot/active").ListContext(readCtx)
	if err != nil {
		return nil, fmt.Errorf("قراءة جلسات HotSpot النشطة: %w", err)
	}
	items := list.All()
	result := make([]HotspotSession, 0, len(items))
	for _, item := range items {
		result = append(result, HotspotSession{
			ID: item.ID, User: item.Get("user"), Server: item.Get("server"),
			Address: item.Get("address"), MAC: item.Get("mac-address"), LoginBy: item.Get("login-by"),
			Uptime: item.Get("uptime"), BytesIn: item.Get("bytes-in"), BytesOut: item.Get("bytes-out"), Active: true,
		})
	}
	return result, nil
}

var ErrHotspotSessionNotActive = errors.New("HotSpot session is not active")

func (m *Manager) TerminateHotspotSession(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return ErrHotspotSessionNotActive
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.current == nil {
		return ErrNotConnected
	}
	writeCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	list, err := ros.NewBaseResource(m.current.api.Client(), "/ip/hotspot/active").ListContext(writeCtx)
	if err != nil {
		return fmt.Errorf("إعادة التحقق من جلسة HotSpot: %w", err)
	}
	found := false
	for _, item := range list.All() {
		if item.ID == id {
			found = true
			break
		}
	}
	if !found {
		return ErrHotspotSessionNotActive
	}
	if err := ros.NewBaseResource(m.current.api.Client(), "/ip/hotspot/active").DeleteContext(writeCtx, id); err != nil {
		return fmt.Errorf("إنهاء جلسة HotSpot: %w", err)
	}
	return nil
}

func ParseMajorVersion(version string) (int, error) {
	version = strings.TrimSpace(version)
	if version == "" {
		return 0, errors.New("إصدار RouterOS غير متاح")
	}
	first := strings.SplitN(version, ".", 2)[0]
	major, err := strconv.Atoi(first)
	if err != nil || major < 1 {
		return 0, fmt.Errorf("صيغة إصدار RouterOS غير معروفة: %q", version)
	}
	return major, nil
}
