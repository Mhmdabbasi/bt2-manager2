package httpapi

import (
	"testing"

	routerosadapter "github.com/Mhmdabbasi/bt2-manager2/internal/routeros"
)

func TestPaginateHotspotUsersSearchesAndSlicesOnServer(t *testing.T) {
	users := []routerosadapter.HotspotUser{
		{ID: "1", Name: "alpha", Profile: "bronze", Server: "hs-a"},
		{ID: "2", Name: "beta", Profile: "gold", Server: "hs-b"},
		{ID: "3", Name: "gamma", Profile: "gold", Server: "hs-c"},
	}
	page := paginateHotspotUsers(users, 1, 1, "gold")
	if page.Total != 2 || page.Offset != 1 || page.Limit != 1 || len(page.Items) != 1 || page.Items[0].Name != "gamma" {
		t.Fatalf("unexpected page: %+v", page)
	}
	if got := paginateHotspotUsers(users, 10, 20, "missing"); got.Total != 0 || len(got.Items) != 0 || got.Offset != 0 {
		t.Fatalf("out-of-range empty page should be normalized: %+v", got)
	}
}
