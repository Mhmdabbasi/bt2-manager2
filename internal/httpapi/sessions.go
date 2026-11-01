package httpapi

import (
	"errors"
	"net/http"
	"strings"

	routerosadapter "github.com/Mhmdabbasi/bt2-manager2/internal/routeros"
	"github.com/Mhmdabbasi/bt2-manager2/internal/usermanager"
)

func (s *Server) userManagerUsers(w http.ResponseWriter, r *http.Request) {
	active, ok := s.routers.Active()
	if !ok {
		writeError(w, http.StatusConflict, "اتصل بالراوتر أولاً")
		return
	}
	directory, err := s.routers.UserManagerUsers(r.Context())
	if err != nil {
		s.writeUserManagerReadError(w, err, "تعذرت قراءة مستخدمي User Manager")
		return
	}

	var routerID string
	if err := s.db.QueryRowContext(r.Context(), `SELECT id FROM routers WHERE address=? AND port=?`, active.Address, active.Port).Scan(&routerID); err != nil {
		directory.LocalOriginMappingWarning = "تعذر ربط قائمة المستخدمين بسجل الراوتر المحلي؛ بيانات التوزيع غير متاحة."
	} else {
		origins, originErr := s.readLocalUserManagerOrigins(r, routerID)
		if originErr != nil {
			directory.LocalOriginMappingWarning = "تعذر قراءة روابط الباقات والدفعات المحلية؛ لا يمكن تأكيد نقطة التوزيع."
		} else {
			directory.LocalOriginMappingAvailable = true
			nameCounts := make(map[string]int, len(directory.Users))
			for _, user := range directory.Users {
				nameCounts[user.Name]++
			}
			for index := range directory.Users {
				name := directory.Users[index].Name
				if nameCounts[name] != 1 {
					continue
				}
				if origin, found := origins[name]; found {
					copy := origin
					directory.Users[index].LocalOrigin = &copy
				}
			}
		}
	}
	writeJSON(w, http.StatusOK, directory)
}

func (s *Server) readLocalUserManagerOrigins(r *http.Request, routerID string) (map[string]usermanager.LocalOrigin, error) {
	rows, err := s.db.QueryContext(r.Context(), `
		SELECT v.username, p.name, b.id, COALESCE(d.name,'')
		FROM vouchers AS v
		JOIN packages AS p ON p.id=v.package_id
		JOIN batches AS b ON b.id=v.batch_id
		LEFT JOIN stock_events AS se ON se.id=(
			SELECT se2.id FROM stock_events AS se2
			WHERE se2.voucher_id=v.id AND se2.distributor_id IS NOT NULL
				AND se2.event_type IN ('issue','allocate','transfer')
			ORDER BY se2.created_at DESC LIMIT 1
		)
		LEFT JOIN distributors AS d ON d.id=se.distributor_id
		WHERE v.router_id=? AND p.service_type='user_manager'`, routerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make(map[string]usermanager.LocalOrigin)
	for rows.Next() {
		var username string
		var origin usermanager.LocalOrigin
		if err := rows.Scan(&username, &origin.PackageName, &origin.BatchID, &origin.DistributorName); err != nil {
			return nil, err
		}
		result[username] = origin
	}
	return result, rows.Err()
}

func (s *Server) userManagerSessions(w http.ResponseWriter, r *http.Request) {
	snapshot, err := s.routers.UserManagerSessions(r.Context())
	if err != nil {
		s.writeUserManagerReadError(w, err, "تعذرت قراءة جلسات User Manager")
		return
	}
	writeJSON(w, http.StatusOK, snapshot)
}

func (s *Server) writeUserManagerReadError(w http.ResponseWriter, err error, fallback string) {
	switch {
	case errors.Is(err, routerosadapter.ErrNotConnected):
		writeError(w, http.StatusConflict, "اتصل بالراوتر أولاً")
	case errors.Is(err, usermanager.ErrUnsupportedVersion):
		writeError(w, http.StatusUnprocessableEntity, "إصدار RouterOS غير مدعوم لقراءة User Manager")
	case errors.Is(err, usermanager.ErrInvalidSnapshot):
		writeError(w, http.StatusBadGateway, "أعاد User Manager بيانات غير مكتملة أو غير صالحة؛ لم تُستخدم القيم الملتبسة")
	default:
		if strings.TrimSpace(err.Error()) == "" {
			writeError(w, http.StatusBadGateway, fallback)
			return
		}
		writeError(w, http.StatusBadGateway, fallback+". تحقق من تثبيت الحزمة والصلاحيات.")
	}
}

func (s *Server) hotspotSessions(w http.ResponseWriter, r *http.Request) {
	sessions, err := s.routers.HotspotSessions(r.Context())
	if err != nil {
		if errors.Is(err, routerosadapter.ErrNotConnected) {
			writeError(w, http.StatusConflict, "اتصل بالراوتر أولاً")
			return
		}
		writeError(w, http.StatusBadGateway, "تعذرت قراءة جلسات HotSpot النشطة")
		return
	}
	writeJSON(w, http.StatusOK, sessions)
}

func (s *Server) terminateHotspotSession(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeError(w, http.StatusBadRequest, "معرّف الجلسة مطلوب")
		return
	}
	err := s.routers.TerminateHotspotSession(r.Context(), id)
	switch {
	case errors.Is(err, routerosadapter.ErrNotConnected):
		writeError(w, http.StatusConflict, "اتصل بالراوتر أولاً")
	case errors.Is(err, routerosadapter.ErrHotspotSessionNotActive):
		writeError(w, http.StatusConflict, "الجلسة لم تعد نشطة؛ حدّث القائمة قبل المحاولة")
	case err != nil:
		writeError(w, http.StatusBadGateway, "تعذر إنهاء جلسة HotSpot")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}
