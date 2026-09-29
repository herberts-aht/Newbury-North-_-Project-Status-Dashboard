[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectKey,

    [hashtable[]]$TopLevelLocations
)

$ErrorActionPreference = "Stop"

# ============================================================
# CONSTANTS / DEFAULTS
# ============================================================

$validLocationTypes = @(
    "Building",
    "Level",
    "Wing",
    "Room",
    "Exterior",
    "Site Zone",
    "Utility",
    "Other",
    "Area"
)

$defaultRoomNumberRules = @(
    @{
        Min   = 0
        Max   = 99
        Level = "Ground Floor / Lower Level"
    },
    @{
        Min   = 100
        Max   = 199
        Level = "First Floor"
    },
    @{
        Min   = 200
        Max   = 299
        Level = "Second Floor"
    }
)

# ============================================================
# VERIFY PNP CONNECTION
# ============================================================

try {
    $connection = Get-PnPConnection
}
catch {
    throw "No active PnP connection. Connect to the AHT SharePoint site first."
}

if (-not $connection) {
    throw "No active PnP connection. Connect to the AHT SharePoint site first."
}

# ============================================================
# RESOLVE PROJECT
# ============================================================

$projectKeyNormalized = $ProjectKey.Trim().ToUpperInvariant()

$project = Get-PnPListItem -List "Projects" -PageSize 500 |
    Where-Object {
        $_["ProjectKey"] -eq $projectKeyNormalized
    } |
    Select-Object -First 1

if (-not $project) {
    throw "ProjectKey '$projectKeyNormalized' was not found in the Projects list."
}

$projectId    = $project.Id
$projectTitle = $project["Title"]

Write-Host ""
Write-Host "AHT PROJECT INITIALIZATION"
Write-Host "--------------------------"
Write-Host "Project Name : $projectTitle"
Write-Host "Project Key  : $projectKeyNormalized"
Write-Host "Project ID   : $projectId"
Write-Host ""

# ============================================================
# SHOW DEFAULT ROOM NUMBER RULES
# ============================================================

Write-Host "Default room-number mapping:"
Write-Host "  000-099 -> Ground Floor / Lower Level"
Write-Host "  100-199 -> First Floor"
Write-Host "  200-299 -> Second Floor"
Write-Host "  300+    -> No automatic assignment"
Write-Host ""

# ============================================================
# CREATE TOP-LEVEL LOCATIONS IF SUPPLIED
# ============================================================

if (-not $TopLevelLocations -or $TopLevelLocations.Count -eq 0) {
    Write-Host "No top-level locations supplied. Nothing to create."
    return
}

$existingLocations = Get-PnPListItem `
    -List "Project Locations" `
    -PageSize 2000 `
    -Fields "Title","Project","ParentLocation","LocationType","SortOrder","Active","LocationProgressWeight"

$projectTopLevel = $existingLocations |
    Where-Object {
        $_["Project"] -and
        $_["Project"].LookupId -eq $projectId -and
        -not $_["ParentLocation"]
    }

$nextSortOrder = 0

if ($projectTopLevel) {
    $maxSort = ($projectTopLevel |
        ForEach-Object {
            if ($null -ne $_["SortOrder"]) {
                [double]$_["SortOrder"]
            }
        } |
        Measure-Object -Maximum).Maximum

    if ($null -ne $maxSort) {
        $nextSortOrder = [math]::Floor($maxSort) + 1
    }
}

foreach ($location in $TopLevelLocations) {

    if (-not $location.ContainsKey("Name")) {
        throw "Each TopLevelLocations entry must include Name."
    }

    if (-not $location.ContainsKey("Type")) {
        throw "Top-level location '$($location.Name)' must include Type."
    }

    $name = [string]$location.Name
    $type = [string]$location.Type

    $name = $name.Trim()
    $type = $type.Trim()

    if ($type -notin $validLocationTypes) {
        throw "Invalid LocationType '$type' for '$name'. Valid choices: $($validLocationTypes -join ', ')"
    }

    $duplicate = $projectTopLevel |
        Where-Object {
            $_["Title"] -eq $name
        } |
        Select-Object -First 1

    if ($duplicate) {
        Write-Host "EXISTS: $name [$type] - ID $($duplicate.Id)"
        continue
    }

    $sortOrder = $nextSortOrder

    if ($location.ContainsKey("SortOrder") -and $null -ne $location.SortOrder) {
        $sortOrder = [double]$location.SortOrder
    }

    $values = @{
        "Title"                  = $name
        "Project"                = $projectId
        "LocationType"           = $type
        "SortOrder"              = $sortOrder
        "Active"                 = $true
        "LocationProgressWeight" = 1
    }

    if ($location.ContainsKey("PlanLevel") -and $location.PlanLevel) {
        $values["PlanLevel"] = [string]$location.PlanLevel
    }

    if ($PSCmdlet.ShouldProcess(
        "$projectTitle -> $name [$type]",
        "Create top-level project location"
    )) {
        $newLocation = Add-PnPListItem `
            -List "Project Locations" `
            -Values $values

        Write-Host "CREATED: $name [$type] - ID $($newLocation.Id)"
    }

    $nextSortOrder++
}
