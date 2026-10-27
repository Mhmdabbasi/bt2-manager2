$ErrorActionPreference = 'Stop'

if (-not $IsWindows -and $env:OS -ne 'Windows_NT') {
  throw 'Build this desktop target on Windows; Wails desktop builds are not cross-compiled here.'
}
if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
  throw 'Go 1.23+ is required.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'Node.js 22+ (npm) is required to build the UI.'
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
  go mod tidy
  if ($LASTEXITCODE -ne 0) { throw 'Go dependency resolution failed.' }
  Push-Location web
  try {
    npm ci
    npm run typecheck
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
  } finally { Pop-Location }
  New-Item -ItemType Directory -Force build | Out-Null
  go build -trimpath -ldflags '-s -w' -o build/BT2Manager2.exe ./cmd/desktop
  if ($LASTEXITCODE -ne 0) { throw 'Windows desktop build failed.' }
  Write-Host 'Build created: build/BT2Manager2.exe'
} finally {
  Pop-Location
}
