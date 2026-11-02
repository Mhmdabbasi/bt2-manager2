package httpapi

import (
	"errors"
	"net/http"
	"strings"

	routerosadapter "github.com/Mhmdabbasi/bt2-manager2/internal/routeros"
)

type hotspotUserStateRequest struct {
	Disabled *bool `json:"disabled"`
}

func (s *Server) setHotspotUserState(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeError(w, http.StatusBadRequest, "معرّف مستخدم HotSpot مطلوب")
		return
	}
	var input hotspotUserStateRequest
	if err := decodeJSON(w, r, &input); err != nil || input.Disabled == nil {
		writeError(w, http.StatusBadRequest, "حدد الحالة المطلوبة disabled")
		return
	}
	active, ok := s.routers.Active()
	if !ok {
		writeError(w, http.StatusConflict, "اتصل بالراوتر أولاً")
		return
	}
	user, err := s.routers.SetUserDisabled(r.Context(), id, *input.Disabled, active.Address, active.Port, active.TLS)
	switch {
	case errors.Is(err, routerosadapter.ErrNotConnected):
		writeError(w, http.StatusConflict, "اتصل بالراوتر أولاً")
		return
	case errors.Is(err, routerosadapter.ErrHotspotRouterChanged):
		writeError(w, http.StatusConflict, "تغيّر الراوتر النشط؛ حدّث القائمة قبل تنفيذ الإجراء")
		return
	case errors.Is(err, routerosadapter.ErrHotspotUserNotFound):
		writeError(w, http.StatusConflict, "لم يعد المستخدم موجوداً على الراوتر؛ حدّث القائمة")
		return
	case err != nil:
		writeError(w, http.StatusBadGateway, safeFailure(err.Error(), ""))
		return
	}

	state := "active"
	if *input.Disabled {
		state = "disabled"
	}
	if _, err := s.db.ExecContext(r.Context(), `UPDATE vouchers SET state=? WHERE username=? AND remote_id=? AND router_id=(SELECT id FROM routers WHERE address=? AND port=?) AND state IN ('active','disabled')`, state, user.Name, id, active.Address, active.Port); err != nil {
		writeError(w, http.StatusInternalServerError, "تغيرت حالة المستخدم على الراوتر لكن تعذرت مزامنة سجل القسيمة المحلي")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "name": user.Name, "disabled": user.Disabled})
}
