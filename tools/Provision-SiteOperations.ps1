# Provision-SiteOperations.ps1
# Requires an active Connect-PnPOnline session to:
# https://ahtglobalteam.sharepoint.com/sites/NewburyNorth

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control - Site Operations Provisioning" -ForegroundColor Cyan
Write-Host "--------------------------------------------------"

function Ensure-List {
    param(
        [string]$Title,
        [string]$Description
    )

    $list = Get-PnPList -Identity $Title -ErrorAction SilentlyContinue

    if (-not $list) {
        Write-Host "Creating list: $Title" -ForegroundColor Yellow
        New-PnPList `
            -Title $Title `
            -Template GenericList `
            -OnQuickLaunch:$false | Out-Null

        Set-PnPList `
            -Identity $Title `
            -Description $Description
    }
    else {
        Write-Host "List already exists: $Title" -ForegroundColor DarkGray
    }

    return Get-PnPList -Identity $Title
}

function Ensure-Field {
    param(
        [string]$List,
        [string]$DisplayName,
        [string]$InternalName,
        [string]$Type,
        [string[]]$Choices = $null
    )

    $field = Get-PnPField `
        -List $List `
        -Identity $InternalName `
        -ErrorAction SilentlyContinue

    if ($field) {
        Write-Host "  Exists: $DisplayName" -ForegroundColor DarkGray
        return
    }

    Write-Host "  Adding: $DisplayName" -ForegroundColor Green

    if ($Type -eq "Choice") {
        Add-PnPField `
            -List $List `
            -DisplayName $DisplayName `
            -InternalName $InternalName `
            -Type Choice `
            -Choices $Choices `
            -AddToDefaultView | Out-Null
    }
    else {
        Add-PnPField `
            -List $List `
            -DisplayName $DisplayName `
            -InternalName $InternalName `
            -Type $Type `
            -AddToDefaultView | Out-Null
    }
}

function Ensure-LookupField {
    param(
        [string]$List,
        [string]$DisplayName,
        [string]$InternalName,
        [Guid]$LookupListId
    )

    $field = Get-PnPField `
        -List $List `
        -Identity $InternalName `
        -ErrorAction SilentlyContinue

    if ($field) {
        Write-Host "  Exists: $DisplayName" -ForegroundColor DarkGray
        return
    }

    Write-Host "  Adding lookup: $DisplayName" -ForegroundColor Green

    $fieldId = [Guid]::NewGuid().ToString()
    $lookupId = $LookupListId.ToString("B")

    $xml = @"
<Field
    Type="Lookup"
    DisplayName="$DisplayName"
    Name="$InternalName"
    StaticName="$InternalName"
    ID="{$fieldId}"
    List="$lookupId"
    ShowField="Title"
    Required="FALSE" />
"@

    Add-PnPFieldFromXml `
        -List $List `
        -FieldXml $xml | Out-Null
}


# ------------------------------------------------------------
# Existing Projects list
# ------------------------------------------------------------

$projects = Get-PnPList -Identity "Projects"

if (-not $projects) {
    throw "Projects list was not found. Provisioning stopped."
}

Write-Host "Projects list found." -ForegroundColor Green


# ============================================================
# PROJECT LOCATIONS
# ============================================================

$locations = Ensure-List `
    -Title "Project Locations" `
    -Description "Hierarchical project buildings, levels, areas, rooms, exterior zones and supporting locations used by Site Operations."

Write-Host ""
Write-Host "Project Locations fields" -ForegroundColor Cyan

Ensure-LookupField `
    -List "Project Locations" `
    -DisplayName "Project" `
    -InternalName "Project" `
    -LookupListId $projects.Id

# Self-referencing parent location
$locations = Get-PnPList -Identity "Project Locations"

Ensure-LookupField `
    -List "Project Locations" `
    -DisplayName "Parent Location" `
    -InternalName "ParentLocation" `
    -LookupListId $locations.Id

Ensure-Field `
    -List "Project Locations" `
    -DisplayName "Location Type" `
    -InternalName "LocationType" `
    -Type "Choice" `
    -Choices @(
        "Building",
        "Level",
        "Wing",
        "Area",
        "Room",
        "Exterior",
        "Site Zone",
        "Utility",
        "Other"
    )

Ensure-Field `
    -List "Project Locations" `
    -DisplayName "Level / Floor" `
    -InternalName "PlanLevel" `
    -Type "Text"

Ensure-Field `
    -List "Project Locations" `
    -DisplayName "Sort Order" `
    -InternalName "SortOrder" `
    -Type "Number"

Ensure-Field `
    -List "Project Locations" `
    -DisplayName "Active" `
    -InternalName "Active" `
    -Type "Boolean"


# Progress overrides
Ensure-Field `
    -List "Project Locations" `
    -DisplayName "Overall Progress Override" `
    -InternalName "OverallProgressOverride" `
    -Type "Number"

Ensure-Field `
    -List "Project Locations" `
    -DisplayName "Overall Override Reason" `
    -InternalName "OverallOverrideReason" `
    -Type "Note"

Ensure-Field `
    -List "Project Locations" `
    -DisplayName "Rough-In Progress Override" `
    -InternalName "RoughInProgressOverride" `
    -Type "Number"

Ensure-Field `
    -List "Project Locations" `
    -DisplayName "Rough-In Override Reason" `
    -InternalName "RoughInOverrideReason" `
    -Type "Note"

Ensure-Field `
    -List "Project Locations" `
    -DisplayName "Trim Progress Override" `
    -InternalName "TrimProgressOverride" `
    -Type "Number"

Ensure-Field `
    -List "Project Locations" `
    -DisplayName "Trim Override Reason" `
    -InternalName "TrimOverrideReason" `
    -Type "Note"

Ensure-Field `
    -List "Project Locations" `
    -DisplayName "Final Progress Override" `
    -InternalName "FinalProgressOverride" `
    -Type "Number"

Ensure-Field `
    -List "Project Locations" `
    -DisplayName "Final Override Reason" `
    -InternalName "FinalOverrideReason" `
    -Type "Note"


# ============================================================
# SITE OPERATIONS
# ============================================================

$operations = Ensure-List `
    -Title "Site Operations" `
    -Description "External-safe site progress, current work, lookahead, milestones, risks and blockers for AHT projects."

Write-Host ""
Write-Host "Site Operations fields" -ForegroundColor Cyan

Ensure-LookupField `
    -List "Site Operations" `
    -DisplayName "Project" `
    -InternalName "Project" `
    -LookupListId $projects.Id

Ensure-LookupField `
    -List "Site Operations" `
    -DisplayName "Location" `
    -InternalName "Location" `
    -LookupListId $locations.Id

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Entry Type" `
    -InternalName "EntryType" `
    -Type "Choice" `
    -Choices @(
        "Work Activity",
        "Lookahead",
        "Milestone",
        "Issue"
    )

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "System" `
    -InternalName "System" `
    -Type "Choice" `
    -Choices @(
        "AV",
        "Lighting",
        "Shades",
        "Network",
        "Security",
        "Power",
        "Other"
    )

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Site Phase" `
    -InternalName "SitePhase" `
    -Type "Choice" `
    -Choices @(
        "Rough-In",
        "Trim",
        "Final"
    )

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Work Stage" `
    -InternalName "WorkStage" `
    -Type "Choice" `
    -Choices @(
        "Layout",
        "Installation",
        "Programming",
        "Commissioning",
        "Testing",
        "Complete",
        "Other"
    )

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Status" `
    -InternalName "Status" `
    -Type "Choice" `
    -Choices @(
        "Planned",
        "In Progress",
        "At Risk",
        "Blocked",
        "Complete"
    )

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Percent Complete" `
    -InternalName "PercentComplete" `
    -Type "Number"

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Progress Weight" `
    -InternalName "ProgressWeight" `
    -Type "Number"

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Track Progress" `
    -InternalName "TrackProgress" `
    -Type "Boolean"

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Activity Date" `
    -InternalName "ActivityDate" `
    -Type "DateTime"

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Target Date" `
    -InternalName "TargetDate" `
    -Type "DateTime"

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Details" `
    -InternalName "Details" `
    -Type "Note"

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Blocker / Dependency" `
    -InternalName "BlockerDependency" `
    -Type "Note"

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Lead / Responsible" `
    -InternalName "LeadResponsible" `
    -Type "Text"


# ------------------------------------------------------------
# Automatic behavior + manual overrides
# ------------------------------------------------------------

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Project Activity Mode" `
    -InternalName "ProjectActivityMode" `
    -Type "Choice" `
    -Choices @(
        "Auto",
        "Show",
        "Hide"
    )

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Risk Mode" `
    -InternalName "RiskMode" `
    -Type "Choice" `
    -Choices @(
        "Auto",
        "Force At Risk",
        "Force On Track"
    )

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Information Required Mode" `
    -InternalName "InformationRequiredMode" `
    -Type "Choice" `
    -Choices @(
        "Auto",
        "Suggest",
        "Do Not Suggest"
    )

Ensure-Field `
    -List "Site Operations" `
    -DisplayName "Related Information Required ID" `
    -InternalName "RelatedInformationRequiredId" `
    -Type "Number"


# ------------------------------------------------------------
# Friendly Title labels
# ------------------------------------------------------------

Set-PnPField `
    -List "Project Locations" `
    -Identity "Title" `
    -Values @{ Title = "Location Name" }

Set-PnPField `
    -List "Site Operations" `
    -Identity "Title" `
    -Values @{ Title = "Activity / Progress Item" }


Write-Host ""
Write-Host "Provisioning complete." -ForegroundColor Green
Write-Host ""
Write-Host "Created / verified:" -ForegroundColor Cyan
Write-Host "  - Project Locations"
Write-Host "  - Site Operations"
Write-Host ""

