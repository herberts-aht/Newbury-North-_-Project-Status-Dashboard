# Upgrade-v0.14.17-SiteTitleCleanup.ps1
# Removes the stale version number from the browser/share title permanently.
#
# The live app version remains visible inside Project Control.
# The browser tab, shared link title, and saved-site title become simply:
#   AHT Project Control
#
# No SharePoint, auth, PDF-report, project, or user changes.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.17 - Site Title Cleanup"
Write-Host ""

$files = @(
  "index.html",
  "js/config.js"
)

# Backup
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.17-$stamp"
New-Item -ItemType Directory -Path $backupDir | Out-Null

foreach ($file in $files) {
  Copy-Item $file (Join-Path $backupDir $file)
}
Write-Host "BACKUP:" $backupDir

# ------------------------------------------------------------------
# 1. Clean browser/share title.
# ------------------------------------------------------------------
$html = Get-Content "index.html" -Raw

# Replace any existing AHT Project Control title that includes a version.
$html = [regex]::Replace(
  $html,
  '<title>\s*AHT Project Control(?:\s*[·\-|]\s*(?:v)?[0-9.]+)?\s*</title>',
  '<title>AHT Project Control</title>',
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

if ($html -notmatch '<title>AHT Project Control</title>') {
  throw "Could not normalize the AHT Project Control <title>."
}

# Add stable share/home-screen metadata if not already present.
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

# ------------------------------------------------------------------
# 2. Version bump
# ------------------------------------------------------------------
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
Write-Host " - App footer/mobile indicator still shows the actual build version"
Write-Host ""
Write-Host "Test Port 8000 before committing."
