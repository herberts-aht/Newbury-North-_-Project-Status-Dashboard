param(
    [string]$SiteUrl = "https://ahtglobalteam.sharepoint.com/sites/NewburyNorth",
    [string]$ClientId = "31d011da-f938-4518-89f0-f6888e952a1e",
    [string]$Tenant = "5a5d8945-36e4-407e-89ba-5e5cc456ff3b",
    [string]$AdminEmail = "stace@ahtglobal.com",
    [string]$TestUserEmail = "dj.its.just.stace@gmail.com"
)

$ErrorActionPreference = "Stop"
$ListName = "Dashboard Access"

Write-Host "Connecting to $SiteUrl..." -ForegroundColor Cyan
Connect-PnPOnline -Url $SiteUrl -DeviceLogin -ClientId $ClientId -Tenant $Tenant

function Ensure-TextField {
    param([string]$List,[string]$InternalName,[string]$DisplayName)
    $field = Get-PnPField -List $List -Identity $InternalName -ErrorAction SilentlyContinue
    if (-not $field) {
        Add-PnPField -List $List -InternalName $InternalName -DisplayName $DisplayName -Type Text -AddToDefaultView | Out-Null
        Write-Host "Added $List.$InternalName" -ForegroundColor Green
    } else { Write-Host "Exists $List.$InternalName" -ForegroundColor DarkGray }
}

function Ensure-BooleanField {
    param([string]$List,[string]$InternalName,[string]$DisplayName)
    $field = Get-PnPField -List $List -Identity $InternalName -ErrorAction SilentlyContinue
    if (-not $field) {
        Add-PnPField -List $List -InternalName $InternalName -DisplayName $DisplayName -Type Boolean -AddToDefaultView | Out-Null
        Write-Host "Added $List.$InternalName" -ForegroundColor Green
    } else { Write-Host "Exists $List.$InternalName" -ForegroundColor DarkGray }
}

function Ensure-ChoiceField {
    param([string]$List,[string]$InternalName,[string]$DisplayName,[string[]]$Choices)
    $field = Get-PnPField -List $List -Identity $InternalName -ErrorAction SilentlyContinue
    if (-not $field) {
        Add-PnPField -List $List -InternalName $InternalName -DisplayName $DisplayName -Type Choice -Choices $Choices -AddToDefaultView | Out-Null
        Write-Host "Added $List.$InternalName" -ForegroundColor Green
    } else { Write-Host "Exists $List.$InternalName" -ForegroundColor DarkGray }
}

$list = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue
if (-not $list) {
    New-PnPList -Title $ListName -Template GenericList -OnQuickLaunch:$false | Out-Null
    Write-Host "Created SharePoint list: $ListName" -ForegroundColor Green
} else {
    Write-Host "Exists SharePoint list: $ListName" -ForegroundColor DarkGray
}

# Title is intentionally used as the normalized email address.
Ensure-TextField -List $ListName -InternalName "ProfileKey" -DisplayName "Profile Key"
Ensure-TextField -List $ListName -InternalName "DisplayName" -DisplayName "Display Name"
Ensure-TextField -List $ListName -InternalName "Company" -DisplayName "Company"
Ensure-ChoiceField -List $ListName -InternalName "DashboardRole" -DisplayName "Dashboard Role" -Choices @("Administrator","Internal Editor","Executive Viewer","External Viewer")
Ensure-TextField -List $ListName -InternalName "ProjectKeys" -DisplayName "Project Keys"
Ensure-BooleanField -List $ListName -InternalName "Active" -DisplayName "Active"
Ensure-TextField -List $ListName -InternalName "EntraObjectId" -DisplayName "Entra Object ID"
Ensure-ChoiceField -List $ListName -InternalName "EntraUserType" -DisplayName "Entra User Type" -Choices @("Member","Guest")

function Upsert-AccessProfile {
    param(
        [string]$Email,
        [string]$Name,
        [string]$Company,
        [string]$Role,
        [string]$ProjectKeys,
        [string]$EntraUserType
    )
    if ([string]::IsNullOrWhiteSpace($Email)) { return }
    $normalized = $Email.Trim().ToLowerInvariant()
    $existing = Get-PnPListItem -List $ListName -PageSize 200 | Where-Object { $_["Title"] -and $_["Title"].ToString().Trim().ToLowerInvariant() -eq $normalized } | Select-Object -First 1
    $values = @{
        Title = $normalized
        ProfileKey = "email-$normalized"
        DisplayName = $Name
        Company = $Company
        DashboardRole = $Role
        ProjectKeys = $ProjectKeys
        Active = $true
        EntraUserType = $EntraUserType
    }
    if ($existing) {
        Set-PnPListItem -List $ListName -Identity $existing.Id -Values $values | Out-Null
        Write-Host "Updated access profile: $normalized" -ForegroundColor Yellow
    } else {
        Add-PnPListItem -List $ListName -Values $values | Out-Null
        Write-Host "Added access profile: $normalized" -ForegroundColor Green
    }
}

Upsert-AccessProfile -Email $AdminEmail -Name "Stace Herbert" -Company "AHT Global" -Role "Administrator" -ProjectKeys "*" -EntraUserType "Member"
if ($TestUserEmail) {
    Upsert-AccessProfile -Email $TestUserEmail -Name "its just stace" -Company "External" -Role "External Viewer" -ProjectKeys "2200;2340" -EntraUserType "Guest"
}

Write-Host ""
Write-Host "v0.15.0 Dashboard Access list is ready." -ForegroundColor Green
Write-Host "Admin profile seeded for $AdminEmail." -ForegroundColor Green
if ($TestUserEmail) { Write-Host "Test profile seeded for $TestUserEmail with projects 2200 and 2340." -ForegroundColor Green }
Write-Host "Next: configure the Azure managed API application settings and app-only SharePoint permission before deploying v0.15.0." -ForegroundColor Yellow
