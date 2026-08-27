# Upgrade-SiteOperations-LocationSchema.ps1
# One-time fallback for environments where the dashboard cannot auto-create the new location metadata column.
# Requires an active Connect-PnPOnline session to the Newbury North SharePoint site.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control - Site Operations Location Schema Upgrade" -ForegroundColor Cyan
Write-Host "----------------------------------------------------------------"

$listName = "Project Locations"


$numberField = Get-PnPField -List $listName -Identity "LocationNumber" -ErrorAction SilentlyContinue
if (-not $numberField) {
    Write-Host "Adding Location Number field..." -ForegroundColor Yellow
    Add-PnPField `
        -List $listName `
        -DisplayName "Location Number" `
        -InternalName "LocationNumber" `
        -Type Text `
        -AddToDefaultView | Out-Null
    Write-Host "Location Number field added." -ForegroundColor Green
} else {
    Write-Host "Location Number field already exists." -ForegroundColor DarkGray
}

$field = Get-PnPField -List $listName -Identity "PlanLevel" -ErrorAction SilentlyContinue
if (-not $field) {
    Write-Host "Adding Level / Floor field..." -ForegroundColor Yellow
    Add-PnPField `
        -List $listName `
        -DisplayName "Level / Floor" `
        -InternalName "PlanLevel" `
        -Type Text `
        -AddToDefaultView | Out-Null
    Write-Host "Added Level / Floor." -ForegroundColor Green
}
else {
    Write-Host "Level / Floor already exists." -ForegroundColor DarkGray
}


$weightField = Get-PnPField -List $listName -Identity "LocationProgressWeight" -ErrorAction SilentlyContinue
if (-not $weightField) {
    Write-Host "Adding Location Rollup Weight field..." -ForegroundColor Yellow
    Add-PnPField `
        -List $listName `
        -DisplayName "Location Rollup Weight" `
        -InternalName "LocationProgressWeight" `
        -Type Number `
        -AddToDefaultView | Out-Null
    Write-Host "Added Location Rollup Weight." -ForegroundColor Green
}
else {
    Write-Host "Location Rollup Weight already exists." -ForegroundColor DarkGray
}

$typeField = Get-PnPField -List $listName -Identity "LocationType" -ErrorAction SilentlyContinue
if ($typeField) {
    $choices = @($typeField.Choices)
    if ($choices -notcontains "Area") {
        Write-Host "Adding Area to Location Type choices..." -ForegroundColor Yellow
        $updated = [string[]]@($choices + "Area" | Select-Object -Unique)
        $typeField.Choices = $updated
        $typeField.Update()
        Invoke-PnPQuery
        Write-Host "Added Area choice." -ForegroundColor Green
    }
    else {
        Write-Host "Area Location Type already exists." -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "Location schema upgrade complete." -ForegroundColor Green
