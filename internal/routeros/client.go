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
	if m.current == nil {
		return ErrNotConnected
	}
	writeCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	return ros.NewBaseResource(m.current.api.Client(), "/ip/hotspot/user").DisableContext(writeCtx, id)
}

func (m *Manager) CreateUser(ctx context.Context, name, password, profile string) (HotspotUser, error) {
	if strings.TrimSpace(name) == "" || strings.TrimSpace(password) == "" || strings.TrimSpace(profile) == "" {
		return HotspotUser{}, errors.New("اسم المستخدم وكلمة المرور والملف مطلوبة")
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
	id, err := resource.AddContext(writeCtx, map[string]string{"name": name, "password": password, "profile": profile})
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
