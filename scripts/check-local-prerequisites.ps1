[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Test-Command($Name) {
  $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-CommandVersion($Name, [string[]]$Arguments = @("--version")) {
  if (-not (Test-Command $Name)) {
    return "missing"
  }
  try {
    $output = & $Name @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
      return "installed"
    }
    return (($output | Select-Object -First 1) -as [string]).Trim()
  } catch {
    return "installed"
  }
}

function Get-DotnetWorkloadState($Name) {
  if (-not (Test-Command "dotnet")) {
    return "missing-dotnet"
  }
  $output = & dotnet workload list 2>&1
  if ($LASTEXITCODE -ne 0) {
    return "unknown"
  }
  if (($output -join "`n") -match $Name) {
    return "installed"
  }
  return "missing"
}

function Get-ElectronState {
  $electronRoot = Join-Path (Get-Location) "apps/hosts/electron/node_modules/electron"
  if (Test-Path $electronRoot) {
    return "installed"
  }
  return "missing"
}

$state = [ordered]@{
  winget = if (Test-Command "winget") { "installed" } else { "missing" }
  node = Get-CommandVersion "node"
  npm = Get-CommandVersion "npm"
  python = Get-CommandVersion "python"
  dotnet = Get-CommandVersion "dotnet"
  java = Get-CommandVersion "java"
  maven = Get-CommandVersion "mvn"
  electronDependencies = Get-ElectronState
  mauiWorkload = Get-DotnetWorkloadState "maui"
}

$state.GetEnumerator() | ForEach-Object {
  Write-Output "$($_.Key): $($_.Value)"
}
