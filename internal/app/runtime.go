package app

import (
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/Mhmdabbasi/bt2-manager2/internal/httpapi"
	routerosadapter "github.com/Mhmdabbasi/bt2-manager2/internal/routeros"
	"github.com/Mhmdabbasi/bt2-manager2/internal/secretstore"
	"github.com/Mhmdabbasi/bt2-manager2/internal/store"
	"github.com/Mhmdabbasi/bt2-manager2/internal/ui"
)

type Runtime struct {
	Store      *store.Store
	Secrets    *secretstore.Store
	Routers    *routerosadapter.Manager
	API        *httpapi.Server
	Assets     fs.FS
	tempSecretDir string
}

func Open(database string) (*Runtime, error) {
	if database == "" {
		base, err := os.UserConfigDir()
		if err != nil { return nil, fmt.Errorf("find user configuration directory: %w", err) }
		database = filepath.Join(base, "BT2Manager2", "bt2-manager2.sqlite")
	}
	secretDir := filepath.Dir(database)
	tempDir := ""
	if database == ":memory:" {
		var err error
		tempDir, err = os.MkdirTemp("", "bt2-manager2-secrets-")
		if err != nil { return nil, fmt.Errorf("create temporary secret directory: %w", err) }
		secretDir = tempDir
	} else if err := os.MkdirAll(secretDir, 0o700); err != nil {
		return nil, fmt.Errorf("create application data directory: %w", err)
	}

	data, err := store.Open(database)
	if err != nil { if tempDir!="" { _=os.RemoveAll(tempDir) }; return nil, err }
	secrets, err := secretstore.Open(secretDir)
	if err != nil { _=data.Close(); if tempDir!="" { _=os.RemoveAll(tempDir) }; return nil, err }
	assets, err := ui.Dist()
	if err != nil { _=data.Close(); if tempDir!="" { _=os.RemoveAll(tempDir) }; return nil, fmt.Errorf("load frontend assets: %w",err) }
	routers:=routerosadapter.NewManager()
	return &Runtime{Store:data,Secrets:secrets,Routers:routers,API:httpapi.New(data.DB(),routers,secrets),Assets:assets,tempSecretDir:tempDir},nil
}

func (rt *Runtime) Close() error {
	if rt.Routers!=nil { rt.Routers.Disconnect() }
	var err error
	if rt.Store!=nil { err=rt.Store.Close() }
	if rt.tempSecretDir!="" { _=os.RemoveAll(rt.tempSecretDir) }
	return err
}

func (rt *Runtime) BrowserHandler() http.Handler {
	mux:=http.NewServeMux()
	mux.Handle("/api/",rt.API.Handler())
	mux.Handle("/",spaHandler(rt.Assets))
	return mux
}

type spa struct{ files fs.FS }

func spaHandler(files fs.FS) http.Handler { return spa{files:files} }

// assetName cleans URL paths with slash semantics on every operating system.
// filepath.Clean is platform-specific and turns URLs into backslash paths on Windows.
func assetName(urlPath string) string {
	name := strings.TrimPrefix(path.Clean("/"+urlPath), "/")
	if name == "" || name == "." {
		return "index.html"
	}
	return name
}

func (s spa) ServeHTTP(w http.ResponseWriter,r *http.Request) {
	name := assetName(r.URL.Path)
	file, err := s.files.Open(name)
	if err != nil {
		// A missing static asset must not silently return index.html (and its
		// text/html MIME type) as a JavaScript or stylesheet response.
		if path.Ext(name) != "" {
			http.NotFound(w, r)
			return
		}
		name = "index.html"
		file, err = s.files.Open(name)
	}
	if err!=nil { http.Error(w,"web assets unavailable; build the frontend first",http.StatusServiceUnavailable);return }
	_ = file.Close()
	w.Header().Set("X-Content-Type-Options","nosniff")
	w.Header().Set("Referrer-Policy","no-referrer")
	w.Header().Set("X-Frame-Options","DENY")
	w.Header().Set("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
	http.ServeFileFS(w,r,s.files,name)
}
