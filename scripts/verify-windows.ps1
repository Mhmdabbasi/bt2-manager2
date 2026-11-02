$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
  throw 'Run this verification script in Windows PowerShell or PowerShell on Windows.'
}

$go = Get-Command go -ErrorAction SilentlyContinue
if (-not $go) { throw 'Go 1.23+ is required.' }
$goVersionText = (& go version 2>&1 | Out-String)
if ($goVersionText -notmatch 'go version go(\d+\.\d+)') { throw "Could not read Go version: $goVersionText" }
if ([version]$Matches[1] -lt [version]'1.23') { throw "Go 1.23+ is required. Found: $goVersionText" }

$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $node -or -not $npm) { throw 'Node.js 22+ and npm are required.' }
$nodeVersionText = (& node --version 2>&1 | Out-String).Trim()
if ($nodeVersionText -notmatch '^v(\d+)\.') { throw "Could not read Node.js version: $nodeVersionText" }
if ([int]$Matches[1] -lt 22) { throw "Node.js 22+ is required. Found: $nodeVersionText" }

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Description,
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  Write-Host "`n==> $Description"
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE." }
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
  Invoke-Checked 'Resolve Go dependencies' 'go' @('mod', 'tidy')

  Push-Location (Join-Path $root 'web')
  try {
    Invoke-Checked 'Install locked frontend dependencies' 'npm' @('ci')
    Invoke-Checked 'Typecheck and build embedded UI' 'npm' @('run', 'build')
  } finally { Pop-Location }

  Invoke-Checked 'Run Go tests' 'go' @('test', './...')
  Invoke-Checked 'Run Go vet' 'go' @('vet', './...')

  New-Item -ItemType Directory -Force (Join-Path $root 'build') | Out-Null
  Invoke-Checked 'Build Windows desktop application' 'go' @('build', '-trimpath', '-ldflags', '-s -w', '-o', 'build/BT2Manager2.exe', './cmd/desktop')
  Invoke-Checked 'Build Windows local web application' 'go' @('build', '-trimpath', '-ldflags', '-s -w', '-o', 'build/bt2-manager2-web.exe', './cmd/bt2-manager2')

  Write-Host "`nAll automated local checks passed. Manual router and Windows print acceptance is still required; follow docs/LOCAL_ACCEPTANCE_CHECKLIST_AR.md."
} finally {
  Pop-Location
}
