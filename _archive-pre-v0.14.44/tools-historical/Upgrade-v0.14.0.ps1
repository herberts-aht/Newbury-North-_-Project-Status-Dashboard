param(
    [string]$SiteUrl = "https://ahtglobalteam.sharepoint.com/sites/NewburyNorth",
    [string]$ClientId = "31d011da-f938-4518-89f0-f6888e952a1e",
    [string]$Tenant = "5a5d8945-36e4-407e-89ba-5e5cc456ff3b"
)

$ErrorActionPreference = "Stop"

Write-Host "Connecting to $SiteUrl..." -ForegroundColor Cyan
Connect-PnPOnline -Url $SiteUrl -DeviceLogin -ClientId $ClientId -Tenant $Tenant

function Ensure-ChoiceField {
    param([string]$List,[string]$InternalName,[string]$DisplayName,[string[]]$Choices,[string]$DefaultValue="")
    $field = Get-PnPField -List $List -Identity $InternalName -ErrorAction SilentlyContinue
    if (-not $field) {
        Add-PnPField -List $List -InternalName $InternalName -DisplayName $DisplayName -Type Choice -Choices $Choices -AddToDefaultView | Out-Null
        if ($DefaultValue) { Set-PnPField -List $List -Identity $InternalName -Values @{ DefaultValue = $DefaultValue } | Out-Null }
        Write-Host "Added $List.$InternalName" -ForegroundColor Green
    } else { Write-Host "Exists $List.$InternalName" -ForegroundColor DarkGray }
}
function Ensure-NumberField {
    param([string]$List,[string]$InternalName,[string]$DisplayName,[double]$DefaultValue=0)
    $field = Get-PnPField -List $List -Identity $InternalName -ErrorAction SilentlyContinue
    if (-not $field) {
        Add-PnPField -List $List -InternalName $InternalName -DisplayName $DisplayName -Type Number -AddToDefaultView | Out-Null
        Set-PnPField -List $List -Identity $InternalName -Values @{ DefaultValue = [string]$DefaultValue } | Out-Null
        Write-Host "Added $List.$InternalName" -ForegroundColor Green
    } else { Write-Host "Exists $List.$InternalName" -ForegroundColor DarkGray }
}

Ensure-ChoiceField -List "Projects" -InternalName "ProgressPlanningMode" -DisplayName "Planning Progress Mode" -Choices @("auto","manual") -DefaultValue "manual"
Ensure-ChoiceField -List "Projects" -InternalName "ProgressEngineeringMode" -DisplayName "Engineering Progress Mode" -Choices @("auto","manual") -DefaultValue "manual"
Ensure-ChoiceField -List "Projects" -InternalName "ProgressInstallationMode" -DisplayName "Installation Progress Mode" -Choices @("auto","manual") -DefaultValue "manual"
Ensure-ChoiceField -List "Projects" -InternalName "ProgressOverallMode" -DisplayName "Overall Progress Mode" -Choices @("auto","manual") -DefaultValue "auto"
Ensure-NumberField -List "Projects" -InternalName "ProgressOverallOverride" -DisplayName "Overall Manual Progress" -DefaultValue 0
Ensure-ChoiceField -List "Deliverables" -InternalName "ProgressPhase" -DisplayName "Progress Phase" -Choices @("Planning","Engineering","Installation","Exclude")

# Preserve all existing project percentages by explicitly putting existing rows in Manual phase mode.
$projects = Get-PnPListItem -List "Projects" -PageSize 200
foreach ($item in $projects) {
    Set-PnPListItem -List "Projects" -Identity $item.Id -Values @{
        ProgressPlanningMode = "manual"
        ProgressEngineeringMode = "manual"
        ProgressInstallationMode = "manual"
        ProgressOverallMode = "auto"
    } | Out-Null
}

Write-Host "" 
Write-Host "v0.14.0 SharePoint fields are ready." -ForegroundColor Green
Write-Host "Existing Planning / Engineering / Installation values were preserved in Manual mode." -ForegroundColor Yellow
Write-Host "Assign each Deliverable a Progress Phase in the dashboard, then switch project phases to Auto when ready." -ForegroundColor Yellow
