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
$logFile = Join-Path $logDir "healthcheck.log"
Import-DotEnv -EnvPath (Join-Path $root ".env")

$apiPort = if ($env:PORT) { [int]$env:PORT } else { 3333 }
$frontendHttpPort = if ($env:FRONTEND_PORT) { [int]$env:FRONTEND_PORT } elseif ($env:FRONTEND_HTTP_PORT) { [int]$env:FRONTEND_HTTP_PORT } else { 3345 }
$frontendHttpsPort = if ($env:FRONTEND_HTTPS_PORT) { [int]$env:FRONTEND_HTTPS_PORT } else { 3344 }

$checks = @(
  @{ Name = "Backend Health"; Url = "http://127.0.0.1:$apiPort/api/health" },
  @{ Name = "Frontend HTTP Root"; Url = "http://127.0.0.1:$frontendHttpPort/" },
  @{ Name = "Torre Divergencias"; Url = "http://127.0.0.1:$frontendHttpPort/recebiveis-cartao/divergencias" }
)

$failed = $false
foreach ($check in $checks) {
  $result = Test-Url -Url $check.Url
  if ($result.Ok) {
    Write-LogLine -Message "$($check.Name): OK ($($result.StatusCode))" -LogFile $logFile
  } else {
    Write-LogLine -Message "$($check.Name): FALHA" -LogFile $logFile
    $failed = $true
  }
}

$httpsListener = Get-NetTCPConnection -LocalPort $frontendHttpsPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($httpsListener) {
  Write-LogLine -Message "Frontend HTTPS Port ${frontendHttpsPort}: OK" -LogFile $logFile
} else {
  Write-LogLine -Message "Frontend HTTPS Port ${frontendHttpsPort}: FALHA" -LogFile $logFile
  $failed = $true
}

if ($failed) {
  exit 1
}

Write-LogLine -Message "Healthcheck concluido com sucesso." -LogFile $logFile
