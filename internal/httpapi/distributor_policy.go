package httpapi

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"
)

type distributorPackageSetting struct {
	PackageID string `json:"package_id"`
	Name string `json:"name"`
	ServiceType string `json:"service_type"`
	PackageEnabled bool `json:"package_enabled"`
	Allowed bool `json:"allowed"`
	UsernamePrefixOverride string `json:"username_prefix_override"`
}

type distributorPackagePolicy struct {
	DistributorID string `json:"distributor_id"`
	AllPackagesEnabled bool `json:"all_packages_enabled"`
	Packages []distributorPackageSetting `json:"packages"`
}

func (s *Server) distributorPackages(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var allPackages int
	if err := s.db.QueryRowContext(r.Context(), `SELECT all_packages_enabled FROM distributors WHERE id=?`, id).Scan(&allPackages); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "الموزع غير موجود")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "تعذر قراءة سياسة الموزع")
		return
	}
	rows, err := s.db.QueryContext(r.Context(), `SELECT p.id,p.name,p.service_type,p.enabled,COALESCE(s.allowed,?),COALESCE(s.username_prefix_override,'') FROM packages p LEFT JOIN distributor_package_settings s ON s.package_id=p.id AND s.distributor_id=? ORDER BY p.name`, allPackages, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "تعذر قراءة باقات الموزع")
		return
	}
	defer rows.Close()
	policy := distributorPackagePolicy{DistributorID:id, AllPackagesEnabled:allPackages == 1, Packages:make([]distributorPackageSetting, 0)}
	for rows.Next() {
		var item distributorPackageSetting
		var packageEnabled, allowed int
		if err := rows.Scan(&item.PackageID, &item.Name, &item.ServiceType, &packageEnabled, &allowed, &item.UsernamePrefixOverride); err != nil {
			writeError(w, http.StatusInternalServerError, "تعذر قراءة إعدادات باقة الموزع")
			return
		}
		item.PackageEnabled = packageEnabled == 1
		item.Allowed = allowed == 1
		policy.Packages = append(policy.Packages, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "تعذر إكمال قراءة باقات الموزع")
		return
	}
	writeJSON(w, http.StatusOK, policy)
}

func (s *Server) updateDistributorPackages(w http.ResponseWriter, r *http.Request) {
	var input struct {
		AllPackagesEnabled bool `json:"all_packages_enabled"`
		Packages []distributorPackageSetting `json:"packages"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(input.Packages) > 1000 {
		writeError(w, http.StatusBadRequest, "عدد إعدادات الباقات تجاوز الحد")
		return
	}
	seen := make(map[string]struct{}, len(input.Packages))
	for i := range input.Packages {
		item := &input.Packages[i]
		item.PackageID = strings.TrimSpace(item.PackageID)
		item.UsernamePrefixOverride = strings.ToUpper(strings.TrimSpace(item.UsernamePrefixOverride))
		if item.PackageID == "" || len(item.UsernamePrefixOverride) > 8 || (item.UsernamePrefixOverride != "" && !isAlphaNumeric(item.UsernamePrefixOverride)) {
			writeError(w, http.StatusBadRequest, "معرّف الباقة أو البادئة المخصصة غير صالح")
			return
		}
		if _, exists := seen[item.PackageID]; exists {
			writeError(w, http.StatusBadRequest, "توجد باقة مكررة في الإعدادات")
			return
		}
		seen[item.PackageID] = struct{}{}
	}

	id := r.PathValue("id")
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "تعذر بدء تحديث سياسة الموزع")
		return
	}
	defer tx.Rollback()
	var exists int
	if err := tx.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM distributors WHERE id=?`, id).Scan(&exists); err != nil || exists != 1 {
		writeError(w, http.StatusNotFound, "الموزع غير موجود")
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := tx.ExecContext(r.Context(), `UPDATE distributors SET all_packages_enabled=?,updated_at=? WHERE id=?`, boolInt(input.AllPackagesEnabled), now, id); err != nil {
		writeError(w, http.StatusInternalServerError, "تعذر حفظ قاعدة إتاحة الباقات")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `DELETE FROM distributor_package_settings WHERE distributor_id=?`, id); err != nil {
		writeError(w, http.StatusInternalServerError, "تعذر استبدال إعدادات الباقات")
		return
	}
	for _, item := range input.Packages {
		// Persist only explicit exceptions to the default-all/default-none policy,
		// plus per-distributor prefix overrides.
		if item.Allowed == input.AllPackagesEnabled && item.UsernamePrefixOverride == "" {
			continue
		}
		if _, err := tx.ExecContext(r.Context(), `INSERT INTO distributor_package_settings(distributor_id,package_id,allowed,username_prefix_override,updated_at) VALUES(?,?,?,?,?)`, id, item.PackageID, boolInt(item.Allowed), item.UsernamePrefixOverride, now); err != nil {
			writeError(w, http.StatusBadRequest, "تعذر حفظ إعداد إحدى الباقات؛ تحقق من وجود الباقة")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "تعذر تثبيت سياسة الموزع")
		return
	}
	s.distributorPackages(w, r)
}
