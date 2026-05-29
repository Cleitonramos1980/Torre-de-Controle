param(
  [string]$InstallDir = "C:\TorreControle",
  [switch]$NoService,
  [switch]$SkipHealthcheck
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

$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Ensure-Directory -Path $InstallDir
$installLogDir = Join-Path $InstallDir "logs"
Ensure-Directory -Path $installLogDir
$installLog = Join-Path $installLogDir "install.log"

Write-LogLine -Message "Iniciando instalacao em $InstallDir" -LogFile $installLog

if (Test-Path -LiteralPath $InstallDir) {
  $backupRoot = Join-Path $InstallDir "backups"
  Ensure-Directory -Path $backupRoot
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupDir = Join-Path $backupRoot "preinstall-$stamp"
  Ensure-Directory -Path $backupDir
  if (Test-Path (Join-Path $InstallDir ".env")) {
    Copy-Item -LiteralPath (Join-Path $InstallDir ".env") -Destination (Join-Path $backupDir ".env") -Force
  }
  Write-LogLine -Message "Backup pre-instalacao criado em $backupDir" -LogFile $installLog
} else {
  Ensure-Directory -Path $InstallDir
}

$toCopyDirs = @("backend", "frontend", "runtime", "config", "database", "oracle", "service", "scripts")
foreach ($dir in $toCopyDirs) {
  $src = Join-Path $sourceRoot $dir
  if (!(Test-Path -LiteralPath $src)) { continue }
  $dst = Join-Path $InstallDir $dir
  Ensure-Directory -Path $dst
  robocopy $src $dst /E /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "Falha ao copiar pasta $dir (robocopy code: $LASTEXITCODE)"
  }
}

$toCopyFiles = @(
  ".env.example",
  "README_INSTALACAO.md",
  "README_PRODUCAO.md",
  "TROUBLESHOOTING.md",
  "RELEASE_NOTES.md",
  "manifest.json",
  "checksums.sha256",
  "install.cmd", "install.ps1",
  "start.cmd", "start.ps1",
  "stop.cmd", "stop.ps1",
  "restart.cmd", "restart.ps1",
  "status.cmd", "status.ps1",
  "healthcheck.cmd", "healthcheck.ps1",
  "uninstall.cmd", "uninstall.ps1",
  "backup.cmd", "backup.ps1",
  "restore.cmd", "restore.ps1",
  "update.cmd", "update.ps1"
)

foreach ($file in $toCopyFiles) {
  $src = Join-Path $sourceRoot $file
  if (Test-Path -LiteralPath $src) {
    Copy-Item -LiteralPath $src -Destination (Join-Path $InstallDir $file) -Force
  }
}

$targetEnv = Join-Path $InstallDir ".env"
if (!(Test-Path -LiteralPath $targetEnv)) {
  Copy-Item -LiteralPath (Join-Path $InstallDir ".env.example") -Destination $targetEnv -Force
  Write-LogLine -Message "Arquivo .env criado a partir do .env.example" -LogFile $installLog
} else {
  Write-LogLine -Message "Arquivo .env existente preservado" -LogFile $installLog
}

Import-DotEnv -EnvPath $targetEnv
$oracleReady = -not [string]::IsNullOrWhiteSpace($env:ORACLE_USER) -and -not [string]::IsNullOrWhiteSpace($env:ORACLE_PASSWORD) -and -not [string]::IsNullOrWhiteSpace($env:ORACLE_CONNECT_STRING)
if (-not $oracleReady) {
  Write-LogLine -Message "Variaveis ORACLE_USER/ORACLE_PASSWORD/ORACLE_CONNECT_STRING nao configuradas no .env." -LogFile $installLog
  throw "Preencha o .env com credenciais Oracle/WinThor validas e execute install.cmd novamente."
}

$migrateScript = Join-Path $InstallDir "database\migrate.ps1"
& powershell -NoProfile -ExecutionPolicy Bypass -File $migrateScript -InstallDir $InstallDir
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao executar migracoes."
}

if (-not $NoService) {
  $serviceScript = Join-Path $InstallDir "service\install-service.ps1"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $serviceScript -InstallDir $InstallDir
}

$startScript = Join-Path $InstallDir "start.ps1"
& powershell -NoProfile -ExecutionPolicy Bypass -File $startScript
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao iniciar aplicacao apos instalacao."
}

if (-not $SkipHealthcheck) {
  $healthScript = Join-Path $InstallDir "healthcheck.ps1"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $healthScript
  if ($LASTEXITCODE -ne 0) {
    throw "Healthcheck pos-instalacao falhou."
  }
}

Write-LogLine -Message "Instalacao concluida. Frontend: http://127.0.0.1:3344" -LogFile $installLog
