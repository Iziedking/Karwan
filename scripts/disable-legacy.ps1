# disable-legacy.ps1 — close the 30-day legacy recovery surface.
#
# Windows / PowerShell equivalent of scripts/disable-legacy.sh. Use this if
# you're closing the window from your local laptop via WSL or against a
# Windows-hosted runtime. The Linux VPS path is the .sh version.
#
# Usage:
#   ./scripts/disable-legacy.ps1
#   ./scripts/disable-legacy.ps1 -EnvFile "C:\path\to\.env"

[CmdletBinding()]
param(
  [string]$EnvFile = "$HOME/karwan/.env",
  [string]$ComposeDir = "$HOME/karwan",
  [string]$Service = "karwan-api"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $EnvFile)) {
  Write-Error "ENV file not found at $EnvFile. Pass -EnvFile to override."
  exit 1
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "$EnvFile.before-legacy-close.$stamp"
Copy-Item -LiteralPath $EnvFile -Destination $backup -Force
Write-Host "Backed up .env -> $backup"

$lines = Get-Content -LiteralPath $EnvFile -Encoding utf8
$keys = @('KARWAN_ESCROW_LEGACY_ADDR', 'KARWAN_VAULT_LEGACY_ADDR', 'LEGACY_WINDOW_CLOSES_AT')
$rewrite = foreach ($line in $lines) {
  $changed = $false
  foreach ($k in $keys) {
    if ($line -match "^$k=.+$") {
      "# $line  # disabled by disable-legacy.ps1"
      $changed = $true
      break
    }
  }
  if (-not $changed) { $line }
}

Set-Content -LiteralPath $EnvFile -Value $rewrite -Encoding utf8
Write-Host "Commented out legacy env vars."

Push-Location $ComposeDir
try {
  & docker compose up -d --no-deps --force-recreate $Service
} finally {
  Pop-Location
}

Start-Sleep -Seconds 4
try {
  $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/legacy/window' -Method Get
  Write-Host "Window state: open=$($resp.open) daysRemaining=$($resp.daysRemaining)"
} catch {
  Write-Host "(could not reach local api; check public health endpoint instead)"
}

Write-Host 'Done.'
