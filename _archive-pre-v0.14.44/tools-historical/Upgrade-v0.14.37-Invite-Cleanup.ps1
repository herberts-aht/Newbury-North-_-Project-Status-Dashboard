# Upgrade-v0.14.37-Invite-Cleanup.ps1
# Cosmetic cleanup only:
# - top button becomes "Create Invitation"
# - Outlook draft uses project display names instead of internal project IDs
# - keeps the working two-step invite/authentication flow unchanged

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.37 - Invite Cleanup"
Write-Host ""

$files = @("index.html","js/microsoft-access.js","js/config.js")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.37-invite-cleanup-$stamp"

foreach ($file in $files) {
    if (-not (Test-Path $file)) { throw "Missing required file: $file" }
    $dest = Join-Path $backupDir $file
    $destDir = Split-Path $dest -Parent
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    Copy-Item $file $dest -Force
}
Write-Host "BACKUP: $backupDir"

function Replace-Exact {
    param(
        [string]$Path,
        [string]$Old,
        [string]$New,
        [string]$Label
    )
    $text = Get-Content $Path -Raw
    if ($text.Contains($New)) {
        Write-Host "SKIP:" $Label
        return
    }
    if (-not $text.Contains($Old)) {
        throw "Could not find expected code for '$Label' in $Path"
    }
    $text = $text.Replace($Old,$New)
    Set-Content $Path $text -NoNewline
    Write-Host "PATCH:" $Label
}

# 1. Rename the top button
Replace-Exact `
  -Path "index.html" `
  -Old '<button class="btn primary" id="inviteExternalBtn" type="button" style="margin-top:10px">Invite & Open Outlook Draft</button>' `
  -New '<button class="btn primary" id="inviteExternalBtn" type="button" style="margin-top:10px">Create Invitation</button>' `
  -Label "Rename top invite button"

# 2. Update Outlook draft helper to translate project IDs to display names
$content = Get-Content "js/microsoft-access.js" -Raw

$old = @'
    const projectText = Array.isArray(projects) && projects.length
      ? projects.join(" & ")
      : "your assigned project(s)";

    const subject = `AHT Project Control Access - ${projectText}`;
'@

$new = @'
    const projectNames = Array.isArray(projects)
      ? projects
          .map(projectId => state.projects.find(project => project.id === projectId)?.name || projectId)
          .filter(Boolean)
      : [];

    const projectText = projectNames.length
      ? projectNames.join(" & ")
      : "your assigned project(s)";

    const subject = `AHT Project Control Access - ${projectText}`;
'@

if ($content.Contains($new)) {
    Write-Host "SKIP: Project display-name cleanup already applied."
}
elseif (-not $content.Contains($old)) {
    throw "Could not find the current projectText block in openExternalInviteDraft()."
}
else {
    $content = $content.Replace($old,$new)
    Set-Content "js/microsoft-access.js" $content -NoNewline
    Write-Host "PATCH: Outlook draft now uses project display names."
}

# 3. Version bump
$config = Get-Content "js/config.js" -Raw

if ($config -match 'version:\s*"0\.14\.37"') {
    Write-Host "SKIP: Version already 0.14.37"
}
elseif ($config -match 'version:\s*"0\.14\.36"') {
    $config = $config -replace 'version:\s*"0\.14\.36"', 'version: "0.14.37"'
    Set-Content "js/config.js" $config -NoNewline
    Write-Host "PATCH: Version 0.14.37"
}
else {
    Write-Warning "Current version is not 0.14.36. Check js/config.js before commit."
}

Write-Host ""
Write-Host "v0.14.37 cleanup complete."
Write-Host "Working invite/authentication logic was not changed."
Write-Host ""
Write-Host "Run:"
Write-Host "  node --check js/microsoft-access.js"
Write-Host "  git diff --check"
Write-Host ""
Write-Host "Then refresh Port 8000 and confirm:"
Write-Host "  - top button says Create Invitation"
Write-Host "  - Outlook subject/body show 2200 Gordon Dr / 2340 Gordon Dr"
Write-Host ""
Write-Host "Do not commit until the cosmetic test passes."
