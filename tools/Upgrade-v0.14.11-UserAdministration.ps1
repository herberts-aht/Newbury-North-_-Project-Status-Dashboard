# Upgrade-v0.14.11-UserAdministration.ps1
# Fixes Microsoft/user-profile synchronization and cleans up the Current Dashboard Access list.
#
# Changes:
# - Removes the old Bill-specific "all projects" hardcode.
# - Normalizes legacy role names to the UI names: Editor / Viewer.
# - Ensures Editor remains editable after Microsoft sign-in.
# - Refreshes Entra group membership when a local profile needs to be matched.
# - Immediately links a newly granted AHT user to the existing local dashboard profile.
# - Makes Current Dashboard Access a bounded scroll section.
#
# No SharePoint schema/data changes.
# No Deliverables / Information Required / project-progress changes.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.11 - User Administration"
Write-Host ""

$files = @(
  "index.html",
  "js/auth.js",
  "js/microsoft-access.js",
  "css/styles.css",
  "css/mobile.css",
  "js/config.js"
)

# ------------------------------------------------------------------
# Backup
# ------------------------------------------------------------------
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.11-$stamp"
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
# 1. Remove old Bill-specific all-project hardcode.
# Bill should have exactly the projects selected in Administration.
# ------------------------------------------------------------------
Replace-Exact `
  "index.html" `
  ' user.projects=user.canAdmin||user.id==="bill"?["*"]:selected;' `
  ' user.projects=user.canAdmin?["*"]:selected;' `
  "Remove Bill all-project hardcode"

# ------------------------------------------------------------------
# 2. Microsoft access: normalize legacy role terminology.
# ------------------------------------------------------------------
$oldNormalize = '  function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }'
$newNormalize = @'
  function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
  function normalizeDashboardRole(value, isGuest = false) {
    if (isGuest) return "External Viewer";
    let role = String(value || "").trim();
    if (role === "Internal Editor") role = "Editor";
    if (role === "Executive Viewer") role = "Viewer";
    return ["Administrator", "Editor", "Viewer"].includes(role) ? role : "Viewer";
  }
'@
Replace-Exact "js/microsoft-access.js" $oldNormalize $newNormalize "Role normalization helper"

$oldCompact = @'
  function compactProfile(profile) {
    return {
      r: profile.role || (profile.entraUserType === "Guest" ? "External Viewer" : "Executive Viewer"),
      p: Array.isArray(profile.projects) ? profile.projects.filter(Boolean) : [],
      c: profile.company || (profile.entraUserType === "Guest" ? "External" : "AHT Global"),
      n: profile.name || "",
      e: normalizeEmail(profile.email)
    };
  }
'@
$newCompact = @'
  function compactProfile(profile) {
    const isGuest = String(profile.entraUserType || "").toLowerCase() === "guest";
    return {
      r: normalizeDashboardRole(profile.role, isGuest),
      p: Array.isArray(profile.projects) ? profile.projects.filter(Boolean) : [],
      c: profile.company || (isGuest ? "External" : "AHT Global"),
      n: profile.name || "",
      e: normalizeEmail(profile.email)
    };
  }
'@
Replace-Exact "js/microsoft-access.js" $oldCompact $newCompact "Store normalized dashboard roles"

# Always refresh direct group members when resolving a profile that has no Entra ID.
Replace-Exact `
  "js/microsoft-access.js" `
  '      const members = directoryMembers.length ? directoryMembers : await listGroupUsers();' `
  '      const members = await listGroupUsers();' `
  "Fresh Entra lookup during profile sync"

# Normalize shared-profile role writes.
$oldSaveForObject = @'
  async function saveProfileForObject(objectId, values) {
    sharedProfiles[objectId] = {
      r: values.role, p: values.projects || [], c: values.company || "", n: values.name || "", e: normalizeEmail(values.email)
    };
    await persistSharedProfiles();
  }
'@
$newSaveForObject = @'
  async function saveProfileForObject(objectId, values) {
    const isGuest = String(values.entraUserType || "").toLowerCase() === "guest" || values.role === "External Viewer";
    sharedProfiles[objectId] = {
      r: normalizeDashboardRole(values.role, isGuest),
      p: values.projects || [],
      c: values.company || "",
      n: values.name || "",
      e: normalizeEmail(values.email)
    };
    await persistSharedProfiles();
  }
'@
Replace-Exact "js/microsoft-access.js" $oldSaveForObject $newSaveForObject "Normalize direct Microsoft profile writes"

# Internal directory identity should use Editor / Viewer, while still accepting legacy shared values.
$oldInternalRole = @'
    } else {
      if (!["Administrator", "Internal Editor", "Executive Viewer"].includes(profile.role)) profile.role = "Executive Viewer";
      profile.canAdmin = profile.role === "Administrator";
      profile.canEdit = profile.role === "Administrator" || profile.role === "Internal Editor";
      profile.isInternal = true;
      if (profile.canAdmin) profile.projects = ["*"];
      else if (!stored && (!Array.isArray(profile.projects) || !profile.projects.length)) profile.projects = ["*"];
      profile.company = "AHT Global";
    }
'@
$newInternalRole = @'
    } else {
      profile.role = normalizeDashboardRole(profile.role, false);
      profile.canAdmin = profile.role === "Administrator";
      profile.canEdit = profile.role === "Administrator" || profile.role === "Editor";
      profile.isInternal = true;
      if (profile.canAdmin) profile.projects = ["*"];
      else if (!stored && (!Array.isArray(profile.projects) || !profile.projects.length)) profile.projects = ["*"];
      profile.company = "AHT Global";
    }
'@
Replace-Exact "js/microsoft-access.js" $oldInternalRole $newInternalRole "Use Editor / Viewer for internal Microsoft users"

# New internal user default.
Replace-Exact `
  "js/microsoft-access.js" `
  '          role: isGuest ? "External Viewer" : "Executive Viewer",' `
  '          role: isGuest ? "External Viewer" : "Viewer",' `
  "New Microsoft member default role"

Replace-Exact `
  "js/microsoft-access.js" `
  '        <td>${escText(profile?.role || (type === "External" ? "External Viewer" : "Executive Viewer"))}</td>' `
  '        <td>${escText(normalizeDashboardRole(profile?.role, type === "External"))}</td>' `
  "Current-access role display"

Replace-Exact `
  "js/microsoft-access.js" `
  '    const role = el("internalUserRole")?.value || "Executive Viewer";' `
  '    const role = el("internalUserRole")?.value || "Viewer";' `
  "Internal grant default role"

# ------------------------------------------------------------------
# 3. After Grant Dashboard Access, immediately bind the returned Entra ID
#    to any existing local dashboard profile with the same email.
#    This avoids waiting for Graph group-membership eventual consistency.
# ------------------------------------------------------------------
$oldAddInternalCore = @'
      await saveProfileForObject(user.id, { role, projects, company: "AHT Global", name: user.displayName || email, email });
      await addMemberObjectId(user.id);
      if (input) input.value = "";
'@
$newAddInternalCore = @'
      await saveProfileForObject(user.id, { role, projects, company: "AHT Global", name: user.displayName || email, email });
      await addMemberObjectId(user.id);

      const localProfile = USERS.find(item => normalizeEmail(item.email) === email);
      if (localProfile) {
        localProfile.entraObjectId = user.id;
        localProfile.entraUserType = "Member";
        localProfile.managedByEntraAccessGroup = true;
        localProfile.role = normalizeDashboardRole(role, false);
        localProfile.canAdmin = localProfile.role === "Administrator";
        localProfile.canEdit = localProfile.role === "Administrator" || localProfile.role === "Editor";
        localProfile.isInternal = true;
        localProfile.projects = [...projects];
        localProfile.active = true;
        localProfile.company = "AHT Global";
        await DataProvider.saveUsers(USERS);
      }

      if (!directoryMembers.some(item => item.id === user.id)) {
        directoryMembers.push(user);
        directoryMembers.sort((a,b) => String(a.displayName || "").localeCompare(String(b.displayName || "")));
      }

      if (input) input.value = "";
'@
Replace-Exact "js/microsoft-access.js" $oldAddInternalCore $newAddInternalCore "Bind newly granted AHT user to local profile"

# ------------------------------------------------------------------
# 4. Auth login: understand both old and new role terminology.
# ------------------------------------------------------------------
$oldAuthRole = '    const role = shared?.r || user?.role || "Executive Viewer";'
$newAuthRole = @'
    const storedRole = shared?.r || user?.role || "Viewer";
    const role = storedRole === "Internal Editor" ? "Editor" : storedRole === "Executive Viewer" ? "Viewer" : storedRole;
'@
Replace-Exact "js/auth.js" $oldAuthRole $newAuthRole "Normalize signed-in dashboard role"

Replace-Exact `
  "js/auth.js" `
  '      canEdit: role === "Administrator" || role === "Internal Editor",' `
  '      canEdit: role === "Administrator" || role === "Editor",' `
  "Editor permissions after Microsoft sign-in"

# ------------------------------------------------------------------
# 5. Bounded Current Dashboard Access list.
# ------------------------------------------------------------------
$desktopMarker = "v0.14.11 — bounded Microsoft access list"
$styles = Get-Content "css/styles.css" -Raw
if ($styles.Contains($desktopMarker)) {
  Write-Host "SKIP: Current-access desktop CSS (already applied)"
}
else {
  Add-Content "css/styles.css" @'

/* v0.14.11 — bounded Microsoft access list */
.entra-user-table-wrap{
  max-height:430px;
  overflow:auto;
  padding:4px 2px 2px;
  border-radius:8px;
  scrollbar-gutter:stable;
}
.entra-user-table-wrap .entra-table-heading{
  position:sticky;
  top:0;
  z-index:3;
  background:#fbfdff;
  padding:5px 0 8px;
}
.entra-user-table thead th{
  position:sticky;
  top:48px;
  z-index:2;
  background:#f4f8fb;
}
'@
  Write-Host "PATCH: Current-access desktop scroll section"
}

$mobileMarker = "v0.14.11 — Microsoft access list on mobile"
$mobile = Get-Content "css/mobile.css" -Raw
if ($mobile.Contains($mobileMarker)) {
  Write-Host "SKIP: Current-access mobile CSS (already applied)"
}
else {
  Add-Content "css/mobile.css" @'

/* v0.14.11 — Microsoft access list on mobile */
@media (max-width:700px){
  .entra-user-table-wrap{
    max-height:400px;
    overflow:auto;
    -webkit-overflow-scrolling:touch;
    margin-left:0;
    margin-right:0;
    padding-top:4px;
  }
  .entra-user-table{
    min-width:720px;
  }
  .entra-user-table-wrap .entra-table-heading{
    min-width:100%;
    padding-left:2px;
    padding-right:2px;
  }
}
'@
  Write-Host "PATCH: Current-access mobile scroll section"
}

# ------------------------------------------------------------------
# 6. Version bump
# ------------------------------------------------------------------
$config = Get-Content "js/config.js" -Raw
if ($config -match 'version:\s*"0\.14\.11"') {
  Write-Host "SKIP: Version already 0.14.11"
}
elseif ($config -match 'version:\s*"0\.14\.10"') {
  $config = $config -replace 'version:\s*"0\.14\.10"', 'version: "0.14.11"'
  Set-Content "js/config.js" -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.11"
}
else {
  throw "Expected current version 0.14.10 in js/config.js."
}

Write-Host ""
Write-Host "v0.14.11 User Administration patch complete."
Write-Host ""
Write-Host "Test Bill first:"
Write-Host "  1. Open Bill in Dashboard Role / Project Assignment."
Write-Host "  2. Change Editor -> Viewer and remove one project."
Write-Host "  3. Save User."
Write-Host "  4. Confirm there is no Microsoft profile-sync error."
Write-Host "  5. Re-open Bill and verify the role/project change persisted."
Write-Host ""
Write-Host "Do NOT commit until Bill passes this test."
