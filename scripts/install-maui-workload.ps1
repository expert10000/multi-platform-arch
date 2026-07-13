[CmdletBinding()]
param(
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  [Console]::Out.WriteLine("[maui] $Message")
}

function Invoke-Dotnet {
  param([string[]]$Arguments)
  Write-Step "Running: dotnet $($Arguments -join ' ')"
  & dotnet @Arguments
  $exitCode = $LASTEXITCODE
  Write-Step "dotnet exit code: $exitCode"
  if ($exitCode -ne 0) {
    throw "dotnet $($Arguments -join ' ') failed with exit code $exitCode."
  }
}

function Get-DotnetOutput {
  param([string[]]$Arguments)
  Write-Step "Running: dotnet $($Arguments -join ' ')"
  $output = & dotnet @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  Write-Step "dotnet exit code: $exitCode"
  if ($output) {
    foreach ($line in $output) {
      Write-Step "  $line"
    }
  }
  if ($exitCode -ne 0) {
    throw "dotnet $($Arguments -join ' ') failed with exit code $exitCode."
  }
  return ($output -join "`n")
}

$dotnetCommand = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnetCommand) {
  throw "The .NET SDK is required before installing the MAUI workload."
}

Write-Step ".NET SDK path: $($dotnetCommand.Source)"
$dotnetVersion = Get-DotnetOutput -Arguments @("--version")
Write-Step ".NET SDK version: $dotnetVersion"

$workloadList = Get-DotnetOutput -Arguments @("workload", "list")
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
Write-Step "This can take several minutes and may download SDK workload packs."
Invoke-Dotnet -Arguments @("workload", "install", "maui")

$updatedWorkloadList = Get-DotnetOutput -Arguments @("workload", "list")
if (-not ($updatedWorkloadList -match "maui")) {
  throw "dotnet workload install maui finished, but the MAUI workload is still not listed."
}

Write-Step "MAUI workload installed."
