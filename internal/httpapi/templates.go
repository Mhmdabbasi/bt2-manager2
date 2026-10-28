package httpapi

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type cardTemplateField struct {
	ID string `json:"id"`
	Kind string `json:"kind"`
	Field string `json:"field"`
	Text string `json:"text"`
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Width float64 `json:"width"`
	Height float64 `json:"height"`
	FontSize float64 `json:"font_size"`
	FontWeight string `json:"font_weight"`
	Align string `json:"align"`
	Color string `json:"color"`
}

type cardTemplateDocument struct {
	WidthMM float64 `json:"width_mm"`
	HeightMM float64 `json:"height_mm"`
	Background string `json:"background"`
	Fields []cardTemplateField `json:"fields"`
}

type templateRecord struct {
	ID string `json:"id"`
	VersionID string `json:"version_id"`
	Name string `json:"name"`
	Version int `json:"version"`
	CreatedAt string `json:"created_at"`
	ServiceType string `json:"service_type"`
	PackageID string `json:"package_id"`
	DistributorID string `json:"distributor_id"`
	Scope string `json:"scope"`
	Archived bool `json:"archived"`
	Document json.RawMessage `json:"document,omitempty"`
}

func (s *Server) listTemplates(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(), `SELECT t.id,t.name,t.current_version,t.created_at,v.id,t.service_type,COALESCE(t.package_id,''),COALESCE(t.distributor_id,''),t.scope,t.archived FROM templates t JOIN template_versions v ON v.template_id=t.id AND v.version=t.current_version WHERE t.archived=0 ORDER BY t.updated_at DESC,t.name`)
	if err != nil { writeError(w, http.StatusInternalServerError, "تعذر قراءة القوالب"); return }
	defer rows.Close()
	items := make([]templateRecord, 0)
	for rows.Next() {
		var item templateRecord
		var archived int
		if err := rows.Scan(&item.ID, &item.Name, &item.Version, &item.CreatedAt, &item.VersionID, &item.ServiceType, &item.PackageID, &item.DistributorID, &item.Scope, &archived); err != nil { writeError(w, http.StatusInternalServerError, "تعذر قراءة القالب"); return }
		item.Archived=archived==1
		items = append(items, item)
	}
	if err := rows.Err(); err != nil { writeError(w, http.StatusInternalServerError, "تعذر قراءة القوالب"); return }
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) getTemplate(w http.ResponseWriter, r *http.Request) {
	var item templateRecord
	var document string
	var archived int
	err := s.db.QueryRowContext(r.Context(), `SELECT t.id,t.name,t.current_version,t.created_at,v.id,v.document_json,t.service_type,COALESCE(t.package_id,''),COALESCE(t.distributor_id,''),t.scope,t.archived FROM templates t JOIN template_versions v ON v.template_id=t.id AND v.version=t.current_version WHERE t.id=?`, r.PathValue("id")).Scan(&item.ID, &item.Name, &item.Version, &item.CreatedAt, &item.VersionID, &document, &item.ServiceType, &item.PackageID, &item.DistributorID, &item.Scope, &archived)
	item.Archived=archived==1
	if errors.Is(err, sql.ErrNoRows) { writeError(w, http.StatusNotFound, "القالب غير موجود"); return }
	if err != nil { writeError(w, http.StatusInternalServerError, "تعذر قراءة القالب"); return }
	item.Document = json.RawMessage(document)
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) getTemplateVersion(w http.ResponseWriter, r *http.Request) {
	var item templateRecord
	var document string
	var archived int
	err := s.db.QueryRowContext(r.Context(), `SELECT t.id,t.name,v.version,v.created_at,v.id,v.document_json,t.service_type,COALESCE(t.package_id,''),COALESCE(t.distributor_id,''),t.scope,t.archived FROM template_versions v JOIN templates t ON t.id=v.template_id WHERE v.id=?`, r.PathValue("id")).Scan(&item.ID, &item.Name, &item.Version, &item.CreatedAt, &item.VersionID, &document, &item.ServiceType, &item.PackageID, &item.DistributorID, &item.Scope, &archived)
	item.Archived=archived==1
	if errors.Is(err, sql.ErrNoRows) { writeError(w, http.StatusNotFound, "إصدار القالب غير موجود"); return }
	if err != nil { writeError(w, http.StatusInternalServerError, "تعذر قراءة إصدار القالب"); return }
	item.Document = json.RawMessage(document)
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) saveTemplate(w http.ResponseWriter, r *http.Request) {
	var input struct { ID string `json:"id"`; Name string `json:"name"`; ServiceType string `json:"service_type"`; PackageID string `json:"package_id"`; DistributorID string `json:"distributor_id"`; Scope string `json:"scope"`; Document cardTemplateDocument `json:"document"` }
	if err := decodeJSON(w, r, &input); err != nil { writeError(w, http.StatusBadRequest, err.Error()); return }
	input.ID = strings.TrimSpace(input.ID)
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len([]rune(input.Name)) > 100 { writeError(w, http.StatusBadRequest, "اسم القالب مطلوب ويجب ألا يتجاوز 100 حرف"); return }
	input.ServiceType=strings.TrimSpace(input.ServiceType); if input.ServiceType=="" { input.ServiceType="hotspot" }
	input.Scope=strings.TrimSpace(input.Scope); if input.Scope=="" { input.Scope="global" }
	input.PackageID=strings.TrimSpace(input.PackageID); input.DistributorID=strings.TrimSpace(input.DistributorID)
	if (input.ServiceType!="hotspot"&&input.ServiceType!="user_manager")||(input.Scope!="global"&&input.Scope!="package"&&input.Scope!="distributor") { writeError(w,http.StatusBadRequest,"نوع الخدمة أو نطاق القالب غير صالح");return }
	if input.Scope!="global"&&input.PackageID=="" { writeError(w,http.StatusBadRequest,"اختر باقة لربط القالب بها");return }
	if input.Scope=="distributor"&&input.DistributorID=="" { writeError(w,http.StatusBadRequest,"اختر موزعاً لهذا القالب");return }
	if input.Scope!="distributor" { input.DistributorID="" }
	if input.PackageID!="" { var service string; if err:=s.db.QueryRowContext(r.Context(),`SELECT service_type FROM packages WHERE id=?`,input.PackageID).Scan(&service); err!=nil { writeError(w,http.StatusBadRequest,"الباقة المرتبطة بالقالب غير موجودة");return }; if service!=input.ServiceType { writeError(w,http.StatusBadRequest,"نوع خدمة القالب لا يطابق نوع الباقة");return } }
	if input.DistributorID!="" { var exists int; if err:=s.db.QueryRowContext(r.Context(),`SELECT COUNT(*) FROM distributors WHERE id=?`,input.DistributorID).Scan(&exists);err!=nil||exists!=1 { writeError(w,http.StatusBadRequest,"الموزع المرتبط بالقالب غير موجود");return } }
	if err := validateTemplate(input.Document); err != nil { writeError(w, http.StatusBadRequest, err.Error()); return }
	document, err := json.Marshal(input.Document)
	if err != nil { writeError(w, http.StatusBadRequest, "تعذر ترميز تصميم القالب"); return }
	if len(document) > 128*1024 { writeError(w, http.StatusRequestEntityTooLarge, "حجم تصميم القالب تجاوز الحد"); return }
	id, version := input.ID, 1
	now := time.Now().UTC().Format(time.RFC3339Nano)
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil { writeError(w, http.StatusInternalServerError, "تعذر بدء حفظ القالب"); return }
	defer tx.Rollback()
	if id == "" {
		id, err = randomID()
		if err != nil { writeError(w, http.StatusInternalServerError, "تعذر إنشاء معرّف للقالب"); return }
		if _, err = tx.ExecContext(r.Context(), `INSERT INTO templates(id,name,current_version,created_at,updated_at,service_type,package_id,distributor_id,scope,archived) VALUES(?,?,1,?,?,?,?,?,?,0)`, id, input.Name, now, now, input.ServiceType, nullIfEmpty(input.PackageID), nullIfEmpty(input.DistributorID), input.Scope); err != nil { writeError(w, http.StatusConflict, "تعذر إنشاء القالب؛ تحقق من عدم تكرار الاسم"); return }
	} else {
		if err = tx.QueryRowContext(r.Context(), `SELECT current_version FROM templates WHERE id=? AND archived=0`, id).Scan(&version); errors.Is(err, sql.ErrNoRows) { writeError(w, http.StatusNotFound, "القالب المراد تحديثه غير موجود"); return } else if err != nil { writeError(w, http.StatusInternalServerError, "تعذر قراءة إصدار القالب"); return }
		version++
		if _, err = tx.ExecContext(r.Context(), `UPDATE templates SET name=?,current_version=?,updated_at=?,service_type=?,package_id=?,distributor_id=?,scope=? WHERE id=? AND archived=0`, input.Name, version, now, input.ServiceType, nullIfEmpty(input.PackageID), nullIfEmpty(input.DistributorID), input.Scope, id); err != nil { writeError(w, http.StatusConflict, "تعذر تحديث القالب؛ قد يكون الاسم مستخدماً"); return }
	}
	versionID, err := randomID()
	if err != nil { writeError(w, http.StatusInternalServerError, "تعذر إنشاء إصدار القالب"); return }
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO template_versions(id,template_id,version,document_json,created_at) VALUES(?,?,?,?,?)`, versionID, id, version, string(document), now); err != nil { writeError(w, http.StatusInternalServerError, "تعذر حفظ إصدار القالب"); return }
	if err := tx.Commit(); err != nil { writeError(w, http.StatusInternalServerError, "تعذر تثبيت إصدار القالب"); return }
	writeJSON(w, http.StatusCreated, templateRecord{ID:id, VersionID:versionID, Name:input.Name, Version:version, CreatedAt:now, ServiceType:input.ServiceType, PackageID:input.PackageID, DistributorID:input.DistributorID, Scope:input.Scope, Document:document})
}

func (s *Server) archiveTemplate(w http.ResponseWriter,r *http.Request) {
	result,err:=s.db.ExecContext(r.Context(),`UPDATE templates SET archived=1,updated_at=? WHERE id=? AND archived=0`,time.Now().UTC().Format(time.RFC3339Nano),r.PathValue("id"))
	if err!=nil { writeError(w,http.StatusInternalServerError,"تعذرت أرشفة القالب");return }; count,_:=result.RowsAffected();if count==0 { writeError(w,http.StatusNotFound,"القالب غير موجود أو مؤرشف سابقاً");return };w.WriteHeader(http.StatusNoContent)
}

func validateTemplate(document cardTemplateDocument) error {
	if document.WidthMM < 20 || document.WidthMM > 100 || document.HeightMM < 10 || document.HeightMM > 60 { return fmt.Errorf("أبعاد البطاقة يجب أن تكون بين 20–100 مم عرضاً و10–60 مم ارتفاعاً") }
	if document.Background == "" { document.Background = "#ffffff" }
	if !validHexColor(document.Background) { return fmt.Errorf("لون الخلفية غير صالح؛ استخدم صيغة HEX مثل #ffffff") }
	if len(document.Fields) > 32 { return fmt.Errorf("القالب يدعم حتى 32 عنصراً") }
	seen := map[string]struct{}{}
	for _, field := range document.Fields {
		if field.ID == "" || len(field.ID) > 48 { return fmt.Errorf("معرّف عنصر القالب غير صالح") }
		if _, ok := seen[field.ID]; ok { return fmt.Errorf("معرّف عنصر القالب مكرر") }
		seen[field.ID] = struct{}{}
		if field.Kind != "text" && field.Kind != "field" { return fmt.Errorf("نوع عنصر القالب غير مدعوم") }
		if field.Kind == "field" && field.Field != "username" && field.Field != "password" && field.Field != "package" && field.Field != "validity" && field.Field != "date" && field.Field != "print_date" && field.Field != "qrcode" { return fmt.Errorf("حقل متغير غير مدعوم") }
		if field.Kind == "text" && len([]rune(field.Text)) > 160 { return fmt.Errorf("نص عنصر القالب أطول من الحد") }
		if field.X < 0 || field.Y < 0 || field.Width <= 0 || field.Height <= 0 || field.X+field.Width > document.WidthMM || field.Y+field.Height > document.HeightMM { return fmt.Errorf("يوجد عنصر خارج حدود البطاقة") }
		if field.FontSize < 6 || field.FontSize > 48 { return fmt.Errorf("حجم خط عنصر القالب خارج النطاق") }
		if field.Align != "right" && field.Align != "center" && field.Align != "left" { return fmt.Errorf("محاذاة عنصر القالب غير صالحة") }
		if field.Color != "" && !validHexColor(field.Color) { return fmt.Errorf("لون نص عنصر القالب غير صالح") }
	}
	return nil
}

func validHexColor(value string) bool {
	if len(value) != 7 || value[0] != '#' { return false }
	for _, r := range value[1:] { if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')) { return false } }
	return true
}
