package httpapi

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Mhmdabbasi/bt2-manager2/internal/routeros"
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
	err := s.db.QueryRowContext(r.Context(), `SELECT id,name,service_type,profile_name,username_prefix,validity_label,price_minor,currency,enabled FROM packages WHERE id=?`, input.PackageID).
		Scan(&pkg.ID, &pkg.Name, &pkg.ServiceType, &pkg.ProfileName, &pkg.UsernamePrefix, &pkg.ValidityLabel, &pkg.PriceMinor, &pkg.Currency, &enabled)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "الباقة غير موجودة")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "تعذر قراءة الباقة")
		return
	}
	if enabled != 1 {
		writeError(w, http.StatusConflict, "الباقة متوقفة")
		return
	}
	if pkg.ServiceType != "hotspot" {
		writeError(w, http.StatusConflict, "إنشاء مستخدمي User Manager غير متاح حتى اجتياز بوابة توافق v6/v7")
		return
	}
	active, ok := s.routers.Active()
	if !ok {
		writeError(w, http.StatusConflict, "اتصل بالراوتر أولاً")
		return
	}
	profiles, err := s.routers.Profiles(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	profileFound := false
	for _, profile := range profiles {
		if profile.Name == pkg.ProfileName {
			profileFound = true
			break
		}
	}
	if !profileFound {
		writeError(w, http.StatusConflict, "ملف الباقة غير موجود على الراوتر النشط")
		return
	}
	if input.TemplateVersionID != "" {
		var exists int
		if err := s.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM template_versions WHERE id=?`, input.TemplateVersionID).Scan(&exists); err != nil || exists != 1 {
			writeError(w, http.StatusBadRequest, "إصدار قالب البطاقة غير موجود")
			return
		}
	}
	var routerID string
	if err := s.db.QueryRowContext(r.Context(), `SELECT id FROM routers WHERE address=? AND port=?`, active.Address, active.Port).Scan(&routerID); err != nil {
		writeError(w, http.StatusInternalServerError, "تعذر ربط الدفعة بسجل الراوتر المحلي")
		return
	}

	batchID, err := randomID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "تعذر إنشاء معرّف للدفعة")
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	prepared := make([]generatedVoucher, input.Count)
	ciphertexts := make([][]byte, input.Count)
	for i := range prepared {
		prepared[i].ID, err = randomID()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "تعذر إنشاء معرّفات القسائم")
			return
		}
		username, tokenErr := randomToken(10)
		if tokenErr != nil {
			writeError(w, http.StatusInternalServerError, "تعذر توليد بيانات القسيمة")
			return
		}
		password, tokenErr := randomToken(12)
		if tokenErr != nil {
			writeError(w, http.StatusInternalServerError, "تعذر توليد بيانات القسيمة")
			return
		}
		prepared[i].Username = pkg.UsernamePrefix + username
		prepared[i].Password = password
		prepared[i].State = "pending"
		ciphertexts[i], err = s.secrets.Encrypt([]byte(password))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "تعذر تشفير بيانات القسائم محلياً")
			return
		}
	}

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "تعذر بدء تسجيل الدفعة")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO batches(id,router_id,package_id,state,requested_count,template_version_id,created_at) VALUES(?,?,?,'running',?,?,?)`, batchID, routerID, pkg.ID, input.Count, nullIfEmpty(input.TemplateVersionID), now); err != nil {
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
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "تعذر حفظ الدفعة قبل التنفيذ")
		return
	}

	successCount, failedCount := 0, 0
	for i := range prepared {
		ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
		created, createErr := s.routers.CreateUser(ctx, prepared[i].Username, prepared[i].Password, pkg.ProfileName)
		cancel()
		if createErr != nil {
			// If the router accepted the create but its reply was lost, reconcile by
			// the generated unique username instead of retrying a write blindly.
			reconcileCtx, reconcileCancel := context.WithTimeout(r.Context(), 8*time.Second)
			found, exists, reconcileErr := s.routers.FindUser(reconcileCtx, prepared[i].Username)
			reconcileCancel()
			if reconcileErr == nil && exists && found.Profile == pkg.ProfileName {
				prepared[i].RemoteID = found.ID
				prepared[i].State = "active"
				prepared[i].Error = ""
				successCount++
			} else {
				prepared[i].State = "failed"
				prepared[i].Error = safeFailure(createErr.Error(), prepared[i].Password)
				if reconcileErr != nil {
					prepared[i].Error = "تعذرت مصالحة النتيجة بعد خطأ اتصال؛ راجع الراوتر قبل إعادة المحاولة"
				}
				failedCount++
			}
		} else {
			prepared[i].RemoteID = created.ID
			prepared[i].State = "active"
			successCount++
		}
		wasActive := prepared[i].State == "active"
		if err := s.persistVoucherResult(r.Context(), prepared[i], batchID); err != nil {
			prepared[i].State = "failed"
			prepared[i].Error = "تعذر حفظ نتيجة العنصر محلياً؛ راجع الراوتر قبل إعادة المحاولة"
			if wasActive {
				successCount--
				failedCount++
			}
		}
		if prepared[i].State != "active" { prepared[i].Password = "" } // Failed credentials are never returned to the UI.
	}

	state := "completed"
	if failedCount == input.Count {
		state = "failed"
	} else if failedCount > 0 {
		state = "partial"
	}
	if _, err := s.db.ExecContext(r.Context(), `UPDATE batches SET state=?,succeeded_count=?,failed_count=?,completed_at=? WHERE id=?`, state, successCount, failedCount, time.Now().UTC().Format(time.RFC3339Nano), batchID); err != nil {
		writeError(w, http.StatusInternalServerError, "تم إرسال الدفعة لكن تعذر حفظ حالتها النهائية؛ راجع حالة القسائم")
		return
	}
	writeJSON(w, http.StatusCreated, batchResult{ID: batchID, State: state, RequestedCount: input.Count, SucceededCount: successCount, FailedCount: failedCount, Vouchers: prepared})
}

func (s *Server) persistVoucherResult(ctx context.Context, item generatedVoucher, batchID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return err }
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE vouchers SET state=?,failure_reason=?,remote_id=? WHERE id=?`, item.State, item.Error, item.RemoteID, item.ID); err != nil { return err }
	if item.State == "active" {
		eventID, err := randomID(); if err != nil { return err }
		if _, err := tx.ExecContext(ctx, `INSERT INTO stock_events(id,voucher_id,event_type,quantity,reference,note,created_at) VALUES(?,?,'issue',1,?,'إصدار دفعة',?)`, eventID,item.ID,batchID,time.Now().UTC().Format(time.RFC3339Nano)); err != nil { return err }
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
	rows,err:=s.db.QueryContext(r.Context(),`SELECT b.id,b.state,b.requested_count,b.succeeded_count,b.failed_count,b.created_at,b.completed_at,p.name,r.name FROM batches b JOIN packages p ON p.id=b.package_id JOIN routers r ON r.id=b.router_id ORDER BY b.created_at DESC LIMIT 100`);if err!=nil{writeError(w,http.StatusInternalServerError,"تعذر قراءة الدفعات");return};defer rows.Close()
	type batchRow struct { ID string `json:"id"`; State string `json:"state"`; Requested int `json:"requested_count"`; Succeeded int `json:"succeeded_count"`; Failed int `json:"failed_count"`; CreatedAt string `json:"created_at"`; CompletedAt string `json:"completed_at"`; Package string `json:"package"`; Router string `json:"router"` }
	items:=make([]batchRow,0);for rows.Next(){var x batchRow;if err:=rows.Scan(&x.ID,&x.State,&x.Requested,&x.Succeeded,&x.Failed,&x.CreatedAt,&x.CompletedAt,&x.Package,&x.Router);err!=nil{writeError(w,http.StatusInternalServerError,"تعذر قراءة الدفعة");return};items=append(items,x)};if err:=rows.Err();err!=nil{writeError(w,http.StatusInternalServerError,"تعذر قراءة الدفعات");return};writeJSON(w,http.StatusOK,items)
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
	message=strings.ReplaceAll(message,password,"[redacted]")
	message=strings.ReplaceAll(message,"\n"," ")
	runes:=[]rune(message)
	if len(runes)>280 { message=string(runes[:280]) }
	return message
}
