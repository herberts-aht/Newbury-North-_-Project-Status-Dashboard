# Upgrade-v0.14.10-MobilePolishAndCounts.ps1
# Small, isolated patch:
#   1) Makes Deliverable summary buckets exhaustive:
#      Active + Waiting/Review + Complete = Total
#   2) Keeps mobile status badges compact and single-line.
#   3) Bumps version 0.14.9 -> 0.14.10
#
# No SharePoint schema/data changes.
# No authentication changes.
# No desktop layout changes.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.10 - Mobile polish + summary counts"
Write-Host ""

$files = @(
  "js/dashboard.js",
  "css/mobile.css",
  "js/config.js"
)

# Backup affected files first.
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.10-$stamp"
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

function Replace-Exact {
  param(
    [string]$Path,
    [string]$Old,
    [string]$New,
    [string]$Label
  )

  $text = Get-Content $Path -Raw

  if ($text.Contains($New)) {
    Write-Host "SKIP:" $Label "(already applied)"
    return
  }

  if (-not $text.Contains($Old)) {
    throw "Could not find expected code for: $Label in $Path. Stopping this patch."
  }

  $text = $text.Replace($Old, $New)
  Set-Content -Path $Path -Value $text -NoNewline
  Write-Host "PATCH:" $Label
}

# ------------------------------------------------------------------
# 1. Project-card counts
# Waiting/Review and Complete are explicit buckets.
# Active becomes every other non-archived deliverable.
# ------------------------------------------------------------------

$oldProjectCounts = 'projectGrid.innerHTML=projects.map(pr=>{const active=pr.deliverables.filter(x=>x.status==="In Progress").length,waiting=pr.deliverables.filter(x=>x.status.includes("Waiting")||x.status==="Awaiting Review").length,complete=pr.deliverables.filter(x=>x.status==="Complete").length;'
$newProjectCounts = 'projectGrid.innerHTML=projects.map(pr=>{const waiting=pr.deliverables.filter(x=>x.status.includes("Waiting")||x.status==="Awaiting Review").length,complete=pr.deliverables.filter(x=>x.status==="Complete").length,active=Math.max(0,pr.deliverables.length-waiting-complete);'

Replace-Exact "js/dashboard.js" $oldProjectCounts $newProjectCounts "Project-card Active/Waiting/Complete counts"

# ------------------------------------------------------------------
# 2. Executive Summary KPI counts
# ------------------------------------------------------------------

$oldKpis = 'kpiTotal.textContent=ds.length;kpiActive.textContent=ds.filter(x=>x.status==="In Progress").length;kpiWaiting.textContent=ds.filter(x=>x.status.includes("Waiting")||x.status==="Awaiting Review").length;kpiComplete.textContent=ds.filter(x=>x.status==="Complete").length;'
$newKpis = 'const summaryWaiting=ds.filter(x=>x.status.includes("Waiting")||x.status==="Awaiting Review").length,summaryComplete=ds.filter(x=>x.status==="Complete").length,summaryActive=Math.max(0,ds.length-summaryWaiting-summaryComplete);kpiTotal.textContent=ds.length;kpiActive.textContent=summaryActive;kpiWaiting.textContent=summaryWaiting;kpiComplete.textContent=summaryComplete;'

Replace-Exact "js/dashboard.js" $oldKpis $newKpis "Executive Summary Active/Waiting/Complete counts"

# ------------------------------------------------------------------
# 3. Mobile status-pill polish
# ------------------------------------------------------------------

$mobileMarker = "v0.14.10 — compact mobile status badges"

$mobileCss = Get-Content "css/mobile.css" -Raw
if ($mobileCss.Contains($mobileMarker)) {
  Write-Host "SKIP: Mobile status-badge CSS (already applied)"
}
else {
  $patch = @'

/* v0.14.10 — compact mobile status badges */
@media (max-width:700px){
  .mobile-record-heading{
    align-items:flex-start;
  }

  .mobile-record-heading > .badge,
  .mobile-record-heading > span > .badge,
  .mobile-record .badge{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    flex:0 0 auto;
    width:max-content;
    max-width:none;
    min-width:0;
    white-space:nowrap;
    line-height:1.15;
    text-align:center;
    vertical-align:top;
  }

  .mobile-record-heading h4{
    min-width:0;
  }
}
'@
  Add-Content -Path "css/mobile.css" -Value $patch
  Write-Host "PATCH: Mobile status-badge sizing"
}

# ------------------------------------------------------------------
# 4. Version bump
# ------------------------------------------------------------------

$config = Get-Content "js/config.js" -Raw

if ($config -match 'version:\s*"0\.14\.10"') {
  Write-Host "SKIP: Version already 0.14.10"
}
elseif ($config -match 'version:\s*"0\.14\.9"') {
  $config = $config -replace 'version:\s*"0\.14\.9"', 'version: "0.14.10"'
  Set-Content "js/config.js" -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.10"
}
else {
  throw "Expected current version 0.14.9 in js/config.js."
}

Write-Host ""
Write-Host "v0.14.10 patch complete."
Write-Host ""
Write-Host "Expected behavior:"
Write-Host " - Total Deliverables = Active + Waiting / Review + Complete"
Write-Host " - Not Started / Pending / In Progress / other open statuses count as Active"
Write-Host " - Mobile status pills stay compact and on one line"
Write-Host ""
Write-Host "Do NOT commit until desktop + mobile are checked."
