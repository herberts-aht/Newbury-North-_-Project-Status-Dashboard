# Upgrade-v0.14.34-Outlook-Mailto.ps1
# Now that macOS mailto: is explicitly assigned to Microsoft Outlook,
# restore the standard mailto compose handoff.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.34 - Outlook Desktop via mailto"
Write-Host ""

$path = "js/microsoft-access.js"
$configPath = "js/config.js"

foreach ($file in @($path,$configPath)) {
    if (-not (Test-Path $file)) { throw "Missing required file: $file" }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.34-outlook-mailto-$stamp"
New-Item -ItemType Directory -Path "$backupDir/js" -Force | Out-Null
Copy-Item $path "$backupDir/js/microsoft-access.js" -Force
Copy-Item $configPath "$backupDir/js/config.js" -Force
Write-Host "BACKUP: $backupDir"

$content = Get-Content $path -Raw

$old = @'
    const outlookUri =
      `ms-outlook://compose?to=${encodeURIComponent(email)}` +
      `&subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    // Force the native Microsoft Outlook app on macOS instead of the
    // operating system's default mailto handler.
    window.location.href = outlookUri;
'@

$new = @'
    const mailto =
      `mailto:${encodeURIComponent(email)}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    // macOS mailto: is configured to open Microsoft Outlook.
    window.location.href = mailto;
'@

if ($content.Contains($new)) {
    Write-Host "SKIP: Outlook mailto handoff already applied."
}
elseif (-not $content.Contains($old)) {
    throw "Could not find the v0.14.33 ms-outlook compose block. No changes made."
}
else {
    $content = $content.Replace($old,$new)
    Set-Content $path $content -NoNewline
    Write-Host "PATCH: Restored standard mailto compose handoff."
}

$config = Get-Content $configPath -Raw

if ($config -match 'version:\s*"0\.14\.34"') {
    Write-Host "SKIP: Version already 0.14.34"
}
elseif ($config -match 'version:\s*"0\.14\.33"') {
    $config = $config -replace 'version:\s*"0\.14\.33"', 'version: "0.14.34"'
    Set-Content $configPath $config -NoNewline
    Write-Host "PATCH: Version 0.14.34"
}
else {
    Write-Warning "Current version is not 0.14.33. Check js/config.js before commit."
}

Write-Host ""
Write-Host "v0.14.34 patch complete."
Write-Host "DO NOT COMMIT YET."
Write-Host ""
Write-Host "Run:"
Write-Host "  node --check js/microsoft-access.js"
Write-Host "  git diff --check"
Write-Host ""
Write-Host "Then refresh Port 8000 and test Open Outlook Draft."
