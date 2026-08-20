# Upgrade-v0.14.9-MobileParity.ps1
# Mobile-only parity patch built from the confirmed v0.14.8 stable baseline.
# Does not touch SharePoint data, auth, desktop table markup, or project data.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.9 - Mobile Parity upgrade"
Write-Host ""

$files = @(
  "index.html",
  "css/mobile.css",
  "js/app.js",
  "js/dashboard.js",
  "js/config.js"
)

# Backup every file before changing it.
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.9-mobile-$stamp"
New-Item -ItemType Directory -Path $backupDir | Out-Null
foreach ($file in $files) {
  $dest = Join-Path $backupDir $file
  $destDir = Split-Path $dest -Parent
  if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
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
    throw "Could not find the expected v0.14.8 code for: $Label in $Path. Stopping without applying that patch."
  }

  $text = $text.Replace($Old, $New)
  Set-Content -Path $Path -Value $text -NoNewline
  Write-Host "PATCH:" $Label
}

# 1. Actual Deliverables / Information Required mobile rendering.
$renderOld = @'
 deliverablesBody.innerHTML=filtered.map(x=>`<tr><td>${esc(x.discipline)}</td><td><strong>${esc(x.deliverable)}</strong>${visBadge(x.visibility)}<div class="small">${esc(x.current)}</div></td><td>${badge(x.status)}</td><td>${healthBadge(x)}</td><td>${esc(x.owner)}</td><td>${esc(x.waitingOn)}</td><td>${esc(x.nextStep)}</td><td>${fmtDate(x.date)}</td><td>${currentUser.canEdit?`<button class="linkbtn" onclick="editDeliverable(${x.id})">Edit</button>`:""}</td></tr>`).join("");
 infoBody.innerHTML=infoRecords.map(x=>`<tr><td><strong>${esc(x.item)}</strong>${visBadge(x.visibility)}</td><td>${esc(x.from)}</td><td>${badge(x.status)}</td><td>${esc(x.blocking)}</td><td>${esc(x.notes)}</td><td>${currentUser.canEdit?`<button class="linkbtn" onclick="editInfo(${x.id})">Edit</button>`:""}</td></tr>`).join("");
 infoCards.innerHTML=infoRecords.map(x=>`<div class="mobile-record"><h4>${esc(x.item)} ${visBadge(x.visibility)}</h4><div class="row"><span>Status</span><span>${badge(x.status)}</span></div><div class="row"><span>Requested From</span><strong>${esc(x.from)}</strong></div><div class="row"><span>Blocking</span><span>${esc(x.blocking)}</span></div><div class="row"><span>Needed By</span><span>${fmtDate(x.neededBy)}</span></div>${currentUser.canEdit?`<div style="margin-top:9px"><button class="linkbtn" onclick="editInfo(${x.id})">Edit source</button></div>`:""}</div>`).join("");
'@
$renderNew = @'
 deliverablesBody.innerHTML=filtered.map(x=>`<tr><td>${esc(x.discipline)}</td><td><strong>${esc(x.deliverable)}</strong>${visBadge(x.visibility)}<div class="small">${esc(x.current)}</div></td><td>${badge(x.status)}</td><td>${healthBadge(x)}</td><td>${esc(x.owner)}</td><td>${esc(x.waitingOn)}</td><td>${esc(x.nextStep)}</td><td>${fmtDate(x.date)}</td><td>${currentUser.canEdit?`<button class="linkbtn" onclick="editDeliverable(${x.id})">Edit</button>`:""}</td></tr>`).join("");
 deliverableCards.innerHTML=filtered.map(x=>`<div class="mobile-record mobile-deliverable"><div class="mobile-record-heading"><div><div class="mobile-record-kicker">${esc(x.discipline)}</div><h4>${esc(x.deliverable)} ${visBadge(x.visibility)}</h4></div><span>${badge(x.status)}</span></div>${x.current?`<div class="mobile-record-current">${esc(x.current)}</div>`:""}<div class="row"><span>Schedule Health</span><span>${healthBadge(x)}</span></div><div class="row"><span>Owner</span><strong>${esc(x.owner)||"—"}</strong></div><div class="row"><span>Waiting On</span><span>${esc(x.waitingOn)||"—"}</span></div><div class="row"><span>Next Step</span><span>${esc(x.nextStep)||"—"}</span></div><div class="row"><span>Target</span><span>${fmtDate(x.date)}</span></div>${currentUser.canEdit?`<div class="mobile-record-actions"><button class="btn" onclick="editDeliverable(${x.id})">Edit Deliverable</button></div>`:""}</div>`).join("")||'<div class="mobile-empty">No deliverables match the current filters.</div>';
 infoBody.innerHTML=infoRecords.map(x=>`<tr><td><strong>${esc(x.item)}</strong>${visBadge(x.visibility)}</td><td>${esc(x.from)}</td><td>${badge(x.status)}</td><td>${esc(x.blocking)}</td><td>${esc(x.notes)}</td><td>${currentUser.canEdit?`<button class="linkbtn" onclick="editInfo(${x.id})">Edit</button>`:""}</td></tr>`).join("");
 infoCards.innerHTML=infoRecords.map(x=>`<div class="mobile-record mobile-info"><div class="mobile-record-heading"><h4>${esc(x.item)} ${visBadge(x.visibility)}</h4><span>${badge(x.status)}</span></div><div class="row"><span>Requested From</span><strong>${esc(x.from)||"—"}</strong></div><div class="row"><span>Blocking</span><span>${esc(x.blocking)||"—"}</span></div><div class="row"><span>Needed By</span><span>${fmtDate(x.neededBy)}</span></div>${x.notes?`<div class="mobile-record-current">${esc(x.notes)}</div>`:""}${currentUser.canEdit?`<div class="mobile-record-actions"><button class="btn" onclick="editInfo(${x.id})">Edit Request</button></div>`:""}</div>`).join("")||'<div class="mobile-empty">No information requests for this project.</div>';
'@
Replace-Exact "js/dashboard.js" $renderOld $renderNew "Mobile Deliverables + Information Required render"

# 2. Mobile-visible version marker in the app shell.
$sidebarOld = @'
<div class="sidebar-footer">AHT Project Control<br><span id="sidebarVersion">Version —</span><br>© AHT Global</div>
'@
$sidebarNew = @'
<div class="sidebar-footer">AHT Project Control<br><span id="sidebarVersion">Version —</span><br>© AHT Global</div>
      <div class="mobile-version" id="mobileVersion">Version —</div>
'@
Replace-Exact "index.html" $sidebarOld $sidebarNew "Mobile version element"

# 3. Populate mobile version from the same APP_CONFIG.version as desktop.
$appOld = @'
  if (sidebarVersion) sidebarVersion.textContent = `Version ${APP_CONFIG.version}`;
'@
$appNew = @'
  if (sidebarVersion) sidebarVersion.textContent = `Version ${APP_CONFIG.version}`;
  const mobileVersion = document.getElementById("mobileVersion");
  if (mobileVersion) mobileVersion.textContent = `v${APP_CONFIG.version}`;
'@
Replace-Exact "js/app.js" $appOld $appNew "Mobile version text"

# 4. Mobile-only CSS.
$mobilePatch = @'
/* v0.14.9 — mobile Deliverables / Information Required parity */
@media (max-width:700px){
  #deliverables .desktop-table{
    display:block!important;
    border:0;
    background:transparent;
    overflow:visible;
    margin-bottom:10px;
  }
  #deliverables .desktop-table>.table-tools{
    display:grid!important;
    grid-template-columns:1fr;
    border:1px solid var(--line);
    border-radius:10px;
    background:#fff;
  }
  #deliverables .desktop-table>div[style*="overflow:auto"]{
    display:none!important;
  }

  .mobile-record-heading{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:10px;
    margin-bottom:7px;
  }
  .mobile-record-heading>div{min-width:0}
  .mobile-record-heading h4{margin:0}
  .mobile-record-kicker{
    color:var(--muted);
    font-size:10px;
    font-weight:750;
    text-transform:uppercase;
    letter-spacing:.05em;
    margin-bottom:3px;
  }
  .mobile-record-current{
    font-size:12px;
    color:var(--muted);
    line-height:1.4;
    padding:8px 0 9px;
    border-bottom:1px solid #edf1f5;
  }
  .mobile-record-actions{
    padding-top:10px;
  }
  .mobile-record-actions .btn{
    width:100%;
  }
  .mobile-empty{
    background:#fff;
    border:1px solid var(--line);
    border-radius:10px;
    padding:16px;
    color:var(--muted);
    font-size:13px;
  }
}

/* v0.14.9 — visible build number on phone */
.mobile-version{display:none}
@media (max-width:700px){
  .mobile-version{
    display:block;
    flex:0 0 auto;
    align-self:center;
    padding:0 8px;
    font-size:10px;
    font-weight:700;
    color:var(--muted);
    white-space:nowrap;
  }
}
'@
$mobileCss = Get-Content "css/mobile.css" -Raw
if ($mobileCss.Contains("v0.14.9 — mobile Deliverables / Information Required parity")) {
  Write-Host "SKIP: Mobile parity CSS (already applied)"
} else {
  Add-Content -Path "css/mobile.css" -Value ("`n`n" + $mobilePatch)
  Write-Host "PATCH: Mobile parity CSS"
}

# 5. Version bump.
$config = Get-Content "js/config.js" -Raw
if ($config -match 'version:\s*"0\.14\.9"') {
  Write-Host "SKIP: Version already 0.14.9"
} elseif ($config -match 'version:\s*"0\.14\.8"') {
  $config = $config -replace 'version:\s*"0\.14\.8"', 'version: "0.14.9"'
  Set-Content "js/config.js" -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.9"
} else {
  throw "Expected current version 0.14.8 in js/config.js."
}

Write-Host ""
Write-Host "v0.14.9 mobile parity patch complete."
Write-Host "Changed files:"
$files | ForEach-Object { Write-Host " -" $_ }
Write-Host ""
Write-Host "Next: refresh Port 8000 and test the actual Deliverables and Information Required tabs on mobile."
Write-Host "Do NOT commit until mobile testing passes."
