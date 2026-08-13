#requires -Version 7.4
<#
.SYNOPSIS
Creates the SharePoint Lists used by the AHT Project Control dashboard.

.DESCRIPTION
Creates or updates:
  - Projects
  - Deliverables
  - Information Required
  - Change Log

The script is idempotent and does not delete existing lists or data.
The existing "Control Dashboard" list is not modified.

.EXAMPLE
./Create-AHTDashboard.ps1 -ClientId "00000000-0000-0000-0000-000000000000"

.EXAMPLE
./Create-AHTDashboard.ps1 -ClientId "00000000-0000-0000-0000-000000000000" -SeedSampleData
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ClientId,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$SiteUrl = "https://ahtglobalteam.sharepoint.com/sites/NewburyNorth",

    [Parameter()]
    [string]$Tenant,

    [Parameter()]
    [switch]$SeedSampleData
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-ListIfExists {
    param([string]$Title)
    return Get-PnPList -Identity $Title -ErrorAction SilentlyContinue
}

function Ensure-List {
    param(
        [string]$Title,
        [string]$Url,
        [string]$Description
    )

    $list = Get-ListIfExists -Title $Title
    if (-not $list) {
        Write-Host "Creating list: $Title"
        New-PnPList -Title $Title -Url $Url -Template GenericList -OnQuickLaunch:$false | Out-Null
        $list = Get-PnPList -Identity $Title
    }
    else {
        Write-Host "List already exists: $Title"
    }

    Set-PnPList -Identity $Title -EnableVersioning $true -MajorVersions 100 | Out-Null
    Set-PnPList -Identity $Title -Description $Description | Out-Null
    return $list
}

function Ensure-Field {
    param(
        [string]$List,
        [string]$InternalName,
        [string]$DisplayName,
        [ValidateSet("Text","Note","Choice","Number","DateTime","Boolean")]
        [string]$Type,
        [bool]$Required = $false,
        [string[]]$Choices,
        [string]$DefaultValue,
        [bool]$AddToDefaultView = $false
    )

    $field = Get-PnPField -List $List -Identity $InternalName -ErrorAction SilentlyContinue
    if (-not $field) {
        $params = @{
            List          = $List
            DisplayName   = $DisplayName
            InternalName  = $InternalName
            Type          = $Type
            Required      = $Required
            AddToDefaultView = $AddToDefaultView
        }
        if ($Choices) { $params["Choices"] = $Choices }

        Write-Host "  Adding field $List.$InternalName"
        Add-PnPField @params | Out-Null
        $field = Get-PnPField -List $List -Identity $InternalName
    }

    $values = @{ Title = $DisplayName; Required = $Required }
    if ($DefaultValue) { $values["DefaultValue"] = $DefaultValue }
    Set-PnPField -List $List -Identity $InternalName -Values $values | Out-Null
}

function Ensure-LookupField {
    param(
        [string]$List,
        [string]$InternalName,
        [string]$DisplayName,
        [string]$LookupListTitle,
        [bool]$Required = $false,
        [bool]$AddToDefaultView = $false
    )

    $field = Get-PnPField -List $List -Identity $InternalName -ErrorAction SilentlyContinue
    if ($field) { return }

    $lookupList = Get-PnPList -Identity $LookupListTitle
    $requiredText = if ($Required) { "TRUE" } else { "FALSE" }
    $xml = @"
<Field Type="Lookup"
       DisplayName="$DisplayName"
       Name="$InternalName"
       StaticName="$InternalName"
       Required="$requiredText"
       List="{$($lookupList.Id)}"
       ShowField="Title"
       RelationshipDeleteBehavior="Restrict" />
"@

    Write-Host "  Adding lookup $List.$InternalName -> $LookupListTitle"
    Add-PnPFieldFromXml -List $List -FieldXml $xml | Out-Null
    if ($AddToDefaultView) {
        Add-PnPViewField -List $List -Identity "All Items" -Fields $InternalName -ErrorAction SilentlyContinue
    }
}

function Rename-TitleField {
    param([string]$List, [string]$DisplayName)
    Set-PnPField -List $List -Identity "Title" -Values @{ Title = $DisplayName; Required = $true } | Out-Null
}

function Ensure-IndexedField {
    param([string]$List, [string]$InternalName)
    $field = Get-PnPField -List $List -Identity $InternalName
    if (-not $field.Indexed) {
        Write-Host "  Indexing $List.$InternalName"
        Set-PnPField -List $List -Identity $InternalName -Values @{ Indexed = $true } | Out-Null
    }
}

function Ensure-UniqueIndexedField {
    param([string]$List, [string]$InternalName)
    $field = Get-PnPField -List $List -Identity $InternalName
    if (-not $field.Indexed -or -not $field.EnforceUniqueValues) {
        Write-Host "  Enforcing unique indexed values on $List.$InternalName"
        Set-PnPField -List $List -Identity $InternalName -Values @{ Indexed = $true; EnforceUniqueValues = $true } | Out-Null
    }
}

function Get-SeedRecordByProjectAndLegacyId {
    param(
        [string]$List,
        [int]$ProjectId,
        [int]$LegacyId
    )

    $query = @"
<View><Query><Where><And><Eq><FieldRef Name='Project' LookupId='TRUE'/><Value Type='Lookup'>$ProjectId</Value></Eq><Eq><FieldRef Name='LegacyId'/><Value Type='Number'>$LegacyId</Value></Eq></And></Where></Query><RowLimit>1</RowLimit></View>
"@
    return Get-PnPListItem -List $List -Query $query | Select-Object -First 1
}

function Ensure-View {
    param(
        [string]$List,
        [string]$Title,
        [string[]]$Fields,
        [string]$Query = "",
        [uint32]$RowLimit = 100
    )

    $view = Get-PnPView -List $List -Identity $Title -ErrorAction SilentlyContinue
    if (-not $view) {
        Write-Host "  Creating view: $List / $Title"
        Add-PnPView -List $List -Title $Title -Fields $Fields -Query $Query -RowLimit $RowLimit | Out-Null
    }
    else {
        Set-PnPView -List $List -Identity $Title -Fields $Fields -Query $Query -RowLimit $RowLimit | Out-Null
    }
}

function DateOrNull {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
    return [datetime]::ParseExact($Value, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)
}

Write-Step "Checking PnP.PowerShell"
if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
    throw "PnP.PowerShell is not installed. Run: Install-Module PnP.PowerShell -Scope CurrentUser"
}
Import-Module PnP.PowerShell

Write-Step "Connecting to SharePoint"
$connect = @{ Url = $SiteUrl; Interactive = $true; ClientId = $ClientId }
if ($Tenant) { $connect["Tenant"] = $Tenant }
Connect-PnPOnline @connect

$web = Get-PnPWeb
Write-Host "Connected to: $($web.Title) — $SiteUrl" -ForegroundColor Green

Write-Step "Creating lists"
Ensure-List -Title "Projects" -Url "Lists/Projects" -Description "AHT Project Control project records." | Out-Null
Ensure-List -Title "Deliverables" -Url "Lists/Deliverables" -Description "AHT Project Control deliverables and schedule records." | Out-Null
Ensure-List -Title "Information Required" -Url "Lists/InformationRequired" -Description "AHT Project Control information requests." | Out-Null
Ensure-List -Title "Change Log" -Url "Lists/ChangeLog" -Description "AHT Project Control append-style change history." | Out-Null

Write-Step "Configuring Projects"
Rename-TitleField -List "Projects" -DisplayName "Project Name"
Ensure-Field -List "Projects" -InternalName "ProjectKey" -DisplayName "Project Key" -Type Text -Required $true
Ensure-Field -List "Projects" -InternalName "ProjectAddress" -DisplayName "Address" -Type Text
Ensure-Field -List "Projects" -InternalName "ProjectCity" -DisplayName "City" -Type Text
Ensure-Field -List "Projects" -InternalName "ProjectState" -DisplayName "State" -Type Text
Ensure-Field -List "Projects" -InternalName "ProjectDescription" -DisplayName "Description" -Type Text
Ensure-Field -List "Projects" -InternalName "ProjectSubtitle" -DisplayName "Subtitle" -Type Text
Ensure-Field -List "Projects" -InternalName "ProjectPhase" -DisplayName "Phase" -Type Text
Ensure-Field -List "Projects" -InternalName "Archived" -DisplayName "Archived" -Type Boolean -DefaultValue "0"
Ensure-Field -List "Projects" -InternalName "LastActivityDate" -DisplayName "Last Internal Activity Date" -Type DateTime
Ensure-Field -List "Projects" -InternalName "LastActivity" -DisplayName "Last Internal Activity" -Type Note
Ensure-Field -List "Projects" -InternalName "ProgressPlanning" -DisplayName "Planning Progress" -Type Number -DefaultValue "0"
Ensure-Field -List "Projects" -InternalName "ProgressEngineering" -DisplayName "Engineering Progress" -Type Number -DefaultValue "0"
Ensure-Field -List "Projects" -InternalName "ProgressInstallation" -DisplayName "Installation Progress" -Type Number -DefaultValue "0"
Ensure-Field -List "Projects" -InternalName "HealthMode" -DisplayName "Health Mode" -Type Choice -Choices @("auto","manual") -DefaultValue "auto"
Ensure-Field -List "Projects" -InternalName "HealthOverride" -DisplayName "Health Override" -Type Choice -Choices @("Healthy","At Risk","Overdue")
Ensure-Field -List "Projects" -InternalName "HealthOverrideReason" -DisplayName "Health Override Reason" -Type Note
Ensure-Field -List "Projects" -InternalName "HealthOverrideUntil" -DisplayName "Health Override Until" -Type DateTime

Write-Step "Configuring Deliverables"
Rename-TitleField -List "Deliverables" -DisplayName "Deliverable"
Ensure-LookupField -List "Deliverables" -InternalName "Project" -DisplayName "Project" -LookupListTitle "Projects" -Required $true
Ensure-Field -List "Deliverables" -InternalName "LegacyId" -DisplayName "Legacy ID" -Type Number
Ensure-Field -List "Deliverables" -InternalName "Discipline" -DisplayName "Discipline" -Type Text -Required $true
Ensure-Field -List "Deliverables" -InternalName "OperationalStatus" -DisplayName "Operational Status" -Type Choice -Required $true -Choices @("Not Started","Pending","In Progress","Awaiting Review","Waiting on Information","Blocked","Complete") -DefaultValue "Pending"
Ensure-Field -List "Deliverables" -InternalName "Owner" -DisplayName "Owner" -Type Text
Ensure-Field -List "Deliverables" -InternalName "CurrentActivity" -DisplayName "Current Activity" -Type Note
Ensure-Field -List "Deliverables" -InternalName "WaitingOn" -DisplayName "Waiting On" -Type Note
Ensure-Field -List "Deliverables" -InternalName "NextStep" -DisplayName "Next Step" -Type Note
Ensure-Field -List "Deliverables" -InternalName "StartDate" -DisplayName "Start Date" -Type DateTime
Ensure-Field -List "Deliverables" -InternalName "TargetDate" -DisplayName "Target Date" -Type DateTime
Ensure-Field -List "Deliverables" -InternalName "Risk" -DisplayName "Risk" -Type Note
Ensure-Field -List "Deliverables" -InternalName "Visibility" -DisplayName "Visibility" -Type Choice -Required $true -Choices @("Shared","AHT Internal","Admin Only") -DefaultValue "Shared"
Ensure-Field -List "Deliverables" -InternalName "Archived" -DisplayName "Archived" -Type Boolean -DefaultValue "0"
Ensure-Field -List "Deliverables" -InternalName "HealthMode" -DisplayName "Health Mode" -Type Choice -Choices @("auto","manual") -DefaultValue "auto"
Ensure-Field -List "Deliverables" -InternalName "HealthOverride" -DisplayName "Health Override" -Type Choice -Choices @("Healthy","At Risk","Overdue")
Ensure-Field -List "Deliverables" -InternalName "HealthOverrideReason" -DisplayName "Health Override Reason" -Type Note
Ensure-Field -List "Deliverables" -InternalName "HealthOverrideUntil" -DisplayName "Health Override Until" -Type DateTime

Write-Step "Configuring Information Required"
Rename-TitleField -List "Information Required" -DisplayName "Item Needed"
Ensure-LookupField -List "Information Required" -InternalName "Project" -DisplayName "Project" -LookupListTitle "Projects" -Required $true
Ensure-Field -List "Information Required" -InternalName "LegacyId" -DisplayName "Legacy ID" -Type Number
Ensure-Field -List "Information Required" -InternalName "RequestedFrom" -DisplayName "Requested From" -Type Text
Ensure-Field -List "Information Required" -InternalName "RequestStatus" -DisplayName "Status" -Type Choice -Required $true -Choices @("Outstanding","Pending","Received","No Longer Needed") -DefaultValue "Outstanding"
Ensure-Field -List "Information Required" -InternalName "Blocking" -DisplayName "Blocking" -Type Note
Ensure-Field -List "Information Required" -InternalName "NeededBy" -DisplayName "Needed By" -Type DateTime
Ensure-Field -List "Information Required" -InternalName "Notes" -DisplayName "Notes" -Type Note
Ensure-Field -List "Information Required" -InternalName "Visibility" -DisplayName "Visibility" -Type Choice -Required $true -Choices @("Shared","AHT Internal","Admin Only") -DefaultValue "Shared"
Ensure-Field -List "Information Required" -InternalName "Archived" -DisplayName "Archived" -Type Boolean -DefaultValue "0"

Write-Step "Configuring Change Log"
Rename-TitleField -List "Change Log" -DisplayName "Record Name"
Ensure-LookupField -List "Change Log" -InternalName "Project" -DisplayName "Project" -LookupListTitle "Projects"
Ensure-Field -List "Change Log" -InternalName "ChangeTime" -DisplayName "Change Time" -Type DateTime -Required $true
Ensure-Field -List "Change Log" -InternalName "UserName" -DisplayName "User Name" -Type Text
Ensure-Field -List "Change Log" -InternalName "UserEmail" -DisplayName "User Email" -Type Text
Ensure-Field -List "Change Log" -InternalName "Action" -DisplayName "Action" -Type Choice -Required $true -Choices @("Created","Updated","Archived","Restored","Deleted") -DefaultValue "Updated"
Ensure-Field -List "Change Log" -InternalName "RecordType" -DisplayName "Record Type" -Type Choice -Required $true -Choices @("Project","Deliverable","Information Required")
Ensure-Field -List "Change Log" -InternalName "Details" -DisplayName "Details" -Type Note
Ensure-Field -List "Change Log" -InternalName "Visibility" -DisplayName "Visibility" -Type Choice -Required $true -Choices @("Shared","AHT Internal","Admin Only") -DefaultValue "AHT Internal"

Write-Step "Adding indexes"
Ensure-UniqueIndexedField -List "Projects" -InternalName "ProjectKey"
Ensure-IndexedField -List "Projects" -InternalName "Archived"
Ensure-IndexedField -List "Deliverables" -InternalName "Project"
Ensure-IndexedField -List "Deliverables" -InternalName "TargetDate"
Ensure-IndexedField -List "Deliverables" -InternalName "Archived"
Ensure-IndexedField -List "Information Required" -InternalName "Project"
Ensure-IndexedField -List "Information Required" -InternalName "NeededBy"
Ensure-IndexedField -List "Information Required" -InternalName "Archived"
Ensure-IndexedField -List "Change Log" -InternalName "Project"
Ensure-IndexedField -List "Change Log" -InternalName "ChangeTime"

Write-Step "Creating dashboard-friendly views"
Ensure-View -List "Projects" -Title "Active Projects" `
    -Fields @("LinkTitle","ProjectKey","ProjectPhase","ProgressPlanning","ProgressEngineering","ProgressInstallation","LastActivityDate") `
    -Query "<Where><Eq><FieldRef Name='Archived'/><Value Type='Integer'>0</Value></Eq></Where><OrderBy><FieldRef Name='Title' Ascending='TRUE'/></OrderBy>"

Ensure-View -List "Deliverables" -Title "Active Deliverables" `
    -Fields @("LinkTitle","Project","Discipline","OperationalStatus","Owner","StartDate","TargetDate","Visibility") `
    -Query "<Where><Eq><FieldRef Name='Archived'/><Value Type='Integer'>0</Value></Eq></Where><OrderBy><FieldRef Name='TargetDate' Ascending='TRUE'/></OrderBy>"

Ensure-View -List "Information Required" -Title "Open Information" `
    -Fields @("LinkTitle","Project","RequestedFrom","RequestStatus","NeededBy","Visibility") `
    -Query "<Where><And><Eq><FieldRef Name='Archived'/><Value Type='Integer'>0</Value></Eq><Neq><FieldRef Name='RequestStatus'/><Value Type='Choice'>Received</Value></Neq></And></Where><OrderBy><FieldRef Name='NeededBy' Ascending='TRUE'/></OrderBy>"

Ensure-View -List "Change Log" -Title "Recent Changes" `
    -Fields @("LinkTitle","Project","ChangeTime","UserName","Action","RecordType","Visibility") `
    -Query "<OrderBy><FieldRef Name='ChangeTime' Ascending='FALSE'/></OrderBy>" `
    -RowLimit 200

if ($SeedSampleData) {
    Write-Step "Loading sample data"
    $samplePath = Join-Path $PSScriptRoot "SampleData.json"
    if (-not (Test-Path $samplePath)) {
        throw "Sample data file not found: $samplePath"
    }

    $sample = Get-Content $samplePath -Raw | ConvertFrom-Json
    $projectIds = @{}

    foreach ($project in $sample.projects) {
        $existing = Get-PnPListItem -List "Projects" -Query @"
<View><Query><Where><Eq><FieldRef Name='ProjectKey'/><Value Type='Text'>$($project.projectKey)</Value></Eq></Where></Query><RowLimit>1</RowLimit></View>
"@
        if ($existing.Count -gt 0) {
            $projectIds[$project.projectKey] = $existing[0].Id
            Write-Host "  Sample project already exists: $($project.projectName)"
            continue
        }

        $item = Add-PnPListItem -List "Projects" -Values @{
            Title                = $project.projectName
            ProjectKey           = $project.projectKey
            ProjectAddress       = $project.address
            ProjectCity          = $project.city
            ProjectState         = $project.state
            ProjectDescription   = $project.description
            ProjectSubtitle      = $project.subtitle
            ProjectPhase         = $project.phase
            Archived             = $false
            LastActivityDate     = DateOrNull $project.lastActivityDate
            LastActivity         = $project.lastActivity
            ProgressPlanning     = $project.progressPlanning
            ProgressEngineering  = $project.progressEngineering
            ProgressInstallation = $project.progressInstallation
            HealthMode           = "auto"
        }
        $projectIds[$project.projectKey] = $item.Id
        Write-Host "  Added sample project: $($project.projectName)"
    }

    foreach ($record in $sample.deliverables) {
        $projectId = $projectIds[$record.projectKey]
        $existing = Get-SeedRecordByProjectAndLegacyId -List "Deliverables" -ProjectId $projectId -LegacyId $record.legacyId
        if ($existing) {
            Write-Host "  Sample deliverable already exists: $($record.deliverable)"
            continue
        }

        Add-PnPListItem -List "Deliverables" -Values @{
            Title            = $record.deliverable
            Project          = $projectId
            LegacyId         = $record.legacyId
            Discipline       = $record.discipline
            OperationalStatus= $record.status
            Owner            = $record.owner
            CurrentActivity  = $record.currentActivity
            WaitingOn        = $record.waitingOn
            NextStep         = $record.nextStep
            TargetDate       = DateOrNull $record.targetDate
            Risk             = $record.risk
            Visibility       = $record.visibility
            Archived         = $false
            HealthMode       = "auto"
        } | Out-Null
        Write-Host "  Added sample deliverable: $($record.deliverable)"
    }

    foreach ($record in $sample.informationRequired) {
        $projectId = $projectIds[$record.projectKey]
        $existing = Get-SeedRecordByProjectAndLegacyId -List "Information Required" -ProjectId $projectId -LegacyId $record.legacyId
        if ($existing) {
            Write-Host "  Sample information request already exists: $($record.item)"
            continue
        }

        Add-PnPListItem -List "Information Required" -Values @{
            Title          = $record.item
            Project        = $projectId
            LegacyId       = $record.legacyId
            RequestedFrom  = $record.requestedFrom
            RequestStatus  = $record.status
            Blocking       = $record.blocking
            NeededBy       = DateOrNull $record.neededBy
            Notes          = $record.notes
            Visibility     = $record.visibility
            Archived       = $false
        } | Out-Null
        Write-Host "  Added sample information request: $($record.item)"
    }
}

Write-Step "Verification"
foreach ($listTitle in @("Projects","Deliverables","Information Required","Change Log")) {
    $list = Get-PnPList -Identity $listTitle
    $fieldCount = (Get-PnPField -List $listTitle).Count
    Write-Host ("{0,-24} fields: {1,-3} URL: {2}" -f $list.Title, $fieldCount, $list.RootFolder.ServerRelativeUrl) -ForegroundColor Green
}

Write-Host ""
Write-Host "SharePoint backend setup completed successfully." -ForegroundColor Green
Disconnect-PnPOnline
