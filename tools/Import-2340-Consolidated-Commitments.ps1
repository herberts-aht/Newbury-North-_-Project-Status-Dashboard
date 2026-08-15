# 2340 Gordon - Consolidated Auto-Population / Update
# Adds today's AHT commitments and updates existing 2340 records.
# Safe to re-run: existing records are updated by exact Title; new records are only added if missing.
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
    param(
        [hashtable]$Record,
        [hashtable]$Existing
    )

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

    if ($Record.TargetDate) {
        $values["TargetDate"] = $Record.TargetDate
    }

    if ($Existing.ContainsKey($key)) {
        $item = $Existing[$key]
        Set-PnPListItem -List "Deliverables" -Identity $item.Id -Values $values | Out-Null
        Write-Host "UPDATE Deliverable:" $Record.Title
    }
    else {
        Add-PnPListItem -List "Deliverables" -Values $values | Out-Null
        Write-Host "ADD    Deliverable:" $Record.Title
    }
}

function Upsert-InformationRequired {
    param(
        [hashtable]$Record,
        [hashtable]$Existing
    )

    $key = $Record.Title.Trim().ToLowerInvariant()

    $values = Clean-Values @{
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

    if ($Existing.ContainsKey($key)) {
        $item = $Existing[$key]
        Set-PnPListItem -List "Information Required" -Identity $item.Id -Values $values | Out-Null
        Write-Host "UPDATE Information Required:" $Record.Title
    }
    else {
        Add-PnPListItem -List "Information Required" -Values $values | Out-Null
        Write-Host "ADD    Information Required:" $Record.Title
    }
}

Write-Host ""
Write-Host "2340 Gordon - Consolidated AHT Commitments"
Write-Host "Project: $projectTitle (SharePoint Project ID $projectId)"
Write-Host ""

$existingDeliverables = Get-ProjectItemsByTitle -ListName "Deliverables"
$existingInfo = Get-ProjectItemsByTitle -ListName "Information Required"

# -------------------------------------------------------------------
# UPDATE existing 2340 deliverables
# -------------------------------------------------------------------

$deliverables = @(
    @{
        Title             = "AV Room BTU Calculations"
        Discipline        = "Engineering"
        OperationalStatus = "In Progress"
        Owner             = "Stacy Herbert / Shaun Kastner"
        CurrentActivity   = "Preparing preliminary AV equipment and BTU / heat-load calculations for 2340."
        WaitingOn         = "Any remaining equipment assumptions needed to complete the preliminary calculations."
        NextStep          = "Finalize the calculations and review them with Russell during the week of August 17, 2026."
        Risk              = "Incomplete equipment assumptions can affect the preliminary heat-load calculation."
        Visibility        = "Shared"
        ProgressPhase     = "Engineering"
        TargetDate        = ""
    },
    @{
        Title             = "Battery / Inverter / Dynamic Load Shedding Layout"
        Discipline        = "Technical Power"
        OperationalStatus = "In Progress"
        Owner             = "AHT / Aiden"
        CurrentActivity   = "Developing preliminary battery, inverter, and dynamic-load-shedding equipment layout and space requirements for the plant building."
        WaitingOn         = "CES electrical load calculations / early one-line as available."
        NextStep          = "Confirm required equipment dimensions, floor area, wall space, and clearances and issue the requirements to the design team."
        Risk              = "Late equipment-size or electrical-load changes can affect the plant-building room size and wall-space allocation."
        Visibility        = "Shared"
        ProgressPhase     = "Engineering"
        TargetDate        = ""
    },

    # ----------------------------------------------------------------
    # ADD today's specific AHT commitments
    # ----------------------------------------------------------------
    @{
        Title             = "Life Safety Fire System Layout / Power Requirements"
        Discipline        = "Life Safety"
        OperationalStatus = "In Progress"
        Owner             = "Bill / AHT"
        CurrentActivity   = "AHT committed to getting Paul engaged to lay out the life-safety fire system and establish its power requirements."
        WaitingOn         = "Paul's life-safety system layout and electrical / power requirements."
        NextStep          = "Bill to engage Paul and obtain the layout and power requirements for coordination with the project team."
        Risk              = "Late power requirements can affect electrical coordination and equipment-space planning."
        Visibility        = "Shared"
        ProgressPhase     = "Engineering"
        TargetDate        = ""
    },
    @{
        Title             = "Battery Weight Information"
        Discipline        = "Technical Power"
        OperationalStatus = "In Progress"
        Owner             = "Stacy Herbert"
        CurrentActivity   = "Obtaining the battery-system weight information required for plant-building coordination."
        WaitingOn         = "Battery / equipment weight data from the system design source."
        NextStep          = "Obtain the battery weight information and send it to Jose."
        Risk              = "Structural / equipment-room coordination depends on accurate equipment weight information."
        Visibility        = "Shared"
        ProgressPhase     = "Engineering"
        TargetDate        = ""
    },
    @{
        Title             = "Dual Shade Pocket Dimensions"
        Discipline        = "Lighting / Shades"
        OperationalStatus = "In Progress"
        Owner             = "Bill / AHT"
        CurrentActivity   = "Confirming the exact pocket dimensions required for the dual-shade bracket to span the full width of the openings."
        WaitingOn         = "Final dimensional information from the shade / bracket source."
        NextStep          = "Bill to obtain the exact required dimensions and provide them to the design team."
        Risk              = "Incorrect pocket dimensions can affect architectural coordination and final shade installation."
        Visibility        = "Shared"
        ProgressPhase     = "Engineering"
        TargetDate        = ""
    }
)

foreach ($record in $deliverables) {
    Upsert-Deliverable -Record $record -Existing $existingDeliverables
}

# -------------------------------------------------------------------
# Information Required / coordination follow-up
# -------------------------------------------------------------------

$informationRequired = @(
    @{
        Title         = "Lighting Design Coordination Meeting / AHT Participation"
        RequestedFrom = "Project Team / Radiance"
        RequestStatus = "Pending"
        Blocking      = "Lighting control, keypad planning, fixture / control compatibility, and related AHT engineering"
        NeededBy      = ""
        Notes         = "A meeting is planned with Greg (Radiance) and Susie Warner to discuss the lighting plan. Stacy / Bill to follow up on timing and determine whether AHT should participate if the design is sufficiently developed for technology / controls coordination."
        Visibility    = "Shared"
    }
)

foreach ($record in $informationRequired) {
    Upsert-InformationRequired -Record $record -Existing $existingInfo
}

Write-Host ""
Write-Host "2340 consolidated import/update complete."
Write-Host ""
Write-Host "Expected:"
Write-Host "  UPDATE: AV Room BTU Calculations"
Write-Host "  UPDATE: Battery / Inverter / Dynamic Load Shedding Layout"
Write-Host "  ADD:    Life Safety Fire System Layout / Power Requirements"
Write-Host "  ADD:    Battery Weight Information"
Write-Host "  ADD:    Dual Shade Pocket Dimensions"
Write-Host "  ADD:    Lighting Design Coordination Meeting / AHT Participation"
Write-Host ""
Write-Host "Refresh the dashboard to review the updated 2340 records."
