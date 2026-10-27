package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Mhmdabbasi/bt2-manager2/internal/app"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8787", "local HTTP listen address")
	database := flag.String("db", "", "SQLite database path (defaults to the user config directory)")
	flag.Parse()
	if err := run(*addr, *database); err != nil { log.Fatal(err) }
}

func run(addr, database string) error {
	if err := validateListenAddress(addr); err != nil { return err }
	runtime, err := app.Open(database)
	if err != nil { return err }
	defer runtime.Close()
	server := &http.Server{Addr:addr,Handler:runtime.BrowserHandler(),ReadHeaderTimeout:5*time.Second,IdleTimeout:60*time.Second}
	listener,err:=net.Listen("tcp",addr);if err!=nil{return fmt.Errorf("listen on %s: %w",addr,err)}
	log.Printf("bt2-manager2 local web app listening at http://%s",addr)
	ctx,stop:=signal.NotifyContext(context.Background(),os.Interrupt,syscall.SIGTERM);defer stop()
	go func(){<-ctx.Done();shutdownCtx,cancel:=context.WithTimeout(context.Background(),5*time.Second);defer cancel();_ = server.Shutdown(shutdownCtx)}()
	if err:=server.Serve(listener);err!=nil&&!errors.Is(err,http.ErrServerClosed){return fmt.Errorf("HTTP server: %w",err)}
	return nil
}

func validateListenAddress(addr string) error {
	host,_,err:=net.SplitHostPort(addr);if err!=nil{return fmt.Errorf("invalid listen address: %w",err)}
	ip:=net.ParseIP(host);if host!="localhost"&&(ip==nil||!ip.IsLoopback()){return errors.New("the local application must bind to a loopback address only")};return nil
}
