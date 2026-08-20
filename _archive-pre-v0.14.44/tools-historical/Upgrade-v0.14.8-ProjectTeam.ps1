# Upgrade-v0.14.8-ProjectTeam.ps1
# Adds project-specific Executive Lead, Senior Project Manager, and Project Manager / Site Lead.
# Run from the project root in the PnP-authenticated PowerShell terminal.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.8 - Project Team upgrade"
Write-Host ""

# ---------- 1. SharePoint schema ----------
$projectFields = @(
    @{ InternalName = "ExecutiveLead";          DisplayName = "Executive Lead" },
    @{ InternalName = "SeniorProjectManager";   DisplayName = "Senior Project Manager" },
    @{ InternalName = "ProjectManagerSiteLead"; DisplayName = "Project Manager / Site Lead" }
)

foreach ($f in $projectFields) {
    $existing = Get-PnPField -List "Projects" -Identity $f.InternalName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "SKIP SharePoint field:" $f.DisplayName
    } else {
        Add-PnPField -List "Projects" -DisplayName $f.DisplayName -InternalName $f.InternalName -Type Text | Out-Null
        Write-Host "ADD  SharePoint field:" $f.DisplayName
    }
}

# ---------- 2. Back up code ----------
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.8-$stamp"
New-Item -ItemType Directory -Path $backupDir | Out-Null
Copy-Item "index.html" "$backupDir/index.html"
Copy-Item "js/dashboard.js" "$backupDir/dashboard.js"
Copy-Item "js/data-provider.js" "$backupDir/data-provider.js"
Copy-Item "js/config.js" "$backupDir/config.js"
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
        Write-Host "SKIP code patch:" $Label
        return
    }
    if (-not $text.Contains($Old)) {
        throw "Could not find expected code for patch: $Label in $Path. No further code changes were made for this patch."
    }
    $text = $text.Replace($Old, $New)
    Set-Content -Path $Path -Value $text -NoNewline
    Write-Host "PATCH:" $Label
}

# ---------- 3. Summary UI ----------
$old = '<div class="summary-cell"><div class="label">Project Lead</div><div class="value">Stacy Herbert</div></div>'
$new = @'
<div class="summary-cell"><div class="label">Executive Lead</div><div class="value" id="summaryExecutiveLead">—</div></div>
        <div class="summary-cell"><div class="label">Senior Project Manager</div><div class="value" id="summarySeniorProjectManager">—</div></div>
        <div class="summary-cell"><div class="label">Project Manager / Site Lead</div><div class="value" id="summaryProjectManagerSiteLead">—</div></div>
'@
Replace-Exact "index.html" $old $new "Summary project-team fields"

# ---------- 4. Project modal: selectable internal team ----------
$old = 'function dateField(name,label,val){return `<div class="field"><label>${label}</label><input type="date" name="${name}" value="${esc(val??"")}"></div>`}'
$new = @'
function dateField(name,label,val){return `<div class="field"><label>${label}</label><input type="date" name="${name}" value="${esc(val??"")}"></div>`}
function projectTeamField(name,label,val){
 const users=USERS.filter(u=>u.isInternal&&u.active!==false).slice().sort((a,b)=>a.name.localeCompare(b.name));
 return `<div class="field"><label>${label}</label><select name="${name}"><option value="">— Unassigned —</option>${users.map(u=>`<option value="${esc(u.name)}" ${u.name===val?"selected":""}>${esc(u.name)}</option>`).join("")}</select></div>`;
}
'@
Replace-Exact "index.html" $old $new "Project-team selector helper"

$old = '    ${field("description","Builder / Client",d.description||((d.subtitle||"").includes("·")?(d.subtitle.split("·")[1]||"").trim():""),"full")}'
$new = @'
    ${field("description","Builder / Client",d.description||((d.subtitle||"").includes("·")?(d.subtitle.split("·")[1]||"").trim():""),"full")}
    ${projectTeamField("executiveLead","Executive Lead",d.executiveLead||"")}
    ${projectTeamField("seniorProjectManager","Senior Project Manager",d.seniorProjectManager||"")}
    ${projectTeamField("projectManagerSiteLead","Project Manager / Site Lead",d.projectManagerSiteLead||"")}
'@
Replace-Exact "index.html" $old $new "Project modal team selectors"

# Existing-project save
$old = '     p.description=description;'
$new = @'
     p.description=description;
     p.executiveLead=String(obj.executiveLead||"").trim();
     p.seniorProjectManager=String(obj.seniorProjectManager||"").trim();
     p.projectManagerSiteLead=String(obj.projectManagerSiteLead||"").trim();
'@
Replace-Exact "index.html" $old $new "Save team on existing project"

# New-project object
$old = '       description,'
$new = @'
       description,
       executiveLead:String(obj.executiveLead||"").trim(),
       seniorProjectManager:String(obj.seniorProjectManager||"").trim(),
       projectManagerSiteLead:String(obj.projectManagerSiteLead||"").trim(),
'@
Replace-Exact "index.html" $old $new "Save team on new project"

# ---------- 5. Dashboard rendering ----------
$old = 'summaryUpdated.textContent=formatLastUpdated(p);summaryAccess.textContent=currentUser.canAdmin?"Administrator":currentUser.canEdit?"Editor":"Viewer";'
$new = 'summaryExecutiveLead.textContent=p.executiveLead||"—";summarySeniorProjectManager.textContent=p.seniorProjectManager||"—";summaryProjectManagerSiteLead.textContent=p.projectManagerSiteLead||"—";summaryUpdated.textContent=formatLastUpdated(p);summaryAccess.textContent=currentUser.canAdmin?"Administrator":currentUser.canEdit?"Editor":"Viewer";'
Replace-Exact "js/dashboard.js" $old $new "Render project team on Summary"

$old = '<div><span class="small">Phase</span><br><strong>${esc(p.phase||"Planning")}</strong></div>'
$new = @'
<div><span class="small">Phase</span><br><strong>${esc(p.phase||"Planning")}</strong><div class="small">${esc(p.executiveLead||"No Executive Lead")} · ${esc(p.seniorProjectManager||"No SPM")}</div></div>
'@
Replace-Exact "js/dashboard.js" $old $new "Show team in Administration project row"

# ---------- 6. SharePoint provider read/write ----------
$old = '          phase: fields.ProjectPhase || "",'
$new = @'
          phase: fields.ProjectPhase || "",
          executiveLead: fields.ExecutiveLead || "",
          seniorProjectManager: fields.SeniorProjectManager || "",
          projectManagerSiteLead: fields.ProjectManagerSiteLead || "",
'@
Replace-Exact "js/data-provider.js" $old $new "Read project team from SharePoint"

$old = '      ProjectPhase: project.phase || "",'
$new = @'
      ProjectPhase: project.phase || "",
      ExecutiveLead: project.executiveLead || "",
      SeniorProjectManager: project.seniorProjectManager || "",
      ProjectManagerSiteLead: project.projectManagerSiteLead || "",
'@
Replace-Exact "js/data-provider.js" $old $new "Write project team to SharePoint"

# ---------- 7. Version ----------
$config = Get-Content "js/config.js" -Raw
if ($config -match 'version:\s*"0\.14\.8"') {
    Write-Host "SKIP version: already 0.14.8"
} elseif ($config -match 'version:\s*"0\.14\.7"') {
    $config = $config -replace 'version:\s*"0\.14\.7"', 'version: "0.14.8"'
    Set-Content "js/config.js" -Value $config -NoNewline
    Write-Host "PATCH: version 0.14.8"
} else {
    throw "Expected current version 0.14.7 in js/config.js."
}

Write-Host ""
Write-Host "v0.14.8 code/schema upgrade complete."
Write-Host "Next: refresh Port 8000, open Administration, edit each project, and choose the three team roles."
Write-Host "Do NOT commit until the Summary and Admin project editor are tested."
