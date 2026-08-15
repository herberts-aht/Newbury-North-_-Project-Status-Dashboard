# Upgrade-v0.14.17-SiteTitleCleanup-FIXED.ps1
# Corrected backup handling for nested files.
# Removes stale version number from browser/share title permanently.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.17 - Site Title Cleanup"
Write-Host ""

$files = @(
  "index.html",
  "js/config.js"
)

# Backup with nested-directory support.
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.17-$stamp"
New-Item -ItemType Directory -Path $backupDir | Out-Null

foreach ($file in $files) {
  $dest = Join-Path $backupDir $file
  $destDir = Split-Path $dest -Parent
  if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  }
  Copy-Item $file $dest
}

Write-Host "BACKUP:" $backupDir

# Clean browser/share title.
$html = Get-Content "index.html" -Raw

$html = [regex]::Replace(
  $html,
  '<title>\s*AHT Project Control(?:\s*[·\-|]\s*(?:v)?[0-9.]+)?\s*</title>',
  '<title>AHT Project Control</title>',
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

if ($html -notmatch '<title>AHT Project Control</title>') {
  throw "Could not normalize the AHT Project Control <title>."
}

$metadata = @'
<meta name="application-name" content="AHT Project Control" />
<meta name="apple-mobile-web-app-title" content="AHT Project Control" />
<meta property="og:title" content="AHT Project Control" />
'@

if ($html -notmatch 'name="application-name"') {
  $html = $html.Replace(
    '<title>AHT Project Control</title>',
    "<title>AHT Project Control</title>`n$metadata"
  )
}

Set-Content "index.html" -Value $html -NoNewline
Write-Host "PATCH: Browser/share title -> AHT Project Control"

# Version bump.
$config = Get-Content "js/config.js" -Raw

if ($config -match 'version:\s*"0\.14\.17"') {
  Write-Host "SKIP: Version already 0.14.17"
}
elseif ($config -match 'version:\s*"0\.14\.16"') {
  $config = $config -replace 'version:\s*"0\.14\.16"', 'version: "0.14.17"'
  Set-Content "js/config.js" -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.17"
}
else {
  throw "Expected current version 0.14.16 in js/config.js."
}

Write-Host ""
Write-Host "v0.14.17 title cleanup complete."
Write-Host ""
Write-Host "Expected:"
Write-Host " - Browser tab: AHT Project Control"
Write-Host " - Shared/saved link title: AHT Project Control"
Write-Host " - App footer/mobile indicator still shows v0.14.17"
