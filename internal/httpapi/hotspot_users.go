package httpapi

import (
	"errors"
	"net/http"
	"strings"

	routerosadapter "github.com/Mhmdabbasi/bt2-manager2/internal/routeros"
)

type hotspotUserPage struct {
	Items  []routerosadapter.HotspotUser `json:"items"`
	Total  int                           `json:"total"`
	Limit  int                           `json:"limit"`
	Offset int                           `json:"offset"`
}

func (s *Server) hotspotUsersPage(w http.ResponseWriter, r *http.Request) {
	users, err := s.routers.Users(r.Context())
	if err != nil {
		if errors.Is(err, routerosadapter.ErrNotConnected) {
			writeError(w, http.StatusConflict, "اتصل بالراوتر أولاً")
			return
		}
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	limit := queryInt(r, "limit", 20, 1, 100)
	offset := queryInt(r, "offset", 0, 0, 1000000)
	term := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	if len([]rune(term)) > 120 {
		term = string([]rune(term)[:120])
	}
	writeJSON(w, http.StatusOK, paginateHotspotUsers(users, offset, limit, term))
}

func paginateHotspotUsers(users []routerosadapter.HotspotUser, offset, limit int, term string) hotspotUserPage {
	filtered := make([]routerosadapter.HotspotUser, 0, len(users))
	for _, user := range users {
		if term != "" && !strings.Contains(strings.ToLower(user.Name+" "+user.Profile+" "+user.Server), term) {
			continue
		}
		filtered = append(filtered, user)
	}
	total := len(filtered)
	if offset < 0 { offset = 0 }
	if offset > total { offset = total }
	if limit < 1 { limit = 1 }
	end := offset + limit
	if end > total { end = total }
	return hotspotUserPage{Items: filtered[offset:end], Total: total, Limit: limit, Offset: offset}
}
