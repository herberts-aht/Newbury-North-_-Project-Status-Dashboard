# Upgrade-v0.14.31-Idempotent-Group-Membership.ps1
# Treats "already a member" as success so external-user recovery can continue.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.31 - Idempotent Group Membership"
Write-Host ""

$path = "js/microsoft-access.js"
$configPath = "js/config.js"

foreach ($file in @($path,$configPath)) {
    if (-not (Test-Path $file)) { throw "Missing required file: $file" }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.31-idempotent-membership-$stamp"
New-Item -ItemType Directory -Path "$backupDir/js" -Force | Out-Null
Copy-Item $path "$backupDir/js/microsoft-access.js" -Force
Copy-Item $configPath "$backupDir/js/config.js" -Force

$content = Get-Content $path -Raw

$old = @'
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
'@

$new = @'
      } catch (error) {
        lastError = error;
        const message = String(error?.message || error || "");

        const alreadyMember =
          message.includes("already exist") ||
          message.includes("added object references already exist") ||
          message.includes("One or more added object references already exist");

        if (alreadyMember) {
          return;
        }

        const retryable =
          message.includes("does not exist") ||
          message.includes("Request_ResourceNotFound") ||
          message.includes("Directory_ObjectNotFound");

        if (!retryable || attempt === delays.length - 1) {
          throw error;
        }
      }
'@

if ($content.Contains($new)) {
    Write-Host "SKIP: Idempotent membership handling already applied."
}
elseif (-not $content.Contains($old)) {
    throw "Could not find the retry catch block in addMemberObjectId(). No changes made."
}
else {
    $content = $content.Replace($old,$new)
    Set-Content $path $content -NoNewline
    Write-Host "PATCH: Existing group membership is now treated as success."
}

$config = Get-Content $configPath -Raw

if ($config -match 'version:\s*"0\.14\.31"') {
    Write-Host "SKIP: Version already 0.14.31"
}
elseif ($config -match 'version:\s*"0\.14\.30"') {
    $config = $config -replace 'version:\s*"0\.14\.30"', 'version: "0.14.31"'
    Set-Content $configPath $config -NoNewline
    Write-Host "PATCH: Version 0.14.31"
}
else {
    Write-Warning "Current version is not 0.14.30. Check js/config.js before commit."
}

Write-Host ""
Write-Host "v0.14.31 membership patch complete."
Write-Host "Backup: $backupDir"
Write-Host ""
Write-Host "DO NOT COMMIT YET."
Write-Host "Next:"
Write-Host "  node --check js/microsoft-access.js"
Write-Host "  git diff --check"
Write-Host "Then refresh Port 8000 and retry the existing Blue Mountain guest."
