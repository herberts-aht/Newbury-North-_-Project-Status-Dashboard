

# Upgrade-v0.14.21-StableUserIdentityMatching.ps1
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.21 - Stable User Identity Matching"
Write-Host ""

$files = @("js/data-provider.js","js/config.js")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.21-$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

foreach ($file in $files) {
  $dest = Join-Path $backupDir $file
  $destDir = Split-Path $dest -Parent
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  Copy-Item $file $dest -Force
}
Write-Host "BACKUP:" $backupDir

$dataPath = "js/data-provider.js"
$data = Get-Content $dataPath -Raw

$oldProfileMatch = @'
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
'@

$newProfileMatch = @'
    // Deliberately do NOT fall back to display name here.
    // Names are mutable and can collide; sign-in identity must be anchored
    // to Entra Object ID or exact ProfileKey/email.
    if (!row || row.fields?.Active === false) return null;
'@

if ($data.Contains($oldProfileMatch)) {
  $data = $data.Replace($oldProfileMatch, $newProfileMatch)
  Write-Host "PATCH: Removed display-name fallback from sign-in matching"
} elseif (-not $data.Contains($newProfileMatch)) {
  throw "Could not find expected getDashboardAccessProfile display-name fallback."
}

$oldMaps = @'
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
'@

$newMaps = @'
    const byProfileKey = new Map();
    const byObjectId = new Map();
    const bySharePointId = new Map();
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
      if (row.id != null) bySharePointId.set(String(row.id), row);
      if (displayName) byDisplayName.set(displayName, row);
    }
'@

if ($data.Contains($oldMaps)) {
  $data = $data.Replace($oldMaps, $newMaps)
  Write-Host "PATCH: Added SharePoint row-id identity map"
} elseif (-not $data.Contains($newMaps)) {
  throw "Could not find expected saveUsers map block."
}

$oldExisting = @'
      const existing =
        (objectId && byObjectId.get(objectId.toLowerCase())) ||
        byProfileKey.get(profileKey.toLowerCase()) ||
        byDisplayName.get(displayName.toLowerCase());
'@

$newExisting = @'
      const sharePointAccessId = String(user.sharePointAccessId || "").trim();

      let existing =
        (objectId && byObjectId.get(objectId.toLowerCase())) ||
        (profileKey && byProfileKey.get(profileKey.toLowerCase())) ||
        (sharePointAccessId && bySharePointId.get(sharePointAccessId)) ||
        null;

      if (
        !existing &&
        !objectId &&
        !profileKey &&
        !sharePointAccessId &&
        displayName
      ) {
        existing = byDisplayName.get(displayName.toLowerCase()) || null;
      }
'@

if ($data.Contains($oldExisting)) {
  $data = $data.Replace($oldExisting, $newExisting)
  Write-Host "PATCH: Stable existing-row resolution"
} elseif (-not $data.Contains($newExisting)) {
  throw "Could not find expected existing-row resolution."
}

$oldCreate = @'
        const row = {
          id: created.id,
          fields
        };

        byProfileKey.set(profileKey.toLowerCase(), row);
        if (objectId) byObjectId.set(objectId.toLowerCase(), row);
        if (displayName) byDisplayName.set(displayName.toLowerCase(), row);
'@

$newCreate = @'
        const row = {
          id: created.id,
          fields
        };

        user.sharePointAccessId = Number(created.id);

        byProfileKey.set(profileKey.toLowerCase(), row);
        if (objectId) byObjectId.set(objectId.toLowerCase(), row);
        if (created.id != null) bySharePointId.set(String(created.id), row);
        if (displayName) byDisplayName.set(displayName.toLowerCase(), row);
'@

if ($data.Contains($oldCreate)) {
  $data = $data.Replace($oldCreate, $newCreate)
  Write-Host "PATCH: Preserve created SharePoint row id"
} elseif (-not $data.Contains($newCreate)) {
  throw "Could not find expected create-row block."
}

$oldUpdate = @'
        existing.fields = {
          ...(existing.fields || {}),
          ...fields
        };
'@

$newUpdate = @'
        existing.fields = {
          ...(existing.fields || {}),
          ...fields
        };

        user.sharePointAccessId = Number(existing.id);
'@

if ($data.Contains($oldUpdate)) {
  $data = $data.Replace($oldUpdate, $newUpdate)
  Write-Host "PATCH: Preserve updated SharePoint row id"
} elseif (-not $data.Contains($newUpdate)) {
  throw "Could not find expected update-row block."
}

Set-Content $dataPath -Value $data -NoNewline

$configPath = "js/config.js"
$config = Get-Content $configPath -Raw

if ($config -match 'version:\s*"0\.14\.20"') {
  $config = $config -replace 'version:\s*"0\.14\.20"', 'version: "0.14.21"'
  Set-Content $configPath -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.21"
} elseif ($config -match 'version:\s*"0\.14\.21"') {
  Write-Host "SKIP: Version already 0.14.21"
} else {
  throw "Expected current version 0.14.20 in js/config.js."
}

Write-Host ""
Write-Host "v0.14.21 identity-matching fix complete."
Write-Host ""
Write-Host "TEST:"
Write-Host " 1. Refresh Port 8000."
Write-Host " 2. In Administration, select your Stacy profile."
Write-Host " 3. Change ONLY the display name slightly."
Write-Host " 4. Save User."
Write-Host " 5. Refresh SharePoint Dashboard Access."
Write-Host " 6. Confirm only ONE Stacy row changed."
Write-Host ""
Write-Host "Do NOT commit until the edit sticks to one row consistently."
