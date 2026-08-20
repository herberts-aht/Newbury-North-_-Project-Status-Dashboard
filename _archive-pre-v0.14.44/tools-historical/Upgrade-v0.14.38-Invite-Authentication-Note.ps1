# Upgrade-v0.14.38-Invite-Authentication-Note.ps1
# Adds one concise authentication expectation sentence to the external invite email.
# No Entra, permission, invitation, or Outlook handoff logic is changed.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.38 - Invite Authentication Note"
Write-Host ""

$path = "js/microsoft-access.js"
$configPath = "js/config.js"

foreach ($file in @($path,$configPath)) {
    if (-not (Test-Path $file)) { throw "Missing required file: $file" }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.38-auth-note-$stamp"
New-Item -ItemType Directory -Path "$backupDir/js" -Force | Out-Null
Copy-Item $path "$backupDir/js/microsoft-access.js" -Force
Copy-Item $configPath "$backupDir/js/config.js" -Force
Write-Host "BACKUP: $backupDir"

$content = Get-Content $path -Raw

$old = @'
      "Activate your Project Control access:",
      redeemUrl,
      "",
      "Once completed, you can sign in to Project Control using this email address.",
'@

$new = @'
      "Activate your Project Control access:",
      redeemUrl,
      "",
      "Microsoft may ask you to verify your identity or complete additional authentication steps during setup.",
      "",
      "Once completed, you can sign in to Project Control using this email address.",
'@

if ($content.Contains($new)) {
    Write-Host "SKIP: Authentication note already present."
}
elseif (-not $content.Contains($old)) {
    throw "Could not find the expected invitation email body block. No changes made."
}
else {
    $content = $content.Replace($old,$new)
    Set-Content $path $content -NoNewline
    Write-Host "PATCH: Added concise Microsoft authentication note."
}

$config = Get-Content $configPath -Raw

if ($config -match 'version:\s*"0\.14\.38"') {
    Write-Host "SKIP: Version already 0.14.38"
}
elseif ($config -match 'version:\s*"0\.14\.37"') {
    $config = $config -replace 'version:\s*"0\.14\.37"', 'version: "0.14.38"'
    Set-Content $configPath $config -NoNewline
    Write-Host "PATCH: Version 0.14.38"
}
else {
    Write-Warning "Current version is not 0.14.37. Check js/config.js before commit."
}

Write-Host ""
Write-Host "v0.14.38 complete."
Write-Host "Invite/authentication mechanics were not changed."
Write-Host ""
Write-Host "Run:"
Write-Host "  node --check js/microsoft-access.js"
Write-Host "  git diff --check"
Write-Host ""
Write-Host "Then refresh Port 8000 and inspect one Outlook draft before committing."
