# Upgrade-v0.14.12-AccessListScroll.ps1
# Final small Admin polish:
# - Makes Current Dashboard Access truly scrollable once the list exceeds the box height.
# - Keeps the section heading and table header visible.
# - Preserves all existing user-sync logic.
# - Bumps version 0.14.11 -> 0.14.12.
#
# No SharePoint schema/data changes.
# No auth logic changes.
# No Deliverables / project / mobile-data changes.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.12 - Access List Scroll Fix"
Write-Host ""

$files = @(
  "css/styles.css",
  "css/mobile.css",
  "js/config.js"
)

# Backup affected files.
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.12-$stamp"
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

# Desktop/tablet fix.
$desktopMarker = "v0.14.12 — reliable Current Dashboard Access scrolling"
$styles = Get-Content "css/styles.css" -Raw

if ($styles.Contains($desktopMarker)) {
  Write-Host "SKIP: Desktop access-list scroll CSS already applied"
}
else {
  Add-Content "css/styles.css" @'

/* v0.14.12 — reliable Current Dashboard Access scrolling */
.entra-user-table-wrap{
  position:relative;
  height:auto;
  max-height:none;
  overflow:visible;
  padding:0;
}

.entra-user-table-wrap .entra-table-heading{
  position:relative;
  top:auto;
  z-index:auto;
  background:transparent;
  padding:0 0 8px;
}

/* Make the actual table body area the scroll container. */
.entra-user-table-wrap .entra-user-table{
  display:block;
  width:100%;
  max-height:360px;
  overflow-y:auto;
  overflow-x:auto;
  border-collapse:separate;
  border-spacing:0;
  scrollbar-gutter:stable;
  -webkit-overflow-scrolling:touch;
}

.entra-user-table-wrap .entra-user-table thead,
.entra-user-table-wrap .entra-user-table tbody{
  display:table;
  width:100%;
  table-layout:fixed;
}

.entra-user-table-wrap .entra-user-table thead{
  position:sticky;
  top:0;
  z-index:3;
}

.entra-user-table-wrap .entra-user-table thead th{
  position:static;
  background:#f4f8fb;
}

/* Keep row geometry stable as names/projects grow. */
.entra-user-table-wrap .entra-user-table td,
.entra-user-table-wrap .entra-user-table th{
  box-sizing:border-box;
  vertical-align:top;
}
'@
  Write-Host "PATCH: Desktop access-list scroll CSS"
}

# Mobile override.
$mobileMarker = "v0.14.12 — Current Dashboard Access mobile scrolling"
$mobile = Get-Content "css/mobile.css" -Raw

if ($mobile.Contains($mobileMarker)) {
  Write-Host "SKIP: Mobile access-list scroll CSS already applied"
}
else {
  Add-Content "css/mobile.css" @'

/* v0.14.12 — Current Dashboard Access mobile scrolling */
@media (max-width:700px){
  .entra-user-table-wrap{
    max-height:none!important;
    overflow:visible!important;
  }

  .entra-user-table-wrap .entra-user-table{
    display:block;
    width:100%;
    min-width:680px;
    max-height:320px;
    overflow:auto;
    -webkit-overflow-scrolling:touch;
  }

  .entra-user-table-wrap .entra-user-table thead,
  .entra-user-table-wrap .entra-user-table tbody{
    display:table;
    width:100%;
    min-width:680px;
    table-layout:fixed;
  }
}
'@
  Write-Host "PATCH: Mobile access-list scroll CSS"
}

# Version bump.
$config = Get-Content "js/config.js" -Raw

if ($config -match 'version:\s*"0\.14\.12"') {
  Write-Host "SKIP: Version already 0.14.12"
}
elseif ($config -match 'version:\s*"0\.14\.11"') {
  $config = $config -replace 'version:\s*"0\.14\.11"', 'version: "0.14.12"'
  Set-Content "js/config.js" -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.12"
}
else {
  throw "Expected current version 0.14.11 in js/config.js."
}

Write-Host ""
Write-Host "v0.14.12 access-list scroll fix complete."
Write-Host ""
Write-Host "Test:"
Write-Host " - Current Dashboard Access top row is fully visible."
Write-Host " - The list scrolls internally when there are enough users."
Write-Host " - Bill role/project edits still save correctly."
Write-Host " - Desktop and mobile Admin still render normally."
Write-Host ""
Write-Host "If those pass, commit/push and create the stable ZIP."
