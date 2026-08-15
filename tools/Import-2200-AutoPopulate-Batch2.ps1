# 2200 Gordon - Additional Auto-Population Batch 2
# Adds only missing records. Safe to re-run.
# Requires an authenticated PnP.PowerShell connection to:
# https://ahtglobalteam.sharepoint.com/sites/NewburyNorth

$ErrorActionPreference = "Stop"
$projectId = 1
$projectTitle = "2200 Gordon Dr"

function Get-ExistingTitles {
    param([string]$ListName)

    $titles = @{}
    Get-PnPListItem -List $ListName -PageSize 500 | ForEach-Object {
        $project = $_.FieldValues.Project
        if ($project -and $project.LookupId -eq $projectId) {
            $title = [string]$_.FieldValues.Title
            if ($title) {
                $titles[$title.Trim().ToLowerInvariant()] = $_.Id
            }
        }
    }
    return $titles
}

function Add-DeliverableIfMissing {
    param([hashtable]$Record, [hashtable]$Existing)

    $key = $Record.Title.Trim().ToLowerInvariant()
    if ($Existing.ContainsKey($key)) {
        Write-Host "SKIP Deliverable:" $Record.Title
        return
    }

    $values = @{
        Project           = $projectId
        Title             = $Record.Title
        Discipline        = $Record.Discipline
        OperationalStatus = $Record.OperationalStatus
        Owner             = $Record.Owner
        CurrentActivity   = $Record.CurrentActivity
        WaitingOn         = $Record.WaitingOn
        NextStep          = $Record.NextStep
        Risk              = $Record.Risk
        Visibility        = $Record.Visibility
        ProgressPhase     = $Record.ProgressPhase
        Archived          = $false
        HealthMode        = "auto"
    }

    if ($Record.TargetDate) {
        $values["TargetDate"] = $Record.TargetDate
    }

    Add-PnPListItem -List "Deliverables" -Values $values | Out-Null
    Write-Host "ADD  Deliverable:" $Record.Title
}

function Add-InfoIfMissing {
    param([hashtable]$Record, [hashtable]$Existing)

    $key = $Record.Title.Trim().ToLowerInvariant()
    if ($Existing.ContainsKey($key)) {
        Write-Host "SKIP Information Required:" $Record.Title
        return
    }

    $values = @{
        Project        = $projectId
        Title          = $Record.Title
        RequestedFrom  = $Record.RequestedFrom
        RequestStatus  = $Record.RequestStatus
        Blocking       = $Record.Blocking
        Notes          = $Record.Notes
        Visibility     = $Record.Visibility
        Archived       = $false
    }

    if ($Record.NeededBy) {
        $values["NeededBy"] = $Record.NeededBy
    }

    Add-PnPListItem -List "Information Required" -Values $values | Out-Null
    Write-Host "ADD  Information Required:" $Record.Title
}

$deliverables = @(
    @{
        Title             = "Resource Planning"
        Discipline        = "Project Management"
        OperationalStatus = "In Progress"
        Owner             = "AHT"
        CurrentActivity   = "Tracking staffing and resource needs for upcoming 2200 engineering and construction coordination."
        WaitingOn         = ""
        NextStep          = "Confirm current staffing/resource plan and update the project-control record as project needs develop."
        Risk              = "Resource needs will increase as permitting, approvals, and construction activity expand."
        Visibility        = "AHT Internal"
        ProgressPhase     = "Planning"
        TargetDate        = "2026-08-11"
    },
    @{
        Title             = "Working Shade Mockup"
        Discipline        = "Lighting / Shades"
        OperationalStatus = "In Progress"
        Owner             = "AHT"
        CurrentActivity   = "Coordinating a working shade mockup and associated fabric/sample sequence."
        WaitingOn         = "Fabric/sample availability and coordinated mockup requirements."
        NextStep          = "Complete the working mockup once the required fabric/sample material is available."
        Risk              = "Mockup timing depends on material availability and coordinated design requirements."
        Visibility        = "Shared"
        ProgressPhase     = "Engineering"
        TargetDate        = ""
    },
    @{
        Title             = "Temporary CCTV & Wi-Fi Plan"
        Discipline        = "AV / Network"
        OperationalStatus = "In Progress"
        Owner             = "AHT"
        CurrentActivity   = "Developing temporary CCTV and Wi-Fi coverage planning for the construction phase."
        WaitingOn         = ""
        NextStep          = "Issue the temporary CCTV and Wi-Fi plan for coordination."
        Risk              = "Construction conditions and temporary infrastructure may require revisions."
        Visibility        = "Shared"
        ProgressPhase     = "Engineering"
        TargetDate        = ""
    }
)

$informationRequired = @(
    @{
        Title         = "Low-Voltage Wall Pathway Detail"
        RequestedFrom = "Newbury Engineering"
        RequestStatus = "Outstanding"
        Blocking      = "Cable routing / low-voltage pathway coordination"
        NeededBy      = "2026-08-09"
        Notes         = "Need the coordinated wall/pathway detail to finalize low-voltage routing strategy. This supports the existing Cable Routing Coordination deliverable."
        Visibility    = "Shared"
    },
    @{
        Title         = "Exterior Access / Call Station Decision"
        RequestedFrom = "Client / Design Team"
        RequestStatus = "Outstanding"
        Blocking      = "Exterior access-control and call-station design"
        NeededBy      = ""
        Notes         = "Further direction is required on the exterior access and call-station approach before the design can be finalized."
        Visibility    = "Shared"
    }
)

Write-Host ""
Write-Host "2200 Gordon - Additional Auto-Population Batch 2"
Write-Host "Project: $projectTitle (SharePoint Project ID $projectId)"
Write-Host ""

$existingDeliverables = Get-ExistingTitles -ListName "Deliverables"
foreach ($record in $deliverables) {
    Add-DeliverableIfMissing -Record $record -Existing $existingDeliverables
}

$existingInfo = Get-ExistingTitles -ListName "Information Required"
foreach ($record in $informationRequired) {
    Add-InfoIfMissing -Record $record -Existing $existingInfo
}

Write-Host ""
Write-Host "Batch 2 import complete."
Write-Host "Refresh the dashboard to review the new records."
