package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestInventoryEventsSupportServerPaginationAndFilters(t *testing.T) {
	s := testServer(t)
	seed := []string{
		`INSERT INTO routers(id,name,address,port,created_at) VALUES('router-1','Router','192.0.2.1',8728,'now')`,
		`INSERT INTO packages(id,name,service_type,profile_name,created_at,updated_at) VALUES('package-1','Daily','hotspot','default','now','now')`,
		`INSERT INTO batches(id,router_id,package_id,state,requested_count,created_at) VALUES('batch-1','router-1','package-1','completed',2,'now')`,
		`INSERT INTO distributors(id,name,created_at,updated_at) VALUES('dist-1','Outlet A','now','now')`,
		`INSERT INTO vouchers(id,batch_id,router_id,package_id,username,password_ciphertext,state,created_at) VALUES('voucher-1','batch-1','router-1','package-1','VoucherA',X'01','active','now')`,
		`INSERT INTO vouchers(id,batch_id,router_id,package_id,username,password_ciphertext,state,created_at) VALUES('voucher-2','batch-1','router-1','package-1','VoucherB',X'02','active','now')`,
		`INSERT INTO stock_events(id,voucher_id,distributor_id,event_type,note,created_at) VALUES('event-1','voucher-1','dist-1','allocate','needle note','2026-01-01T00:00:00Z')`,
		`INSERT INTO stock_events(id,voucher_id,event_type,note,created_at) VALUES('event-2','voucher-2','issue','other note','2026-01-02T00:00:00Z')`,
	}
	for _, statement := range seed {
		if _, err := s.db.Exec(statement); err != nil {
			t.Fatalf("seed inventory: %v (statement %s)", err, statement)
		}
	}

	request := func(query string) struct {
		EventsTotal int `json:"events_total"`
		Events      []struct {
			Username string `json:"username"`
			Type     string `json:"type"`
		} `json:"events"`
	} {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8787/api/inventory?"+query, nil)
		req.Host = "127.0.0.1:8787"
		response := httptest.NewRecorder()
		s.Handler().ServeHTTP(response, req)
		if response.Code != http.StatusOK {
			t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
		}
		var body struct {
			EventsTotal int `json:"events_total"`
			Events      []struct {
				Username string `json:"username"`
				Type     string `json:"type"`
			} `json:"events"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		return body
	}

	page := request("event_limit=1&event_offset=1")
	if page.EventsTotal != 2 || len(page.Events) != 1 || page.Events[0].Username != "VoucherA" {
		t.Fatalf("unexpected paginated response: %+v", page)
	}

	filtered := request(fmt.Sprintf("event_limit=20&event_type=allocate&event_q=%s", "needle"))
	if filtered.EventsTotal != 1 || len(filtered.Events) != 1 || filtered.Events[0].Username != "VoucherA" || filtered.Events[0].Type != "allocate" {
		t.Fatalf("unexpected filtered response: %+v", filtered)
	}
}
