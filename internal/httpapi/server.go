package httpapi

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Mhmdabbasi/bt2-manager2/internal/routeros"
	"github.com/Mhmdabbasi/bt2-manager2/internal/secretstore"
)

type Server struct {
	db      *sql.DB
	routers *routerosadapter.Manager
	secrets *secretstore.Store
	mux     *http.ServeMux
}

func New(db *sql.DB, manager *routerosadapter.Manager, secrets *secretstore.Store) *Server {
	s := &Server{db: db, routers: manager, secrets: secrets, mux: http.NewServeMux()}
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return securityHeaders(s.localOnly(s.mux))
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /api/health", s.health)
	s.mux.HandleFunc("POST /api/backup/export", s.exportBackup)
	s.mux.HandleFunc("GET /api/routers", s.listRouters)
	s.mux.HandleFunc("GET /api/routers/active", s.activeRouter)
	s.mux.HandleFunc("POST /api/routers/connect", s.connectRouter)
	s.mux.HandleFunc("POST /api/routers/disconnect", s.disconnectRouter)
	s.mux.HandleFunc("GET /api/hotspot/profiles", s.hotspotProfiles)
	s.mux.HandleFunc("GET /api/hotspot/users", s.hotspotUsers)
	s.mux.HandleFunc("GET /api/usermanager", s.savedUserManager)
	s.mux.HandleFunc("POST /api/usermanager/sync", s.syncUserManager)
	s.mux.HandleFunc("GET /api/packages", s.listPackages)
	s.mux.HandleFunc("POST /api/packages", s.createPackage)
	s.mux.HandleFunc("PUT /api/packages/{id}", s.updatePackage)
	s.mux.HandleFunc("DELETE /api/packages/{id}", s.disablePackage)
	s.mux.HandleFunc("GET /api/distributors", s.listDistributors)
	s.mux.HandleFunc("POST /api/distributors", s.createDistributor)
	s.mux.HandleFunc("GET /api/templates", s.listTemplates)
	s.mux.HandleFunc("GET /api/template-versions/{id}", s.getTemplateVersion)
	s.mux.HandleFunc("POST /api/templates", s.saveTemplate)
	s.mux.HandleFunc("GET /api/templates/{id}", s.getTemplate)
	s.mux.HandleFunc("PUT /api/distributors/{id}", s.updateDistributor)
	s.mux.HandleFunc("GET /api/inventory", s.inventory)
	s.mux.HandleFunc("POST /api/inventory/movements", s.inventoryMovement)
	s.mux.HandleFunc("POST /api/vouchers/batches", s.createBatch)
	s.mux.HandleFunc("GET /api/vouchers", s.listVouchers)
	s.mux.HandleFunc("GET /api/vouchers/{id}/credentials", s.voucherCredentials)
	s.mux.HandleFunc("POST /api/vouchers/{id}/disable", s.disableVoucher)
	s.mux.HandleFunc("GET /api/batches", s.listBatches)
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "bt2-manager2"})
}

func (s *Server) listRouters(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(), `SELECT id,name,address,port,use_tls,last_version,last_identity,last_seen_at,created_at FROM routers ORDER BY created_at DESC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "تعذر قراءة قائمة الراوترات")
		return
	}
	defer rows.Close()
	type routerRecord struct {
		ID string `json:"id"`; Name string `json:"name"`; Address string `json:"address"`
		Port int `json:"port"`; TLS bool `json:"tls"`; Version string `json:"version"`
		Identity string `json:"identity"`; LastSeenAt string `json:"last_seen_at"`; CreatedAt string `json:"created_at"`
	}
	result := make([]routerRecord, 0)
	for rows.Next() {
		var item routerRecord
		var tlsEnabled int
		if err := rows.Scan(&item.ID, &item.Name, &item.Address, &item.Port, &tlsEnabled, &item.Version, &item.Identity, &item.LastSeenAt, &item.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "تعذر قراءة سجل الراوتر")
			return
		}
		item.TLS = tlsEnabled == 1
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "تعذر قراءة قائمة الراوترات")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) activeRouter(w http.ResponseWriter, _ *http.Request) {
	info, ok := s.routers.Active()
	writeJSON(w, http.StatusOK, map[string]any{"connected": ok, "router": info})
}

func (s *Server) connectRouter(w http.ResponseWriter, r *http.Request) {
	var input routerosadapter.ConnectInput
	if err := decodeJSON(w, r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	info, err := s.routers.Connect(ctx, input)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	id, err := randomID()
	if err != nil {
		s.routers.Disconnect()
		writeError(w, http.StatusInternalServerError, "تعذر إنشاء معرّف للراوتر")
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.ExecContext(ctx, `INSERT INTO routers(id,name,address,port,use_tls,last_version,last_identity,last_seen_at,created_at)
		VALUES(?,?,?,?,?,?,?,?,?)
		ON CONFLICT(address,port) DO UPDATE SET name=excluded.name,use_tls=excluded.use_tls,last_version=excluded.last_version,last_identity=excluded.last_identity,last_seen_at=excluded.last_seen_at`,
		id, info.Name, info.Address, info.Port, boolInt(info.TLS), info.Version, info.Identity, now, now)
	if err != nil {
		s.routers.Disconnect()
		log.Printf("router metadata save failed: %v", err)
		writeError(w, http.StatusInternalServerError, "نجح الاتصال لكن تعذر تسجيل بيانات الراوتر محلياً")
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) disconnectRouter(w http.ResponseWriter, _ *http.Request) {
	s.routers.Disconnect()
	writeJSON(w, http.StatusOK, map[string]bool{"connected": false})
}

func (s *Server) hotspotProfiles(w http.ResponseWriter, r *http.Request) {
	profiles, err := s.routers.Profiles(r.Context())
	if err != nil {
		if errors.Is(err, routerosadapter.ErrNotConnected) {
			writeError(w, http.StatusConflict, "اتصل بالراوتر أولاً")
			return
		}
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, profiles)
}

func (s *Server) hotspotUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.routers.Users(r.Context())
	if err != nil {
		if errors.Is(err, routerosadapter.ErrNotConnected) {
			writeError(w, http.StatusConflict, "اتصل بالراوتر أولاً")
			return
		}
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, users)
}

type packageRecord struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	ServiceType   string `json:"service_type"`
	ProfileName   string `json:"profile_name"`
	UsernamePrefix string `json:"username_prefix"`
	ValidityLabel string `json:"validity_label"`
	PriceMinor    int64  `json:"price_minor"`
	Currency      string `json:"currency"`
	Enabled       bool   `json:"enabled"`
}

func (s *Server) listPackages(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(), `SELECT id,name,service_type,profile_name,username_prefix,validity_label,price_minor,currency,enabled FROM packages ORDER BY name`)
	if err != nil { writeError(w, http.StatusInternalServerError, "تعذر قراءة الباقات"); return }
	defer rows.Close()
	items := make([]packageRecord, 0)
	for rows.Next() {
		var item packageRecord
		var enabled int
		if err := rows.Scan(&item.ID,&item.Name,&item.ServiceType,&item.ProfileName,&item.UsernamePrefix,&item.ValidityLabel,&item.PriceMinor,&item.Currency,&enabled); err != nil { writeError(w, http.StatusInternalServerError, "تعذر قراءة الباقة"); return }
		item.Enabled = enabled == 1
		items = append(items, item)
	}
	if err := rows.Err(); err != nil { writeError(w, http.StatusInternalServerError, "تعذر قراءة الباقات"); return }
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) createPackage(w http.ResponseWriter, r *http.Request) {
	var item packageRecord
	if err := decodeJSON(w,r,&item); err != nil { writeError(w,http.StatusBadRequest,err.Error()); return }
	item.Name = strings.TrimSpace(item.Name); item.ProfileName = strings.TrimSpace(item.ProfileName)
	item.ServiceType = strings.TrimSpace(item.ServiceType); item.UsernamePrefix = strings.ToUpper(strings.TrimSpace(item.UsernamePrefix)); item.Currency = strings.ToUpper(strings.TrimSpace(item.Currency))
	if item.Name == "" || item.ProfileName == "" || item.UsernamePrefix == "" { writeError(w,http.StatusBadRequest,"الاسم والملف والبادئة مطلوبة"); return }
	if item.ServiceType != "hotspot" && item.ServiceType != "user_manager" { writeError(w,http.StatusBadRequest,"نوع الخدمة غير صالح"); return }
	if len(item.UsernamePrefix) > 8 || !isAlphaNumeric(item.UsernamePrefix) { writeError(w,http.StatusBadRequest,"البادئة يجب أن تكون حتى 8 أحرف/أرقام لاتينية"); return }
	if item.PriceMinor < 0 { writeError(w,http.StatusBadRequest,"السعر لا يمكن أن يكون سالباً"); return }
	if item.Currency == "" { item.Currency = "YER" }
	id, err := randomID(); if err != nil { writeError(w,http.StatusInternalServerError,"تعذر إنشاء معرّف"); return }
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.ExecContext(r.Context(), `INSERT INTO packages(id,name,service_type,profile_name,username_prefix,validity_label,price_minor,currency,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?)`, id,item.Name,item.ServiceType,item.ProfileName,item.UsernamePrefix,item.ValidityLabel,item.PriceMinor,item.Currency,now,now)
	if err != nil { writeError(w,http.StatusConflict,"تعذر حفظ الباقة؛ تحقق من عدم تكرار الاسم"); return }
	item.ID=id; item.Enabled=true; writeJSON(w,http.StatusCreated,item)
}

func (s *Server) updatePackage(w http.ResponseWriter, r *http.Request) {
	var item packageRecord
	if err := decodeJSON(w,r,&item); err != nil { writeError(w,http.StatusBadRequest,err.Error()); return }
	item.Name=strings.TrimSpace(item.Name); item.ProfileName=strings.TrimSpace(item.ProfileName); item.UsernamePrefix=strings.ToUpper(strings.TrimSpace(item.UsernamePrefix)); item.Currency=strings.ToUpper(strings.TrimSpace(item.Currency))
	if item.Name=="" || item.ProfileName=="" || (item.ServiceType!="hotspot" && item.ServiceType!="user_manager") || !isAlphaNumeric(item.UsernamePrefix) || len(item.UsernamePrefix)>8 || item.PriceMinor<0 { writeError(w,http.StatusBadRequest,"بيانات الباقة غير صالحة"); return }
	if item.Currency=="" { item.Currency="YER" }
	result,err:=s.db.ExecContext(r.Context(),`UPDATE packages SET name=?,service_type=?,profile_name=?,username_prefix=?,validity_label=?,price_minor=?,currency=?,updated_at=? WHERE id=?`,item.Name,item.ServiceType,item.ProfileName,item.UsernamePrefix,item.ValidityLabel,item.PriceMinor,item.Currency,time.Now().UTC().Format(time.RFC3339),r.PathValue("id"))
	if err!=nil { writeError(w,http.StatusConflict,"تعذر تحديث الباقة؛ تحقق من الاسم"); return }; count,_:=result.RowsAffected(); if count==0 { writeError(w,http.StatusNotFound,"الباقة غير موجودة"); return }; item.ID=r.PathValue("id"); item.Enabled=true; writeJSON(w,http.StatusOK,item)
}

func (s *Server) disablePackage(w http.ResponseWriter, r *http.Request) {
	result,err:=s.db.ExecContext(r.Context(),`UPDATE packages SET enabled=0,updated_at=? WHERE id=?`,time.Now().UTC().Format(time.RFC3339),r.PathValue("id"))
	if err!=nil { writeError(w,http.StatusInternalServerError,"تعذر إيقاف الباقة"); return }; count,_:=result.RowsAffected(); if count==0 { writeError(w,http.StatusNotFound,"الباقة غير موجودة"); return }; w.WriteHeader(http.StatusNoContent)
}

type distributorRecord struct { ID string `json:"id"`; Name string `json:"name"`; Contact string `json:"contact"`; Notes string `json:"notes"`; Active bool `json:"active"`; CreatedAt string `json:"created_at"` }

func (s *Server) listDistributors(w http.ResponseWriter, r *http.Request) {
	rows,err:=s.db.QueryContext(r.Context(),`SELECT id,name,contact,notes,active,created_at FROM distributors ORDER BY name`); if err!=nil { writeError(w,http.StatusInternalServerError,"تعذر قراءة الموزعين"); return }; defer rows.Close()
	items:=make([]distributorRecord,0); for rows.Next(){ var x distributorRecord; var active int; if err:=rows.Scan(&x.ID,&x.Name,&x.Contact,&x.Notes,&active,&x.CreatedAt); err!=nil { writeError(w,http.StatusInternalServerError,"تعذر قراءة الموزع"); return }; x.Active=active==1; items=append(items,x) }; if err:=rows.Err(); err!=nil { writeError(w,http.StatusInternalServerError,"تعذر قراءة الموزعين"); return }; writeJSON(w,http.StatusOK,items)
}

func (s *Server) createDistributor(w http.ResponseWriter, r *http.Request) {
	var x distributorRecord; if err:=decodeJSON(w,r,&x); err!=nil { writeError(w,http.StatusBadRequest,err.Error()); return }; x.Name=strings.TrimSpace(x.Name); x.Contact=strings.TrimSpace(x.Contact); x.Notes=strings.TrimSpace(x.Notes)
	if x.Name=="" || len(x.Name)>120 || len(x.Contact)>160 || len(x.Notes)>1000 { writeError(w,http.StatusBadRequest,"بيانات الموزع غير صالحة"); return }; id,err:=randomID(); if err!=nil { writeError(w,http.StatusInternalServerError,"تعذر إنشاء معرّف"); return }; now:=time.Now().UTC().Format(time.RFC3339); _,err=s.db.ExecContext(r.Context(),`INSERT INTO distributors(id,name,contact,notes,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)`,id,x.Name,x.Contact,x.Notes,now,now); if err!=nil { writeError(w,http.StatusConflict,"تعذر حفظ الموزع؛ تحقق من عدم تكرار الاسم"); return }; x.ID=id; x.Active=true; x.CreatedAt=now; writeJSON(w,http.StatusCreated,x)
}

func (s *Server) updateDistributor(w http.ResponseWriter, r *http.Request) {
	var x distributorRecord; if err:=decodeJSON(w,r,&x); err!=nil { writeError(w,http.StatusBadRequest,err.Error()); return }; x.Name=strings.TrimSpace(x.Name); x.Contact=strings.TrimSpace(x.Contact); x.Notes=strings.TrimSpace(x.Notes); if x.Name=="" || len(x.Name)>120 || len(x.Contact)>160 || len(x.Notes)>1000 { writeError(w,http.StatusBadRequest,"بيانات الموزع غير صالحة"); return }
	result,err:=s.db.ExecContext(r.Context(),`UPDATE distributors SET name=?,contact=?,notes=?,active=?,updated_at=? WHERE id=?`,x.Name,x.Contact,x.Notes,boolInt(x.Active),time.Now().UTC().Format(time.RFC3339),r.PathValue("id")); if err!=nil { writeError(w,http.StatusConflict,"تعذر تحديث الموزع"); return }; count,_:=result.RowsAffected(); if count==0 { writeError(w,http.StatusNotFound,"الموزع غير موجود"); return }; x.ID=r.PathValue("id"); writeJSON(w,http.StatusOK,x)
}

func isAlphaNumeric(value string) bool {
	if value=="" { return false }; for _,r:=range value { if !(r>='A'&&r<='Z') && !(r>='0'&&r<='9') { return false } }; return true
}

func (s *Server) localOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if host == "" {
			http.Error(w, "invalid host", http.StatusForbidden)
			return
		}
		name, _, err := net.SplitHostPort(host)
		if err != nil {
			name = host
		}
		isWailsHost := name == "wails.localhost"
		if !isWailsHost && name != "localhost" && (net.ParseIP(name) == nil || !net.ParseIP(name).IsLoopback()) {
			http.Error(w, "local access only", http.StatusForbidden)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" {
			parsed, err := url.Parse(origin)
			if err != nil || !sameLocalOrigin(parsed, host) {
				http.Error(w, "origin rejected", http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func sameLocalOrigin(origin *url.URL, host string) bool {
	if origin == nil {
		return false
	}
	originHost := origin.Hostname()
	hostname, _, err := net.SplitHostPort(host)
	if err != nil { hostname = host }
	if origin.Scheme == "wails" {
		return originHost == "wails.localhost" && hostname == "wails.localhost"
	}
	if origin.Scheme != "https" && origin.Scheme != "http" {
		return false
	}
	if originHost == hostname { return true }
	originIP, hostIP := net.ParseIP(originHost), net.ParseIP(hostname)
	originLoopback := originHost == "localhost" || (originIP != nil && originIP.IsLoopback())
	hostLoopback := hostname == "localhost" || (hostIP != nil && hostIP.IsLoopback())
	return originLoopback && hostLoopback
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		if errors.Is(err, io.EOF) {
			return fmt.Errorf("محتوى الطلب فارغ")
		}
		return fmt.Errorf("بيانات الطلب غير صالحة: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return fmt.Errorf("يجب إرسال كائن JSON واحد فقط")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": strings.TrimSpace(message)})
}

func randomID() (string, error) {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(data[:]), nil
}

func nullIfEmpty(value string) any {
	if value == "" { return nil }
	return value
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
