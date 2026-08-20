# Upgrade-v0.14.22-ProjectDelete.ps1
# Completes v0.14.22 by adding Administrator-only permanent Project deletion.
#
# Delete Project cleans:
# - SharePoint Deliverables for the project
# - SharePoint Information Required for the project
# - SharePoint Projects row
# - Explicit Dashboard Access ProjectKeys references
# - Local/dashboard user project assignments
# - Dashboard project state
#
# Users assigned "*" (all projects) remain "*".
# Intended first test: 9999 Test Gordon Dr
#
# No version bump: this is part of uncommitted v0.14.22.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.22 - Project Delete"
Write-Host ""

$files = @("index.html","js/data-provider.js")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.22-delete-$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

foreach ($file in $files) {
  if (-not (Test-Path $file)) { throw "Missing required file: $file" }
  $dest = Join-Path $backupDir $file
  $destDir = Split-Path $dest -Parent
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  Copy-Item $file $dest -Force
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
    throw "Could not find expected code for: $Label in $Path"
  }

  $text = $text.Replace($Old,$New)
  Set-Content $Path -Value $text -NoNewline
  Write-Host "PATCH:" $Label
}

# ------------------------------------------------------------------
# 1. SharePoint deleteItem helper
# ------------------------------------------------------------------
$oldUpdateItem = @'
  async updateItem(displayName, itemId, fields) {
    const site = await this.getSite();
    const listId = await this.getListId(displayName);
    return this.graph(
      `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}/fields`,
      { method: "PATCH", body: JSON.stringify(fields) }
    );
  },
'@

$newUpdateItem = @'
  async updateItem(displayName, itemId, fields) {
    const site = await this.getSite();
    const listId = await this.getListId(displayName);
    return this.graph(
      `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}/fields`,
      { method: "PATCH", body: JSON.stringify(fields) }
    );
  },

  async deleteItem(displayName, itemId) {
    if (!itemId) return;
    const site = await this.getSite();
    const listId = await this.getListId(displayName);
    await this.graph(
      `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
      { method: "DELETE" }
    );
  },
'@

Replace-Exact "js/data-provider.js" $oldUpdateItem $newUpdateItem "SharePoint deleteItem helper"

# ------------------------------------------------------------------
# 2. SharePoint permanent project deletion
# Insert just before getDashboardAccessRows()
# ------------------------------------------------------------------
$oldBeforeAccess = @'
  async getDashboardAccessRows() {
'@

$newBeforeAccess = @'
  async deleteProject(project) {
    if (!project) throw new Error("Project was not supplied for deletion.");

    // Delete child records first so SharePoint lookup relationships cannot
    // leave orphaned records behind.
    for (const record of project.deliverables || []) {
      const itemId = record.sharePointId || record.id;
      if (itemId) {
        await this.deleteItem(this.config.lists.deliverables, itemId);
      }
    }

    for (const record of project.info || []) {
      const itemId = record.sharePointId || record.id;
      if (itemId) {
        await this.deleteItem(this.config.lists.informationRequired, itemId);
      }
    }

    // Remove the project row itself.
    if (project.sharePointId) {
      await this.deleteItem(this.config.lists.projects, project.sharePointId);
    }

    // Remove this project key from users with explicit assignments.
    // "*" remains all-project access and needs no change.
    const accessRows = await this.getDashboardAccessRows();

    for (const row of accessRows) {
      const raw = String(row.fields?.ProjectKeys || "").trim();
      if (!raw || raw === "*") continue;

      const keys = raw
        .split(/[;,|]/)
        .map(value => value.trim())
        .filter(Boolean);

      if (!keys.includes(project.id)) continue;

      const updated = keys
        .filter(value => value !== project.id)
        .join(";");

      await this.updateItem(
        this.config.lists.dashboardAccess,
        row.id,
        { ProjectKeys: updated }
      );
    }
  },

  async getDashboardAccessRows() {
'@

Replace-Exact "js/data-provider.js" $oldBeforeAccess $newBeforeAccess "SharePoint project deletion"

# ------------------------------------------------------------------
# 3. Fallback provider delegates project deletion to SharePoint when available
# ------------------------------------------------------------------
$oldFallbackSaveState = @'
  async saveState(nextState) {
    if (this.fallbackWasUsed) {
      return LocalStorageDataProvider.saveState(nextState);
    }
    return SharePointDataProvider.saveState(nextState);
  },
'@

$newFallbackSaveState = @'
  async saveState(nextState) {
    if (this.fallbackWasUsed) {
      return LocalStorageDataProvider.saveState(nextState);
    }
    return SharePointDataProvider.saveState(nextState);
  },

  async deleteProject(project) {
    if (this.fallbackWasUsed) return;
    return SharePointDataProvider.deleteProject(project);
  },
'@

Replace-Exact "js/data-provider.js" $oldFallbackSaveState $newFallbackSaveState "Fallback project-delete bridge"

# ------------------------------------------------------------------
# 4. Always configure modal Delete button for the current record type.
# Insert immediately before modalBackdrop display.
# ------------------------------------------------------------------
$oldModalDisplay = @'
  modalBackdrop.style.display="flex";
'@

$newModalDisplay = @'
  const canDeleteCurrent =
    Boolean(editContext?.id) &&
    (
      editContext.type === "project"
        ? Boolean(currentUser?.canAdmin)
        : Boolean(currentUser?.canEdit)
    );

  deleteRecordBtn.classList.toggle("hidden", !canDeleteCurrent);
  deleteRecordBtn.textContent =
    editContext.type === "project" ? "Delete Project" : "Delete";

  modalBackdrop.style.display="flex";
'@

Replace-Exact "index.html" $oldModalDisplay $newModalDisplay "Project-aware Delete button"

# ------------------------------------------------------------------
# 5. Replace existing delete handler with project-aware async handler
# ------------------------------------------------------------------
$oldDeleteHandler = @'
deleteRecordBtn.onclick=()=>{
 if(!currentUser.canEdit||!editContext?.id)return;
 const p=currentProject(),arr=editContext.type==="deliverable"?p.deliverables:p.info;
 const i=arr.findIndex(x=>x.id===editContext.id);
 if(i<0)return;
 const record=arr[i],name=record.deliverable||record.item;
 if(!confirm(`Delete "${name}"? This will be recorded in the change log.`))return;
 arr.splice(i,1);
 touchProject(p);
 logChange("Delete",p.id,editContext.type==="deliverable"?"Deliverable":"Information Request",name,"Record deleted.");
 modalBackdrop.style.display="none";save();
};
'@

$newDeleteHandler = @'
deleteRecordBtn.onclick=async()=>{
 if(!editContext?.id)return;

 if(editContext.type==="project"){
   if(!currentUser?.canAdmin)return;

   const i=state.projects.findIndex(x=>x.id===editContext.id);
   if(i<0)return;

   const project=state.projects[i];
   const name=project.name||project.address||project.id;

   if(!confirm(
     `Permanently delete "${name}"?\n\n`+
     `This removes the project, its Deliverables, its Information Required records, `+
     `and explicit user project assignments from Project Control and SharePoint.\n\n`+
     `This cannot be undone.`
   ))return;

   const typed=prompt(`Type DELETE to permanently remove "${name}".`);
   if(String(typed||"").trim().toUpperCase()!=="DELETE")return;

   deleteRecordBtn.disabled=true;
   deleteRecordBtn.textContent="Deleting...";

   try{
     if(typeof DataProvider?.deleteProject==="function"){
       await DataProvider.deleteProject(project);
     }else{
       throw new Error("The active data provider does not support project deletion.");
     }

     // Remove explicit local/dashboard assignments. "*" remains all projects.
     USERS.forEach(user=>{
       if(user.projects?.includes("*"))return;
       user.projects=(user.projects||[]).filter(projectId=>projectId!==project.id);
     });

     logChange(
       "Delete",
       project.id,
       "Project",
       name,
       "Project permanently deleted with child records and explicit access assignments."
     );

     state.projects.splice(i,1);

     if(state.currentProjectId===project.id){
       state.currentProjectId=state.projects.find(x=>!x.archived)?.id||state.projects[0]?.id||"";
     }

     modalBackdrop.style.display="none";
     await save();
     render();
     alert(`"${name}" was permanently deleted.`);
   }catch(error){
     console.error("Project deletion failed.",error);
     alert(`Project deletion failed: ${error?.message||error}`);
     deleteRecordBtn.disabled=false;
     deleteRecordBtn.textContent="Delete Project";
   }

   return;
 }

 if(!currentUser?.canEdit)return;

 const p=currentProject();
 const arr=editContext.type==="deliverable"?p.deliverables:p.info;
 const i=arr.findIndex(x=>x.id===editContext.id);
 if(i<0)return;

 const record=arr[i],name=record.deliverable||record.item;
 if(!confirm(`Delete "${name}"? This will be recorded in the change log.`))return;

 arr.splice(i,1);
 touchProject(p);
 logChange(
   "Delete",
   p.id,
   editContext.type==="deliverable"?"Deliverable":"Information Request",
   name,
   "Record deleted."
 );
 modalBackdrop.style.display="none";
 save();
};
'@

Replace-Exact "index.html" $oldDeleteHandler $newDeleteHandler "Administrator-only permanent Delete Project"

Write-Host ""
Write-Host "v0.14.22 Project Delete patch complete."
Write-Host ""
Write-Host "TEST WITH 9999 TEST GORDON DR:"
Write-Host " 1. Refresh Port 8000."
Write-Host " 2. Edit 9999 Test Gordon Dr."
Write-Host " 3. Confirm the red button says Delete Project."
Write-Host " 4. Click it, confirm, then type DELETE."
Write-Host " 5. Confirm the project disappears from the dashboard."
Write-Host " 6. Wait for sync, then confirm it is gone from SharePoint Projects."
Write-Host " 7. Confirm its key is gone from Bill/Shaun explicit ProjectKeys."
Write-Host ""
Write-Host "Do NOT commit until all three cleanup checks pass."
