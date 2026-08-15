# Upgrade-v0.14.15-ProjectPrintReport.ps1
# Adds a per-project Print / PDF report to Executive Summary.
#
# The report is generated from the currently selected project and the records
# visible to the signed-in user. It opens in a clean print window and invokes
# the browser's native Print dialog (Save as PDF on supported devices).
#
# No SharePoint schema/data changes.
# No authentication changes.
# No project-management logic changes.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.15 - Project Print / PDF Report"
Write-Host ""

$files = @(
  "index.html",
  "js/dashboard.js",
  "js/config.js"
)

# ------------------------------------------------------------------
# Backup
# ------------------------------------------------------------------
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.15-$stamp"
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
    throw "Could not find expected code for: $Label in $Path. Stopping."
  }

  $text = $text.Replace($Old, $New)
  Set-Content -Path $Path -Value $text -NoNewline
  Write-Host "PATCH:" $Label
}

# ------------------------------------------------------------------
# 1. Executive Summary button
# ------------------------------------------------------------------

$oldHeader = @'
        <div class="project-switcher"><span class="small">Project</span><select id="projectSelect"></select></div>
'@

$newHeader = @'
        <div class="actions">
          <div class="project-switcher"><span class="small">Project</span><select id="projectSelect"></select></div>
          <button class="btn" type="button" onclick="printCurrentProjectReport()">Print / PDF</button>
        </div>
'@

Replace-Exact "index.html" $oldHeader $newHeader "Executive Summary Print / PDF button"

# ------------------------------------------------------------------
# 2. Print-report generator
# ------------------------------------------------------------------

$dashboard = Get-Content "js/dashboard.js" -Raw

if ($dashboard.Contains("function printCurrentProjectReport()")) {
  Write-Host "SKIP: Project report generator already present"
}
else {

$reportFunction = @'

function printCurrentProjectReport(){
 const p=currentProject();
 if(!p)return;

 const ds=visibleDeliverables(p);
 const infoRecords=visibleInfo(p);
 const waiting=ds.filter(x=>x.status.includes("Waiting")||x.status==="Awaiting Review").length;
 const complete=ds.filter(x=>x.status==="Complete").length;
 const active=Math.max(0,ds.length-waiting-complete);
 const current=ds.filter(x=>x.status==="In Progress");
 const next=current;
 const risks=ds.filter(x=>x.risk);
 const outstandingInfo=infoRecords.filter(x=>x.status!=="Received"&&x.status!=="No Longer Needed");
 const progress=weightedProjectProgress(p);
 const planning=displayedPhaseProgress(p,"Planning");
 const engineering=displayedPhaseProgress(p,"Engineering");
 const installation=displayedPhaseProgress(p,"Installation");
 const health=displayedProjectHealth(p);
 const generated=new Date().toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"});

 const reportEsc=value=>esc(String(value??""));
 const reportDate=value=>value?fmtDate(value):"—";

 const bulletList=(items,emptyText,renderer)=>items.length
   ? `<ul class="clean-list">${items.map(renderer).join("")}</ul>`
   : `<div class="empty">${reportEsc(emptyText)}</div>`;

 const deliverableRows=ds.map(x=>`
   <tr>
     <td>${reportEsc(x.discipline)}</td>
     <td><strong>${reportEsc(x.deliverable)}</strong>${x.current?`<div class="sub">${reportEsc(x.current)}</div>`:""}</td>
     <td>${reportEsc(x.status)}</td>
     <td>${reportEsc(x.owner||"—")}</td>
     <td>${reportEsc(x.waitingOn||"—")}</td>
     <td>${reportEsc(x.nextStep||"—")}</td>
     <td class="nowrap">${reportDate(x.date)}</td>
   </tr>`).join("");

 const infoRows=infoRecords.map(x=>`
   <tr>
     <td><strong>${reportEsc(x.item)}</strong></td>
     <td>${reportEsc(x.from||"—")}</td>
     <td>${reportEsc(x.status||"—")}</td>
     <td>${reportEsc(x.blocking||"—")}</td>
     <td class="nowrap">${reportDate(x.neededBy)}</td>
     <td>${reportEsc(x.notes||"—")}</td>
   </tr>`).join("");

 const html=`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${reportEsc(p.name)} - Project Control Report</title>
<style>
  :root{--navy:#0c2338;--blue:#145f8a;--muted:#617182;--line:#dce4ea;--soft:#f4f7f9;--red:#9c3434;--orange:#a96518;--green:#277149}
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;margin:0;color:#17212a;background:#fff;font-size:11px;line-height:1.4}
  .page{max-width:1080px;margin:0 auto;padding:28px}
  .report-header{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid var(--navy);padding-bottom:14px;margin-bottom:16px}
  h1{font-size:25px;line-height:1.1;margin:0;color:var(--navy)}
  .subtitle{font-size:12px;color:var(--muted);margin-top:5px}
  .report-meta{text-align:right;color:var(--muted);font-size:10px}
  .brand{font-weight:800;color:var(--navy);font-size:13px;margin-bottom:4px}
  .ribbon{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:14px}
  .cell{padding:10px;border-right:1px solid var(--line);min-height:60px}
  .cell:last-child{border-right:0}
  .label{text-transform:uppercase;font-size:8px;letter-spacing:.06em;color:var(--muted);font-weight:800}
  .value{font-size:12px;font-weight:750;color:var(--navy);margin-top:4px}
  .health{display:inline-block;padding:3px 7px;border:1px solid var(--line);border-radius:999px}
  .progress-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 14px}
  .progress-card{border:1px solid var(--line);border-radius:7px;padding:9px}
  .pct{font-size:20px;font-weight:800;color:var(--navy)}
  .bar{height:5px;background:#e8edf1;border-radius:999px;margin-top:6px;overflow:hidden}
  .bar span{display:block;height:100%;background:var(--blue)}
  .count-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
  .count{border:1px solid var(--line);border-radius:7px;padding:8px;text-align:center}
  .count strong{font-size:18px;color:var(--navy);display:block}
  .count span{font-size:8px;color:var(--muted);font-weight:800;letter-spacing:.05em}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
  .panel{border:1px solid var(--line);border-radius:7px;overflow:hidden;break-inside:avoid}
  .panel h2{font-size:10px;letter-spacing:.06em;margin:0;padding:8px 10px;background:var(--soft);color:var(--navy)}
  .panel-body{padding:8px 10px}
  .clean-list{padding-left:17px;margin:0}
  .clean-list li{margin:0 0 6px}
  .sub{color:var(--muted);font-size:9px;margin-top:2px}
  .empty{color:var(--muted);font-style:italic}
  .section-title{font-size:14px;color:var(--navy);border-bottom:1px solid var(--line);padding-bottom:5px;margin:18px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:9px}
  th{text-align:left;background:var(--soft);color:var(--navy);font-size:8px;text-transform:uppercase;letter-spacing:.04em;padding:6px;border:1px solid var(--line)}
  td{vertical-align:top;padding:6px;border:1px solid var(--line)}
  .nowrap{white-space:nowrap}
  .footer{margin-top:16px;padding-top:8px;border-top:1px solid var(--line);font-size:8px;color:var(--muted);display:flex;justify-content:space-between}
  @media print{
    @page{size:landscape;margin:.38in}
    .page{max-width:none;padding:0}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    thead{display:table-header-group}
    tr{break-inside:avoid}
    .panel,.progress-card,.count{break-inside:avoid}
  }
</style>
</head>
<body>
<div class="page">
  <div class="report-header">
    <div>
      <div class="brand">AHT GLOBAL · PROJECT CONTROL</div>
      <h1>${reportEsc(p.name)}</h1>
      <div class="subtitle">${reportEsc(p.subtitle||"")}</div>
    </div>
    <div class="report-meta">
      <strong>Project Report</strong><br>
      Generated ${reportEsc(generated)}<br>
      Last Updated ${reportEsc(formatLastUpdated(p))}
    </div>
  </div>

  <div class="ribbon">
    <div class="cell"><div class="label">Project Health</div><div class="value"><span class="health">${reportEsc(health)}</span></div></div>
    <div class="cell"><div class="label">Executive Lead</div><div class="value">${reportEsc(p.executiveLead||"—")}</div></div>
    <div class="cell"><div class="label">Senior Project Manager</div><div class="value">${reportEsc(p.seniorProjectManager||"—")}</div></div>
    <div class="cell"><div class="label">Project Manager / Site Lead</div><div class="value">${reportEsc(p.projectManagerSiteLead||"—")}</div></div>
    <div class="cell"><div class="label">Project Phase</div><div class="value">${reportEsc(p.phase||"—")}</div></div>
  </div>

  <div class="progress-grid">
    ${[
      ["Overall",progress],
      ["Planning",planning],
      ["Engineering",engineering],
      ["Installation",installation]
    ].map(([label,value])=>`<div class="progress-card"><div class="label">${label} Progress</div><div class="pct">${value}%</div><div class="bar"><span style="width:${value}%"></span></div></div>`).join("")}
  </div>

  <div class="count-grid">
    <div class="count"><strong>${ds.length}</strong><span>DELIVERABLES</span></div>
    <div class="count"><strong>${active}</strong><span>ACTIVE</span></div>
    <div class="count"><strong>${waiting}</strong><span>WAITING / REVIEW</span></div>
    <div class="count"><strong>${complete}</strong><span>COMPLETE</span></div>
  </div>

  <div class="grid-2">
    <div class="panel">
      <h2>CURRENT WORK</h2>
      <div class="panel-body">${bulletList(current,"No active work.",x=>`<li><strong>${reportEsc(x.deliverable)}</strong>${x.current?`<div class="sub">${reportEsc(x.current)}</div>`:""}</li>`)}</div>
    </div>
    <div class="panel">
      <h2>REQUIRED FROM OTHERS</h2>
      <div class="panel-body">${bulletList(outstandingInfo,"Nothing outstanding.",x=>`<li><strong>${reportEsc(x.item)}</strong><div class="sub">${reportEsc(x.from||"—")} · blocks ${reportEsc(x.blocking||"—")}</div></li>`)}</div>
    </div>
    <div class="panel">
      <h2>NEXT DELIVERABLES</h2>
      <div class="panel-body">${bulletList(next,"No active deliverables.",x=>`<li><strong>${reportEsc(x.deliverable)}</strong><div class="sub">${reportEsc(x.nextStep||"—")} · ${reportDate(x.date)}</div></li>`)}</div>
    </div>
    <div class="panel">
      <h2>PROJECT RISKS</h2>
      <div class="panel-body">${bulletList(risks,"No current risks.",x=>`<li>${reportEsc(x.risk)}</li>`)}</div>
    </div>
  </div>

  <div class="section-title">Deliverables</div>
  <table>
    <thead><tr><th>Discipline</th><th>Deliverable / Current Activity</th><th>Status</th><th>Owner</th><th>Waiting On</th><th>Next Step</th><th>Target</th></tr></thead>
    <tbody>${deliverableRows||'<tr><td colspan="7">No deliverables.</td></tr>'}</tbody>
  </table>

  <div class="section-title">Information Required</div>
  <table>
    <thead><tr><th>Item Needed</th><th>Requested From</th><th>Status</th><th>Blocking</th><th>Needed By</th><th>Notes</th></tr></thead>
    <tbody>${infoRows||'<tr><td colspan="6">No information requests.</td></tr>'}</tbody>
  </table>

  <div class="footer">
    <span>AHT Global · Project Control</span>
    <span>${reportEsc(p.name)} · v${reportEsc(APP_CONFIG.version)}</span>
  </div>
</div>
<script>
  window.addEventListener("load",()=>setTimeout(()=>window.print(),250));
</script>
</body>
</html>`;

 const reportWindow=window.open("","_blank");
 if(!reportWindow){
   alert("The browser blocked the Project Report window. Allow pop-ups for Project Control and try again.");
   return;
 }
 reportWindow.document.open();
 reportWindow.document.write(html);
 reportWindow.document.close();
}
'@

  Add-Content "js/dashboard.js" -Value $reportFunction
  Write-Host "PATCH: Project print-report generator"
}

# ------------------------------------------------------------------
# 3. Version bump
# ------------------------------------------------------------------

$config = Get-Content "js/config.js" -Raw

if ($config -match 'version:\s*"0\.14\.15"') {
  Write-Host "SKIP: Version already 0.14.15"
}
elseif ($config -match 'version:\s*"0\.14\.14"') {
  $config = $config -replace 'version:\s*"0\.14\.14"', 'version: "0.14.15"'
  Set-Content "js/config.js" -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.15"
}
else {
  throw "Expected current version 0.14.14 in js/config.js."
}

Write-Host ""
Write-Host "v0.14.15 Project Print / PDF Report complete."
Write-Host ""
Write-Host "Test on Port 8000:"
Write-Host " 1. Executive Summary -> select a project."
Write-Host " 2. Click Print / PDF."
Write-Host " 3. Confirm the report contains ONLY the selected project."
Write-Host " 4. Check project team, progress, counts, summary panels,"
Write-Host "    Deliverables, and Information Required."
Write-Host " 5. Cancel the print dialog until you are satisfied with the layout."
Write-Host ""
Write-Host "Do NOT commit until the report looks right."
