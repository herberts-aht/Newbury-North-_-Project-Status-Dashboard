# Upgrade-v0.14.23-FinalAccessProvisioning.ps1
# Consolidated rollout patch for Project Control access.
#
# Final model:
#   - Project Control Access group (cb2b...) = dashboard gate + SharePoint Visitor/Read
#   - Newbury North group (52c6...)          = SharePoint Member/Edit
#   - Viewer                               = access group only
#   - Editor / Administrator                = access group + Newbury North edit group
#   - Role changes automatically add/remove edit-group membership
#   - Removing Project Control access also removes edit-group membership
#   - Deleted projects are removed from Microsoft sharedProfiles as well
#
# This script only patches app code/config. Existing SharePoint group nesting
# already completed through PnP is not recreated here.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.23 - Final Access Provisioning"
Write-Host ""

$files = @(
  "js/config.js",
  "js/microsoft-access.js",
  "index.html"
)

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.23-final-access-$stamp"
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
    throw "Could not find expected code for '$Label' in $Path"
  }

  $text = $text.Replace($Old,$New)
  Set-Content $Path -Value $text -NoNewline
  Write-Host "PATCH:" $Label
}

# ------------------------------------------------------------------
# 1. Config: add the Entra group that already maps to SharePoint Members/Edit
# ------------------------------------------------------------------
$configPath = "js/config.js"
$config = Get-Content $configPath -Raw

if ($config -notmatch 'editAccessGroupId:\s*"52c62197-dae3-4b48-be7f-11c3c875cffc"') {
  $old = @'
    accessGroupId: "cb2b8e45-9b5b-4cb3-a24d-4ca2f3c63d69",
'@

  $new = @'
    accessGroupId: "cb2b8e45-9b5b-4cb3-a24d-4ca2f3c63d69",

    // Existing Entra group already nested in "Newbury North Members" in SharePoint.
    // Editor / Administrator roles are synchronized into this group for Edit rights.
    editAccessGroupId: "52c62197-dae3-4b48-be7f-11c3c875cffc",
'@

  if (-not $config.Contains($old)) {
    throw "Could not find accessGroupId in js/config.js."
  }

  $config = $config.Replace($old,$new)
  Set-Content $configPath -Value $config -NoNewline
  Write-Host "PATCH: Added SharePoint Edit Entra group ID"
} else {
  Write-Host "SKIP: SharePoint Edit Entra group ID already configured"
}

# ------------------------------------------------------------------
# 2. MicrosoftAccess: helper for edit group id
# ------------------------------------------------------------------
$oldGroupHelpers = @'
  function groupId() { return APP_CONFIG.entra.accessGroupId || ""; }
  function managementScopes() { return APP_CONFIG.entra.accessManagementScopes || []; }
'@

$newGroupHelpers = @'
  function groupId() { return APP_CONFIG.entra.accessGroupId || ""; }
  function editGroupId() { return APP_CONFIG.entra.editAccessGroupId || ""; }
  function managementScopes() { return APP_CONFIG.entra.accessManagementScopes || []; }
'@

Replace-Exact "js/microsoft-access.js" $oldGroupHelpers $newGroupHelpers "Edit-group config helper"

# ------------------------------------------------------------------
# 3. MicrosoftAccess: add generalized membership synchronization.
# Place immediately before addMemberObjectId().
# ------------------------------------------------------------------
$oldAddMemberStart = @'
  async function addMemberObjectId(objectId) {
'@

$newAddMemberStart = @'
  async function groupHasMember(targetGroupId, objectId) {
    if (!targetGroupId || !objectId) return false;

    let url =
      `/groups/${encodeURIComponent(targetGroupId)}/members` +
      `?$select=id&$top=999`;

    while (url) {
      const data = await graph(url);
      if ((data.value || []).some(item => String(item.id) === String(objectId))) {
        return true;
      }
      url = data["@odata.nextLink"] || "";
    }

    return false;
  }

  async function syncSharePointEditAccess(objectId, role) {
    const targetGroupId = editGroupId();
    if (!targetGroupId || !objectId) return;

    const normalizedRole = normalizeDashboardRole(role, false);
    const needsEdit =
      normalizedRole === "Administrator" ||
      normalizedRole === "Editor";

    const isMember = await groupHasMember(targetGroupId, objectId);

    if (needsEdit && !isMember) {
      await graph(`/groups/${encodeURIComponent(targetGroupId)}/members/$ref`, {
        method: "POST",
        body: JSON.stringify({
          "@odata.id": `${GRAPH}/directoryObjects/${objectId}`
        })
      });
    }

    if (!needsEdit && isMember) {
      await graph(
        `/groups/${encodeURIComponent(targetGroupId)}/members/${encodeURIComponent(objectId)}/$ref`,
        { method: "DELETE" }
      );
    }
  }

  async function addMemberObjectId(objectId) {
'@

Replace-Exact "js/microsoft-access.js" $oldAddMemberStart $newAddMemberStart "Editor/Admin SharePoint permission synchronization"

# ------------------------------------------------------------------
# 4. Saving any dashboard profile synchronizes SharePoint Edit rights.
# This covers Viewer <-> Editor/Admin role changes from Administration.
# ------------------------------------------------------------------
$oldSaveProfileEnd = @'
    sharedProfiles[objectId] = compactProfile(profile);
    await persistSharedProfiles();
  }
'@

$newSaveProfileEnd = @'
    sharedProfiles[objectId] = compactProfile(profile);
    await persistSharedProfiles();

    if (String(profile.entraUserType || "").toLowerCase() !== "guest") {
      await syncSharePointEditAccess(objectId, profile.role);
    }
  }
'@

Replace-Exact "js/microsoft-access.js" $oldSaveProfileEnd $newSaveProfileEnd "Role-change SharePoint permission sync"

# ------------------------------------------------------------------
# 5. Add Internal flow: synchronize edit access immediately.
# ------------------------------------------------------------------
$oldInternalProvision = @'
      await saveProfileForObject(user.id, { role, projects, company: "AHT Global", name: user.displayName || email, email });
      await addMemberObjectId(user.id);

      const localProfile = USERS.find(item => normalizeEmail(item.email) === email);
'@

$newInternalProvision = @'
      await saveProfileForObject(user.id, { role, projects, company: "AHT Global", name: user.displayName || email, email });
      await addMemberObjectId(user.id);
      await syncSharePointEditAccess(user.id, role);

      const localProfile = USERS.find(item => normalizeEmail(item.email) === email);
'@

Replace-Exact "js/microsoft-access.js" $oldInternalProvision $newInternalProvision "Add Internal role-based SharePoint permission"

# ------------------------------------------------------------------
# 6. Remove Project Control access: also remove SharePoint Edit membership.
# ------------------------------------------------------------------
$oldRemoveAccess = @'
      await graph(`/groups/${encodeURIComponent(groupId())}/members/${encodeURIComponent(objectId)}/$ref`, { method: "DELETE" });
      if (sharedProfiles[objectId]) { delete sharedProfiles[objectId]; await persistSharedProfiles(); }
'@

$newRemoveAccess = @'
      await graph(`/groups/${encodeURIComponent(groupId())}/members/${encodeURIComponent(objectId)}/$ref`, { method: "DELETE" });
      await syncSharePointEditAccess(objectId, "Viewer");
      if (sharedProfiles[objectId]) { delete sharedProfiles[objectId]; await persistSharedProfiles(); }
'@

Replace-Exact "js/microsoft-access.js" $oldRemoveAccess $newRemoveAccess "Remove stale SharePoint Edit access"

# ------------------------------------------------------------------
# 7. Ensure project deletion cleans Microsoft sharedProfiles.
# The user already added removeProjectFromProfiles(); this wires it into delete.
# ------------------------------------------------------------------
$indexPath = "index.html"
$index = Get-Content $indexPath -Raw

$projectCleanupCall = @'
     if(typeof window.MicrosoftAccess?.removeProjectFromProfiles==="function"){
       await window.MicrosoftAccess.removeProjectFromProfiles(project.id);
     }
'@

if (-not $index.Contains($projectCleanupCall)) {
  $oldDeleteBridge = @'
     if(typeof DataProvider?.deleteProject==="function"){
       await DataProvider.deleteProject(project);
     }else{
       throw new Error("The active data provider does not support project deletion.");
     }

     // Remove explicit local/dashboard assignments. "*" remains all projects.
'@

  $newDeleteBridge = @'
     if(typeof DataProvider?.deleteProject==="function"){
       await DataProvider.deleteProject(project);
     }else{
       throw new Error("The active data provider does not support project deletion.");
     }

     // Remove the project from Microsoft sharedProfiles too, so a later
     // Microsoft Access refresh cannot restore a stale ProjectKey.
     if(typeof window.MicrosoftAccess?.removeProjectFromProfiles==="function"){
       await window.MicrosoftAccess.removeProjectFromProfiles(project.id);
     }

     // Remove explicit local/dashboard assignments. "*" remains all projects.
'@

  if (-not $index.Contains($oldDeleteBridge)) {
    throw "Could not find the Project Delete bridge in index.html."
  }

  $index = $index.Replace($oldDeleteBridge,$newDeleteBridge)
  Set-Content $indexPath -Value $index -NoNewline
  Write-Host "PATCH: Project deletion cleans Microsoft sharedProfiles"
} else {
  Write-Host "SKIP: Project deletion already cleans Microsoft sharedProfiles"
}

# ------------------------------------------------------------------
# 8. Ensure removeProjectFromProfiles exists and is exported.
# ------------------------------------------------------------------
$msPath = "js/microsoft-access.js"
$ms = Get-Content $msPath -Raw

if ($ms -notmatch 'async function removeProjectFromProfiles\(projectId\)') {
  $oldSelected = @'
  function selectedProjects(containerId) {
'@

  $newSelected = @'
  async function removeProjectFromProfiles(projectId) {
    if (!currentUser?.canAdmin || !projectId) return;

    await loadSharedProfiles();

    let changed = false;

    Object.keys(sharedProfiles).forEach(objectId => {
      const profile = sharedProfiles[objectId];
      if (!profile || !Array.isArray(profile.p) || profile.p.includes("*")) return;

      const updated = profile.p.filter(id => id !== projectId);

      if (updated.length !== profile.p.length) {
        profile.p = updated;
        changed = true;
      }
    });

    if (changed) {
      await persistSharedProfiles();
    }
  }

  function selectedProjects(containerId) {
'@

  if (-not $ms.Contains($oldSelected)) {
    throw "Could not add removeProjectFromProfiles to microsoft-access.js."
  }

  $ms = $ms.Replace($oldSelected,$newSelected)
  Set-Content $msPath -Value $ms -NoNewline
  Write-Host "PATCH: Added Microsoft shared-profile project cleanup function"
}

$ms = Get-Content $msPath -Raw
$oldExport = @'
  return { initialize, onAdminView, refresh, saveDashboardProfile, renderInviteProjects };
'@
$newExport = @'
  return { initialize, onAdminView, refresh, saveDashboardProfile, removeProjectFromProfiles, renderInviteProjects };
'@

if ($ms.Contains($oldExport)) {
  $ms = $ms.Replace($oldExport,$newExport)
  Set-Content $msPath -Value $ms -NoNewline
  Write-Host "PATCH: Exported removeProjectFromProfiles"
} elseif ($ms.Contains($newExport)) {
  Write-Host "SKIP: removeProjectFromProfiles already exported"
} else {
  throw "Could not verify MicrosoftAccess export block."
}

# ------------------------------------------------------------------
# 9. Version bump
# ------------------------------------------------------------------
$config = Get-Content $configPath -Raw

if ($config -match 'version:\s*"0\.14\.23"') {
  Write-Host "SKIP: Version already 0.14.23"
}
elseif ($config -match 'version:\s*"0\.14\.22"') {
  $config = $config -replace 'version:\s*"0\.14\.22"', 'version: "0.14.23"'
  Set-Content $configPath -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.23"
}
else {
  Write-Warning "Could not automatically bump version because current version was not 0.14.22. Check js/config.js manually."
}

Write-Host ""
Write-Host "v0.14.23 consolidated access provisioning patch complete."
Write-Host ""
Write-Host "FINAL MODEL:"
Write-Host "  Viewer              -> Project Control Access only (SharePoint Read via Visitors)"
Write-Host "  Editor/Administrator -> Project Control Access + Newbury North edit group"
Write-Host "  Role downgrade       -> removes Newbury North edit-group membership"
Write-Host "  Remove Access        -> removes both dashboard access and edit-group membership"
Write-Host "  Delete Project       -> cleans SharePoint, USERS, and Microsoft sharedProfiles"
Write-Host ""
Write-Host "DO NOT COMMIT YET."
Write-Host "Next: test with one temporary/internal account before asking Bill to sign in."
