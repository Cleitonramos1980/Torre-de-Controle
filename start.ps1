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
Import-DotEnv -EnvPath (Join-Path $root ".env")

$apiPort = if ($env:PORT) { [int]$env:PORT } else { 3333 }
$frontendHttpPort = if ($env:FRONTEND_PORT) { [int]$env:FRONTEND_PORT } elseif ($env:FRONTEND_HTTP_PORT) { [int]$env:FRONTEND_HTTP_PORT } else { 3345 }
$frontendHttpsPort = if ($env:FRONTEND_HTTPS_PORT) { [int]$env:FRONTEND_HTTPS_PORT } else { 3344 }
$node = Join-Path $root "runtime\node\node.exe"

if (!(Test-Path -LiteralPath $node)) {
  throw "Runtime Node nao encontrado em $node"
}

function Start-IfNeeded {
  param(
    [string]$Name,
    [string]$WorkDir,
    [string[]]$Arguments,
    [string]$PidFile,
    [int]$Port
  )

  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    Write-LogLine -Message "$Name ja ativo na porta $Port (PID $($listener.OwningProcess))" -LogFile $logFile
    Set-Content -LiteralPath $PidFile -Value $listener.OwningProcess -Encoding ASCII
    return
  }

  $outLog = Join-Path $logDir "$Name.out.log"
  $errLog = Join-Path $logDir "$Name.err.log"
  $proc = Start-Process -FilePath $node -ArgumentList $Arguments -WorkingDirectory $WorkDir -WindowStyle Hidden -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog
  Set-Content -LiteralPath $PidFile -Value $proc.Id -Encoding ASCII
  Write-LogLine -Message "$Name iniciado com PID $($proc.Id)" -LogFile $logFile
}

Start-IfNeeded -Name "backend" -WorkDir $root -Arguments @("backend/dist/server.js") -PidFile (Join-Path $logDir "backend.pid") -Port $apiPort
Start-IfNeeded -Name "frontend" -WorkDir $root -Arguments @("frontend/server.mjs") -PidFile (Join-Path $logDir "frontend.pid") -Port $frontendHttpPort

function Wait-ForUrl {
  param(
    [string]$Url,
    [int]$MaxAttempts = 20,
    [int]$DelayMs = 1000
  )
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    $result = Test-Url -Url $Url
    if ($result.Ok) { return $true }
    Start-Sleep -Milliseconds $DelayMs
  }
  return $false
}

function Wait-ForPort {
  param(
    [int]$Port,
    [int]$MaxAttempts = 20,
    [int]$DelayMs = 1000
  )
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) { return $true }
    Start-Sleep -Milliseconds $DelayMs
  }
  return $false
}

$backendReady = Wait-ForUrl -Url "http://127.0.0.1:$apiPort/api/health"
$frontendHttpReady = Wait-ForUrl -Url "http://127.0.0.1:$frontendHttpPort/"
$frontendHttpsReady = Wait-ForPort -Port $frontendHttpsPort

if (-not $backendReady) { throw "Backend nao respondeu em /api/health" }
if (-not $frontendHttpReady) { throw "Frontend HTTP nao respondeu na raiz" }
if (-not $frontendHttpsReady) { throw "Frontend HTTPS nao abriu a porta $frontendHttpsPort" }

Write-LogLine -Message "Aplicacao online (backend $apiPort / frontend HTTP $frontendHttpPort / frontend HTTPS $frontendHttpsPort)" -LogFile $logFile
