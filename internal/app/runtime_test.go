package app

import (
	"io/fs"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestAssetNameUsesURLSlashes(t *testing.T) {
	for _, test := range []struct{ input, want string }{
		{"/", "index.html"},
		{"/assets/index.css", "assets/index.css"},
		{"assets\\index.js", "assets\\index.js"},
		{"/nested/../assets/app.js", "assets/app.js"},
	} {
		if got := assetName(test.input); got != test.want {
			t.Errorf("assetName(%q) = %q; want %q", test.input, got, test.want)
		}
	}
}

func TestSPAHandlerServesAssetsAndRoutes(t *testing.T) {
	files := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<!doctype html><main>app</main>")},
		"assets/app.js": &fstest.MapFile{Data: []byte("export default 1;")},
		"assets/app.css": &fstest.MapFile{Data: []byte("body{color:#123}")},
	}
	handler := spaHandler(files)
	for _, test := range []struct{ url, contentType, body string }{
		{"/assets/app.js", "javascript", "export default 1;"},
		{"/assets/app.css", "text/css", "body{color:#123}"},
		{"/settings", "text/html", "<!doctype html><main>app</main>"},
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest("GET", test.url, nil))
		if response.Code != 200 { t.Fatalf("GET %s status = %d", test.url, response.Code) }
		if !strings.Contains(response.Header().Get("Content-Type"), test.contentType) { t.Errorf("GET %s Content-Type = %q; want it to contain %q", test.url, response.Header().Get("Content-Type"), test.contentType) }
		if got := response.Body.String(); got != test.body { t.Errorf("GET %s body = %q; want %q", test.url, got, test.body) }
	}
}

func TestSPAHandlerDoesNotReturnHTMLForMissingAsset(t *testing.T) {
	files := fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte("app")}}
	response := httptest.NewRecorder()
	spaHandler(fs.FS(files)).ServeHTTP(response, httptest.NewRequest("GET", "/assets/missing.js", nil))
	if response.Code != 404 { t.Fatalf("status = %d; want 404", response.Code) }
	if strings.Contains(response.Header().Get("Content-Type"), "text/html") { t.Fatalf("missing asset got HTML MIME type %q", response.Header().Get("Content-Type")) }
}
