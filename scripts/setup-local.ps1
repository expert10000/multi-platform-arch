[CmdletBinding()]
param(
  [switch]$IncludeMaui,
  [switch]$SkipElectronDependencies
)

$ErrorActionPreference = "Stop"

function Test-Command($Name) {
  $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Refresh-Path {
  $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Require-Winget {
  if (-not (Test-Command "winget")) {
    throw "winget is required for automatic Windows prerequisite installation. Install Node.js 20+, Python 3.11+, and .NET SDK manually, then rerun this script."
  }
}

function Install-WingetPackage($CommandName, $PackageId, $Label) {
  if (Test-Command $CommandName) {
    Write-Output "[$Label] already installed."
    return
  }

  Require-Winget
  Write-Output "[$Label] installing $PackageId via winget"
  winget install --id $PackageId --exact --accept-package-agreements --accept-source-agreements
  Refresh-Path
  if (-not (Test-Command $CommandName)) {
    throw "$Label was installed, but '$CommandName' is still not available on PATH."
  }
}

$repoRoot = (Get-Location).Path

Install-WingetPackage "node" "OpenJS.NodeJS.LTS" "node"
Install-WingetPackage "python" "Python.Python.3.11" "python"
Install-WingetPackage "dotnet" "Microsoft.DotNet.SDK.10" "dotnet"

Write-Output "[spring] checking Java and Maven"
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/install-spring-tooling.ps1")

if (-not $SkipElectronDependencies) {
  Write-Output "[electron] installing host dependencies"
  npm --prefix (Join-Path $repoRoot "apps/hosts/electron") install
  if ($LASTEXITCODE -ne 0) {
    throw "Electron dependency install failed."
  }
}

if ($IncludeMaui) {
  Write-Output "[maui] installing optional MAUI workload"
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/install-maui-workload.ps1")
}

Write-Output "[check] final prerequisite state"
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts/check-local-prerequisites.ps1")
