$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "./backup-v0.14.43-$stamp"
New-Item -ItemType Directory -Force "$backup/js" | Out-Null
Copy-Item ./js/data-provider.js "$backup/js/data-provider.js"
Copy-Item ./js/config.js "$backup/js/config.js"
Copy-Item ./v01444/data-provider.js ./js/data-provider.js -Force
Copy-Item ./v01444/config.js ./js/config.js -Force
Write-Host "v0.14.44 Change Log schema fix installed. Backup: $backup" -ForegroundColor Green
Write-Host "Hard refresh with Cmd+Shift+R." -ForegroundColor Cyan
