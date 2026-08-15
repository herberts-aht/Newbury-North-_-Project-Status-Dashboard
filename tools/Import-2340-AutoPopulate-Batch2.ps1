# 2340 Gordon - Auto-Population Batch 2
# Adds remaining validated 2340 planning records and updates broad engineering status.
# Safe to re-run: exact-title matches are updated; missing records are added.
# Requires an authenticated PnP.PowerShell connection to:
# https://ahtglobalteam.sharepoint.com/sites/NewburyNorth

$ErrorActionPreference = "Stop"
$projectId = 2
$projectTitle = "2340 Gordon Dr"

function Get-ProjectItemsByTitle {
    param([string]$ListName)

    $map = @{}
    Get-PnPListItem -List $ListName -PageSize 500 | ForEach-Object {
        $project = $_.FieldValues.Project
        if ($project -and $project.LookupId -eq $projectId) {
            $title = [string]$_.FieldValues.Title
            if ($title) {
                $map[$title.Trim().ToLowerInvariant()] = $_
            }
        }
    }
    return $map
}

function Clean-Values {
    param([hashtable]$Values)

    $clean = @{}
    foreach ($key in $Values.Keys) {
        $value = $Values[$key]
        if ($null -ne $value -and [string]$value -ne "") {
            $clean[$key] = $value
        }
    }
    return $clean
}

function Upsert-Deliverable {
    param([hashtable]$Record, [hashtable]$Existing)

    $key = $Record.Title.Trim().ToLowerInvariant()

    $values = Clean-Values @{
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

    if ($Record.TargetDate) { $values["TargetDate"] = $Record.TargetDate }

    if ($Existing.ContainsKey($key)) {
        Set-PnPListItem -List "Deliverables" -Identity $Existing[$key].Id -Values $values | Out-Null
        Write-Host "UPDATE Deliverable:" $Record.Title
    } else {
        Add-PnPListItem -List "Deliverables" -Values $values | Out-Null
        Write-Host "ADD    Deliverable:" $Record.Title
    }
}

function Upsert-InformationRequired {
    param([hashtable]$Record, [hashtable]$Existing)

    $key = $Record.Title.Trim().ToLowerInvariant()

    $values = Clean-Values @{
        Project       = $projectId
        Title         = $Record.Title
        RequestedFrom = $Record.RequestedFrom
        RequestStatus = $Record.RequestStatus
        Blocking      = $Record.Blocking
        Notes         = $Record.Notes
        Visibility    = $Record.Visibility
        Archived      = $false
    }

    if ($Record.NeededBy) { $values["NeededBy"] = $Record.NeededBy }

    if ($Existing.ContainsKey($key)) {
        Set-PnPListItem -List "Information Required" -Identity $Existing[$key].Id -Values $values | Out-Null
        Write-Host "UPDATE Information Required:" $Record.Title
    } else {
        Add-PnPListItem -List "Information Required" -Values $values | Out-Null
        Write-Host "ADD    Information Required:" $Record.Title
    }
}

Write-Host ""
Write-Host "2340 Gordon - Auto-Population Batch 2"
Write-Host "Project: $projectTitle (SharePoint Project ID $projectId)"
Write-Host ""

$existingDeliverables = Get-ProjectItemsByTitle -ListName "Deliverables"
$existingInfo = Get-ProjectItemsByTitle -ListName "Information Required"

$deliverables = @(
    @{
        Title             = "Preliminary AV Planning Matrix"
        Discipline        = "AV / Network"
        OperationalStatus = "Complete"
        Owner             = "AHT"
        CurrentActivity   = "Rev. 4.3 preliminary AV planning matrix was completed and issued to Bill and Shaun."
        WaitingOn         = ""
        NextStep          = "Use the planning matrix as the baseline for detailed engineering and subsequent project coordination."
        Risk              = ""
        Visibility        = "AHT Internal"
        ProgressPhase     = "Planning"
        TargetDate        = "2026-08-04"
    },
    @{
        Title             = "Detailed AV Engineering"
        Discipline        = "AV / Network"
        OperationalStatus = "In Progress"
        Owner             = "AHT Engineering"
        CurrentActivity   = "Detailed AV engineering is underway using the preliminary planning matrix, client requirements, and developing architectural backgrounds."
        WaitingOn         = "Final design inputs, architectural coordination, and discipline-specific decisions as the project develops."
        NextStep          = "Continue coordinated AV, network, rack, device-location, and system engineering as design information matures."
        Risk              = "Engineering scope will continue to expand as client approvals, architectural information, and construction requirements are finalized."
        Visibility        = "AHT Internal"
        ProgressPhase     = "Engineering"
        TargetDate        = ""
    }
)

foreach ($record in $deliverables) {
    Upsert-Deliverable -Record $record -Existing $existingDeliverables
}

$informationRequired = @(
    @{
        Title         = "Exterior Audio Design Inputs"
        RequestedFrom = "Client / Design Team"
        RequestStatus = "Outstanding"
        Blocking      = "Exterior audio planning for outdoor living, kitchen, pool, spa, and cabana areas"
        NeededBy      = ""
        Notes         = "Final exterior-use requirements and design inputs are still needed to complete exterior audio planning."
        Visibility    = "Shared"
    },
    @{
        Title         = "Final AVIT Room Allocation"
        RequestedFrom = "Architect / Project Team"
        RequestStatus = "Outstanding"
        Blocking      = "Final rack count, equipment-room layout, technical power, and cooling coordination"
        NeededBy      = ""
        Notes         = "Confirm the final AVIT / equipment-room allocation so AHT can finalize rack, power, cooling, and equipment-space requirements."
        Visibility    = "Shared"
    },
    @{
        Title         = "Display Sizes and Mounting Requirements"
        RequestedFrom = "Client / Design Team"
        RequestStatus = "Outstanding"
        Blocking      = "Final video endpoint engineering and mounting coordination"
        NeededBy      = ""
        Notes         = "The preliminary planning matrix identified approximately 14 display endpoints; final display sizes and mounting requirements remain to be confirmed."
        Visibility    = "Shared"
    }
)

foreach ($record in $informationRequired) {
    Upsert-InformationRequired -Record $record -Existing $existingInfo
}

# If the superseded direction-to-proceed request exists, close it rather than leaving it outstanding.
$oldKey = "direction to proceed with detailed engineering"
if ($existingInfo.ContainsKey($oldKey)) {
    Set-PnPListItem -List "Information Required" -Identity $existingInfo[$oldKey].Id -Values @{
        RequestStatus = "No Longer Needed"
        Notes = "Superseded: detailed AV engineering is now actively underway."
    } | Out-Null
    Write-Host "UPDATE Information Required: Direction to Proceed with Detailed Engineering -> No Longer Needed"
}

Write-Host ""
Write-Host "2340 Batch 2 complete."
Write-Host "Refresh the dashboard to review the updated records."
