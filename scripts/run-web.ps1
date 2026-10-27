$ErrorActionPreference = 'Stop'

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
  throw 'Go 1.23+ is required. Install Go and reopen PowerShell.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'Node.js 22+ (npm) is required to build the UI once.'
}

Push-Location (Join-Path $PSScriptRoot '..')
try {
  if (-not (Test-Path 'web/node_modules')) {
    Push-Location web
    try { npm ci } finally { Pop-Location }
  }
  go mod tidy
  if ($LASTEXITCODE -ne 0) { throw 'Go dependency resolution failed.' }
  Push-Location web
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
  } finally { Pop-Location }
  go run ./cmd/bt2-manager2
} finally {
  Pop-Location
}
