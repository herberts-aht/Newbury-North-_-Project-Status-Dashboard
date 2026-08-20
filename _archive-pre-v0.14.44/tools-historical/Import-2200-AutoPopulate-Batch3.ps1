# 2200 Gordon - Auto-Population Batch 3
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
        Title             = "Shade Controls"
        Discipline        = "Lighting / Shades"
        OperationalStatus = "Pending"
        Owner             = "AHT"
        CurrentActivity   = "Shade control design will follow the coordinated lighting-control and keypad direction."
        WaitingOn         = "Final lighting / keypad coordination"
        NextStep          = "Begin detailed shade-control design once coordinated lighting/keypad information is sufficiently developed."
        Risk              = "Lighting/keypad changes can affect shade-control coordination."
        Visibility        = "Shared"
        ProgressPhase     = "Engineering"
        TargetDate        = ""
    },
    @{
        Title             = "Auxiliary Building AV / Security Layouts"
        Discipline        = "AV / Security"
        OperationalStatus = "Waiting on Information"
        Owner             = "AHT"
        CurrentActivity   = "Preliminary auxiliary-building layouts have not started because the required architectural drawings are still outstanding."
        WaitingOn         = "Auxiliary Building Drawings"
        NextStep          = "Begin preliminary AV, network, CCTV, and access layouts when the auxiliary-building backgrounds are received."
        Risk              = "Late backgrounds can compress coordination time for auxiliary-building systems."
        Visibility        = "Shared"
        ProgressPhase     = "Engineering"
        TargetDate        = ""
    },
    @{
        Title             = "Landscape / Exterior Systems Layouts"
        Discipline        = "AV / Network"
        OperationalStatus = "Waiting on Information"
        Owner             = "AHT"
        CurrentActivity   = "Exterior AV, Wi-Fi, CCTV, and access planning is waiting on coordinated landscape drawings."
        WaitingOn         = "Landscape Drawings"
        NextStep          = "Develop preliminary exterior-system layouts when the landscape backgrounds are received."
        Risk              = "Landscape and exterior-design changes can affect device locations, pathways, and coverage."
        Visibility        = "Shared"
        ProgressPhase     = "Engineering"
        TargetDate        = ""
    },
    @{
        Title             = "Device Location Review Package"
        Discipline        = "Documentation"
        OperationalStatus = "Pending"
        Owner             = "AHT"
        CurrentActivity   = "The preliminary device-location package will combine the current discipline layouts for coordinated review."
        WaitingOn         = "Completion of current speaker, Wi-Fi, CCTV, access, lighting, shade, and related layouts"
        NextStep          = "Compile and issue a coordinated preliminary device-location package for review."
        Risk              = "The package depends on multiple discipline layouts reaching a reviewable state."
        Visibility        = "Shared"
        ProgressPhase     = "Engineering"
        TargetDate        = ""
    }
)

$informationRequired = @(
    @{
        Title         = "Mechanical Room / Fire Suppression Coordination"
        RequestedFrom = "Builder / Fire Suppression"
        RequestStatus = "Pending"
        Blocking      = "Technical power and equipment-room layouts"
        NeededBy      = ""
        Notes         = "Confirm revised fire-suppression equipment clearances and conflicts. Added fire-suppression equipment may require minor relocation of AHT equipment and revisions to completed technical-power/permit drawings."
        Visibility    = "Shared"
    },
    @{
        Title         = "Shade Mockup Box Ready for Final Measure"
        RequestedFrom = "Brian / Project Team"
        RequestStatus = "Pending"
        Blocking      = "Working shade mockup"
        NeededBy      = ""
        Notes         = "The plywood shade box needs to be installed and available so the shade team can take the final field measurement and fabricate the working mockup."
        Visibility    = "Shared"
    },
    @{
        Title         = "Temporary CCTV / Wi-Fi Final Specs"
        RequestedFrom = "Project Team"
        RequestStatus = "Pending"
        Blocking      = "Temporary CCTV and Wi-Fi / network response"
        NeededBy      = ""
        Notes         = "Final temporary-system requirements/specifications are needed so AHT can validate the temporary CCTV and Wi-Fi concept and add any required equipment."
        Visibility    = "AHT Internal"
    }
)

Write-Host ""
Write-Host "2200 Gordon - Auto-Population Batch 3"
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
Write-Host "Batch 3 import complete."
Write-Host "Refresh the dashboard to review the new records."
