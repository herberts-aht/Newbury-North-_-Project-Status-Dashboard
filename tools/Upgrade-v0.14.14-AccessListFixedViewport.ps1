# Upgrade-v0.14.14-AccessListFixedViewport.ps1
# Final Admin access-list polish layered on top of v0.14.13.
#
# - Gives Current Dashboard Access a deliberately compact viewport.
# - Vertical scrolling becomes obvious as the user list grows.
# - Keeps the existing v0.14.11 user-sync fixes untouched.
# - No SharePoint, auth, project, deliverable, or data changes.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.14 - Access List Fixed Viewport"
Write-Host ""

$files = @(
  "css/styles.css",
  "css/mobile.css",
  "js/config.js"
)

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.14-$stamp"
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

$desktopMarker = "v0.14.14 — compact Current Dashboard Access viewport"
$styles = Get-Content "css/styles.css" -Raw

if ($styles.Contains($desktopMarker)) {
  Write-Host "SKIP: Desktop fixed viewport already applied"
}
else {
  Add-Content "css/styles.css" @'

/* v0.14.14 — compact Current Dashboard Access viewport */
.entra-user-table-wrap{
  height:260px!important;
  max-height:260px!important;
  overflow-y:scroll!important;
  overflow-x:auto!important;
  scrollbar-gutter:stable!important;
}

/* Keep the title visible while the user rows move beneath it. */
.entra-user-table-wrap .entra-table-heading{
  position:sticky!important;
  top:0!important;
  z-index:6!important;
  background:#fbfdff!important;
}

/* Keep column labels visible beneath the title. */
.entra-user-table-wrap .entra-user-table thead th{
  position:sticky!important;
  top:45px!important;
  z-index:5!important;
  background:#f4f8fb!important;
}
'@
  Write-Host "PATCH: Desktop access-list fixed viewport"
}

$mobileMarker = "v0.14.14 — compact Current Dashboard Access viewport mobile"
$mobile = Get-Content "css/mobile.css" -Raw

if ($mobile.Contains($mobileMarker)) {
  Write-Host "SKIP: Mobile fixed viewport already applied"
}
else {
  Add-Content "css/mobile.css" @'

/* v0.14.14 — compact Current Dashboard Access viewport mobile */
@media (max-width:700px){
  .entra-user-table-wrap{
    height:245px!important;
    max-height:245px!important;
    overflow:auto!important;
    -webkit-overflow-scrolling:touch;
  }
}
'@
  Write-Host "PATCH: Mobile access-list fixed viewport"
}

$config = Get-Content "js/config.js" -Raw

if ($config -match 'version:\s*"0\.14\.14"') {
  Write-Host "SKIP: Version already 0.14.14"
}
elseif ($config -match 'version:\s*"0\.14\.13"') {
  $config = $config -replace 'version:\s*"0\.14\.13"', 'version: "0.14.14"'
  Set-Content "js/config.js" -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.14"
}
else {
  throw "Expected current version 0.14.13 in js/config.js."
}

Write-Host ""
Write-Host "v0.14.14 complete."
Write-Host ""
Write-Host "With the four current users, Current Dashboard Access should now"
Write-Host "stay compact and show/use its own vertical scrolling area."
Write-Host ""
Write-Host "Do NOT commit until the Mac view looks right."
