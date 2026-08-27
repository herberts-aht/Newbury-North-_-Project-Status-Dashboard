$ErrorActionPreference = "Stop"

$projectTitle = "2340 Gordon Dr"
$parentName   = "Main House"
$listName     = "Project Locations"

Write-Host ""
Write-Host "2340 Main House Bulk Location Import" -ForegroundColor Cyan
Write-Host "------------------------------------"

# Find project
$project = Get-PnPListItem -List "Projects" -PageSize 500 |
    Where-Object { $_["Title"] -eq $projectTitle } |
    Select-Object -First 1

if (-not $project) {
    throw "Project '$projectTitle' was not found."
}

$projectId = $project.Id
Write-Host "Project found: $projectTitle (ID $projectId)" -ForegroundColor Green

# Find Main House under this project
$locations = Get-PnPListItem -List $listName -PageSize 500 -Fields `
    "Title",
    "Project",
    "ParentLocation",
    "LocationType",
    "PlanLevel",
    "LocationProgressWeight",
    "Active"

$mainHouse = $locations |
    Where-Object {
        $_["Title"] -eq $parentName -and
        $_["Project"].LookupId -eq $projectId
    } |
    Select-Object -First 1

if (-not $mainHouse) {
    throw "Main House was not found under '$projectTitle'."
}

$mainHouseId = $mainHouse.Id
Write-Host "Parent found: Main House (ID $mainHouseId)" -ForegroundColor Green
Write-Host ""

$roomNames = @(
    "Office",
    "Primary Bedroom 1",
    "Primary Terrace",
    "Primary Bathroom",
    "Wardrobe",
    "Primary Bedroom 2",
    "Primary Bathroom 2",
    "Primary Balcony",
    "Living Room",
    "Gulf Terrace",
    "Dining Room",
    "Outdoor Living and Dining",
    "Outdoor Kitchen",
    "Family Room",
    "Outdoor Pool",
    "Outdoor Spa",
    "Cabana",
    "Kitchen",
    "Club Room (inc. Bar)",
    "Club Terrace",
    "Gym and Pool Lounge",
    "Sauna",
    "Dressing Room",
    "Gym Shower Room 1",
    "Spa",
    "Gym Shower Room 2",
    "Gym Terrace",
    "Gym",
    "Indoor Pool",
    "Guest Suite #1",
    "Guest Suite Bath #1",
    "Guest Terrace",
    "Guest Suite #2",
    "Guest Suite Bath #2",
    "Guest Lounge",
    "Guest Suite #3",
    "Guest Suite Bath #3",
    "Guest Balcony",
    "Gulf Balcony",
    "Sunset Balcony",
    "Suite #1",
    "Suite Bath #1",
    "Suite #2",
    "Suite Bath #2",
    "Suite #3",
    "Suite Bath #3",
    "Suite #4",
    "Suite Bath #4",
    "Salon",
    "Morning Kitchen",
    "Lounge",
    "Sitting",
    "Mud Room",
    "East Balcony",
    "Sunrise Balcony"
)

$exteriorNames = @(
    "Primary Terrace",
    "Primary Balcony",
    "Gulf Terrace",
    "Outdoor Living and Dining",
    "Outdoor Kitchen",
    "Outdoor Pool",
    "Outdoor Spa",
    "Cabana",
    "Club Terrace",
    "Gym Terrace",
    "Guest Terrace",
    "Guest Balcony",
    "Gulf Balcony",
    "Sunset Balcony",
    "East Balcony",
    "Sunrise Balcony"
)

$existingNames = @{}

foreach ($item in $locations) {
    if (
        $item["Project"].LookupId -eq $projectId -and
        $item["ParentLocation"] -and
        $item["ParentLocation"].LookupId -eq $mainHouseId
    ) {
        $existingNames[$item["Title"].Trim().ToLowerInvariant()] = $true
    }
}

$created = 0
$skipped = 0
$sortOrder = 10

foreach ($name in $roomNames) {

    $key = $name.Trim().ToLowerInvariant()

    if ($existingNames.ContainsKey($key)) {
        Write-Host "SKIP  $name" -ForegroundColor DarkGray
        $skipped++
        continue
    }

    $type = if ($exteriorNames -contains $name) {
        "Exterior"
    }
    else {
        "Room"
    }

    Add-PnPListItem `
        -List $listName `
        -Values @{
            Title                  = $name
            Project                = $projectId
            ParentLocation         = $mainHouseId
            LocationType           = $type
            PlanLevel              = ""
            SortOrder              = $sortOrder
            Active                 = $true
            LocationProgressWeight = 1
        } | Out-Null

    Write-Host "ADD   [$type] $name" -ForegroundColor Green

    $created++
    $sortOrder += 10
}

Write-Host ""
Write-Host "Import complete." -ForegroundColor Cyan
Write-Host "Created: $created" -ForegroundColor Green
Write-Host "Skipped existing: $skipped" -ForegroundColor Yellow
Write-Host ""
