package usermanager

import (
	"errors"
	"testing"
)

func TestPathsForSupportedRouterOSVersions(t *testing.T) {
	v6,err:=pathsForMajor(6);if err!=nil{t.Fatal(err)}
	if v6.profiles!="/tool/user-manager/profile/print"||v6.relations!="/tool/user-manager/profile/profile-limitation/print"{t.Fatalf("unexpected v6 paths: %+v",v6)}
	v7,err:=pathsForMajor(7);if err!=nil{t.Fatal(err)}
	if v7.profiles!="/user-manager/profile/print"||v7.relations!="/user-manager/profile-limitation/print"{t.Fatalf("unexpected v7 paths: %+v",v7)}
	if _,err:=pathsForMajor(8);!errors.Is(err,ErrUnsupportedVersion){t.Fatalf("expected unsupported version, got %v",err)}
}

func TestSafePropertiesDropsSecrets(t *testing.T) {
	row:=map[string]string{".id":"*1","name":"Gold","validity":"1d","password":"secret","shared-secret":"secret2"}
	got:=safeProperties(row,".id,name,validity,password,shared-secret")
	if got["name"]!="Gold"||got["validity"]!="1d"{t.Fatalf("unexpected safe values: %#v",got)}
	if _,ok:=got["password"];ok{t.Fatal("password was retained")}
	if _,ok:=got["shared-secret"];ok{t.Fatal("shared secret was retained")}
}

func TestRelationshipResolutionRejectsAmbiguousNames(t *testing.T) {
	profiles:=[]Profile{{SourceID:"1",Name:"Gold"},{SourceID:"2",Name:"Gold"}}
	if _,ok:=matchProfile(profiles,"");ok{t.Fatal("ambiguous name without owner must not be resolved")}
	if got,ok:=matchProfile(profiles,"owner-b");!ok||got.SourceID!="2"{t.Fatalf("owner should disambiguate: %#v %v",got,ok)}
}
