# Upgrade-v0.14.32-Native-Outlook-Invite.ps1
# Returns invitation compose to mailto so macOS opens the native default mail client.
# Set Microsoft Outlook as the Mac default mail app.
# Also improves greeting and removes manual signature/sign-off.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.32 - Native Outlook Invite"
Write-Host ""

$path = "js/microsoft-access.js"
$configPath = "js/config.js"

foreach ($file in @($path,$configPath)) {
    if (-not (Test-Path $file)) { throw "Missing required file: $file" }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.32-native-outlook-$stamp"
New-Item -ItemType Directory -Path "$backupDir/js" -Force | Out-Null
Copy-Item $path "$backupDir/js/microsoft-access.js" -Force
Copy-Item $configPath "$backupDir/js/config.js" -Force
Write-Host "BACKUP: $backupDir"

$content = Get-Content $path -Raw

# Find the complete draft helper so this remains robust against minor formatting changes.
$startMarker = '  function openExternalInviteDraft({ email, name, projects, redeemUrl }) {'
$endMarker = '  async function copyRedeemLink() {'

$start = $content.IndexOf($startMarker)
$end = $content.IndexOf($endMarker)

if ($start -lt 0 -or $end -lt 0 -or $end -le $start) {
    throw "Could not locate openExternalInviteDraft() function boundaries."
}

$oldBlock = $content.Substring($start, $end - $start)

$newBlock = @'
  function openExternalInviteDraft({ email, name, projects, redeemUrl }) {
    const enteredName = String(name || "").trim();
    const firstName = enteredName && normalizeEmail(enteredName) !== normalizeEmail(email)
      ? enteredName.split(/\s+/)[0]
      : "";

    const greeting = firstName ? `Hi ${firstName},` : "Hi,";
    const projectText = Array.isArray(projects) && projects.length
      ? projects.join(" & ")
      : "your assigned project(s)";

    const subject = `AHT Project Control Access - ${projectText}`;
    const body = [
      greeting,
      "",
      `You've been granted access to the AHT Project Control dashboard for ${projectText}.`,
      "",
      "Activate your Project Control access:",
      redeemUrl,
      "",
      "Once completed, you can sign in to Project Control using this email address.",
      "",
      // Intentionally no manual closing/signature.
      // Outlook's configured signature can be used instead.
    ].join("\n");

    const mailto =
      `mailto:${encodeURIComponent(email)}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
  }

'@

$content = $content.Substring(0,$start) + $newBlock + $content.Substring($end)
Set-Content $path $content -NoNewline
Write-Host "PATCH: Native mailto compose restored for Outlook desktop."
Write-Host "PATCH: Greeting now uses first name from Name field."
Write-Host "PATCH: Blank Name now produces 'Hi,' instead of the email address."
Write-Host "PATCH: Removed manual Thanks/Stace closing."

$config = Get-Content $configPath -Raw

if ($config -match 'version:\s*"0\.14\.32"') {
    Write-Host "SKIP: Version already 0.14.32"
}
elseif ($config -match 'version:\s*"0\.14\.31"') {
    $config = $config -replace 'version:\s*"0\.14\.31"', 'version: "0.14.32"'
    Set-Content $configPath $config -NoNewline
    Write-Host "PATCH: Version 0.14.32"
}
else {
    Write-Warning "Current version is not 0.14.31. Check js/config.js before commit."
}

Write-Host ""
Write-Host "v0.14.32 patch complete."
Write-Host ""
Write-Host "IMPORTANT: macOS controls which desktop app handles mailto links."
Write-Host "Set Microsoft Outlook as the Mac default email app before testing."
Write-Host ""
Write-Host "DO NOT COMMIT YET."
Write-Host "Run:"
Write-Host "  node --check js/microsoft-access.js"
Write-Host "  git diff --check"
