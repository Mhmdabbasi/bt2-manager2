package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/Mhmdabbasi/bt2-manager2/internal/routeros"
	"github.com/Mhmdabbasi/bt2-manager2/internal/usermanager"
)

func (s *Server) syncUserManager(w http.ResponseWriter,r *http.Request){
	active,ok:=s.routers.Active();if !ok{writeError(w,http.StatusConflict,"اتصل بالراوتر أولاً");return}
	snapshot,err:=s.routers.UserManagerSnapshot(r.Context())
	if errors.Is(err,routerosadapter.ErrNotConnected){writeError(w,http.StatusConflict,"اتصل بالراوتر أولاً");return}
	if errors.Is(err,usermanager.ErrUnsupportedVersion){writeError(w,http.StatusUnprocessableEntity,"إصدار RouterOS غير مدعوم لمزامنة User Manager");return}
	if errors.Is(err,usermanager.ErrInvalidSnapshot){writeError(w,http.StatusBadGateway,"أعاد User Manager علاقات غير مكتملة أو ملتبسة؛ لم تُحدّث اللقطة المحلية");return}
	if err!=nil{writeError(w,http.StatusBadGateway,"تعذرت قراءة User Manager. تحقق من تثبيت الحزمة والصلاحيات؛ لم تُحدّث اللقطة المحلية.");return}
	var routerID string
	if err:=s.db.QueryRowContext(r.Context(),`SELECT id FROM routers WHERE address=? AND port=?`,active.Address,active.Port).Scan(&routerID);err!=nil{writeError(w,http.StatusInternalServerError,"تعذر ربط المزامنة بسجل الراوتر");return}
	ctx,cancel:=context.WithTimeout(r.Context(),10*time.Second);defer cancel()
	tx,err:=s.db.BeginTx(ctx,nil);if err!=nil{writeError(w,http.StatusInternalServerError,"تعذر بدء مزامنة User Manager");return};defer tx.Rollback()
	now:=time.Now().UTC().Format(time.RFC3339Nano)
	if _,err:=tx.ExecContext(ctx,`UPDATE service_profiles SET present=0 WHERE router_id=? AND service_type='user_manager'`,routerID);err!=nil{writeError(w,http.StatusInternalServerError,"تعذر تجهيز لقطة User Manager");return}
	if _,err:=tx.ExecContext(ctx,`UPDATE user_manager_profile_limitations SET present=0 WHERE router_id=?`,routerID);err!=nil{writeError(w,http.StatusInternalServerError,"تعذر تجهيز علاقات User Manager");return}
	for _,profile:=range snapshot.Profiles{
		id,e:=randomID();if e!=nil{writeError(w,http.StatusInternalServerError,"تعذر إنشاء سجل ملف User Manager");return};attributes,e:=json.Marshal(profile.Properties);if e!=nil{writeError(w,http.StatusInternalServerError,"تعذر ترميز ملف User Manager");return}
		if _,e=tx.ExecContext(ctx,`INSERT INTO service_profiles(id,router_id,service_type,remote_id,name,attributes_json,present,last_seen_at) VALUES(?,?,'user_manager',?,?,?,1,?) ON CONFLICT(router_id,service_type,remote_id) DO UPDATE SET name=excluded.name,attributes_json=excluded.attributes_json,present=1,last_seen_at=excluded.last_seen_at`,id,routerID,"profile:"+profile.SourceID,profile.Name,string(attributes),now);e!=nil{writeError(w,http.StatusInternalServerError,"تعذر حفظ ملفات User Manager؛ لم تُعتمد المزامنة");return}
	}
	for _,limitation:=range snapshot.Limitations{
		id,e:=randomID();if e!=nil{writeError(w,http.StatusInternalServerError,"تعذر إنشاء سجل قيد User Manager");return};attributes,e:=json.Marshal(limitation.Properties);if e!=nil{writeError(w,http.StatusInternalServerError,"تعذر ترميز قيد User Manager");return}
		if _,e=tx.ExecContext(ctx,`INSERT INTO service_profiles(id,router_id,service_type,remote_id,name,attributes_json,present,last_seen_at) VALUES(?,?,'user_manager',?,?,?,1,?) ON CONFLICT(router_id,service_type,remote_id) DO UPDATE SET name=excluded.name,attributes_json=excluded.attributes_json,present=1,last_seen_at=excluded.last_seen_at`,id,routerID,"limitation:"+limitation.SourceID,limitation.Name,string(attributes),now);e!=nil{writeError(w,http.StatusInternalServerError,"تعذر حفظ قيود User Manager؛ لم تُعتمد المزامنة");return}
	}
	for _,relation:=range snapshot.ProfileLimitations{
		id,e:=randomID();if e!=nil{writeError(w,http.StatusInternalServerError,"تعذر إنشاء سجل علاقة User Manager");return};attributes,e:=json.Marshal(relation.Properties);if e!=nil{writeError(w,http.StatusInternalServerError,"تعذر ترميز علاقة User Manager");return}
		if _,e=tx.ExecContext(ctx,`INSERT INTO user_manager_profile_limitations(id,router_id,profile_remote_id,limitation_remote_id,position,attributes_json,present,last_seen_at) VALUES(?,?,?,?,?,?,1,?) ON CONFLICT(router_id,profile_remote_id,limitation_remote_id,position) DO UPDATE SET attributes_json=excluded.attributes_json,present=1,last_seen_at=excluded.last_seen_at`,id,routerID,"profile:"+relation.ProfileSourceID,"limitation:"+relation.LimitationSourceID,relation.Position,string(attributes),now);e!=nil{writeError(w,http.StatusInternalServerError,"تعذر حفظ علاقات User Manager؛ لم تُعتمد المزامنة");return}
	}
	if err:=tx.Commit();err!=nil{writeError(w,http.StatusInternalServerError,"تعذر تثبيت لقطة User Manager");return}
	writeJSON(w,http.StatusOK,map[string]any{"router":active,"major_version":snapshot.MajorVersion,"profiles":snapshot.Profiles,"limitations":snapshot.Limitations,"profile_limitations":snapshot.ProfileLimitations,"synced_at":now})
}

func (s *Server) savedUserManager(w http.ResponseWriter,r *http.Request){
	active,ok:=s.routers.Active();if !ok{writeError(w,http.StatusConflict,"اتصل بالراوتر المرتبط أولاً");return}
	var routerID string;if err:=s.db.QueryRowContext(r.Context(),`SELECT id FROM routers WHERE address=? AND port=?`,active.Address,active.Port).Scan(&routerID);err!=nil{if errors.Is(err,sql.ErrNoRows){writeJSON(w,http.StatusOK,map[string]any{"profiles":[]any{},"limitations":[]any{},"profile_limitations":[]any{}});return};writeError(w,http.StatusInternalServerError,"تعذر قراءة سجل الراوتر");return}
	rows,err:=s.db.QueryContext(r.Context(),`SELECT remote_id,name,attributes_json,present,last_seen_at FROM service_profiles WHERE router_id=? AND service_type='user_manager' ORDER BY remote_id`,routerID);if err!=nil{writeError(w,http.StatusInternalServerError,"تعذر قراءة لقطة User Manager");return};defer rows.Close()
	type record struct{SourceID string `json:"source_id"`;Name string `json:"name"`;Properties json.RawMessage `json:"properties"`;Present bool `json:"present"`;LastSeenAt string `json:"last_seen_at"`}
	profiles:=make([]record,0);limitations:=make([]record,0)
	for rows.Next(){var id,name,attrs,seen string;var present int;if err:=rows.Scan(&id,&name,&attrs,&present,&seen);err!=nil{writeError(w,http.StatusInternalServerError,"تعذر قراءة سجل User Manager");return};item:=record{SourceID:id,Name:name,Properties:json.RawMessage(attrs),Present:present==1,LastSeenAt:seen};if len(id)>=8&&id[:8]=="profile:"{item.SourceID=id[8:];profiles=append(profiles,item)}else if len(id)>=11&&id[:11]=="limitation:"{item.SourceID=id[11:];limitations=append(limitations,item)}}
	if err:=rows.Err();err!=nil{writeError(w,http.StatusInternalServerError,"تعذر قراءة لقطة User Manager");return}
	if err:=rows.Close();err!=nil{writeError(w,http.StatusInternalServerError,"تعذر إغلاق قراءة User Manager");return}
	relations,err:=s.db.QueryContext(r.Context(),`SELECT profile_remote_id,limitation_remote_id,position,attributes_json,present,last_seen_at FROM user_manager_profile_limitations WHERE router_id=? ORDER BY profile_remote_id,position`,routerID);if err!=nil{writeError(w,http.StatusInternalServerError,"تعذر قراءة علاقات User Manager");return};defer relations.Close()
	type relationRecord struct{ProfileSourceID string `json:"profile_source_id"`;LimitationSourceID string `json:"limitation_source_id"`;Position int `json:"position"`;Properties json.RawMessage `json:"properties"`;Present bool `json:"present"`;LastSeenAt string `json:"last_seen_at"`};links:=make([]relationRecord,0)
	for relations.Next(){var item relationRecord;var profile,limitation string;var present int;if err:=relations.Scan(&profile,&limitation,&item.Position,&item.Properties,&present,&item.LastSeenAt);err!=nil{writeError(w,http.StatusInternalServerError,"تعذر قراءة علاقة User Manager");return};item.ProfileSourceID=strings.TrimPrefix(profile,"profile:");item.LimitationSourceID=strings.TrimPrefix(limitation,"limitation:");item.Present=present==1;links=append(links,item)}
	if err:=relations.Err();err!=nil{writeError(w,http.StatusInternalServerError,"تعذر قراءة علاقات User Manager");return};writeJSON(w,http.StatusOK,map[string]any{"profiles":profiles,"limitations":limitations,"profile_limitations":links,"router":active})
}
