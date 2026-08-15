# Upgrade-v0.14.13-AccessListScrollFix.ps1
# Fixes only the Current Dashboard Access scrolling behavior.
# Built to layer on top of v0.14.12.
#
# No SharePoint changes.
# No user-sync/auth changes.
# No project/deliverable changes.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.13 - Access List Scroll Correction"
Write-Host ""

$files = @(
  "css/styles.css",
  "css/mobile.css",
  "js/config.js"
)

# Backup affected files.
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.13-$stamp"
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

# ------------------------------------------------------------------
# Desktop/tablet correction.
# Override the earlier table-as-scroll-container approach.
# The wrapper itself becomes the scroll area.
# ------------------------------------------------------------------

$desktopMarker = "v0.14.13 — Current Dashboard Access wrapper scroll"

$styles = Get-Content "css/styles.css" -Raw

if ($styles.Contains($desktopMarker)) {
  Write-Host "SKIP: Desktop scroll correction already applied"
}
else {
  Add-Content "css/styles.css" @'

/* v0.14.13 — Current Dashboard Access wrapper scroll */
.entra-user-table-wrap{
  position:relative!important;
  display:block!important;
  width:100%!important;
  max-height:360px!important;
  overflow-y:auto!important;
  overflow-x:auto!important;
  overscroll-behavior:contain;
  scrollbar-gutter:stable both-edges;
  -webkit-overflow-scrolling:touch;
  padding:4px 4px 2px!important;
  box-sizing:border-box;
}

/* Put the table back into normal table layout. */
.entra-user-table-wrap .entra-user-table{
  display:table!important;
  width:100%!important;
  min-width:760px;
  max-height:none!important;
  overflow:visible!important;
  border-collapse:separate;
  border-spacing:0;
}

.entra-user-table-wrap .entra-user-table thead,
.entra-user-table-wrap .entra-user-table tbody{
  display:table-row-group!important;
  width:auto!important;
  min-width:0!important;
  table-layout:auto!important;
}

.entra-user-table-wrap .entra-user-table thead{
  display:table-header-group!important;
  position:static!important;
}

.entra-user-table-wrap .entra-table-heading{
  position:sticky!important;
  top:0!important;
  z-index:5!important;
  background:#fbfdff!important;
  padding:4px 0 8px!important;
}

.entra-user-table-wrap .entra-user-table thead th{
  position:sticky!important;
  top:45px!important;
  z-index:4!important;
  background:#f4f8fb!important;
}
'@
  Write-Host "PATCH: Desktop wrapper scrolling"
}

# ------------------------------------------------------------------
# Mobile correction.
# Same principle: wrapper scrolls in both directions.
# ------------------------------------------------------------------

$mobileMarker = "v0.14.13 — Current Dashboard Access wrapper scroll mobile"

$mobile = Get-Content "css/mobile.css" -Raw

if ($mobile.Contains($mobileMarker)) {
  Write-Host "SKIP: Mobile scroll correction already applied"
}
else {
  Add-Content "css/mobile.css" @'

/* v0.14.13 — Current Dashboard Access wrapper scroll mobile */
@media (max-width:700px){
  .entra-user-table-wrap{
    display:block!important;
    width:100%!important;
    max-height:320px!important;
    overflow:auto!important;
    -webkit-overflow-scrolling:touch;
    overscroll-behavior:contain;
    scrollbar-gutter:auto;
  }

  .entra-user-table-wrap .entra-user-table{
    display:table!important;
    width:760px!important;
    min-width:760px!important;
    max-height:none!important;
    overflow:visible!important;
  }

  .entra-user-table-wrap .entra-user-table thead{
    display:table-header-group!important;
  }

  .entra-user-table-wrap .entra-user-table tbody{
    display:table-row-group!important;
  }

  .entra-user-table-wrap .entra-table-heading{
    position:sticky!important;
    top:0!important;
    min-width:760px;
    z-index:5!important;
    background:#fbfdff!important;
  }

  .entra-user-table-wrap .entra-user-table thead th{
    position:sticky!important;
    top:45px!important;
    z-index:4!important;
  }
}
'@
  Write-Host "PATCH: Mobile wrapper scrolling"
}

# ------------------------------------------------------------------
# Version bump.
# ------------------------------------------------------------------

$config = Get-Content "js/config.js" -Raw

if ($config -match 'version:\s*"0\.14\.13"') {
  Write-Host "SKIP: Version already 0.14.13"
}
elseif ($config -match 'version:\s*"0\.14\.12"') {
  $config = $config -replace 'version:\s*"0\.14\.12"', 'version: "0.14.13"'
  Set-Content "js/config.js" -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.13"
}
else {
  throw "Expected current version 0.14.12 in js/config.js."
}

Write-Host ""
Write-Host "v0.14.13 scroll correction complete."
Write-Host ""
Write-Host "Test Current Dashboard Access:"
Write-Host " - mouse wheel / trackpad scroll over the user list on Mac"
Write-Host " - horizontal scroll if the table is wider than the box"
Write-Host " - touch-scroll the same box on iPhone"
Write-Host " - first row and headings remain visible"
Write-Host ""
Write-Host "Do NOT commit until those checks pass."
