[CmdletBinding()]
param(
  [switch]$CheckOnly
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

function Write-State {
  $python = if (Test-Command "python") { "installed" } else { "missing" }
  Write-Output "Python: $python"
}

Write-Output "[python] Checking Python prerequisites"
Write-State

if ($CheckOnly) {
  exit 0
}

if (-not (Test-Command "python")) {
  if (-not (Test-Command "winget")) {
    throw "winget is required to install Python automatically."
  }
  Write-Output "[python] Installing Python 3.11"
  winget install --id Python.Python.3.11 --exact --accept-package-agreements --accept-source-agreements
  Refresh-Path
}

Write-Output "[python] Final prerequisite state"
Write-State
