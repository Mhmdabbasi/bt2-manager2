//go:build windows

package main

import (
	"log"

	"github.com/Mhmdabbasi/bt2-manager2/internal/app"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

func main() {
	runtime, err := app.Open("")
	if err != nil { log.Fatal(err) }
	defer runtime.Close()
	err = wails.Run(&options.App{
		Title: "BT2 Manager",
		Width: 1280,
		Height: 820,
		MinWidth: 1000,
		MinHeight: 650,
		BackgroundColour: options.NewRGB(244, 247, 246),
		AssetServer: &assetserver.Options{Assets: runtime.Assets, Handler: runtime.API.Handler()},
	})
	if err != nil { log.Fatal(err) }
}
