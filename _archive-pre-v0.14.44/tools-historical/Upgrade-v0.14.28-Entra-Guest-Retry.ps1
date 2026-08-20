# Upgrade-v0.14.28-Entra-Guest-Retry.ps1
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.28 - Entra Guest Propagation Retry"
Write-Host ""

$path = "js/microsoft-access.js"
$configPath = "js/config.js"

foreach ($file in @($path,$configPath)) {
    if (-not (Test-Path $file)) { throw "Missing required file: $file" }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.28-entra-guest-retry-$stamp"
New-Item -ItemType Directory -Path "$backupDir/js" -Force | Out-Null
Copy-Item $path "$backupDir/js/microsoft-access.js" -Force
Copy-Item $configPath "$backupDir/js/config.js" -Force

$content = Get-Content $path -Raw

$old = @'
  async function addMemberObjectId(objectId) {
    await graph(`/groups/${encodeURIComponent(groupId())}/members/$ref`, {
      method: "POST",
      body: JSON.stringify({ "@odata.id": `${GRAPH}/directoryObjects/${objectId}` })
    });
  }
'@

$new = @'
  async function addMemberObjectId(objectId) {
    const delays = [0, 1000, 2000, 4000];
    let lastError = null;

    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt]) {
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      }

      try {
        await graph(`/groups/${encodeURIComponent(groupId())}/members/$ref`, {
          method: "POST",
          body: JSON.stringify({ "@odata.id": `${GRAPH}/directoryObjects/${objectId}` })
        });
        return;
      } catch (error) {
        lastError = error;
        const message = String(error?.message || error || "");
        const retryable =
          message.includes("does not exist") ||
          message.includes("Request_ResourceNotFound") ||
          message.includes("Directory_ObjectNotFound");

        if (!retryable || attempt === delays.length - 1) {
          throw error;
        }
      }
    }

    throw lastError || new Error("Could not add the user to the Project Control access group.");
  }
'@

if ($content.Contains($new)) {
    Write-Host "SKIP: Entra guest retry already applied."
}
elseif (-not $content.Contains($old)) {
    throw "Could not find addMemberObjectId() block. No changes made."
}
else {
    $content = $content.Replace($old,$new)
    Set-Content $path $content -NoNewline
    Write-Host "PATCH: Added retry/backoff for new Entra guest group membership."
}

$config = Get-Content $configPath -Raw
if ($config -match 'version:\s*"0\.14\.28"') {
    Write-Host "SKIP: Version already 0.14.28"
}
elseif ($config -match 'version:\s*"0\.14\.27"') {
    $config = $config -replace 'version:\s*"0\.14\.27"', 'version: "0.14.28"'
    Set-Content $configPath $config -NoNewline
    Write-Host "PATCH: Version 0.14.28"
}
else {
    Write-Warning "Current version is not 0.14.27. Check js/config.js before commit."
}

Write-Host ""
Write-Host "v0.14.28 retry patch complete."
Write-Host "Backup: $backupDir"
Write-Host "Do NOT commit yet."
Write-Host "Next: node --check js/microsoft-access.js ; git diff --check"
