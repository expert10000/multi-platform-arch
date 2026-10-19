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
  $dotnet = if (Test-Command "dotnet") { "installed" } else { "missing" }
  Write-Output ".NET: $dotnet"
}

Write-Output "[dotnet] Checking .NET prerequisites"
Write-State

if ($CheckOnly) {
  exit 0
}

if (-not (Test-Command "dotnet")) {
  if (-not (Test-Command "winget")) {
    throw "winget is required to install the .NET SDK automatically."
  }
  Write-Output "[dotnet] Installing .NET SDK 10"
  winget install --id Microsoft.DotNet.SDK.10 --exact --accept-package-agreements --accept-source-agreements
  Refresh-Path
}

Write-Output "[dotnet] Final prerequisite state"
Write-State
