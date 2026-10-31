package httpapi

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func TestValidateTemplateA4GridGeometry(t *testing.T) {
	document := cardTemplateDocument{
		WidthMM: 68, HeightMM: 29.1, Background: "#ffffff", BackgroundMode: "color",
		PageColumns: 3, PageRows: 10,
		Fields: []cardTemplateField{{ID: "user", Kind: "field", Field: "username", X: 1, Y: 1, Width: 40, Height: 5, FontSize: 10, Align: "center"}},
	}
	if err := validateTemplate(document); err != nil { t.Fatalf("valid 3x10 grid rejected: %v", err) }
	document.WidthMM = 51
	if err := validateTemplate(document); err == nil { t.Fatal("grid with dimensions inconsistent with its A4 columns was accepted") }
	document.WidthMM, document.HeightMM, document.PageColumns, document.PageRows = 20, 10, 11, 29
	if err := validateTemplate(document); err == nil { t.Fatal("grid exceeding the supported column count was accepted") }
}

func TestValidateTemplateBackgroundImage(t *testing.T) {
	var encoded bytes.Buffer
	image := image.NewRGBA(image.Rect(0, 0, 2, 2))
	image.Set(0, 0, color.White)
	if err := png.Encode(&encoded, image); err != nil { t.Fatal(err) }
	document := cardTemplateDocument{WidthMM: 51, HeightMM: 19.4, Background: "#ffffff", BackgroundMode: "image", BackgroundImage: "data:image/png;base64," + base64.StdEncoding.EncodeToString(encoded.Bytes()), PageColumns: 4, PageRows: 15}
	if err := validateTemplate(document); err != nil { t.Fatalf("valid image rejected: %v", err) }
	document.BackgroundImage = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="
	if err := validateTemplate(document); err == nil { t.Fatal("SVG background image was accepted") }
}
