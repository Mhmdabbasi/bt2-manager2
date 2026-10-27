package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	routerosadapter "github.com/Mhmdabbasi/bt2-manager2/internal/routeros"
	"github.com/Mhmdabbasi/bt2-manager2/internal/secretstore"
	"github.com/Mhmdabbasi/bt2-manager2/internal/store"
)

func testServer(t *testing.T) *Server {
	t.Helper()
	db, err := store.Open(":memory:")
	if err != nil { t.Fatal(err) }
	t.Cleanup(func(){ _=db.Close() })
	secrets, err := secretstore.Open(t.TempDir())
	if err != nil { t.Fatal(err) }
	return New(db.DB(), routerosadapter.NewManager(), secrets)
}

func TestLocalAPIHealth(t *testing.T) {
	s := testServer(t)
	req := httptest.NewRequest(http.MethodGet,"http://127.0.0.1:8787/api/health",nil)
	req.Host="127.0.0.1:8787"
	response:=httptest.NewRecorder();s.Handler().ServeHTTP(response,req)
	if response.Code!=http.StatusOK { t.Fatalf("status=%d body=%s",response.Code,response.Body.String()) }
}

func TestRejectsNonLocalHostAndOrigin(t *testing.T) {
	s:=testServer(t)
	for _,tc:=range []struct{name,host,origin string}{{"external host","attacker.example",""},{"external origin","127.0.0.1:8787","https://attacker.example"}} {
		t.Run(tc.name,func(t *testing.T){req:=httptest.NewRequest(http.MethodGet,"http://127.0.0.1:8787/api/health",nil);req.Host=tc.host;if tc.origin!=""{req.Header.Set("Origin",tc.origin)};response:=httptest.NewRecorder();s.Handler().ServeHTTP(response,req);if response.Code!=http.StatusForbidden{t.Fatalf("status=%d want %d",response.Code,http.StatusForbidden)}})
	}
}

func TestAllowsLocalDevProxyOrigin(t *testing.T) {
	s:=testServer(t)
	req:=httptest.NewRequest(http.MethodGet,"http://127.0.0.1:8787/api/health",nil);req.Host="127.0.0.1:8787";req.Header.Set("Origin","http://localhost:5173")
	response:=httptest.NewRecorder();s.Handler().ServeHTTP(response,req)
	if response.Code!=http.StatusOK{t.Fatalf("status=%d body=%s",response.Code,response.Body.String())}
}
