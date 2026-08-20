# Upgrade-v0.14.20-SharePointDashboardAccess-RECOVER-AND-FIX.ps1
# Restores the clean v0.14.19 files from the backup created by the failed FINAL patch,
# then applies the Dashboard Access fix with section-specific replacements.
#
# Expected backup from screenshot:
#   backup-v0.14.20-final-20260817-100920
#
# No project/deliverable/information-required data changes.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.20 - Recover + Fix SharePoint Dashboard Access"
Write-Host ""

$sourceBackup = "backup-v0.14.20-final-20260817-100920"

$restoreFiles = @(
  "js/config.js",
  "js/data-provider.js",
  "js/auth.js"
)

# ------------------------------------------------------------------
# 0. Restore clean v0.14.19 source files from the backup made BEFORE
#    the failed v0.14.20 patch changed anything.
# ------------------------------------------------------------------
if (-not (Test-Path $sourceBackup)) {
  throw "Required recovery backup not found: $sourceBackup"
}

foreach ($file in $restoreFiles) {
  $source = Join-Path $sourceBackup $file
  if (-not (Test-Path $source)) {
    throw "Recovery file missing: $source"
  }
  Copy-Item $source $file -Force
}

Write-Host "RESTORE: Clean v0.14.19 files restored from $sourceBackup"

# Create a new backup of the restored clean state.
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.20-recovered-$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

foreach ($file in $restoreFiles) {
  $dest = Join-Path $backupDir $file
  $destDir = Split-Path $dest -Parent
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  Copy-Item $file $dest -Force
}

Write-Host "BACKUP:" $backupDir

function Replace-InSegment {
  param(
    [string]$WholeText,
    [string]$SegmentStart,
    [string]$SegmentEnd,
    [string]$OldText,
    [string]$NewText,
    [string]$Label
  )

  $start = $WholeText.IndexOf($SegmentStart)
  if ($start -lt 0) {
    throw "Could not find segment start for $Label"
  }

  $end = $WholeText.IndexOf($SegmentEnd, $start + $SegmentStart.Length)
  if ($end -lt 0) {
    throw "Could not find segment end for $Label"
  }

  $segment = $WholeText.Substring($start, $end - $start)

  if (-not $segment.Contains($OldText)) {
    throw "Could not find expected code inside $Label segment"
  }

  $segment = $segment.Replace($OldText, $NewText)

  return (
    $WholeText.Substring(0, $start) +
    $segment +
    $WholeText.Substring($end)
  )
}

# ------------------------------------------------------------------
# 1. CONFIG
# ------------------------------------------------------------------
$configPath = "js/config.js"
$config = Get-Content $configPath -Raw

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

if (-not $config.Contains($oldConfigLists)) {
  throw "Could not find the expected v0.14.19 SharePoint lists block in js/config.js."
}

$config = $config.Replace($oldConfigLists, $newConfigLists)
Set-Content $configPath -Value $config -NoNewline
Write-Host "PATCH: Dashboard Access SharePoint list"

# ------------------------------------------------------------------
# 2. DATA PROVIDER
# ------------------------------------------------------------------
$dataPath = "js/data-provider.js"
$data = Get-Content $dataPath -Raw

$oldUserBlock = @'
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

$data = Replace-InSegment `
  -WholeText $data `
  -SegmentStart 'const SharePointDataProvider = {' `
  -SegmentEnd 'const FallbackDataProvider = {' `
  -OldText $oldUserBlock `
  -NewText $newSharePointUsers `
  -Label "SharePointDataProvider"

Write-Host "PATCH: SharePoint internal user persistence"

$data = Replace-InSegment `
  -WholeText $data `
  -SegmentStart 'const FallbackDataProvider = {' `
  -SegmentEnd 'function selectDataProvider()' `
  -OldText $oldUserBlock `
  -NewText $newFallbackUsers `
  -Label "FallbackDataProvider"

Write-Host "PATCH: Fallback provider SharePoint user bridge"

Set-Content $dataPath -Value $data -NoNewline

# ------------------------------------------------------------------
# 3. AUTH
# ------------------------------------------------------------------
$authPath = "js/auth.js"
$auth = Get-Content $authPath -Raw

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

if (-not $auth.Contains($oldAuthStart)) {
  throw "Could not find expected loadSharedDashboardProfile start in js/auth.js."
}

$auth = $auth.Replace($oldAuthStart, $newAuthStart)
Set-Content $authPath -Value $auth -NoNewline
Write-Host "PATCH: Internal sign-in reads SharePoint Dashboard Access"

# ------------------------------------------------------------------
# 4. VERSION
# ------------------------------------------------------------------
$config = Get-Content $configPath -Raw

if ($config -match 'version:\s*"0\.14\.19"') {
  $config = $config -replace 'version:\s*"0\.14\.19"', 'version: "0.14.20"'
  Set-Content $configPath -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.20"
}
elseif ($config -match 'version:\s*"0\.14\.20"') {
  Write-Host "SKIP: Version already 0.14.20"
}
else {
  throw "Expected v0.14.19 after recovery."
}

Write-Host ""
Write-Host "v0.14.20 Recover + Fix complete."
Write-Host ""
Write-Host "TEST:"
Write-Host " 1. Start/refresh Port 8000."
Write-Host " 2. Administration -> Shaun Kastner."
Write-Host " 3. Confirm intended projects and click Save User."
Write-Host " 4. Refresh SharePoint -> Dashboard Access."
Write-Host " 5. Confirm Shaun row + ProjectKeys."
Write-Host " 6. Then have Shaun sign out/in or hard refresh."
Write-Host ""
Write-Host "DO NOT COMMIT until Shaun sees his projects."
