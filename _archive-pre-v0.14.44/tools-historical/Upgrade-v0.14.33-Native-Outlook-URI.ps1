# Upgrade-v0.14.33-Native-Outlook-URI.ps1
# Opens Microsoft Outlook for Mac directly using the ms-outlook:// URL scheme.
# Avoids Safari/macOS default mailto handling.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.33 - Native Outlook URI"
Write-Host ""

$path = "js/microsoft-access.js"
$configPath = "js/config.js"

foreach ($file in @($path,$configPath)) {
    if (-not (Test-Path $file)) { throw "Missing required file: $file" }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.33-native-outlook-uri-$stamp"
New-Item -ItemType Directory -Path "$backupDir/js" -Force | Out-Null
Copy-Item $path "$backupDir/js/microsoft-access.js" -Force
Copy-Item $configPath "$backupDir/js/config.js" -Force
Write-Host "BACKUP: $backupDir"

$content = Get-Content $path -Raw

$old = @'
    const mailto =
      `mailto:${encodeURIComponent(email)}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
'@

$new = @'
    const outlookUri =
      `ms-outlook://compose?to=${encodeURIComponent(email)}` +
      `&subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    // Force the native Microsoft Outlook app on macOS instead of the
    // operating system's default mailto handler.
    window.location.href = outlookUri;
'@

if ($content.Contains($new)) {
    Write-Host "SKIP: Native Outlook URI already applied."
}
elseif (-not $content.Contains($old)) {
    throw "Could not find the current mailto block. No changes made."
}
else {
    $content = $content.Replace($old,$new)
    Set-Content $path $content -NoNewline
    Write-Host "PATCH: Drafts now target the native Microsoft Outlook app."
}

$config = Get-Content $configPath -Raw

if ($config -match 'version:\s*"0\.14\.33"') {
    Write-Host "SKIP: Version already 0.14.33"
}
elseif ($config -match 'version:\s*"0\.14\.32"') {
    $config = $config -replace 'version:\s*"0\.14\.32"', 'version: "0.14.33"'
    Set-Content $configPath $config -NoNewline
    Write-Host "PATCH: Version 0.14.33"
}
else {
    Write-Warning "Current version is not 0.14.32. Check js/config.js before commit."
}

Write-Host ""
Write-Host "v0.14.33 patch complete."
Write-Host "DO NOT COMMIT YET."
Write-Host ""
Write-Host "Run:"
Write-Host "  node --check js/microsoft-access.js"
Write-Host "  git diff --check"
Write-Host ""
Write-Host "Then refresh Port 8000 and click Open Outlook Draft."
