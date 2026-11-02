package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"

	routerosadapter "github.com/Mhmdabbasi/bt2-manager2/internal/routeros"
)

func TestSetHotspotUserStateRequiresDesiredState(t *testing.T) {
	server := &Server{routers: routerosadapter.NewManager()}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest("POST", "/api/hotspot/users/*1/state", strings.NewReader(`{}`))
	request.SetPathValue("id", "*1")

	server.setHotspotUserState(recorder, request)

	if recorder.Code != 400 {
		t.Fatalf("expected HTTP 400 when disabled is omitted; got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestSetHotspotUserStateRequiresConnectedRouter(t *testing.T) {
	server := &Server{routers: routerosadapter.NewManager()}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest("POST", "/api/hotspot/users/*1/state", strings.NewReader(`{"disabled":true}`))
	request.SetPathValue("id", "*1")

	server.setHotspotUserState(recorder, request)

	if recorder.Code != 409 {
		t.Fatalf("expected HTTP 409 without a connected router; got %d: %s", recorder.Code, recorder.Body.String())
	}
}
