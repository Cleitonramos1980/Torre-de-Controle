param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-LogLine {
  param(
    [string]$Message,
    [string]$LogFile
  )
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp] $Message"
  Write-Host $line
  Add-Content -LiteralPath $LogFile -Value $line
}

function Ensure-Directory {
  param([string]$Path)
  if (!(Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Import-DotEnv {
  param([string]$EnvPath)
  if (!(Test-Path -LiteralPath $EnvPath)) { return }
  Get-Content -LiteralPath $EnvPath | ForEach-Object {
    $line = $_.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) { return }
    $separator = $line.IndexOf("=")
    if ($separator -lt 1) { return }
    $name = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim()
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

function Test-Url {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 8
    return [PSCustomObject]@{ Ok = $true; StatusCode = [int]$response.StatusCode }
  } catch {
    return [PSCustomObject]@{ Ok = $false; StatusCode = 0 }
  }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (!(Test-Path -LiteralPath $BackupPath)) {
  throw "Backup nao encontrado: $BackupPath"
}

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "stop.ps1")

$items = @(".env", "logs", "backend\uploads", "backend\data")
foreach ($item in $items) {
  $src = Join-Path $BackupPath $item
  if (Test-Path -LiteralPath $src) {
    $dst = Join-Path $root $item
    Ensure-Directory -Path (Split-Path -Parent $dst)
    Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
  }
}

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "start.ps1")
