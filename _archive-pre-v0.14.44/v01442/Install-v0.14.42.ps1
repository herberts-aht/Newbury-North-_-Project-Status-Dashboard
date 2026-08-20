$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root "backup-v0.14.41-$stamp"
New-Item -ItemType Directory -Force (Join-Path $backup "js"),(Join-Path $backup "css") | Out-Null
Copy-Item (Join-Path $root "index.html") $backup
Copy-Item (Join-Path $root "js/dashboard.js"),(Join-Path $root "js/data-provider.js"),(Join-Path $root "js/storage.js"),(Join-Path $root "js/config.js") (Join-Path $backup "js")
Copy-Item (Join-Path $root "css/styles.css"),(Join-Path $root "css/mobile.css") (Join-Path $backup "css")
Copy-Item (Join-Path $here "index.html") (Join-Path $root "index.html") -Force
Copy-Item (Join-Path $here "dashboard.js") (Join-Path $root "js/dashboard.js") -Force
Copy-Item (Join-Path $here "data-provider.js") (Join-Path $root "js/data-provider.js") -Force
Copy-Item (Join-Path $here "storage.js") (Join-Path $root "js/storage.js") -Force
Copy-Item (Join-Path $here "config.js") (Join-Path $root "js/config.js") -Force
Copy-Item (Join-Path $here "styles.css") (Join-Path $root "css/styles.css") -Force
Copy-Item (Join-Path $here "mobile.css") (Join-Path $root "css/mobile.css") -Force
Write-Host "v0.14.42 installed. Backup: $backup" -ForegroundColor Green
