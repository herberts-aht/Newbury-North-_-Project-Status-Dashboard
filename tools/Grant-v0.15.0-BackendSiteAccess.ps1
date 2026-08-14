param(
    [string]$SiteUrl = "https://ahtglobalteam.sharepoint.com/sites/NewburyNorth",
    [string]$PnPClientId = "31d011da-f938-4518-89f0-f6888e952a1e",
    [string]$BackendClientId = "bf827b7e-aede-449e-bdfa-e6cee3dad6ca",
    [string]$Tenant = "5a5d8945-36e4-407e-89ba-5e5cc456ff3b"
)

$ErrorActionPreference = "Stop"
Write-Host "Connecting to $SiteUrl..." -ForegroundColor Cyan
Connect-PnPOnline -Url $SiteUrl -DeviceLogin -ClientId $PnPClientId -Tenant $Tenant

Write-Host "Granting the Project Control backend app Write access to this site only..." -ForegroundColor Cyan
Grant-PnPAzureADAppSitePermission -AppId $BackendClientId -DisplayName "AHT Project Control Backend" -Permissions Write | Out-Null

Write-Host "Site-level permission granted." -ForegroundColor Green
Write-Host "Note: the backend app must ALSO have Microsoft Graph Application permission Sites.Selected with admin consent." -ForegroundColor Yellow
