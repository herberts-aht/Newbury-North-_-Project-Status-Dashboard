# 2200 Gordon auto-population importer
# Idempotent: skips records with matching Title already linked to 2200 Gordon.
# Run from an authenticated PnP PowerShell session in Codespaces.

$ErrorActionPreference = "Stop"
$projectId = 1
$projectTitle = "2200 Gordon Dr"

function Get-ExistingTitleMap {
    param([string]$ListName)
    $map = @{}
    Get-PnPListItem -List $ListName -PageSize 500 | ForEach-Object {
        $project = $_.FieldValues.Project
        if ($project -and $project.LookupId -eq $projectId) {
            $title = [string]$_.FieldValues.Title
            if ($title) { $map[$title.Trim().ToLowerInvariant()] = $_.Id }
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

$deliverables = @(
    @{
        Title = 'Permit Drawings'
        Discipline = 'Engineering'
        OperationalStatus = 'Complete'
        Owner = 'AHT'
        CurrentActivity = ''
        WaitingOn = 'Fire suppression coordination/revisions'
        NextStep = 'Revise mechanical-space layouts if required.'
        Risk = ''
        Visibility = 'Shared'
        ProgressPhase = 'Engineering'
        TargetDate = '2026-08-14'
    },
    @{
        Title = 'Keypad Locations'
        Discipline = 'Lighting / Shades'
        OperationalStatus = 'Awaiting Review'
        Owner = 'Russel Edwards / Team'
        CurrentActivity = ''
        WaitingOn = 'Review comments / markups'
        NextStep = 'Incorporate comments and finalize layout.'
        Risk = ''
        Visibility = 'Shared'
        ProgressPhase = 'Engineering'
        TargetDate = '2026-08-18'
    },
    @{
        Title = 'Main House Speaker Layout'
        Discipline = 'AV / Audio'
        OperationalStatus = 'In Progress'
        Owner = 'Stacy Herbert / AHT'
        CurrentActivity = ''
        WaitingOn = ''
        NextStep = 'Issue preliminary layout for Russel Edwards / team review.'
        Risk = ''
        Visibility = 'Shared'
        ProgressPhase = 'Engineering'
        TargetDate = '2026-08-07'
    },
    @{
        Title = 'Revised Wi-Fi Heat Map'
        Discipline = 'Network'
        OperationalStatus = 'In Progress'
        Owner = 'AHT'
        CurrentActivity = ''
        WaitingOn = ''
        NextStep = 'Issue revised heat map.'
        Risk = ''
        Visibility = 'Shared'
        ProgressPhase = 'Engineering'
        TargetDate = '2026-08-10'
    },
    @{
        Title = 'Main House CCTV Layout'
        Discipline = 'CCTV'
        OperationalStatus = 'In Progress'
        Owner = 'AHT'
        CurrentActivity = ''
        WaitingOn = ''
        NextStep = 'Issue preliminary CCTV layout.'
        Risk = ''
        Visibility = 'Shared'
        ProgressPhase = 'Engineering'
        TargetDate = '2026-08-12'
    },
    @{
        Title = 'Door-by-Door Access Plan'
        Discipline = 'Access Control'
        OperationalStatus = 'Waiting on Information'
        Owner = 'AHT'
        CurrentActivity = ''
        WaitingOn = 'Door Schedule'
        NextStep = 'Develop door-by-door requirements and preliminary access plan.'
        Risk = ''
        Visibility = 'Shared'
        ProgressPhase = 'Engineering'
        TargetDate = '2026-08-21'
    },
    @{
        Title = 'Cable Routing Coordination'
        Discipline = 'Engineering'
        OperationalStatus = 'In Progress'
        Owner = 'Shaun Kastner / AHT'
        CurrentActivity = ''
        WaitingOn = 'Newbury engineering pathway detail'
        NextStep = 'Review and confirm routing strategy.'
        Risk = ''
        Visibility = 'AHT Internal'
        ProgressPhase = 'Engineering'
        TargetDate = '2026-08-09'
    }
)

$informationRequired = @(
    @{
        Title = 'Door Schedule'
        Owner = 'Builder / Architect'
        OperationalStatus = 'Outstanding'
        CurrentActivity = 'Information required for Access Control.'
        NextStep = 'Obtain and review required information.'
        Visibility = 'Shared'
        TargetDate = '2026-08-14'
    },
    @{
        Title = 'Auxiliary Building Drawings'
        Owner = 'Builder / Architect'
        OperationalStatus = 'Outstanding'
        CurrentActivity = 'Information required for Multiple disciplines.'
        NextStep = 'Obtain and review required information.'
        Visibility = 'Shared'
        TargetDate = '2026-08-17'
    },
    @{
        Title = 'Landscape Drawings'
        Owner = 'Landscape / Builder'
        OperationalStatus = 'Outstanding'
        CurrentActivity = 'Information required for Exterior layouts.'
        NextStep = 'Obtain and review required information.'
        Visibility = 'Shared'
        TargetDate = '2026-08-17'
    },
    @{
        Title = 'Lighting Keypad Review Comments'
        Owner = 'Russel / Team'
        OperationalStatus = 'Pending'
        CurrentActivity = 'Information required for Lighting finalization.'
        NextStep = 'Obtain and review required information.'
        Visibility = 'Shared'
        TargetDate = '2026-08-07'
    }
)

Write-Host ""
Write-Host "2200 Gordon auto-population"
Write-Host "Project: $projectTitle (SharePoint Project ID $projectId)"
Write-Host ""

$existingDeliverables = Get-ExistingTitleMap -ListName "Deliverables"
$addedDeliverables = 0
$skippedDeliverables = 0

foreach ($record in $deliverables) {
    $key = $record.Title.Trim().ToLowerInvariant()
    if ($existingDeliverables.ContainsKey($key)) {
        Write-Host "SKIP Deliverable:" $record.Title
        $skippedDeliverables++
        continue
    }

    $values = Clean-Values $record
    $values["Project"] = $projectId
    $values["Archived"] = $false
    $values["HealthMode"] = "auto"

    Add-PnPListItem -List "Deliverables" -Values $values | Out-Null
    Write-Host "ADD  Deliverable:" $record.Title
    $addedDeliverables++
}

$existingInfo = Get-ExistingTitleMap -ListName "Information Required"
$addedInfo = 0
$skippedInfo = 0

foreach ($record in $informationRequired) {
    $key = $record.Title.Trim().ToLowerInvariant()
    if ($existingInfo.ContainsKey($key)) {
        Write-Host "SKIP Information Required:" $record.Title
        $skippedInfo++
        continue
    }

    $values = Clean-Values $record
    $values["Project"] = $projectId
    $values["Archived"] = $false
    $values["HealthMode"] = "auto"

    Add-PnPListItem -List "Information Required" -Values $values | Out-Null
    Write-Host "ADD  Information Required:" $record.Title
    $addedInfo++
}

Write-Host ""
Write-Host "Import complete."
Write-Host "Deliverables added:" $addedDeliverables
Write-Host "Deliverables skipped:" $skippedDeliverables
Write-Host "Information Required added:" $addedInfo
Write-Host "Information Required skipped:" $skippedInfo
Write-Host ""
Write-Host "Refresh the dashboard after the import."
