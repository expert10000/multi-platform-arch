[CmdletBinding()]
param(
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

function Test-Command($Name) {
  $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Find-RepoRoot {
  $current = (Get-Location).Path
  while ($current) {
    if ((Test-Path (Join-Path $current "package.json")) -and (Test-Path (Join-Path $current "apps/hosts/electron/package.json"))) {
      return $current
    }
    $parent = Split-Path -Parent $current
    if ($parent -eq $current) {
      break
    }
    $current = $parent
  }
  return (Get-Location).Path
}

function Get-ElectronState($RepoRoot) {
  $electronRoot = Join-Path $RepoRoot "apps/hosts/electron/node_modules/electron"
  if (Test-Path $electronRoot) {
    return "installed"
  }
  return "missing"
}

$repoRoot = Find-RepoRoot
$state = Get-ElectronState $repoRoot
Write-Output "[electron] Checking Electron dependencies"
Write-Output "ElectronDependencies: $state"

if ($CheckOnly) {
  exit 0
}

if ($state -ne "installed") {
  if (-not (Test-Command "npm")) {
    throw "npm is required to install Electron dependencies."
  }
  Write-Output "[electron] Installing Electron host dependencies"
  npm --prefix (Join-Path $repoRoot "apps/hosts/electron") install
  if ($LASTEXITCODE -ne 0) {
    throw "Electron dependency install failed."
  }
}

Write-Output "[electron] Final dependency state"
Write-Output "ElectronDependencies: $(Get-ElectronState $repoRoot)"
