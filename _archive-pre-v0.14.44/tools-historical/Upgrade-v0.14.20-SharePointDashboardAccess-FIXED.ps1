# Upgrade-v0.14.20-SharePointDashboardAccess-FIXED.ps1
# Robust version: persists INTERNAL AHT dashboard profiles/project assignments
# to SharePoint list "Dashboard Access".
#
# Designed to layer on v0.14.19.
# External/Guest users continue using existing Entra profile storage.
#
# No project/deliverable/information-required data changes.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.20 - SharePoint Dashboard Access (FIXED)"
Write-Host ""

$files = @(
  "js/config.js",
  "js/data-provider.js",
  "js/auth.js"
)

# ---------------------------------------------------------------
# Backup
# ---------------------------------------------------------------
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.20-fixed-$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

foreach ($file in $files) {
  if (-not (Test-Path $file)) { throw "Missing required file: $file" }
  $dest = Join-Path $backupDir $file
  $destDir = Split-Path $dest -Parent
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  Copy-Item $file $dest -Force
}
Write-Host "BACKUP:" $backupDir

# ---------------------------------------------------------------
# 1. CONFIG - add dashboardAccess list name using flexible matching
# ---------------------------------------------------------------
$configPath = "js/config.js"
$config = Get-Content $configPath -Raw

if ($config -match 'dashboardAccess\s*:\s*["'']Dashboard Access["'']') {
  Write-Host "SKIP: Dashboard Access list already configured"
}
else {
  $listsMatch = [regex]::Match(
    $config,
    '(?s)(lists\s*:\s*\{)(.*?)(\}\s*,?\s*(?:entra|auth|sharePoint|backend|features|version)\s*:)',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )

  if (-not $listsMatch.Success) {
    # Simpler fallback: insert immediately after "lists: {"
    $simple = [regex]::Match(
      $config,
      'lists\s*:\s*\{',
      [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
    if (-not $simple.Success) {
      throw "Could not locate the lists configuration block in js/config.js."
    }

    $insertAt = $simple.Index + $simple.Length
    $config = $config.Insert($insertAt, "`n      dashboardAccess: `"Dashboard Access`",")
  }
  else {
    $body = $listsMatch.Groups[2].Value
    $newBody = "`n      dashboardAccess: `"Dashboard Access`"," + $body
    $config =
      $config.Substring(0, $listsMatch.Groups[2].Index) +
      $newBody +
      $config.Substring($listsMatch.Groups[2].Index + $listsMatch.Groups[2].Length)
  }

  Set-Content $configPath -Value $config -NoNewline
  Write-Host "PATCH: Dashboard Access list configuration"
}

# ---------------------------------------------------------------
# Helpers for JS block replacement
# ---------------------------------------------------------------
function Get-ObjectSegment {
  param(
    [string]$Text,
    [string[]]$StartCandidates,
    [string[]]$EndCandidates
  )

  $startIndex = -1
  $startText = ""

  foreach ($candidate in $StartCandidates) {
    $i = $Text.IndexOf($candidate)
    if ($i -ge 0) {
      $startIndex = $i
      $startText = $candidate
      break
    }
  }

  if ($startIndex -lt 0) {
    return $null
  }

  $endIndex = -1
  foreach ($candidate in $EndCandidates) {
    $i = $Text.IndexOf($candidate, $startIndex + $startText.Length)
    if ($i -ge 0 -and ($endIndex -lt 0 -or $i -lt $endIndex)) {
      $endIndex = $i
    }
  }

  if ($endIndex -lt 0) { $endIndex = $Text.Length }

  return [pscustomobject]@{
    Start = $startIndex
    End = $endIndex
    Text = $Text.Substring($startIndex, $endIndex - $startIndex)
  }
}

# ---------------------------------------------------------------
# 2. DATA PROVIDER - patch SharePoint provider user persistence
# ---------------------------------------------------------------
$dataPath = "js/data-provider.js"
$data = Get-Content $dataPath -Raw

if ($data.Contains("async getDashboardAccessProfile(graphUser)")) {
  Write-Host "SKIP: SharePoint Dashboard Access provider methods already applied"
}
else {
  $sp = Get-ObjectSegment `
    -Text $data `
    -StartCandidates @(
      "const SharePointDataProvider = {",
      "let SharePointDataProvider = {",
      "var SharePointDataProvider = {",
      "SharePointDataProvider = {"
    ) `
    -EndCandidates @(
      "const FallbackDataProvider",
      "let FallbackDataProvider",
      "var FallbackDataProvider",
      "const DataProvider",
      "let DataProvider"
    )

  if (-not $sp) {
    throw "Could not locate SharePointDataProvider in js/data-provider.js."
  }

  $segment = $sp.Text

  $userPattern = '(?s)\s*async\s+loadUsers\s*\(\s*\)\s*\{.*?\}\s*,\s*async\s+saveUsers\s*\(\s*nextUsers\s*\)\s*\{.*?\}\s*(?=,|\n\s*\})'
  $userMatch = [regex]::Match($segment, $userPattern)

  if (-not $userMatch.Success) {
    throw "Could not locate loadUsers/saveUsers inside SharePointDataProvider."
  }

  $replacement = @'

  async getDashboardAccessRows() {
    const listName = this.config?.lists?.dashboardAccess || APP_CONFIG?.sharePoint?.lists?.dashboardAccess || APP_CONFIG?.lists?.dashboardAccess || "Dashboard Access";
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
    return LocalStorageDataProvider.loadUsers();
  },

  async saveUsers(nextUsers) {
    await LocalStorageDataProvider.saveUsers(nextUsers);

    const listName = this.config?.lists?.dashboardAccess || APP_CONFIG?.sharePoint?.lists?.dashboardAccess || APP_CONFIG?.lists?.dashboardAccess || "Dashboard Access";
    const rows = await this.getDashboardAccessRows();

    const byProfileKey = new Map();
    const byObjectId = new Map();

    rows.forEach(item => {
      const profileKey = String(item.fields?.ProfileKey || "").trim().toLowerCase();
      const objectId = String(item.fields?.EntraObjectId || "").trim().toLowerCase();
      if (profileKey) byProfileKey.set(profileKey, item);
      if (objectId) byObjectId.set(objectId, item);
    });

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

  $patchedSegment =
    $segment.Substring(0, $userMatch.Index) +
    $replacement +
    $segment.Substring($userMatch.Index + $userMatch.Length)

  $data =
    $data.Substring(0, $sp.Start) +
    $patchedSegment +
    $data.Substring($sp.End)

  Set-Content $dataPath -Value $data -NoNewline
  Write-Host "PATCH: SharePoint Dashboard Access user persistence"
}

# ---------------------------------------------------------------
# 3. FALLBACK PROVIDER - delegate user writes/lookups to SharePoint
# ---------------------------------------------------------------
$data = Get-Content $dataPath -Raw

if ($data.Contains("return SharePointDataProvider.getDashboardAccessProfile(graphUser);")) {
  Write-Host "SKIP: Fallback provider bridge already applied"
}
else {
  $fb = Get-ObjectSegment `
    -Text $data `
    -StartCandidates @(
      "const FallbackDataProvider = {",
      "let FallbackDataProvider = {",
      "var FallbackDataProvider = {",
      "FallbackDataProvider = {"
    ) `
    -EndCandidates @(
      "const DataProvider",
      "let DataProvider",
      "var DataProvider",
      "window.DataProvider"
    )

  if ($fb) {
    $segment = $fb.Text

    $savePattern = '(?s)async\s+saveUsers\s*\(\s*nextUsers\s*\)\s*\{.*?\}'
    $saveMatch = [regex]::Match($segment, $savePattern)

    if ($saveMatch.Success) {
      $saveReplacement = @'
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

      $patchedSegment =
        $segment.Substring(0, $saveMatch.Index) +
        $saveReplacement +
        $segment.Substring($saveMatch.Index + $saveMatch.Length)

      $data =
        $data.Substring(0, $fb.Start) +
        $patchedSegment +
        $data.Substring($fb.End)

      Set-Content $dataPath -Value $data -NoNewline
      Write-Host "PATCH: Fallback provider SharePoint access bridge"
    }
    else {
      Write-Host "WARN: FallbackDataProvider found but saveUsers() was not located."
      Write-Host "      SharePointDataProvider itself was patched; continuing."
    }
  }
  else {
    Write-Host "INFO: No FallbackDataProvider object found; continuing."
  }
}

# ---------------------------------------------------------------
# 4. AUTH - internal users resolve role/project assignment from SP
# ---------------------------------------------------------------
$authPath = "js/auth.js"
$auth = Get-Content $authPath -Raw

if ($auth.Contains("SharePoint Dashboard Access lookup failed")) {
  Write-Host "SKIP: Auth SharePoint lookup already applied"
}
else {
  $fnMatch = [regex]::Match(
    $auth,
    'async\s+function\s+loadSharedDashboardProfile\s*\(\s*graphUser\s*\)\s*\{',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )

  if (-not $fnMatch.Success) {
    throw "Could not locate loadSharedDashboardProfile(graphUser) in js/auth.js."
  }

  $insertAt = $fnMatch.Index + $fnMatch.Length

  $authInsert = @'

  // AHT internal user role/project assignment is authoritative in SharePoint.
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

'@

  $auth = $auth.Insert($insertAt, $authInsert)
  Set-Content $authPath -Value $auth -NoNewline
  Write-Host "PATCH: Internal auth reads Dashboard Access from SharePoint"
}

# ---------------------------------------------------------------
# 5. VERSION BUMP
# ---------------------------------------------------------------
$config = Get-Content $configPath -Raw

if ($config -match 'version\s*:\s*["'']0\.14\.20["'']') {
  Write-Host "SKIP: Version already 0.14.20"
}
elseif ($config -match 'version\s*:\s*["'']0\.14\.19["'']') {
  $config = [regex]::Replace(
    $config,
    'version\s*:\s*(["''])0\.14\.19\1',
    'version: "0.14.20"',
    1
  )
  Set-Content $configPath -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.20"
}
else {
  throw "Expected v0.14.19 in js/config.js; version bump not applied."
}

Write-Host ""
Write-Host "v0.14.20 FIXED patch complete."
Write-Host ""
Write-Host "TEST SHAUN FIRST:"
Write-Host " 1. Refresh Port 8000."
Write-Host " 2. Administration -> Shaun Kastner."
Write-Host " 3. Confirm his intended projects are selected."
Write-Host " 4. Click Save User."
Write-Host " 5. Refresh SharePoint -> Dashboard Access."
Write-Host " 6. Confirm a Shaun Kastner row now exists with ProjectKeys."
Write-Host " 7. Then have Shaun refresh/sign out-in."
Write-Host ""
Write-Host "Do NOT commit until Shaun sees his projects."
