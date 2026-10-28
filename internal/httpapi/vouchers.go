package httpapi

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type generatedVoucher struct {
	ID       string `json:"id"`
	RemoteID string `json:"-"`
	Username string `json:"username"`
	Password string `json:"password"`
	State    string `json:"state"`
	Error    string `json:"error,omitempty"`
}

type batchResult struct {
	ID             string             `json:"id"`
	Name           string             `json:"name"`
	OutletName     string             `json:"outlet_name"`
	State          string             `json:"state"`
	RequestedCount int                `json:"requested_count"`
	SucceededCount int                `json:"succeeded_count"`
	FailedCount    int                `json:"failed_count"`
	Vouchers       []generatedVoucher `json:"vouchers"`
}

func (s *Server) createBatch(w http.ResponseWriter, r *http.Request) {
	var input struct {
		PackageID         string `json:"package_id"`
		Count             int    `json:"count"`
		TemplateVersionID string `json:"template_version_id"`
		DistributorID     string `json:"distributor_id"`
		OutletName        string `json:"outlet_name"`
		UsernamePrefix    string `json:"username_prefix"`
		TokenMode         string `json:"token_mode"`
		UsernameLength    int    `json:"username_length"`
		HotspotServer     string `json:"hotspot_server"`
		PasswordPolicy    string `json:"password_policy"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if input.Count < 1 || input.Count > 200 {
		writeError(w, http.StatusBadRequest, "حجم الدفعة يجب أن يكون بين 1 و200 مستخدم")
		return
	}
	var pkg packageRecord
	var enabled int
	err := s.db.QueryRowContext(r.Context(), `SELECT id,name,service_type,profile_name,username_prefix,validity_label,price_minor,distributor_price_minor,currency,enabled FROM packages WHERE id=?`, input.PackageID).
		Scan(&pkg.ID, &pkg.Name, &pkg.ServiceType, &pkg.ProfileName, &pkg.UsernamePrefix, &pkg.ValidityLabel, &pkg.PriceMinor, &pkg.DistributorPriceMinor, &pkg.Currency, &enabled)
	if errors.Is(err, sql.ErrNoRows) { writeError(w, http.StatusNotFound, "الباقة غير موجودة"); return }
	if err != nil { writeError(w, http.StatusInternalServerError, "تعذر قراءة الباقة"); return }
	if enabled != 1 { writeError(w, http.StatusConflict, "الباقة متوقفة"); return }
	if pkg.ServiceType != "hotspot" { writeError(w, http.StatusConflict, "إنشاء مستخدمي User Manager غير متاح حتى اجتياز بوابة توافق v6/v7"); return }
	active, ok := s.routers.Active()
	if !ok { writeError(w, http.StatusConflict, "اتصل بالراوتر أولاً"); return }
	profiles, err := s.routers.Profiles(r.Context())
	if err != nil { writeError(w, http.StatusBadGateway, err.Error()); return }
	profileFound := false
	for _, profile := range profiles { if profile.Name == pkg.ProfileName { profileFound = true; break } }
	if !profileFound { writeError(w, http.StatusConflict, "ملف الباقة غير موجود على الراوتر النشط"); return }

	input.UsernamePrefix = strings.ToUpper(strings.TrimSpace(input.UsernamePrefix))
	if input.DistributorID != "" {
		input.DistributorID = strings.TrimSpace(input.DistributorID)
		var distributorActive, allPackages int
		if err := s.db.QueryRowContext(r.Context(), `SELECT active,all_packages_enabled FROM distributors WHERE id=?`, input.DistributorID).Scan(&distributorActive, &allPackages); errors.Is(err, sql.ErrNoRows) { writeError(w, http.StatusNotFound, "الموزع غير موجود"); return } else if err != nil { writeError(w, http.StatusInternalServerError, "تعذر قراءة سياسة الموزع"); return }
		if distributorActive != 1 { writeError(w, http.StatusConflict, "الموزع موقوف"); return }
		allowed := allPackages
		var prefixOverride string
		err := s.db.QueryRowContext(r.Context(), `SELECT allowed,username_prefix_override FROM distributor_package_settings WHERE distributor_id=? AND package_id=?`, input.DistributorID, pkg.ID).Scan(&allowed, &prefixOverride)
		if err != nil && !errors.Is(err, sql.ErrNoRows) { writeError(w, http.StatusInternalServerError, "تعذر التحقق من إتاحة الباقة للموزع"); return }
		if allowed != 1 { writeError(w, http.StatusConflict, "هذه الباقة غير متاحة للموزع المحدد"); return }
		if strings.TrimSpace(prefixOverride) != "" { input.UsernamePrefix = strings.ToUpper(strings.TrimSpace(prefixOverride)) }
	}
	input.OutletName = strings.TrimSpace(input.OutletName)
	if len(input.OutletName) > 120 { writeError(w, http.StatusBadRequest, "اسم نقطة التوزيع لا يتجاوز 120 حرفاً"); return }
	if input.OutletName == "" {
		if input.DistributorID != "" { if err:=s.db.QueryRowContext(r.Context(), `SELECT name FROM distributors WHERE id=?`, input.DistributorID).Scan(&input.OutletName); err!=nil { writeError(w,http.StatusInternalServerError,"تعذر قراءة اسم الموزع المرتبط بالدفعة"); return } }
		if input.OutletName == "" { input.OutletName = "المشغّل المحلي" }
	}
	if input.UsernamePrefix == "" { input.UsernamePrefix = pkg.UsernamePrefix }
	if len(input.UsernamePrefix) > 8 || !isAlphaNumeric(input.UsernamePrefix) { writeError(w, http.StatusBadRequest, "البادئة يجب أن تكون حتى 8 أحرف أو أرقام لاتينية"); return }
	if input.TokenMode == "" { input.TokenMode = "alphanumeric" }
	if input.TokenMode != "alphanumeric" && input.TokenMode != "letters" && input.TokenMode != "numbers" { writeError(w, http.StatusBadRequest, "نوع رمز الدخول غير صالح"); return }
	if input.UsernameLength == 0 { input.UsernameLength = 10 }
	if input.UsernameLength < len(input.UsernamePrefix)+4 || input.UsernameLength > 32 { writeError(w, http.StatusBadRequest, "طول اسم الدخول يجب أن يتضمن البادئة وأربعة رموز عشوائية على الأقل، وبحد أقصى 32"); return }
	if input.HotspotServer == "" { input.HotspotServer = "all" }
	input.HotspotServer = strings.TrimSpace(input.HotspotServer)
	if !strings.EqualFold(input.HotspotServer, "all") {
		servers, err := s.routers.HotspotServers(r.Context())
		if err != nil { writeError(w, http.StatusBadGateway, err.Error()); return }
		found := false
		for _, server := range servers { if server == input.HotspotServer { found = true; break } }
		if !found { writeError(w, http.StatusBadRequest, "خادم HotSpot المختار غير موجود على الراوتر"); return }
	}
	if input.PasswordPolicy == "" { input.PasswordPolicy = "random" }
	if input.PasswordPolicy != "none" && input.PasswordPolicy != "same_as_username" && input.PasswordPolicy != "random" { writeError(w, http.StatusBadRequest, "سياسة كلمة المرور غير صالحة"); return }
	templateDocument := ""
	if input.TemplateVersionID != "" {
		if err := s.db.QueryRowContext(r.Context(), `SELECT document_json FROM template_versions WHERE id=?`, input.TemplateVersionID).Scan(&templateDocument); errors.Is(err, sql.ErrNoRows) { writeError(w, http.StatusBadRequest, "إصدار قالب البطاقة غير موجود"); return } else if err != nil { writeError(w, http.StatusInternalServerError, "تعذر قراءة لقطة القالب"); return }
	}
	var routerID string
	if err := s.db.QueryRowContext(r.Context(), `SELECT id FROM routers WHERE address=? AND port=?`, active.Address, active.Port).Scan(&routerID); err != nil { writeError(w, http.StatusInternalServerError, "تعذر ربط الدفعة بسجل الراوتر المحلي"); return }
	existingUsers, err := s.routers.Users(r.Context())
	if err != nil { writeError(w, http.StatusBadGateway, "تعذر التحقق من أسماء المستخدمين الموجودة على الراوتر: "+err.Error()); return }
	reservedNames := make(map[string]struct{}, len(existingUsers)+input.Count)
	for _, user := range existingUsers { reservedNames[strings.ToUpper(user.Name)] = struct{}{} }

	batchID, err := randomID()
	if err != nil { writeError(w, http.StatusInternalServerError, "تعذر إنشاء معرّف للدفعة"); return }
	now := time.Now().UTC().Format(time.RFC3339Nano)
	batchName := "BT-" + time.Now().UTC().Format("20060102") + "-" + strings.ToUpper(batchID[:8])
	prepared := make([]generatedVoucher, input.Count)
	ciphertexts := make([][]byte, input.Count)
	for i := range prepared {
		prepared[i].ID, err = randomID()
		if err != nil { writeError(w, http.StatusInternalServerError, "تعذر إنشاء معرّفات القسائم"); return }
		for attempt := 0; attempt < 20; attempt++ {
			token, tokenErr := randomCode(input.UsernameLength-len(input.UsernamePrefix), input.TokenMode)
			if tokenErr != nil { writeError(w, http.StatusInternalServerError, "تعذر توليد اسم المستخدم"); return }
			candidate := input.UsernamePrefix + token
			if _, exists := reservedNames[strings.ToUpper(candidate)]; exists { continue }
			var localDuplicate int
			if err := s.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM vouchers WHERE router_id=? AND username=?`, routerID, candidate).Scan(&localDuplicate); err != nil { writeError(w, http.StatusInternalServerError, "تعذر التحقق من تفرد اسم المستخدم"); return }
			if localDuplicate != 0 { reservedNames[strings.ToUpper(candidate)] = struct{}{}; continue }
			prepared[i].Username = candidate
			reservedNames[strings.ToUpper(candidate)] = struct{}{}
			break
		}
		if prepared[i].Username == "" { writeError(w, http.StatusConflict, "تعذر توليد اسم مستخدم فريد؛ قلل العدد أو غيّر البادئة"); return }
		var password string
		switch input.PasswordPolicy {
		case "none": password = ""
		case "same_as_username": password = prepared[i].Username
		default:
			password, err = randomToken(12)
			if err != nil { writeError(w, http.StatusInternalServerError, "تعذر توليد كلمة المرور"); return }
		}
		prepared[i].Password = password
		prepared[i].State = "pending"
		ciphertexts[i], err = s.secrets.Encrypt([]byte(password))
		if err != nil { writeError(w, http.StatusInternalServerError, "تعذر تشفير بيانات القسائم محلياً"); return }
	}
	generationOptions, err := json.Marshal(map[string]any{"service_type":pkg.ServiceType,"package_name":pkg.Name,"profile_name":pkg.ProfileName,"validity_label":pkg.ValidityLabel,"price_minor":pkg.PriceMinor,"distributor_price_minor":pkg.DistributorPriceMinor,"currency":pkg.Currency,"username_prefix":input.UsernamePrefix,"token_mode":input.TokenMode,"username_length":input.UsernameLength,"hotspot_server":input.HotspotServer,"password_policy":input.PasswordPolicy,"distributor_id":input.DistributorID,"outlet_name":input.OutletName,"template_version_id":input.TemplateVersionID,"template_document_json":templateDocument,"paper":"A4","page_margin_mm":3})
	if err != nil { writeError(w, http.StatusInternalServerError, "تعذر حفظ إعدادات الدفعة"); return }

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil { writeError(w, http.StatusInternalServerError, "تعذر بدء تسجيل الدفعة"); return }
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO batches(id,router_id,package_id,state,requested_count,template_version_id,distributor_id,name,outlet_name,package_name_snapshot,service_type_snapshot,profile_name_snapshot,validity_label_snapshot,generation_options_json,created_at) VALUES(?,?,?,'running',?,?,?,?,?,?,?,?,?,?,?)`, batchID, routerID, pkg.ID, input.Count, nullIfEmpty(input.TemplateVersionID), nullIfEmpty(input.DistributorID), batchName, input.OutletName, pkg.Name, pkg.ServiceType, pkg.ProfileName, pkg.ValidityLabel, string(generationOptions), now); err != nil {
		tx.Rollback()
		writeError(w, http.StatusInternalServerError, "تعذر تسجيل الدفعة")
		return
	}
	for i, item := range prepared {
		if _, err = tx.ExecContext(r.Context(), `INSERT INTO vouchers(id,batch_id,router_id,package_id,username,password_ciphertext,state,created_at) VALUES(?,?,?,?,?,?,'pending',?)`, item.ID, batchID, routerID, pkg.ID, item.Username, ciphertexts[i], now); err != nil {
			tx.Rollback()
			writeError(w, http.StatusInternalServerError, "تعذر تجهيز عناصر الدفعة")
			return
		}
	}
	if err := tx.Commit(); err != nil { writeError(w, http.StatusInternalServerError, "تعذر حفظ الدفعة قبل التنفيذ"); return }

	successCount, failedCount := 0, 0
	for i := range prepared {
		ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
		created, createErr := s.routers.CreateUser(ctx, prepared[i].Username, prepared[i].Password, pkg.ProfileName, input.HotspotServer)
		cancel()
		if createErr != nil {
			reconcileCtx, reconcileCancel := context.WithTimeout(r.Context(), 8*time.Second)
			found, exists, reconcileErr := s.routers.FindUser(reconcileCtx, prepared[i].Username)
			reconcileCancel()
			if reconcileErr == nil && exists && found.Profile == pkg.ProfileName {
				created = found
				createErr = nil
			} else if reconcileErr != nil {
				prepared[i].Error = "تعذرت مصالحة نتيجة الكتابة؛ تحقق من الراوتر قبل أي إعادة محاولة"
			} else if exists {
				prepared[i].Error = "اسم المستخدم موجود على الراوتر بملف خدمة مختلف؛ لم تتم إعادة المحاولة"
			} else {
				retryCtx, retryCancel := context.WithTimeout(r.Context(), 10*time.Second)
				retried, retryErr := s.routers.CreateUser(retryCtx, prepared[i].Username, prepared[i].Password, pkg.ProfileName, input.HotspotServer)
				retryCancel()
				if retryErr == nil {
					created = retried
					createErr = nil
				} else {
					verifyCtx, verifyCancel := context.WithTimeout(r.Context(), 8*time.Second)
					confirmed, foundAfterRetry, verifyErr := s.routers.FindUser(verifyCtx, prepared[i].Username)
					verifyCancel()
					if verifyErr == nil && foundAfterRetry && confirmed.Profile == pkg.ProfileName {
						created = confirmed
						createErr = nil
					} else if verifyErr != nil {
						prepared[i].Error = "فشلت محاولة الإنشاء وتعذرت المصالحة النهائية؛ تحقق من الراوتر قبل إعادة المحاولة"
					} else if foundAfterRetry {
						prepared[i].Error = "اسم المستخدم موجود بعد المحاولة بملف خدمة مختلف؛ يلزم التحقق اليدوي"
					} else {
						createErr = retryErr
					}
				}
			}
		}
		if createErr == nil {
			prepared[i].RemoteID = created.ID
			prepared[i].State = "active"
			prepared[i].Error = ""
			successCount++
		} else {
			prepared[i].State = "failed"
			if prepared[i].Error == "" { prepared[i].Error = safeFailure(createErr.Error(), prepared[i].Password) }
			failedCount++
		}
		wasActive := prepared[i].State == "active"
		if err := s.persistVoucherResult(r.Context(), prepared[i], batchID, input.DistributorID); err != nil {
			prepared[i].State = "failed"
			prepared[i].Error = "تعذر حفظ نتيجة العنصر محلياً؛ راجع الراوتر قبل إعادة المحاولة"
			if wasActive { successCount--; failedCount++ }
		}
		if prepared[i].State != "active" { prepared[i].Password = "" }
	}

	state := "completed"
	if failedCount == input.Count { state = "failed" } else if failedCount > 0 { state = "partial" }
	if _, err := s.db.ExecContext(r.Context(), `UPDATE batches SET state=?,succeeded_count=?,failed_count=?,completed_at=? WHERE id=?`, state, successCount, failedCount, time.Now().UTC().Format(time.RFC3339Nano), batchID); err != nil { writeError(w, http.StatusInternalServerError, "تم إرسال الدفعة لكن تعذر حفظ حالتها النهائية؛ راجع حالة القسائم"); return }
	writeJSON(w, http.StatusCreated, batchResult{ID: batchID, Name: batchName, OutletName: input.OutletName, State: state, RequestedCount: input.Count, SucceededCount: successCount, FailedCount: failedCount, Vouchers: prepared})
}

func (s *Server) persistVoucherResult(ctx context.Context, item generatedVoucher, batchID, distributorID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return err }
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE vouchers SET state=?,failure_reason=?,remote_id=? WHERE id=?`, item.State, item.Error, item.RemoteID, item.ID); err != nil { return err }
	if item.State == "active" {
		eventID, err := randomID(); if err != nil { return err }
		eventType := "issue"
		if distributorID != "" { eventType = "allocate" }
		if _, err := tx.ExecContext(ctx, `INSERT INTO stock_events(id,voucher_id,distributor_id,event_type,quantity,reference,note,created_at) VALUES(?,?,?,?,1,?,'إصدار دفعة',?)`, eventID, item.ID, nullIfEmpty(distributorID), eventType, batchID, time.Now().UTC().Format(time.RFC3339Nano)); err != nil { return err }
	}
	return tx.Commit()
}
func (s *Server) listVouchers(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 50, 1, 200)
	offset := queryInt(r, "offset", 0, 0, 1000000)
	term := strings.TrimSpace(r.URL.Query().Get("q"))
	var total int
	if err := s.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM vouchers WHERE (?='' OR username LIKE '%'||?||'%')`, term, term).Scan(&total); err != nil { writeError(w,http.StatusInternalServerError,"تعذر قراءة القسائم"); return }
	rows,err:=s.db.QueryContext(r.Context(),`SELECT v.id,v.batch_id,v.username,v.state,v.failure_reason,v.created_at,p.name,
		COALESCE((SELECT d.name FROM stock_events se LEFT JOIN distributors d ON d.id=se.distributor_id WHERE se.voucher_id=v.id ORDER BY se.created_at DESC,se.rowid DESC LIMIT 1),'المشغّل')
		FROM vouchers v JOIN packages p ON p.id=v.package_id WHERE (?='' OR v.username LIKE '%'||?||'%') ORDER BY v.created_at DESC,v.rowid DESC LIMIT ? OFFSET ?`,term,term,limit,offset)
	if err!=nil { writeError(w,http.StatusInternalServerError,"تعذر قراءة القسائم"); return }; defer rows.Close()
	type voucherRow struct { ID string `json:"id"`; BatchID string `json:"batch_id"`; Username string `json:"username"`; State string `json:"state"`; FailureReason string `json:"failure_reason"`; CreatedAt string `json:"created_at"`; Package string `json:"package"`; Owner string `json:"owner"` }
	items:=make([]voucherRow,0); for rows.Next(){var x voucherRow;if err:=rows.Scan(&x.ID,&x.BatchID,&x.Username,&x.State,&x.FailureReason,&x.CreatedAt,&x.Package,&x.Owner);err!=nil{writeError(w,http.StatusInternalServerError,"تعذر قراءة القسيمة");return};items=append(items,x)};if err:=rows.Err();err!=nil{writeError(w,http.StatusInternalServerError,"تعذر قراءة القسائم");return}
	writeJSON(w,http.StatusOK,map[string]any{"items":items,"total":total,"limit":limit,"offset":offset})
}

func (s *Server) listBatches(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 50, 1, 200)
	offset := queryInt(r, "offset", 0, 0, 1000000)
	term := strings.TrimSpace(r.URL.Query().Get("q"))
	filter := `(?='' OR b.name LIKE '%'||?||'%' OR b.outlet_name LIKE '%'||?||'%' OR COALESCE(NULLIF(b.package_name_snapshot,''),p.name) LIKE '%'||?||'%')`
	var total int
	if err := s.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM batches b JOIN packages p ON p.id=b.package_id WHERE `+filter, term, term, term, term).Scan(&total); err != nil { writeError(w, http.StatusInternalServerError, "تعذر عدّ الأرشيف"); return }
	rows, err := s.db.QueryContext(r.Context(), `SELECT b.id,COALESCE(NULLIF(b.name,''),'BT-'||upper(substr(b.id,1,8))),b.outlet_name,b.state,b.requested_count,b.succeeded_count,b.failed_count,b.created_at,b.completed_at,COALESCE(NULLIF(b.printed_at,''),''),b.print_count,COALESCE(NULLIF(b.package_name_snapshot,''),p.name),COALESCE(NULLIF(b.service_type_snapshot,''),p.service_type),COALESCE(NULLIF(b.profile_name_snapshot,''),p.profile_name),COALESCE((SELECT COUNT(*) FROM vouchers v WHERE v.batch_id=b.id AND v.state='active'),0),COALESCE((SELECT COUNT(*) FROM vouchers v WHERE v.batch_id=b.id AND v.state='disabled'),0)
		FROM batches b JOIN packages p ON p.id=b.package_id WHERE `+filter+` ORDER BY b.created_at DESC,b.rowid DESC LIMIT ? OFFSET ?`, term, term, term, term, limit, offset)
	if err != nil { writeError(w, http.StatusInternalServerError, "تعذر قراءة أرشيف الدفعات"); return }
	defer rows.Close()
	type batchRow struct {
		ID string `json:"id"`; Name string `json:"name"`; OutletName string `json:"outlet_name"`; State string `json:"state"`
		Requested int `json:"requested_count"`; Succeeded int `json:"succeeded_count"`; Failed int `json:"failed_count"`
		CreatedAt string `json:"created_at"`; CompletedAt string `json:"completed_at"`; PrintedAt string `json:"printed_at"`; PrintCount int `json:"print_count"`
		Package string `json:"package"`; ServiceType string `json:"service_type"`; Profile string `json:"profile_name"`; ActiveCount int `json:"active_count"`; DisabledCount int `json:"disabled_count"`
	}
	items := make([]batchRow, 0)
	for rows.Next() { var item batchRow; if err := rows.Scan(&item.ID,&item.Name,&item.OutletName,&item.State,&item.Requested,&item.Succeeded,&item.Failed,&item.CreatedAt,&item.CompletedAt,&item.PrintedAt,&item.PrintCount,&item.Package,&item.ServiceType,&item.Profile,&item.ActiveCount,&item.DisabledCount); err != nil { writeError(w, http.StatusInternalServerError, "تعذر قراءة سجل الدفعة"); return }; items = append(items,item) }
	if err := rows.Err(); err != nil { writeError(w, http.StatusInternalServerError, "تعذر قراءة الأرشيف"); return }
	writeJSON(w,http.StatusOK,map[string]any{"items":items,"total":total,"limit":limit,"offset":offset})
}

func (s *Server) batchDetails(w http.ResponseWriter, r *http.Request) {
	var item struct {
		ID string `json:"id"`; Name string `json:"name"`; OutletName string `json:"outlet_name"`; State string `json:"state"`
		Requested int `json:"requested_count"`; Succeeded int `json:"succeeded_count"`; Failed int `json:"failed_count"`
		CreatedAt string `json:"created_at"`; CompletedAt string `json:"completed_at"`; PrintedAt string `json:"printed_at"`; PrintCount int `json:"print_count"`
		Package string `json:"package"`; ServiceType string `json:"service_type"`; Profile string `json:"profile_name"`; Validity string `json:"validity_label"`
		TemplateVersionID string `json:"template_version_id"`; Options map[string]any `json:"generation_options"`
	}
	var rawOptions string
	err := s.db.QueryRowContext(r.Context(), `SELECT b.id,COALESCE(NULLIF(b.name,''),'BT-'||upper(substr(b.id,1,8))),b.outlet_name,b.state,b.requested_count,b.succeeded_count,b.failed_count,b.created_at,b.completed_at,b.printed_at,b.print_count,COALESCE(NULLIF(b.package_name_snapshot,''),p.name),COALESCE(NULLIF(b.service_type_snapshot,''),p.service_type),COALESCE(NULLIF(b.profile_name_snapshot,''),p.profile_name),CASE WHEN b.package_name_snapshot<>'' THEN b.validity_label_snapshot ELSE p.validity_label END,COALESCE(b.template_version_id,''),b.generation_options_json FROM batches b JOIN packages p ON p.id=b.package_id WHERE b.id=?`,r.PathValue("id")).Scan(&item.ID,&item.Name,&item.OutletName,&item.State,&item.Requested,&item.Succeeded,&item.Failed,&item.CreatedAt,&item.CompletedAt,&item.PrintedAt,&item.PrintCount,&item.Package,&item.ServiceType,&item.Profile,&item.Validity,&item.TemplateVersionID,&rawOptions)
	if errors.Is(err,sql.ErrNoRows) { writeError(w,http.StatusNotFound,"الدفعة غير موجودة"); return }; if err != nil { writeError(w,http.StatusInternalServerError,"تعذر قراءة الدفعة"); return }
	if err := json.Unmarshal([]byte(rawOptions),&item.Options); err != nil { item.Options=map[string]any{} }
	rows,err:=s.db.QueryContext(r.Context(),`SELECT id,username,password_ciphertext,state,failure_reason FROM vouchers WHERE batch_id=? ORDER BY rowid`,item.ID)
	if err!=nil { writeError(w,http.StatusInternalServerError,"تعذر قراءة عناصر الدفعة"); return }; defer rows.Close()
	type archivedVoucher struct { ID string `json:"id"`; Username string `json:"username"`; Password string `json:"password"`; State string `json:"state"`; Error string `json:"error,omitempty"` }
	vouchers:=make([]archivedVoucher,0,item.Requested)
	for rows.Next() { var v archivedVoucher; var encrypted []byte; if err:=rows.Scan(&v.ID,&v.Username,&encrypted,&v.State,&v.Error); err!=nil { writeError(w,http.StatusInternalServerError,"تعذر قراءة عنصر الدفعة"); return }; if v.State=="active" || v.State=="disabled" { password,err:=s.secrets.Decrypt(encrypted); if err!=nil { writeError(w,http.StatusInternalServerError,"تعذر فك تشفير بيانات الدفعة"); return }; v.Password=string(password) }; vouchers=append(vouchers,v) }
	if err:=rows.Err(); err!=nil { writeError(w,http.StatusInternalServerError,"تعذر إكمال قراءة الدفعة"); return }
	writeJSON(w,http.StatusOK,map[string]any{"batch":item,"vouchers":vouchers})
}

func (s *Server) markBatchPrinted(w http.ResponseWriter, r *http.Request) {
	now:=time.Now().UTC().Format(time.RFC3339Nano)
	result,err:=s.db.ExecContext(r.Context(),`UPDATE batches SET printed_at=?,print_count=print_count+1 WHERE id=? AND succeeded_count>0`,now,r.PathValue("id"))
	if err!=nil { writeError(w,http.StatusInternalServerError,"تعذر تسجيل وقت الطباعة"); return }; count,_:=result.RowsAffected(); if count==0 { writeError(w,http.StatusNotFound,"لا توجد دفعة قابلة للطباعة بهذا المعرّف"); return }
	writeJSON(w,http.StatusOK,map[string]any{"printed_at":now})
}

func (s *Server) disableBatch(w http.ResponseWriter,r *http.Request) { s.setBatchVoucherState(w,r,false) }
func (s *Server) enableBatch(w http.ResponseWriter,r *http.Request) { s.setBatchVoucherState(w,r,true) }

func (s *Server) setBatchVoucherState(w http.ResponseWriter,r *http.Request,enable bool) {
	var address string; var port int
	err:=s.db.QueryRowContext(r.Context(),`SELECT r.address,r.port FROM batches b JOIN routers r ON r.id=b.router_id WHERE b.id=?`,r.PathValue("id")).Scan(&address,&port)
	if errors.Is(err,sql.ErrNoRows) { writeError(w,http.StatusNotFound,"الدفعة غير موجودة"); return }; if err!=nil { writeError(w,http.StatusInternalServerError,"تعذر قراءة الراوتر المرتبط بالدفعة"); return }
	active,ok:=s.routers.Active(); if !ok { writeError(w,http.StatusConflict,"اتصل بالراوتر المرتبط بالدفعة أولاً"); return }; if active.Address!=address||active.Port!=port { writeError(w,http.StatusConflict,"الاتصال الحالي لراوتر مختلف عن الراوتر الذي أنشأ الدفعة"); return }
	state,target:="active","disabled"; if enable { state,target="disabled","active" }
	rows,err:=s.db.QueryContext(r.Context(),`SELECT id,username,remote_id FROM vouchers WHERE batch_id=? AND state=? ORDER BY rowid`,r.PathValue("id"),state)
	if err!=nil { writeError(w,http.StatusInternalServerError,"تعذر قراءة قسائم الدفعة"); return }
	type targetVoucher struct { ID string; Username string; RemoteID string }; items:=make([]targetVoucher,0)
	for rows.Next(){var item targetVoucher;if err:=rows.Scan(&item.ID,&item.Username,&item.RemoteID);err!=nil{rows.Close();writeError(w,http.StatusInternalServerError,"تعذر قراءة قسيمة");return};items=append(items,item)};if err:=rows.Err();err!=nil{rows.Close();writeError(w,http.StatusInternalServerError,"تعذر إكمال قراءة القسائم");return};rows.Close()
	type actionResult struct { ID string `json:"id"`; Username string `json:"username"`; State string `json:"state"`; Error string `json:"error,omitempty"` }; results:=make([]actionResult,0,len(items)); succeeded:=0
	for _,item:=range items { result:=actionResult{ID:item.ID,Username:item.Username,State:"failed"}; if item.RemoteID=="" { result.Error="لا يوجد معرّف RouterOS موثوق";results=append(results,result);continue }
		ctx,cancel:=context.WithTimeout(r.Context(),8*time.Second);var actionErr error;if enable { actionErr=s.routers.EnableUser(ctx,item.RemoteID) } else { actionErr=s.routers.DisableUser(ctx,item.RemoteID) };cancel()
		if actionErr!=nil { verifyCtx,verifyCancel:=context.WithTimeout(r.Context(),8*time.Second);remote,exists,verifyErr:=s.routers.FindUser(verifyCtx,item.Username);verifyCancel();desiredDisabled:=!enable;if verifyErr!=nil { result.Error="تعذر تأكيد التغيير: "+verifyErr.Error() } else if !exists||remote.ID!=item.RemoteID||remote.Disabled!=desiredDisabled { result.Error=safeFailure(actionErr.Error(),"") } else { actionErr=nil } }
		if actionErr==nil { _,err:=s.db.ExecContext(r.Context(),`UPDATE vouchers SET state=? WHERE id=? AND state=?`,target,item.ID,state);if err!=nil { result.Error="تم تغيير الحالة على الراوتر لكن تعذر حفظها محلياً؛ أعد المزامنة" } else { result.State=target;succeeded++ } };results=append(results,result)
	}
	writeJSON(w,http.StatusOK,map[string]any{"requested_count":len(items),"succeeded_count":succeeded,"failed_count":len(items)-succeeded,"results":results})
}

func (s *Server) voucherCredentials(w http.ResponseWriter, r *http.Request) {
	var username string; var encrypted []byte; var state string
	err:=s.db.QueryRowContext(r.Context(),`SELECT username,password_ciphertext,state FROM vouchers WHERE id=?`,r.PathValue("id")).Scan(&username,&encrypted,&state)
	if errors.Is(err,sql.ErrNoRows){writeError(w,http.StatusNotFound,"القسيمة غير موجودة");return};if err!=nil{writeError(w,http.StatusInternalServerError,"تعذر قراءة بيانات القسيمة");return};if state!="active"{writeError(w,http.StatusConflict,"لا يمكن عرض بيانات قسيمة لم يثبت نجاحها");return}
	password,err:=s.secrets.Decrypt(encrypted);if err!=nil{writeError(w,http.StatusInternalServerError,"تعذر فك تشفير بيانات القسيمة");return};writeJSON(w,http.StatusOK,map[string]string{"username":username,"password":string(password)})
}

func (s *Server) disableVoucher(w http.ResponseWriter, r *http.Request) {
	var remoteID, state, savedAddress string
	var savedPort int
	err := s.db.QueryRowContext(r.Context(), `SELECT v.remote_id,v.state,r.address,r.port FROM vouchers v JOIN routers r ON r.id=v.router_id WHERE v.id=?`, r.PathValue("id")).Scan(&remoteID,&state,&savedAddress,&savedPort)
	if errors.Is(err,sql.ErrNoRows) { writeError(w,http.StatusNotFound,"القسيمة غير موجودة");return }
	if err!=nil { writeError(w,http.StatusInternalServerError,"تعذر قراءة القسيمة");return }
	if state!="active" { writeError(w,http.StatusConflict,"القسيمة ليست مفعلة محلياً");return }
	if remoteID=="" { writeError(w,http.StatusConflict,"لا يوجد معرّف RouterOS موثوق لهذه القسيمة؛ لا يمكن تنفيذ التعطيل بأمان");return }
	active,ok:=s.routers.Active();if !ok { writeError(w,http.StatusConflict,"اتصل بالراوتر المرتبط بالقسيمة أولاً");return };if active.Address!=savedAddress||active.Port!=savedPort { writeError(w,http.StatusConflict,"الاتصال الحالي لراوتر مختلف عن الراوتر الذي أنشأ القسيمة");return }
	if err:=s.routers.DisableUser(r.Context(),remoteID);err!=nil { writeError(w,http.StatusBadGateway,err.Error());return }
	if _,err:=s.db.ExecContext(r.Context(),`UPDATE vouchers SET state='disabled' WHERE id=?`,r.PathValue("id"));err!=nil { writeError(w,http.StatusInternalServerError,"تم التعطيل على الراوتر لكن تعذر تحديث السجل المحلي؛ راجع المزامنة");return }
	writeJSON(w,http.StatusOK,map[string]string{"state":"disabled"})
}

func queryInt(r *http.Request,key string, fallback,min,max int) int { value:=r.URL.Query().Get(key);if value==""{return fallback};parsed,err:=strconv.Atoi(value);if err!=nil || parsed<min || parsed>max{return fallback};return parsed }

func randomToken(bytesCount int) (string,error) { raw:=make([]byte,bytesCount);if _,err:=rand.Read(raw);err!=nil{return "",err};return strings.TrimRight(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(raw),"=")[:bytesCount],nil }

func safeFailure(message,password string) string {
	if password != "" { message=strings.ReplaceAll(message,password,"[redacted]") }
	message=strings.ReplaceAll(message,"\n"," ")
	runes:=[]rune(message)
	if len(runes)>280 { message=string(runes[:280]) }
	return message
}

// randomCode uses rejection sampling so each allowed symbol is equally likely.
func randomCode(length int, mode string) (string, error) {
	if length < 1 || length > 32 {
		return "", fmt.Errorf("invalid code length")
	}
	alphabet := "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	switch mode {
	case "letters":
		alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	case "numbers":
		alphabet = "0123456789"
	case "alphanumeric":
	default:
		return "", fmt.Errorf("invalid code alphabet")
	}
	limit := 256 - (256 % len(alphabet))
	result := make([]byte, 0, length)
	buffer := make([]byte, 64)
	for len(result) < length {
		if _, err := rand.Read(buffer); err != nil {
			return "", fmt.Errorf("generate random code: %w", err)
		}
		for _, value := range buffer {
			if int(value) >= limit {
				continue
			}
			result = append(result, alphabet[int(value)%len(alphabet)])
			if len(result) == length {
				break
			}
		}
	}
	return string(result), nil
}
