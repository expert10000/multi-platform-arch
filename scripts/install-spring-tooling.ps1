param(
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

function Test-Command($Name) {
  $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Write-State {
  $java = if (Test-Command "java") { "installed" } else { "missing" }
  $maven = if (Test-Command "mvn") { "installed" } else { "missing" }
  Write-Output "Java: $java"
  Write-Output "Maven: $maven"
}

function Refresh-Path {
  $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Install-MavenArchive {
  $version = "3.9.16"
  $toolsRoot = Join-Path $env:LOCALAPPDATA "DZONE\tools"
  $zipPath = Join-Path $toolsRoot "apache-maven-$version-bin.zip"
  $shaPath = "$zipPath.sha512"
  $installRoot = Join-Path $toolsRoot "apache-maven-$version"
  $binPath = Join-Path $installRoot "bin"
  $baseUrl = "https://dlcdn.apache.org/maven/maven-3/$version/binaries"

  New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null
  Write-Output "[spring] Downloading Apache Maven $version"
  Invoke-WebRequest -Uri "$baseUrl/apache-maven-$version-bin.zip" -OutFile $zipPath
  Invoke-WebRequest -Uri "$baseUrl/apache-maven-$version-bin.zip.sha512" -OutFile $shaPath

  $expected = ((Get-Content $shaPath -Raw) -split "\s+")[0].Trim().ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA512 $zipPath).Hash.ToLowerInvariant()
  if ($expected -ne $actual) {
    throw "Maven checksum verification failed."
  }

  if (Test-Path $installRoot) {
    Remove-Item -LiteralPath $installRoot -Recurse -Force
  }
  Expand-Archive -LiteralPath $zipPath -DestinationPath $toolsRoot -Force

  $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
  if (($userPath -split ";") -notcontains $binPath) {
    [System.Environment]::SetEnvironmentVariable("Path", (($userPath, $binPath) -ne "" -join ";"), "User")
  }
  [System.Environment]::SetEnvironmentVariable("MAVEN_HOME", $installRoot, "User")
  [System.Environment]::SetEnvironmentVariable("M2_HOME", $installRoot, "User")
  Refresh-Path
  $env:MAVEN_HOME = $installRoot
  $env:M2_HOME = $installRoot
}

Write-Output "[spring] Checking Spring Boot prerequisites"
Write-State

if ($CheckOnly) {
  exit 0
}

if (-not (Test-Command "winget")) {
  throw "winget is required to install Java and Maven automatically."
}

if (-not (Test-Command "java")) {
  Write-Output "[spring] Installing Microsoft OpenJDK 17"
  winget install --id Microsoft.OpenJDK.17 --exact --accept-package-agreements --accept-source-agreements
  Refresh-Path
}

if (-not (Test-Command "mvn")) {
  Write-Output "[spring] Installing Apache Maven"
  winget install --id Apache.Maven --exact --accept-package-agreements --accept-source-agreements
  Refresh-Path
}

if (-not (Test-Command "mvn")) {
  Write-Output "[spring] Maven was not available from winget; installing the official binary archive"
  Install-MavenArchive
}

Write-Output "[spring] Final prerequisite state"
Write-State
