# Upgrade-v0.14.35-Draft-From-Visible-Fields.ps1
# Makes Open Outlook Draft read directly from the visible Admin fields
# instead of relying on temporary in-memory invite context.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.35 - Draft From Visible Fields"
Write-Host ""

$path = "js/microsoft-access.js"
$configPath = "js/config.js"

foreach ($file in @($path,$configPath)) {
    if (-not (Test-Path $file)) { throw "Missing required file: $file" }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.35-draft-visible-fields-$stamp"
New-Item -ItemType Directory -Path "$backupDir/js" -Force | Out-Null
Copy-Item $path "$backupDir/js/microsoft-access.js" -Force
Copy-Item $configPath "$backupDir/js/config.js" -Force
Write-Host "BACKUP: $backupDir"

$content = Get-Content $path -Raw

$old = @'
  function openCurrentInviteDraft() {
    const link = String(el("inviteRedeemLink")?.value || lastRedeemUrl || "").trim();

    if (!lastInviteContext?.email) {
      alert("Invite or select an external user first so Project Control knows who the draft is for.");
      return;
    }

    if (!link) {
      alert("Paste or generate a Microsoft invitation link first.");
      return;
    }

    openExternalInviteDraft({
      ...lastInviteContext,
      redeemUrl: link
    });
  }
'@

$new = @'
  function openCurrentInviteDraft() {
    const email = normalizeEmail(el("externalInviteEmail")?.value);
    const name = String(el("externalInviteName")?.value || "").trim();
    const projects = selectedProjects("externalInviteProjects");
    const link = String(el("inviteRedeemLink")?.value || lastRedeemUrl || "").trim();

    if (!email) {
      alert("Enter the external user's email address first.");
      return;
    }

    if (!projects.length) {
      alert("Select at least one project first.");
      return;
    }

    if (!link) {
      alert("Paste or generate a Microsoft invitation link first.");
      return;
    }

    openExternalInviteDraft({
      email,
      name,
      projects,
      redeemUrl: link
    });
  }
'@

if ($content.Contains($new)) {
    Write-Host "SKIP: Visible-field draft logic already applied."
}
elseif (-not $content.Contains($old)) {
    throw "Could not find openCurrentInviteDraft() block. No changes made."
}
else {
    $content = $content.Replace($old,$new)
    Set-Content $path $content -NoNewline
    Write-Host "PATCH: Open Outlook Draft now reads Email/Name/Projects/Link directly from the page."
}

$config = Get-Content $configPath -Raw

if ($config -match 'version:\s*"0\.14\.35"') {
    Write-Host "SKIP: Version already 0.14.35"
}
elseif ($config -match 'version:\s*"0\.14\.34"') {
    $config = $config -replace 'version:\s*"0\.14\.34"', 'version: "0.14.35"'
    Set-Content $configPath $config -NoNewline
    Write-Host "PATCH: Version 0.14.35"
}
else {
    Write-Warning "Current version is not 0.14.34. Check js/config.js before commit."
}

Write-Host ""
Write-Host "v0.14.35 patch complete."
Write-Host "DO NOT COMMIT YET."
Write-Host ""
Write-Host "Run:"
Write-Host "  node --check js/microsoft-access.js"
Write-Host "  git diff --check"
Write-Host ""
Write-Host "Then refresh Port 8000, re-enter the test Email/Name, select projects,"
Write-Host "paste the invitation link if needed, and click Open Outlook Draft."
