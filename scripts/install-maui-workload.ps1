[CmdletBinding()]
param(
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host "[maui] $Message"
}

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  throw "The .NET SDK is required before installing the MAUI workload."
}

$workloadList = dotnet workload list
$hasMaui = $workloadList -match "maui"

if ($hasMaui) {
  Write-Step "MAUI workload is already installed."
  exit 0
}

if ($CheckOnly) {
  Write-Step "MAUI workload is not installed."
  Write-Step "Run: dotnet workload install maui"
  exit 0
}

Write-Step "Installing MAUI workload..."
dotnet workload install maui

Write-Step "MAUI workload installed."
