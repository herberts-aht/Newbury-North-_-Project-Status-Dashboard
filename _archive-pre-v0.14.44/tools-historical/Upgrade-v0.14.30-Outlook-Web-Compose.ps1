# Upgrade-v0.14.30-Outlook-Web-Compose.ps1
# Forces external invitation drafts to open in Outlook on the web
# instead of using the operating system's default mail app.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.30 - Outlook Web Compose"
Write-Host ""

$path = "js/microsoft-access.js"
$configPath = "js/config.js"

foreach ($file in @($path,$configPath)) {
    if (-not (Test-Path $file)) { throw "Missing required file: $file" }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.30-outlook-web-$stamp"
New-Item -ItemType Directory -Path "$backupDir/js" -Force | Out-Null
Copy-Item $path "$backupDir/js/microsoft-access.js" -Force
Copy-Item $configPath "$backupDir/js/config.js" -Force

$content = Get-Content $path -Raw

$old = @'
    const mailto =
      `mailto:${encodeURIComponent(email)}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
'@

$new = @'
    const outlookUrl =
      "https://outlook.office.com/mail/deeplink/compose" +
      `?to=${encodeURIComponent(email)}` +
      `&subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    const draftWindow = window.open(outlookUrl, "_blank", "noopener,noreferrer");

    if (!draftWindow) {
      setStatus(
        "Outlook draft was blocked by the browser. Allow pop-ups for Project Control and try again.",
        "error"
      );
    }
'@

if ($content.Contains($new)) {
    Write-Host "SKIP: Outlook web compose patch already applied."
}
elseif (-not $content.Contains($old)) {
    throw "Could not find the current mailto draft block. No changes made."
}
else {
    $content = $content.Replace($old,$new)
    Set-Content $path $content -NoNewline
    Write-Host "PATCH: External invitation drafts now open Outlook on the web."
}

$config = Get-Content $configPath -Raw

if ($config -match 'version:\s*"0\.14\.30"') {
    Write-Host "SKIP: Version already 0.14.30"
}
elseif ($config -match 'version:\s*"0\.14\.29"') {
    $config = $config -replace 'version:\s*"0\.14\.29"', 'version: "0.14.30"'
    Set-Content $configPath $config -NoNewline
    Write-Host "PATCH: Version 0.14.30"
}
else {
    Write-Warning "Current version is not 0.14.29. Check js/config.js before commit."
}

Write-Host ""
Write-Host "v0.14.30 Outlook web compose patch complete."
Write-Host "Backup: $backupDir"
Write-Host ""
Write-Host "DO NOT COMMIT YET."
Write-Host "Next:"
Write-Host "  node --check js/microsoft-access.js"
Write-Host "  git diff --check"
Write-Host "Then refresh Port 8000 and click Open Outlook Draft."
