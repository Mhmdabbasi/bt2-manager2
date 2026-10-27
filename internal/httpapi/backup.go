package httpapi

import (
	"context"
	"net/http"
	"strconv"
	"time"

	backupfile "github.com/Mhmdabbasi/bt2-manager2/internal/backup"
	"github.com/Mhmdabbasi/bt2-manager2/internal/store"
)

func (s *Server) exportBackup(w http.ResponseWriter, r *http.Request) {
	var request struct { Password string `json:"password"` }
	if err := decodeJSON(w, r, &request); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()
	database, err := store.SnapshotDB(ctx, s.db)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "تعذر إنشاء نسخة قاعدة البيانات")
		return
	}
	encrypted, err := backupfile.Encrypt(database, s.secrets.ExportKey(), request.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/vnd.bt2-manager2.backup")
	w.Header().Set("Content-Disposition", `attachment; filename="bt2-manager2-backup.bt2backup"`)
	w.Header().Set("Content-Length", strconv.Itoa(len(encrypted)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(encrypted)
}
