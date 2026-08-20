# Upgrade-v0.14.22-DeleteProject-RedStyle-FIXED.ps1
# Makes the existing .danger button visibly red in the live stylesheet.
# This is cosmetic only; no delete logic or project data changes.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.22 - Delete Project Red Style"
Write-Host ""

$path = "css/styles.css"

if (-not (Test-Path $path)) {
  throw "Could not find $path"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.22-delete-style-$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $backupDir "css") -Force | Out-Null
Copy-Item $path (Join-Path $backupDir "css/styles.css") -Force

$css = Get-Content $path -Raw

$rule = @'

.btn.danger{
  color:#b42318;
  border-color:#e3aaa5;
  background:#fff;
}

.btn.danger:hover{
  color:#8f1d14;
  border-color:#b42318;
  background:#fff1f0;
}
'@

if ($css.Contains(".btn.danger{")) {
  Write-Host "SKIP: danger button styling already exists."
}
else {
  $anchor = '.btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}'

  if (-not $css.Contains($anchor)) {
    throw "Could not find the primary button CSS anchor in css/styles.css."
  }

  $css = $css.Replace($anchor, $anchor + $rule)
  Set-Content $path -Value $css -NoNewline
  Write-Host "PATCH: Delete Project danger button now uses red text/border."
}

Write-Host ""
Write-Host "Backup:" $backupDir
Write-Host "Refresh Port 8000 and reopen Edit Project."
