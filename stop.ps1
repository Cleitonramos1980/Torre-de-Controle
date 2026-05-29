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
$logDir = Join-Path $root "logs"
Ensure-Directory -Path $logDir
$logFile = Join-Path $logDir "service.log"

function Stop-ByPidFile {
  param([string]$Name)
  $pidFile = Join-Path $logDir "$Name.pid"
  if (!(Test-Path -LiteralPath $pidFile)) { return }
  $pidValue = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($pidValue)) { return }
  $pidNum = [int]$pidValue
  $proc = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
  if ($proc) {
    Stop-Process -Id $pidNum -Force -ErrorAction SilentlyContinue
    Write-LogLine -Message "$Name finalizado (PID $pidNum)" -LogFile $logFile
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

Stop-ByPidFile -Name "frontend"
Stop-ByPidFile -Name "backend"
