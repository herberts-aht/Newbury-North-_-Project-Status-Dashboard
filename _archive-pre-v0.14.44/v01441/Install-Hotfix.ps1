$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "./backup-v0.14.40-save-hotfix-$stamp"
New-Item -ItemType Directory -Force "$backup/js" | Out-Null
Copy-Item ./js/data-provider.js,./js/config.js "$backup/js/"
Copy-Item ./v01441/js/data-provider.js ./js/data-provider.js -Force
Copy-Item ./v01441/js/config.js ./js/config.js -Force
Write-Host "v0.14.41 save hotfix installed. Backup: $backup" -ForegroundColor Green
