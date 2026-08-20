# Upgrade-v0.14.22-ReadableProjectKeys.ps1
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.22 - Readable Project Keys"
Write-Host ""

try {
  $connection = Get-PnPConnection
  if (-not $connection) { throw "No PnP connection." }
} catch {
  throw "PnP is not connected. Run Connect-PnPOnline to the NewburyNorth site first."
}

$indexPath = "index.html"
$index = Get-Content $indexPath -Raw

if ($index -notmatch 'const baseId=String\(address\|\|"PROJECT"\)') {
  throw "Readable future-project generator was not found in index.html. Stopping before SharePoint migration."
}

Write-Host "CHECK: Future dashboard-created projects use readable address-based keys."

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.22-$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

foreach ($file in @("index.html","js/config.js")) {
  $dest = Join-Path $backupDir $file
  $destDir = Split-Path $dest -Parent
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  Copy-Item $file $dest -Force
}

Write-Host "BACKUP:" $backupDir

$projectMap = [ordered]@{
  "project_1786753982993" = "2490-GORDON"
  "project_1786754131999" = "3400-GORDON"
}

$projects = Get-PnPListItem -List "Projects"

foreach ($item in $projects) {
  $oldKey = [string]$item["ProjectKey"]

  if ($projectMap.Contains($oldKey)) {
    $newKey = $projectMap[$oldKey]

    Set-PnPListItem `
      -List "Projects" `
      -Identity $item.Id `
      -Values @{ ProjectKey = $newKey } | Out-Null

    Write-Host "PROJECT:" $item["Title"] ":" $oldKey "->" $newKey
  }
}

$accessRows = Get-PnPListItem -List "Dashboard Access"

foreach ($item in $accessRows) {
  $keys = [string]$item["ProjectKeys"]

  if ([string]::IsNullOrWhiteSpace($keys) -or $keys.Trim() -eq "*") {
    continue
  }

  $parts = $keys -split ";" |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ }

  $changed = $false

  $updatedParts = foreach ($key in $parts) {
    if ($projectMap.Contains($key)) {
      $changed = $true
      $projectMap[$key]
    } else {
      $key
    }
  }

  if ($changed) {
    $updated = ($updatedParts | Select-Object -Unique) -join ";"

    Set-PnPListItem `
      -List "Dashboard Access" `
      -Identity $item.Id `
      -Values @{ ProjectKeys = $updated } | Out-Null

    Write-Host "ACCESS:" $item["Title"] "->" $updated
  }
}

$configPath = "js/config.js"
$config = Get-Content $configPath -Raw

if ($config -match 'version:\s*"0\.14\.22"') {
  Write-Host "SKIP: Version already 0.14.22"
}
elseif ($config -match 'version:\s*"0\.14\.21"') {
  $config = $config -replace 'version:\s*"0\.14\.21"', 'version: "0.14.22"'
  Set-Content $configPath -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.22"
}
else {
  throw "Expected current version 0.14.21 in js/config.js."
}

Write-Host ""
Write-Host "PROJECTS:"
Get-PnPListItem -List "Projects" |
  ForEach-Object {
    [PSCustomObject]@{
      Title      = $_["Title"]
      ProjectKey = $_["ProjectKey"]
    }
  } | Format-Table -AutoSize

Write-Host ""
Write-Host "DASHBOARD ACCESS:"
Get-PnPListItem -List "Dashboard Access" |
  ForEach-Object {
    [PSCustomObject]@{
      User        = $_["Title"]
      Role        = $_["DashboardRole"]
      ProjectKeys = $_["ProjectKeys"]
    }
  } | Format-Table -AutoSize -Wrap

Write-Host ""
Write-Host "v0.14.22 migration complete."
Write-Host "Expected keys: 2200-GORDON, 2340-GORDON, 2490-GORDON, 3400-GORDON"
Write-Host ""
Write-Host "Next: refresh Port 8000, confirm all four project cards open,"
Write-Host "then open Bill and Shaun in Administration and confirm all four projects are checked."
Write-Host "Save each once and re-check Dashboard Access."
Write-Host "Do NOT commit until those checks pass."
