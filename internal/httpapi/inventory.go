package httpapi

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"
)

func (s *Server) inventory(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(), `WITH latest AS (
		SELECT se.voucher_id,se.distributor_id,ROW_NUMBER() OVER(PARTITION BY se.voucher_id ORDER BY se.created_at DESC,se.rowid DESC) AS rank
		FROM stock_events se
	)
	SELECT COALESCE(d.id,''),COALESCE(d.name,'المشغّل'),COUNT(*)
	FROM latest l JOIN vouchers v ON v.id=l.voucher_id
	LEFT JOIN distributors d ON d.id=l.distributor_id
	WHERE l.rank=1 AND v.state IN ('active','disabled')
	GROUP BY COALESCE(d.id,''),COALESCE(d.name,'المشغّل') ORDER BY d.name`)
	if err != nil { writeError(w,http.StatusInternalServerError,"تعذر حساب أرصدة المخزون"); return }
	type balance struct { OwnerID string `json:"owner_id"`; OwnerName string `json:"owner_name"`; Count int `json:"count"` }
	balances:=make([]balance,0); total:=0
	for rows.Next(){var b balance;if err:=rows.Scan(&b.OwnerID,&b.OwnerName,&b.Count);err!=nil{rows.Close();writeError(w,http.StatusInternalServerError,"تعذر قراءة رصيد المخزون");return};balances=append(balances,b);total+=b.Count}
	if err:=rows.Err();err!=nil{rows.Close();writeError(w,http.StatusInternalServerError,"تعذر قراءة أرصدة المخزون");return};rows.Close()
	events,err:=s.db.QueryContext(r.Context(),`SELECT se.id,se.event_type,se.voucher_id,v.username,COALESCE(src.name,'المشغّل'),COALESCE(dst.name,'المخزون المركزي'),se.note,se.created_at
		FROM stock_events se JOIN vouchers v ON v.id=se.voucher_id
		LEFT JOIN distributors src ON src.id=se.from_distributor_id LEFT JOIN distributors dst ON dst.id=se.distributor_id
		ORDER BY se.created_at DESC,se.rowid DESC LIMIT 100`)
	if err!=nil{writeError(w,http.StatusInternalServerError,"تعذر قراءة حركات المخزون");return};defer events.Close()
	type event struct { ID string `json:"id"`; Type string `json:"type"`; VoucherID string `json:"voucher_id"`; Username string `json:"username"`; From string `json:"from"`; To string `json:"to"`; Note string `json:"note"`; CreatedAt string `json:"created_at"` }
	items:=make([]event,0);for events.Next(){var e event;if err:=events.Scan(&e.ID,&e.Type,&e.VoucherID,&e.Username,&e.From,&e.To,&e.Note,&e.CreatedAt);err!=nil{writeError(w,http.StatusInternalServerError,"تعذر قراءة حركة المخزون");return};items=append(items,e)};if err:=events.Err();err!=nil{writeError(w,http.StatusInternalServerError,"تعذر قراءة حركات المخزون");return}
	writeJSON(w,http.StatusOK,map[string]any{"total":total,"balances":balances,"events":items})
}

func (s *Server) inventoryMovement(w http.ResponseWriter, r *http.Request) {
	var input struct { Action string `json:"action"`; VoucherIDs []string `json:"voucher_ids"`; DistributorID string `json:"distributor_id"`; Note string `json:"note"` }
	if err:=decodeJSON(w,r,&input);err!=nil{writeError(w,http.StatusBadRequest,err.Error());return}
	input.Action=strings.TrimSpace(input.Action);input.DistributorID=strings.TrimSpace(input.DistributorID);input.Note=strings.TrimSpace(input.Note)
	if len(input.VoucherIDs)<1||len(input.VoucherIDs)>500{writeError(w,http.StatusBadRequest,"اختر من 1 إلى 500 قسيمة");return}
	if len(input.Note)>500{writeError(w,http.StatusBadRequest,"الملاحظة أطول من الحد المسموح");return}
	if input.Action!="allocate"&&input.Action!="transfer"&&input.Action!="return"{writeError(w,http.StatusBadRequest,"نوع حركة المخزون غير مسموح");return}
	if input.Action=="allocate"||input.Action=="transfer"{
		if input.DistributorID==""{writeError(w,http.StatusBadRequest,"اختر الموزع المستهدف");return};var active int;err:=s.db.QueryRowContext(r.Context(),`SELECT active FROM distributors WHERE id=?`,input.DistributorID).Scan(&active);if errors.Is(err,sql.ErrNoRows){writeError(w,http.StatusNotFound,"الموزع غير موجود");return};if err!=nil{writeError(w,http.StatusInternalServerError,"تعذر التحقق من الموزع");return};if active!=1{writeError(w,http.StatusConflict,"الموزع موقوف");return}
	}else{input.DistributorID=""}
	seen:=make(map[string]struct{},len(input.VoucherIDs));for _,id:=range input.VoucherIDs{id=strings.TrimSpace(id);if id==""{writeError(w,http.StatusBadRequest,"معرّف قسيمة غير صالح");return};if _,ok:=seen[id];ok{writeError(w,http.StatusBadRequest,"تحتوي القائمة على قسيمة مكررة");return};seen[id]=struct{}{}}
	tx,err:=s.db.BeginTx(r.Context(),nil);if err!=nil{writeError(w,http.StatusInternalServerError,"تعذر بدء حركة المخزون");return};defer tx.Rollback()
	now:=time.Now().UTC().Format(time.RFC3339Nano)
	for voucherID:=range seen{
		var state string;if err:=tx.QueryRowContext(r.Context(),`SELECT state FROM vouchers WHERE id=?`,voucherID).Scan(&state);errors.Is(err,sql.ErrNoRows){writeError(w,http.StatusNotFound,"إحدى القسائم غير موجودة");return}else if err!=nil{writeError(w,http.StatusInternalServerError,"تعذر التحقق من القسيمة");return};if state!="active"{writeError(w,http.StatusConflict,"يمكن تخصيص القسائم النشطة فقط");return}
		var current string;err:=tx.QueryRowContext(r.Context(),`SELECT COALESCE(distributor_id,'') FROM stock_events WHERE voucher_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1`,voucherID).Scan(&current);if errors.Is(err,sql.ErrNoRows){writeError(w,http.StatusConflict,"القسيمة غير مسجلة في سجل المخزون");return};if err!=nil{writeError(w,http.StatusInternalServerError,"تعذر حساب مالك القسيمة الحالي");return}
		var target any;var from any=current;if input.Action=="allocate"{if current!=""{writeError(w,http.StatusConflict,"القسيمة ليست ضمن المخزون المركزي");return};target=input.DistributorID;from=nil};if input.Action=="transfer"{if current==""{writeError(w,http.StatusConflict,"القسيمة ليست مخصصة حالياً لموزع");return};if current==input.DistributorID{writeError(w,http.StatusConflict,"الموزع المصدر والوجهة متطابقان");return};target=input.DistributorID};if input.Action=="return"{if current==""{writeError(w,http.StatusConflict,"القسيمة موجودة في المخزون المركزي بالفعل");return};target=nil}
		eventID,err:=randomID();if err!=nil{writeError(w,http.StatusInternalServerError,"تعذر إنشاء حركة مخزون");return};if _,err:=tx.ExecContext(r.Context(),`INSERT INTO stock_events(id,voucher_id,distributor_id,from_distributor_id,event_type,quantity,note,created_at) VALUES(?,?,?,?,?,1,?,?)`,eventID,voucherID,target,from,input.Action,input.Note,now);err!=nil{writeError(w,http.StatusInternalServerError,"تعذر تسجيل حركة المخزون");return}
	}
	if err:=tx.Commit();err!=nil{writeError(w,http.StatusInternalServerError,"تعذر تثبيت حركة المخزون");return};writeJSON(w,http.StatusCreated,map[string]any{"action":input.Action,"count":len(seen),"created_at":now})
}
