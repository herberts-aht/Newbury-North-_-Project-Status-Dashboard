[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string]$Address,

    [Parameter(Mandatory = $true)]
    [string]$City,

    [Parameter(Mandatory = $true)]
    [string]$State,

    [Parameter(Mandatory = $true)]
    [string]$Division,

    [Parameter(Mandatory = $true)]
    [string]$Phase,

    [string]$ClientLastName,

    [string]$ProjectKey,

    [string]$ProjectManagerSiteLead,

    [string]$SeniorProjectManager,

    [string]$ExecutiveLead,

    [string]$Subtitle,

    [string]$Description,

    [hashtable[]]$TopLevelLocations,

    [string[]]$Modules
)

$ErrorActionPreference = "Stop"

$toolRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$newProjectTool   = Join-Path $toolRoot "New-AHTProject.ps1"
$initializeTool   = Join-Path $toolRoot "Initialize-AHTProject.ps1"
$projectPlanTool  = Join-Path $toolRoot "Initialize-AHTProjectPlan.ps1"

foreach ($requiredTool in @(
    $newProjectTool,
    $initializeTool,
    $projectPlanTool
)) {
    if (-not (Test-Path $requiredTool)) {
        throw "Required tool not found: $requiredTool"
    }
}

# ============================================================
# BUILD NEW PROJECT ARGUMENTS
# ============================================================

$newProjectParams = @{
    Address  = $Address
    City     = $City
    State    = $State
    Division = $Division
    Phase    = $Phase
}

if (-not [string]::IsNullOrWhiteSpace($ClientLastName)) {
    $newProjectParams["ClientLastName"] = $ClientLastName
}

if ($ProjectKey) {
    $newProjectParams["ProjectKey"] = $ProjectKey
}

if ($ProjectManagerSiteLead) {
    $newProjectParams["ProjectManagerSiteLead"] = $ProjectManagerSiteLead
}

if ($SeniorProjectManager) {
    $newProjectParams["SeniorProjectManager"] = $SeniorProjectManager
}

if ($ExecutiveLead) {
    $newProjectParams["ExecutiveLead"] = $ExecutiveLead
}

if ($Subtitle) {
    $newProjectParams["Subtitle"] = $Subtitle
}

if ($Description) {
    $newProjectParams["Description"] = $Description
}

if ($WhatIfPreference) {
    $newProjectParams["WhatIf"] = $true
}

Write-Host ""
Write-Host "========================================"
Write-Host " AHT PROJECT START"
Write-Host "========================================"
Write-Host ""

# ============================================================
# CREATE PROJECT
# ============================================================

Write-Host "STEP 1 - CREATE MASTER PROJECT"
Write-Host "------------------------------"

try {
    $projectResult = & $newProjectTool @newProjectParams
}
catch {
    throw "Project creation failed: $($_.Exception.Message)"
}

# In WhatIf mode the project is not created, so derive the key
# the same way New-AHTProject does for previewing later steps.

function ConvertTo-AHTProjectKey {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $key = $Value.ToUpperInvariant()
    $key = $key -replace '\b(DRIVE|DR|ROAD|RD|STREET|ST|AVENUE|AVE|BOULEVARD|BLVD|LANE|LN|COURT|CT|PLACE|PL|PARKWAY|PKWY)\b', ''
    $key = $key -replace '[^A-Z0-9]+', '-'
    $key = $key.Trim('-')

    return $key
}

if ($ProjectKey) {
    $resolvedProjectKey = ConvertTo-AHTProjectKey -Value $ProjectKey
}
else {
    if ([string]::IsNullOrWhiteSpace($ClientLastName)) {
        $resolvedProjectName = $Address.Trim()
    }
    else {
        $resolvedProjectName = "$($Address.Trim()) $($ClientLastName.Trim())"
    }

    $resolvedProjectKey = ConvertTo-AHTProjectKey -Value $resolvedProjectName
}

if (-not $WhatIfPreference -and $projectResult) {
    $resultObject = $projectResult |
        Where-Object {
            $_.PSObject.Properties.Name -contains "ProjectKey"
        } |
        Select-Object -Last 1

    if ($resultObject -and $resultObject.ProjectKey) {
        $resolvedProjectKey = $resultObject.ProjectKey
    }
}

Write-Host ""

# ============================================================
# INITIALIZE TOP-LEVEL LOCATIONS
# ============================================================

if ($TopLevelLocations -and $TopLevelLocations.Count -gt 0) {

    Write-Host "STEP 2 - INITIALIZE LOCATIONS"
    Write-Host "-----------------------------"

    $locationParams = @{
        ProjectKey        = $resolvedProjectKey
        TopLevelLocations = $TopLevelLocations
    }

    if ($WhatIfPreference) {
        $locationParams["WhatIf"] = $true
    }

    if ($WhatIfPreference) {
        Write-Host "WhatIf preview only: project does not yet exist, so location initialization is shown conceptually."
        foreach ($location in $TopLevelLocations) {
            Write-Host "WOULD INITIALIZE: $($location.Name) [$($location.Type)]"
        }
    }
    else {
        & $initializeTool @locationParams
    }

    Write-Host ""
}
else {
    Write-Host "STEP 2 - INITIALIZE LOCATIONS"
    Write-Host "-----------------------------"
    Write-Host "No top-level locations supplied. Skipping."
    Write-Host ""
}

# ============================================================
# INITIALIZE PROJECT PLAN
# ============================================================

if ($Modules -and $Modules.Count -gt 0) {

    Write-Host "STEP 3 - INITIALIZE PROJECT PLAN"
    Write-Host "--------------------------------"

    $planParams = @{
        ProjectKey = $resolvedProjectKey
        Modules    = $Modules
    }

    if ($WhatIfPreference) {
        $planParams["WhatIf"] = $true
    }

    if ($WhatIfPreference) {
        Write-Host "WhatIf preview only: project does not yet exist, so Project Plan initialization is shown conceptually."
        Write-Host "Modules:"
        foreach ($module in $Modules) {
            Write-Host "  - $module"
        }

        if ("Core" -notin $Modules) {
            Write-Host "  - Core (automatically included)"
        }
    }
    else {
        & $projectPlanTool @planParams
    }

    Write-Host ""
}
else {
    Write-Host "STEP 3 - INITIALIZE PROJECT PLAN"
    Write-Host "--------------------------------"
    Write-Host "No modules supplied. Skipping."
    Write-Host ""
}

# ============================================================
# SUMMARY
# ============================================================

Write-Host "========================================"
Write-Host " AHT PROJECT START COMPLETE"
Write-Host "========================================"
Write-Host "Project Key : $resolvedProjectKey"

if ($WhatIfPreference) {
    Write-Host "Mode        : WHATIF - no changes made"
}
else {
    Write-Host "Mode        : LIVE"
}

Write-Host ""

