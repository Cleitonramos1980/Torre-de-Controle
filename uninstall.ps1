param(
  [string]$InstallDir = "",
  [switch]$Force
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
if ([string]::IsNullOrWhiteSpace($InstallDir)) { $InstallDir = $root }
$logDir = Join-Path $root "logs"
Ensure-Directory -Path $logDir
$logFile = Join-Path $logDir "install.log"

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "service\uninstall-service.ps1") -InstallDir $InstallDir
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "stop.ps1")

if ($Force) {
  Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
  Write-LogLine -Message "Instalacao removida em $InstallDir" -LogFile $logFile
} else {
  Write-LogLine -Message "Servicos removidos e aplicacao parada. Para apagar arquivos, rode uninstall.ps1 -Force." -LogFile $logFile
}
