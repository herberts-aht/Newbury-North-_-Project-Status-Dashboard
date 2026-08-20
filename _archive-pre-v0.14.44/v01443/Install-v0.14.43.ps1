$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "./backup-v0.14.42-$stamp"

New-Item -ItemType Directory -Force "$backup/js","$backup/css" | Out-Null
Copy-Item ./index.html "$backup/"
Copy-Item ./js/dashboard.js,./js/config.js "$backup/js/"
Copy-Item ./css/styles.css,./css/mobile.css "$backup/css/"

$source = $PSScriptRoot
Copy-Item "$source/index.html" ./index.html -Force
Copy-Item "$source/dashboard.js" ./js/dashboard.js -Force
Copy-Item "$source/config.js" ./js/config.js -Force
Copy-Item "$source/styles.css" ./css/styles.css -Force
Copy-Item "$source/mobile.css" ./css/mobile.css -Force

Write-Host "v0.14.43 installed. Backup: $backup" -ForegroundColor Green
Write-Host "Hard refresh the dashboard with Cmd+Shift+R." -ForegroundColor Green
