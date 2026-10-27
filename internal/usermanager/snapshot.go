package usermanager

import (
	"context"
	"errors"
	"fmt"
	"strings"

	ros "github.com/Mhmdabbasi/routeros-api-Go"
)

var ErrUnsupportedVersion = errors.New("User Manager paths are unsupported for this RouterOS major version")
var ErrInvalidSnapshot = errors.New("User Manager returned an invalid snapshot")

type Profile struct {
	SourceID   string            `json:"source_id"`
	Name       string            `json:"name"`
	Properties map[string]string `json:"properties"`
}

type Limitation struct {
	SourceID   string            `json:"source_id"`
	Name       string            `json:"name"`
	Properties map[string]string `json:"properties"`
}

type ProfileLimitation struct {
	ProfileSourceID    string            `json:"profile_source_id"`
	ProfileName        string            `json:"profile_name"`
	LimitationSourceID string            `json:"limitation_source_id"`
	LimitationName     string            `json:"limitation_name"`
	Position           int               `json:"position"`
	Properties         map[string]string `json:"properties"`
}

type Snapshot struct {
	MajorVersion       int                 `json:"major_version"`
	Profiles           []Profile           `json:"profiles"`
	Limitations        []Limitation        `json:"limitations"`
	ProfileLimitations []ProfileLimitation `json:"profile_limitations"`
}

type paths struct { profiles,limitations,relations,profileProperties,limitationProperties,relationProperties string }

func pathsForMajor(major int) (paths,error) {
	switch major {
	case 6:
		return paths{
			profiles:"/tool/user-manager/profile/print",
			limitations:"/tool/user-manager/profile/limitation/print",
			relations:"/tool/user-manager/profile/profile-limitation/print",
			profileProperties:".id,name,owner,name-for-users,starts-at,override-shared-users,price,validity",
			limitationProperties:".id,name,owner,group-name,rate-limit,transfer-limit,uptime-limit,download-limit,upload-limit,address-list,ip-pool",
			relationProperties:".id,owner,profile,limitation,comment,from-time,till-time,weekdays",
		},nil
	case 7:
		return paths{
			profiles:"/user-manager/profile/print",
			limitations:"/user-manager/limitation/print",
			relations:"/user-manager/profile-limitation/print",
			profileProperties:".id,name,name-for-users,validity,starts-when,price,override-shared-users",
			limitationProperties:".id,name,transfer-limit,uptime-limit,download-limit,upload-limit,rate-limit-rx,rate-limit-tx,reset-counters-interval,reset-counters-start-time,rate-limit-priority,rate-limit-min-rx,rate-limit-min-tx,rate-limit-burst-rx,rate-limit-burst-tx,rate-limit-burst-threshold-rx,rate-limit-burst-threshold-tx,rate-limit-burst-time-rx,rate-limit-burst-time-tx",
			relationProperties:".id,profile,limitation,comment,from-time,till-time,weekdays",
		},nil
	default:return paths{},ErrUnsupportedVersion
	}
}

// ReadSnapshot is read-only: it requests only profile/limitation metadata and their
// many-to-many relationships. It never reads User Manager user records or passwords.
func ReadSnapshot(ctx context.Context, api *ros.API, version string) (Snapshot,error) {
	major,err:=parseMajor(version);if err!=nil{return Snapshot{},err}
	p,err:=pathsForMajor(major);if err!=nil{return Snapshot{},err}
	profilesRaw,err:=readRows(ctx,api,p.profiles,p.profileProperties);if err!=nil{return Snapshot{},fmt.Errorf("read User Manager profiles: %w",err)}
	limitationsRaw,err:=readRows(ctx,api,p.limitations,p.limitationProperties);if err!=nil{return Snapshot{},fmt.Errorf("read User Manager limitations: %w",err)}
	relationsRaw,err:=readRows(ctx,api,p.relations,p.relationProperties);if err!=nil{return Snapshot{},fmt.Errorf("read User Manager profile-limitation relationships: %w",err)}

	result:=Snapshot{MajorVersion:major,Profiles:make([]Profile,0,len(profilesRaw)),Limitations:make([]Limitation,0,len(limitationsRaw)),ProfileLimitations:make([]ProfileLimitation,0,len(relationsRaw))}
	profilesByName:=map[string][]Profile{};limitationsByName:=map[string][]Limitation{}
	for _,row:=range profilesRaw {
		name:=strings.TrimSpace(row["name"]);id:=sourceIdentity(row,name);if name==""||id==""{return Snapshot{},ErrInvalidSnapshot}
		item:=Profile{SourceID:id,Name:name,Properties:safeProperties(row,p.profileProperties)};result.Profiles=append(result.Profiles,item);profilesByName[name]=append(profilesByName[name],item)
	}
	for _,row:=range limitationsRaw {
		name:=strings.TrimSpace(row["name"]);id:=sourceIdentity(row,name);if name==""||id==""{return Snapshot{},ErrInvalidSnapshot}
		item:=Limitation{SourceID:id,Name:name,Properties:safeProperties(row,p.limitationProperties)};result.Limitations=append(result.Limitations,item);limitationsByName[name]=append(limitationsByName[name],item)
	}
	positions:=map[string]int{}
	for _,row:=range relationsRaw {
		profileName:=strings.TrimSpace(row["profile"]);limitationName:=strings.TrimSpace(row["limitation"])
		if profileName==""||limitationName==""{return Snapshot{},fmt.Errorf("%w: incomplete relationship",ErrInvalidSnapshot)}
		owner:=strings.TrimSpace(row["owner"])
		profile,ok:=matchProfile(profilesByName[profileName],owner);if !ok{return Snapshot{},fmt.Errorf("%w: profile relation is unavailable or ambiguous",ErrInvalidSnapshot)}
		limitation,ok:=matchLimitation(limitationsByName[limitationName],owner);if !ok{return Snapshot{},fmt.Errorf("%w: limitation relation is unavailable or ambiguous",ErrInvalidSnapshot)}
		position:=positions[profile.SourceID];positions[profile.SourceID]=position+1
		result.ProfileLimitations=append(result.ProfileLimitations,ProfileLimitation{ProfileSourceID:profile.SourceID,ProfileName:profile.Name,LimitationSourceID:limitation.SourceID,LimitationName:limitation.Name,Position:position,Properties:safeProperties(row,p.relationProperties)})
	}
	return result,nil
}

func readRows(ctx context.Context,api *ros.API,command,properties string)([]map[string]string,error){
	responses,err:=api.SendContext(ctx,command,"=.proplist="+properties);if err!=nil{return nil,err}
	rows:=make([]map[string]string,0,len(responses));for _,response:=range responses{if response==nil||response.Type!=ros.ResponseReply||len(response.Data)==0{continue};copy:=make(map[string]string,len(response.Data));for key,value:=range response.Data{copy[key]=value};rows=append(rows,copy)};return rows,nil
}

func parseMajor(version string)(int,error){
	version=strings.TrimSpace(version);if version==""{return 0,ErrUnsupportedVersion};part,_,_:=strings.Cut(version,".");major:=0;for _,r:=range part{if r<'0'||r>'9'{return 0,ErrUnsupportedVersion};major=major*10+int(r-'0')};if major!=6&&major!=7{return 0,ErrUnsupportedVersion};return major,nil
}
func sourceIdentity(row map[string]string,fallback string)string{if id:=strings.TrimSpace(row[".id"]);id!=""{return id};return strings.TrimSpace(fallback)}
func safeProperties(row map[string]string,propertyList string)map[string]string{
	properties:=strings.Split(propertyList,",");result:=make(map[string]string,len(properties))
	for _,key:=range properties{key=strings.TrimSpace(key);switch strings.ToLower(key){case "",".id","password","secret","shared-secret","otp-secret","web-private-password":continue};if value,ok:=row[key];ok{result[key]=value}}
	return result
}
func matchProfile(items []Profile,owner string)(Profile,bool){if len(items)==1{return items[0],true};if owner!=""{for _,item:=range items{if item.Properties["owner"]==owner{return item,true}}};return Profile{},false}
func matchLimitation(items []Limitation,owner string)(Limitation,bool){if len(items)==1{return items[0],true};if owner!=""{for _,item:=range items{if item.Properties["owner"]==owner{return item,true}}};return Limitation{},false}
