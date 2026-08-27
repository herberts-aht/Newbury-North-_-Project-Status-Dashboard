# Import-2200-MainHouse-Locations.ps1
# Bulk-loads the Main House locations from the client AV & Integrated Systems Requirements v2.4.
# Run only after connecting PnP to:
# https://ahtglobalteam.sharepoint.com/sites/NewburyNorth

$ErrorActionPreference = "Stop"

$projectTitle = "2200 Gordon Dr"
$parentName   = "Main House"
$listName     = "Project Locations"

Write-Host ""
Write-Host "2200 Main House Bulk Location Import" -ForegroundColor Cyan
Write-Host "------------------------------------"

$project = Get-PnPListItem -List "Projects" -PageSize 500 |
    Where-Object { $_["Title"] -eq $projectTitle } |
    Select-Object -First 1

if (-not $project) {
    throw "Project '$projectTitle' was not found."
}

$projectId = $project.Id
Write-Host "Project found: $projectTitle (ID $projectId)" -ForegroundColor Green

$locations = Get-PnPListItem -List $listName -PageSize 1000 -Fields `
    "Title", `
    "Project", `
    "ParentLocation", `
    "LocationNumber", `
    "LocationType", `
    "PlanLevel", `
    "LocationProgressWeight", `
    "SortOrder", `
    "Active"

$mainHouse = $locations |
    Where-Object {
        $_["Title"] -eq $parentName -and
        $_["Project"] -and
        $_["Project"].LookupId -eq $projectId
    } |
    Select-Object -First 1

if (-not $mainHouse) {
    Write-Host "Main House not found. Creating top-level Building..." -ForegroundColor Yellow
    $mainHouse = Add-PnPListItem -List $listName -Values @{
        Title                  = $parentName
        Project                = $projectId
        LocationType           = "Building"
        SortOrder              = 10
        Active                 = $true
        LocationProgressWeight = 1
    }
    Write-Host "Created Main House (ID $($mainHouse.Id))." -ForegroundColor Green
    $locations = @($locations) + $mainHouse
}

$mainHouseId = $mainHouse.Id
Write-Host "Parent: Main House (ID $mainHouseId)" -ForegroundColor Green
Write-Host ""

# Number is intentionally stored as text so values like 001 retain leading zeroes.
# Level / Floor is intentionally left blank for field verification against the construction plans.
$source = @(
    @{ Number="001"; Name="Owners Garage"; Type="Room" },
    @{ Number="101"; Name="Entrance Hall"; Type="Room" },
    @{ Number="102"; Name="Gallery"; Type="Room" },
    @{ Number="103"; Name="Hallway"; Type="Room" },
    @{ Number="107"; Name="Bedroom 3"; Type="Room" },
    @{ Number="108"; Name="Bathroom 3"; Type="Room" },
    @{ Number="111"; Name="Living Room"; Type="Room" },
    @{ Number="112"; Name="Bedroom 1"; Type="Room" },
    @{ Number="113"; Name="Bathroom 1"; Type="Room" },
    @{ Number="115"; Name="Bedroom 2"; Type="Room" },
    @{ Number="116"; Name="Bathroom 2"; Type="Room" },
    @{ Number="118"; Name="Main Living Space"; Type="Room" },
    @{ Number="120"; Name="Media Room"; Type="Room" },
    @{ Number="121"; Name="Game Room"; Type="Room" },
    @{ Number="124"; Name="Cinema"; Type="Room" },
    @{ Number="134"; Name="Staff Room"; Type="Room" },
    @{ Number="135"; Name="Staff Bedroom 1"; Type="Room" },
    @{ Number="138"; Name="Staff Bedroom 2"; Type="Room" },
    @{ Number="145"; Name="Study"; Type="Room" },
    @{ Number="150"; Name="Gym"; Type="Room" },
    @{ Number="151"; Name="Studio"; Type="Room" },
    @{ Number="152"; Name="Hallway"; Type="Room" },
    @{ Number="153"; Name="Hallway"; Type="Room" },
    @{ Number="154"; Name="Changing Room 1"; Type="Room" },
    @{ Number="156"; Name="Changing Room 2"; Type="Room" },
    @{ Number="157"; Name="Pool Lobby"; Type="Room" },
    @{ Number="158"; Name="Indoor Pool"; Type="Room" },
    @{ Number="159"; Name="Cold Tub"; Type="Room" },
    @{ Number="160"; Name="Sauna"; Type="Room" },
    @{ Number="201"; Name="Mezzanine"; Type="Room" },
    @{ Number="204"; Name="Bedroom 4"; Type="Room" },
    @{ Number="205"; Name="Bathroom 4"; Type="Room" },
    @{ Number="207"; Name="Bedroom 5"; Type="Room" },
    @{ Number="208"; Name="Bathroom 5"; Type="Room" },
    @{ Number="210"; Name="Gallery"; Type="Room" },
    @{ Number="212"; Name="Bedroom 6"; Type="Room" },
    @{ Number="213"; Name="Bathroom 6"; Type="Room" },
    @{ Number="216"; Name="Bedroom 7"; Type="Room" },
    @{ Number="217"; Name="Bathroom 7"; Type="Room" },
    @{ Number="220"; Name="Yoga"; Type="Room" },
    @{ Number="221"; Name="Gym"; Type="Room" },
    @{ Number="224"; Name="Wellness"; Type="Room" },
    @{ Number="226"; Name="Primary Bedroom A"; Type="Room" },
    @{ Number="227"; Name="Primary Bathroom A"; Type="Room" },
    @{ Number="228"; Name="Primary Wardrobe A"; Type="Room" },
    @{ Number="229"; Name="Primary Bedroom B"; Type="Room" },
    @{ Number="230"; Name="Primary Bathroom B"; Type="Room" },
    @{ Number="231"; Name="Primary Wardrobe B"; Type="Room" },
    @{ Number="234"; Name="Salon"; Type="Room" },
    @{ Number=""; Name="Pool Terrace"; Type="Exterior" },
    @{ Number=""; Name="Outdoor Living"; Type="Exterior" },
    @{ Number=""; Name="Outdoor Dining"; Type="Exterior" },
    @{ Number=""; Name="Outdoor Kitchen"; Type="Exterior" },
    @{ Number=""; Name="Outdoor Pool"; Type="Exterior" },
    @{ Number=""; Name="Cabana"; Type="Exterior" },
    @{ Number=""; Name="Cabana Shower"; Type="Exterior" }
)

$children = @($locations | Where-Object {
    $_["Project"] -and $_["Project"].LookupId -eq $projectId -and
    $_["ParentLocation"] -and $_["ParentLocation"].LookupId -eq $mainHouseId
})

# Names that repeat in the source must never be used alone to identify a numbered room.
$nameCounts = @{}
foreach ($entry in $source) {
    $key = $entry.Name.Trim().ToLowerInvariant()
    if (-not $nameCounts.ContainsKey($key)) { $nameCounts[$key] = 0 }
    $nameCounts[$key]++
}

$created = 0
$updated = 0
$skipped = 0
$sortOrder = 100

foreach ($entry in $source) {
    $number = [string]$entry.Number
    $name = [string]$entry.Name
    $type = [string]$entry.Type
    $nameKey = $name.Trim().ToLowerInvariant()

    $numberMatch = $null
    if ($number) {
        $numberMatch = $children |
            Where-Object { ([string]$_["LocationNumber"]).Trim() -eq $number } |
            Select-Object -First 1
    }

    if ($numberMatch) {
        Write-Host "SKIP  [$number] $name (room number already exists)" -ForegroundColor DarkGray
        $skipped++
        continue
    }

    # If there is a uniquely named pre-existing unnumbered room, reuse it and add its stable number.
    $nameMatch = $children |
        Where-Object {
            ([string]$_["Title"]).Trim().ToLowerInvariant() -eq $nameKey -and
            -not ([string]$_["LocationNumber"]).Trim()
        } |
        Select-Object -First 1

    if ($number -and $nameCounts[$nameKey] -eq 1 -and $nameMatch) {
        Set-PnPListItem -List $listName -Identity $nameMatch.Id -Values @{
            LocationNumber          = $number
            LocationType            = $type
            LocationProgressWeight  = 1
        } | Out-Null
        Write-Host "UPDATE [$number] $name" -ForegroundColor Cyan
        $nameMatch["LocationNumber"] = $number
        $updated++
        continue
    }

    # Unnumbered exterior locations are duplicate-safe by name.
    if (-not $number -and $nameMatch) {
        Write-Host "SKIP  $name (location already exists)" -ForegroundColor DarkGray
        $skipped++
        continue
    }

    $values = @{
        Title                  = $name
        Project                = $projectId
        ParentLocation         = $mainHouseId
        LocationType           = $type
        PlanLevel              = ""
        SortOrder              = $sortOrder
        Active                 = $true
        LocationProgressWeight = 1
    }
    if ($number) { $values.LocationNumber = $number }

    $newItem = Add-PnPListItem -List $listName -Values $values
    Write-Host $(if ($number) { "ADD   [$number] $name" } else { "ADD   [Exterior] $name" }) -ForegroundColor Green
    $children += $newItem
    $created++
    $sortOrder += 10
}

Write-Host ""
Write-Host "Import complete." -ForegroundColor Cyan
Write-Host "Created: $created" -ForegroundColor Green
Write-Host "Updated with room number: $updated" -ForegroundColor Cyan
Write-Host "Skipped existing: $skipped" -ForegroundColor Yellow
Write-Host ""
