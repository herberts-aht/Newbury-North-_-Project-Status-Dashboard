# Upgrade-v0.14.20-SharePointDashboardAccess-FINAL.ps1
# Targeted for the actual v0.14.19 project structure.
#
# Fix:
#   Internal AHT dashboard user profiles and project assignments are persisted
#   in SharePoint list "Dashboard Access" instead of existing only in localStorage.
#
# SharePoint fields used:
#   ProfileKey, DisplayName, Company, DashboardRole, ProjectKeys,
#   Active, EntraObjectId, EntraUserType
#
# External/Guest users continue to use the existing Entra group extension.
#
# No project/deliverable/information-required data changes.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.20 - SharePoint Dashboard Access FINAL"
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
$backupDir = "backup-v0.14.20-final-$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

foreach ($file in $files) {
  if (-not (Test-Path $file)) {
    throw "Missing required file: $file"
  }

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
    throw "Could not find expected v0.14.19 code for: $Label in $Path. Stopping."
  }

  $text = $text.Replace($Old, $New)
  Set-Content -Path $Path -Value $text -NoNewline
  Write-Host "PATCH:" $Label
}

# ------------------------------------------------------------------
# 1. CONFIG
# Actual v0.14.19 structure:
#   sharePoint: Object.freeze({
#     siteUrl: ...
#     lists: Object.freeze({
#       projects...
# ------------------------------------------------------------------

$oldConfigLists = @'
    lists: Object.freeze({
      projects: "Projects",
      deliverables: "Deliverables",
      informationRequired: "Information Required",
      changeLog: "Change Log"
    })
'@

$newConfigLists = @'
    lists: Object.freeze({
      projects: "Projects",
      deliverables: "Deliverables",
      informationRequired: "Information Required",
      dashboardAccess: "Dashboard Access",
      changeLog: "Change Log"
    })
'@

Replace-Exact "js/config.js" $oldConfigLists $newConfigLists "Dashboard Access SharePoint list"

# ------------------------------------------------------------------
# 2. SHAREPOINT PROVIDER
# Replace only the v0.14.19 SharePointDataProvider loadUsers/saveUsers block.
# ------------------------------------------------------------------

$oldSharePointUsers = @'
  async loadUsers() {
    return LocalStorageDataProvider.loadUsers();
  },

  async saveUsers(nextUsers) {
    return LocalStorageDataProvider.saveUsers(nextUsers);
  }
'@

$newSharePointUsers = @'
  async getDashboardAccessRows() {
    return this.getListRows(this.config.lists.dashboardAccess, [
      "Title",
      "ProfileKey",
      "DisplayName",
      "Company",
      "DashboardRole",
      "ProjectKeys",
      "Active",
      "EntraObjectId",
      "EntraUserType"
    ]);
  },

  dashboardAccessProjects(value) {
    return String(value || "")
      .split(/[;,|]/)
      .map(projectKey => projectKey.trim())
      .filter(Boolean);
  },

  dashboardAccessUser(row) {
    const fields = row.fields || {};
    const role = fields.DashboardRole || "Viewer";

    return {
      id: fields.ProfileKey || `sharepoint-user-${row.id}`,
      sharePointAccessId: Number(row.id),
      name: fields.DisplayName || fields.Title || "AHT User",
      email: "",
      company: fields.Company || "AHT Global",
      role,
      active: fields.Active !== false,
      projects: this.dashboardAccessProjects(fields.ProjectKeys),
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
    const graphEmail = String(
      graphUser.mail ||
      graphUser.userPrincipalName ||
      ""
    ).trim().toLowerCase();

    let row = rows.find(item =>
      String(item.fields?.EntraObjectId || "").trim().toLowerCase() === objectId
    );

    if (!row && graphEmail) {
      row = rows.find(item =>
        String(item.fields?.ProfileKey || "").trim().toLowerCase() === graphEmail
      );
    }

    if (!row && displayName) {
      row = rows.find(item =>
        String(
          item.fields?.DisplayName ||
          item.fields?.Title ||
          ""
        ).trim().toLowerCase() === displayName
      );
    }

    if (!row || row.fields?.Active === false) return null;

    const user = this.dashboardAccessUser(row);

    return {
      r: user.role,
      p: user.projects,
      c: user.company,
      n: user.name,
      e: graphEmail,
      entraObjectId: user.entraObjectId,
      active: user.active
    };
  },

  async loadUsers() {
    // SharePoint is authoritative for internal AHT user role/project assignment.
    // Preserve locally cached users so external/legacy entries remain available
    // to the existing Administration UI, then overlay SharePoint internal rows.
    const localUsers = await LocalStorageDataProvider.loadUsers();

    try {
      const rows = await this.getDashboardAccessRows();
      const sharePointUsers = rows
        .filter(row => String(row.fields?.EntraUserType || "Member").toLowerCase() !== "guest")
        .map(row => this.dashboardAccessUser(row));

      const merged = [...localUsers];

      for (const spUser of sharePointUsers) {
        const index = merged.findIndex(localUser => {
          const sameObjectId =
            spUser.entraObjectId &&
            localUser.entraObjectId &&
            String(localUser.entraObjectId).toLowerCase() === String(spUser.entraObjectId).toLowerCase();

          const sameId =
            String(localUser.id || "").toLowerCase() === String(spUser.id || "").toLowerCase();

          const sameName =
            String(localUser.name || "").trim().toLowerCase() ===
            String(spUser.name || "").trim().toLowerCase();

          return sameObjectId || sameId || sameName;
        });

        if (index >= 0) {
          // Keep local-only details such as email, but SharePoint controls role,
          // projects, active state, company, and Entra identity.
          merged[index] = {
            ...merged[index],
            ...spUser,
            email: merged[index].email || spUser.email || ""
          };
        } else {
          merged.push(spUser);
        }
      }

      await LocalStorageDataProvider.saveUsers(merged);
      return merged;
    } catch (error) {
      console.warn("Could not load Dashboard Access from SharePoint; using cached users.", error);
      return localUsers;
    }
  },

  async saveUsers(nextUsers) {
    // Keep a local cache for fast startup and current admin UI behavior.
    await LocalStorageDataProvider.saveUsers(nextUsers);

    const rows = await this.getDashboardAccessRows();

    const byProfileKey = new Map();
    const byObjectId = new Map();
    const byDisplayName = new Map();

    for (const row of rows) {
      const profileKey = String(row.fields?.ProfileKey || "").trim().toLowerCase();
      const objectId = String(row.fields?.EntraObjectId || "").trim().toLowerCase();
      const displayName = String(
        row.fields?.DisplayName ||
        row.fields?.Title ||
        ""
      ).trim().toLowerCase();

      if (profileKey) byProfileKey.set(profileKey, row);
      if (objectId) byObjectId.set(objectId, row);
      if (displayName) byDisplayName.set(displayName, row);
    }

    const internalUsers = (nextUsers || []).filter(user => {
      const entraType = String(user.entraUserType || "Member").toLowerCase();
      return (
        user &&
        user.isInternal !== false &&
        user.role !== "External Viewer" &&
        entraType !== "guest"
      );
    });

    for (const user of internalUsers) {
      const email = String(user.email || "").trim();
      const profileKey = email || String(user.id || "").trim();
      if (!profileKey) continue;

      const objectId = String(user.entraObjectId || "").trim();
      const displayName = String(user.name || profileKey).trim();

      const role =
        user.canAdmin || user.role === "Administrator"
          ? "Administrator"
          : (user.canEdit || user.role === "Editor")
            ? "Editor"
            : "Viewer";

      const fields = {
        Title: displayName,
        ProfileKey: profileKey,
        DisplayName: displayName,
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
        byProfileKey.get(profileKey.toLowerCase()) ||
        byDisplayName.get(displayName.toLowerCase());

      if (existing) {
        await this.updateItem(
          this.config.lists.dashboardAccess,
          existing.id,
          fields
        );

        existing.fields = {
          ...(existing.fields || {}),
          ...fields
        };
      } else {
        const created = await this.createItem(
          this.config.lists.dashboardAccess,
          fields
        );

        const row = {
          id: created.id,
          fields
        };

        byProfileKey.set(profileKey.toLowerCase(), row);
        if (objectId) byObjectId.set(objectId.toLowerCase(), row);
        if (displayName) byDisplayName.set(displayName.toLowerCase(), row);
      }
    }

    return nextUsers;
  }
'@

Replace-Exact "js/data-provider.js" $oldSharePointUsers $newSharePointUsers "SharePoint internal user persistence"

# ------------------------------------------------------------------
# 3. FALLBACK PROVIDER
# The app uses FallbackDataProvider because:
#   dataProvider = "sharePoint"
#   allowLocalFallback = true
#
# User writes should still go to SharePoint whenever the SharePoint state load
# succeeded. If SharePoint is genuinely unavailable, preserve local fallback.
# ------------------------------------------------------------------

$oldFallbackUsers = @'
  async loadUsers() {
    return LocalStorageDataProvider.loadUsers();
  },

  async saveUsers(nextUsers) {
    return LocalStorageDataProvider.saveUsers(nextUsers);
  }
'@

$newFallbackUsers = @'
  async loadUsers() {
    if (this.fallbackWasUsed) {
      return LocalStorageDataProvider.loadUsers();
    }
    return SharePointDataProvider.loadUsers();
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
'@

# There are now two old blocks originally; the SharePoint one was replaced above,
# leaving exactly the FallbackDataProvider block.
Replace-Exact "js/data-provider.js" $oldFallbackUsers $newFallbackUsers "Fallback provider SharePoint user bridge"

# ------------------------------------------------------------------
# 4. AUTH
# Internal Microsoft Members should read SharePoint Dashboard Access first.
# Guests continue through the existing Entra open-extension flow unchanged.
# ------------------------------------------------------------------

$oldAuthStart = @'
async function loadSharedDashboardProfile(graphUser) {
  const groupId = APP_CONFIG.entra.accessGroupId || "";
'@

$newAuthStart = @'
async function loadSharedDashboardProfile(graphUser) {
  // Internal AHT users use SharePoint Dashboard Access as the authoritative
  // source for dashboard role and project visibility.
  if (
    String(graphUser?.userType || "").toLowerCase() !== "guest" &&
    typeof DataProvider?.getDashboardAccessProfile === "function"
  ) {
    try {
      const sharePointProfile =
        await DataProvider.getDashboardAccessProfile(graphUser);

      if (sharePointProfile) {
        return {
          profile: sharePointProfile,
          error: ""
        };
      }
    } catch (error) {
      console.warn(
        "SharePoint Dashboard Access lookup failed; falling back to existing Entra profile store.",
        error
      );
    }
  }

  const groupId = APP_CONFIG.entra.accessGroupId || "";
'@

Replace-Exact "js/auth.js" $oldAuthStart $newAuthStart "Internal sign-in reads SharePoint Dashboard Access"

# ------------------------------------------------------------------
# 5. VERSION
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
Write-Host "v0.14.20 FINAL patch complete."
Write-Host ""
Write-Host "TEST SHAUN FIRST:"
Write-Host " 1. Start/refresh Port 8000."
Write-Host " 2. Administration -> Shaun Kastner."
Write-Host " 3. Confirm his intended projects are selected."
Write-Host " 4. Click Save User ONCE."
Write-Host " 5. SharePoint -> Site contents -> Dashboard Access -> Refresh."
Write-Host " 6. Confirm Shaun now has a row."
Write-Host " 7. Confirm ProjectKeys contains his selected project IDs."
Write-Host " 8. Have Shaun sign out/in or hard refresh the live dashboard."
Write-Host ""
Write-Host "Then repeat Save User once for Bill."
Write-Host ""
Write-Host "DO NOT COMMIT until Shaun can see his projects."
