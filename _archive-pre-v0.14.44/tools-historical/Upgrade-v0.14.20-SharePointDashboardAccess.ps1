# Upgrade-v0.14.20-SharePointDashboardAccess.ps1
# Makes the SharePoint "Dashboard Access" list the persistent source for
# INTERNAL AHT user role/project assignments.
#
# Why:
# - Project data already lives in SharePoint.
# - Internal dashboard users were still being saved only to browser localStorage.
# - That is why an admin could see Shaun's assigned projects while Shaun saw none.
#
# External/guest access continues to use the existing Entra group profile store.
#
# No project/deliverable data changes.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.20 - SharePoint Dashboard Access"
Write-Host ""

$files = @(
  "js/config.js",
  "js/data-provider.js",
  "js/auth.js"
)

# ------------------------------------------------------------------
# Backup
# ------------------------------------------------------------------
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.20-$stamp"
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
# 1. Register the Dashboard Access SharePoint list in config.
# ------------------------------------------------------------------
Replace-Exact `
  "js/config.js" `
  '      informationRequired: "Information Required",`n      changeLog: "Change Log"' `
  '      informationRequired: "Information Required",`n      dashboardAccess: "Dashboard Access",`n      changeLog: "Change Log"' `
  "Dashboard Access list configuration"

# ------------------------------------------------------------------
# 2. Replace SharePoint user persistence.
#
# Internal users:
#   ProfileKey, DisplayName, Company, DashboardRole, ProjectKeys,
#   Active, EntraObjectId, EntraUserType
#
# ProjectKeys stores the exact dashboard project IDs separated by semicolons.
# ------------------------------------------------------------------

$dataPath = "js/data-provider.js"
$data = Get-Content $dataPath -Raw

$oldUserMethods = @'
  async loadUsers() {
    return LocalStorageDataProvider.loadUsers();
  },

  async saveUsers(nextUsers) {
    return LocalStorageDataProvider.saveUsers(nextUsers);
  }
'@

$newUserMethods = @'
  async getDashboardAccessRows() {
    const listName = this.config.lists.dashboardAccess || "Dashboard Access";
    return this.getListRows(listName, [
      "Title","ProfileKey","DisplayName","Company","DashboardRole",
      "ProjectKeys","Active","EntraObjectId","EntraUserType"
    ]);
  },

  dashboardAccessUser(item) {
    const fields = item.fields || {};
    const role = fields.DashboardRole || "Viewer";
    const projects = String(fields.ProjectKeys || "")
      .split(/[;,|]/)
      .map(value => value.trim())
      .filter(Boolean);

    return {
      id: fields.ProfileKey || `sp-access-${item.id}`,
      sharePointAccessId: Number(item.id),
      name: fields.DisplayName || fields.Title || "AHT User",
      email: "",
      company: fields.Company || "AHT Global",
      role,
      active: fields.Active !== false,
      projects,
      entraObjectId: fields.EntraObjectId || "",
      entraUserType: fields.EntraUserType || "Member",
      managedByEntraAccessGroup: Boolean(fields.EntraObjectId),
      canAdmin: role === "Administrator",
      canEdit: role === "Administrator" || role === "Editor",
      isInternal: String(fields.EntraUserType || "Member").toLowerCase() !== "guest"
    };
  },

  async getDashboardAccessProfile(graphUser) {
    if (!graphUser?.id) return null;

    const rows = await this.getDashboardAccessRows();
    const objectId = String(graphUser.id || "").trim().toLowerCase();
    const displayName = String(graphUser.displayName || "").trim().toLowerCase();

    let row = rows.find(item =>
      String(item.fields?.EntraObjectId || "").trim().toLowerCase() === objectId
    );

    if (!row && displayName) {
      row = rows.find(item =>
        String(item.fields?.DisplayName || item.fields?.Title || "").trim().toLowerCase() === displayName
      );
    }

    if (!row) return null;

    const user = this.dashboardAccessUser(row);
    return {
      r: user.role,
      p: user.projects,
      c: user.company,
      n: user.name,
      e: "",
      entraObjectId: user.entraObjectId,
      active: user.active
    };
  },

  async loadUsers() {
    // Startup happens before Microsoft authentication, so preserve the local
    // profile cache here. Signed-in internal users are resolved from the
    // SharePoint Dashboard Access list in auth.js after MSAL is ready.
    return LocalStorageDataProvider.loadUsers();
  },

  async saveUsers(nextUsers) {
    // Keep the local cache for fast startup/admin rendering.
    await LocalStorageDataProvider.saveUsers(nextUsers);

    const listName = this.config.lists.dashboardAccess || "Dashboard Access";
    const rows = await this.getDashboardAccessRows();

    const byProfileKey = new Map();
    const byObjectId = new Map();

    rows.forEach(item => {
      const profileKey = String(item.fields?.ProfileKey || "").trim().toLowerCase();
      const objectId = String(item.fields?.EntraObjectId || "").trim().toLowerCase();
      if (profileKey) byProfileKey.set(profileKey, item);
      if (objectId) byObjectId.set(objectId, item);
    });

    // External/Guest users stay in the existing Entra profile store.
    const internalUsers = (nextUsers || []).filter(user =>
      user &&
      user.isInternal !== false &&
      user.role !== "External Viewer" &&
      String(user.entraUserType || "Member").toLowerCase() !== "guest"
    );

    for (const user of internalUsers) {
      const profileKey = String(user.id || "").trim();
      if (!profileKey) continue;

      const objectId = String(user.entraObjectId || "").trim();
      const role = user.canAdmin ? "Administrator" :
        (user.role === "Editor" || user.canEdit ? "Editor" : "Viewer");

      const fields = {
        Title: user.name || profileKey,
        ProfileKey: profileKey,
        DisplayName: user.name || profileKey,
        Company: user.company || "AHT Global",
        DashboardRole: role,
        ProjectKeys: Array.isArray(user.projects)
          ? user.projects.filter(Boolean).join(";")
          : "",
        Active: user.active !== false,
        EntraObjectId: objectId,
        EntraUserType: "Member"
      };

      const existing =
        (objectId && byObjectId.get(objectId.toLowerCase())) ||
        byProfileKey.get(profileKey.toLowerCase());

      if (existing) {
        await this.updateItem(listName, existing.id, fields);
        existing.fields = { ...(existing.fields || {}), ...fields };
      } else {
        const created = await this.createItem(listName, fields);
        const row = { id: created.id, fields };
        byProfileKey.set(profileKey.toLowerCase(), row);
        if (objectId) byObjectId.set(objectId.toLowerCase(), row);
      }
    }
  }
'@

if ($data.Contains($newUserMethods)) {
  Write-Host "SKIP: SharePoint Dashboard Access user methods already applied"
}
elseif ($data.Contains($oldUserMethods)) {
  # Only replace the SharePointDataProvider occurrence, not the fallback copy.
  $first = $data.IndexOf($oldUserMethods)
  if ($first -lt 0) { throw "Could not locate SharePoint user methods." }
  $data = $data.Remove($first, $oldUserMethods.Length).Insert($first, $newUserMethods)
  Set-Content $dataPath -Value $data -NoNewline
  Write-Host "PATCH: SharePoint Dashboard Access load/save methods"
}
else {
  throw "Could not find the expected SharePoint user methods in js/data-provider.js."
}

# ------------------------------------------------------------------
# 3. Expose SharePoint access-profile lookup through fallback provider.
# ------------------------------------------------------------------
$data = Get-Content $dataPath -Raw

$oldFallbackUsers = @'
  async loadUsers() {
    return LocalStorageDataProvider.loadUsers();
  },

  async saveUsers(nextUsers) {
    return LocalStorageDataProvider.saveUsers(nextUsers);
  }
};
'@

$newFallbackUsers = @'
  async loadUsers() {
    return LocalStorageDataProvider.loadUsers();
  },

  async saveUsers(nextUsers) {
    if (this.fallbackWasUsed) {
      return LocalStorageDataProvider.saveUsers(nextUsers);
    }
    return SharePointDataProvider.saveUsers(nextUsers);
  },

  async getDashboardAccessProfile(graphUser) {
    if (this.fallbackWasUsed) return null;
    return SharePointDataProvider.getDashboardAccessProfile(graphUser);
  }
};
'@

if ($data.Contains($newFallbackUsers)) {
  Write-Host "SKIP: Fallback Dashboard Access bridge already applied"
}
elseif ($data.Contains($oldFallbackUsers)) {
  $data = $data.Replace($oldFallbackUsers, $newFallbackUsers)
  Set-Content $dataPath -Value $data -NoNewline
  Write-Host "PATCH: Fallback provider Dashboard Access bridge"
}
else {
  throw "Could not find fallback user methods in js/data-provider.js."
}

# ------------------------------------------------------------------
# 4. Auth: INTERNAL AHT users use SharePoint Dashboard Access as the
# authoritative role/project assignment after Microsoft identifies them.
# Guests continue to use the existing Entra open-extension profile.
# ------------------------------------------------------------------

$authPath = "js/auth.js"
$auth = Get-Content $authPath -Raw

$needle = @'
async function loadSharedDashboardProfile(graphUser) {
  const groupId = APP_CONFIG.entra.accessGroupId || "";
'@

$replacement = @'
async function loadSharedDashboardProfile(graphUser) {
  // Internal AHT users are persisted in SharePoint Dashboard Access.
  // Resolve that first so project assignments work on every device/browser.
  if (String(graphUser?.userType || "").toLowerCase() !== "guest" &&
      typeof DataProvider?.getDashboardAccessProfile === "function") {
    try {
      const sharePointProfile = await DataProvider.getDashboardAccessProfile(graphUser);
      if (sharePointProfile) {
        return { profile: sharePointProfile, error: "" };
      }
    } catch (error) {
      console.warn("SharePoint Dashboard Access lookup failed; falling back to Entra profile store.", error);
    }
  }

  const groupId = APP_CONFIG.entra.accessGroupId || "";
'@

if ($auth.Contains($replacement)) {
  Write-Host "SKIP: Auth SharePoint Dashboard Access lookup already applied"
}
elseif ($auth.Contains($needle)) {
  $auth = $auth.Replace($needle, $replacement)
  Set-Content $authPath -Value $auth -NoNewline
  Write-Host "PATCH: Internal auth uses SharePoint Dashboard Access"
}
else {
  throw "Could not find loadSharedDashboardProfile() in js/auth.js."
}

# ------------------------------------------------------------------
# 5. Version bump 0.14.19 -> 0.14.20
# ------------------------------------------------------------------
$config = Get-Content "js/config.js" -Raw

if ($config -match 'version:\s*"0\.14\.20"') {
  Write-Host "SKIP: Version already 0.14.20"
}
elseif ($config -match 'version:\s*"0\.14\.19"') {
  $config = $config -replace 'version:\s*"0\.14\.19"', 'version: "0.14.20"'
  Set-Content "js/config.js" -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.20"
}
else {
  throw "Expected current version 0.14.19 in js/config.js."
}

Write-Host ""
Write-Host "v0.14.20 SharePoint Dashboard Access patch complete."
Write-Host ""
Write-Host "IMPORTANT TEST:"
Write-Host " 1. Refresh Port 8000."
Write-Host " 2. Administration -> open Shaun."
Write-Host " 3. Confirm his intended projects are checked."
Write-Host " 4. Click Save User once."
Write-Host " 5. In SharePoint -> Dashboard Access, refresh the list."
Write-Host "    Shaun should now have his own row with ProjectKeys."
Write-Host " 6. Do the same once for Bill so his row is persisted too."
Write-Host " 7. Have Shaun sign out/in or refresh the live dashboard."
Write-Host ""
Write-Host "Do NOT commit until Shaun can see his assigned projects."
