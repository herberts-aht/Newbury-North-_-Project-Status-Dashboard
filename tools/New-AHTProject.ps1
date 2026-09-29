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

    [switch]$NDA,

    [string]$ProjectKey,

    [string]$ProjectManagerSiteLead,

    [string]$SeniorProjectManager,

    [string]$ExecutiveLead,

    [string]$Subtitle,

    [string]$Description
)

$ErrorActionPreference = "Stop"


# ============================================================
# HELPERS
# ============================================================

function ConvertTo-AHTProjectKey {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $key = $Value.ToUpperInvariant()

    # Common street suffixes are omitted from the internal key.
    $key = $key -replace '\b(DRIVE|DR|ROAD|RD|STREET|ST|AVENUE|AVE|BOULEVARD|BLVD|LANE|LN|COURT|CT|PLACE|PL|PARKWAY|PKWY)\b', ''

    # Everything else becomes a clean hyphenated identifier.
    $key = $key -replace '[^A-Z0-9]+', '-'
    $key = $key.Trim('-')

    return $key
}


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
# VALIDATE NAMING
# ============================================================

if ($NDA -and $ClientLastName) {
    throw "Use either -NDA or -ClientLastName, not both."
}

if (-not $NDA -and [string]::IsNullOrWhiteSpace($ClientLastName)) {
    throw "ClientLastName is required unless -NDA is specified."
}

$Address = $Address.Trim()
$City    = $City.Trim()
$State   = $State.Trim()
$Division = $Division.Trim()
$Phase    = $Phase.Trim()

if ($NDA) {
    $ProjectName = $Address
}
else {
    $ClientLastName = $ClientLastName.Trim()
    $ProjectName = "$Address $ClientLastName"
}

if ([string]::IsNullOrWhiteSpace($ProjectKey)) {
    $ProjectKey = ConvertTo-AHTProjectKey -Value $ProjectName
}
else {
    $ProjectKey = ConvertTo-AHTProjectKey -Value $ProjectKey
}


# ============================================================
# VALIDATE DIVISION
# ============================================================

$divisionField = Get-PnPField -List "Projects" -Identity "Division"
$validDivisions = @($divisionField.Choices)

if ($Division -notin $validDivisions) {
    throw "Invalid Division '$Division'. Valid choices: $($validDivisions -join ', ')"
}


# ============================================================
# DUPLICATE PROTECTION
# ============================================================

$projects = Get-PnPListItem -List "Projects" -PageSize 500

$duplicateKey = $projects |
    Where-Object {
        $_["ProjectKey"] -eq $ProjectKey
    } |
    Select-Object -First 1

if ($duplicateKey) {
    throw "ProjectKey '$ProjectKey' already exists as Project ID $($duplicateKey.Id): $($duplicateKey['Title'])"
}

$duplicateName = $projects |
    Where-Object {
        $_["Title"] -eq $ProjectName
    } |
    Select-Object -First 1

if ($duplicateName) {
    throw "Project '$ProjectName' already exists as Project ID $($duplicateName.Id) with key $($duplicateName['ProjectKey'])."
}


# ============================================================
# BUILD SHAREPOINT VALUES
# ============================================================

$values = @{
    "Title"          = $ProjectName
    "ProjectKey"     = $ProjectKey
    "ProjectAddress" = $Address
    "ProjectCity"    = $City
    "ProjectState"   = $State
    "Division"       = $Division
    "ProjectPhase"   = $Phase
    "Archived"       = $false
}

if ($ProjectManagerSiteLead) {
    $values["ProjectManagerSiteLead"] = $ProjectManagerSiteLead.Trim()
}

if ($SeniorProjectManager) {
    $values["SeniorProjectManager"] = $SeniorProjectManager.Trim()
}

if ($ExecutiveLead) {
    $values["ExecutiveLead"] = $ExecutiveLead.Trim()
}

if ($Subtitle) {
    $values["ProjectSubtitle"] = $Subtitle.Trim()
}

if ($Description) {
    $values["ProjectDescription"] = $Description.Trim()
}


# ============================================================
# PREVIEW
# ============================================================

Write-Host ""
Write-Host "AHT PROJECT ONBOARDING"
Write-Host "----------------------"
Write-Host "Project Name : $ProjectName"
Write-Host "Project Key  : $ProjectKey"
Write-Host "Address      : $Address"
Write-Host "City / State : $City, $State"
Write-Host "Division     : $Division"
Write-Host "Phase        : $Phase"

if ($NDA) {
    Write-Host "Client Name  : Omitted (NDA)"
}
else {
    Write-Host "Client       : $ClientLastName"
}

Write-Host ""


# ============================================================
# CREATE PROJECT
# ============================================================

if ($PSCmdlet.ShouldProcess(
    "$ProjectName [$ProjectKey]",
    "Create AHT Project"
)) {

    $newProject = Add-PnPListItem `
        -List "Projects" `
        -Values $values

    Write-Host ""
    Write-Host "PROJECT CREATED"
    Write-Host "---------------"
    Write-Host "Name       : $ProjectName"
    Write-Host "ProjectKey : $ProjectKey"
    Write-Host "Project ID : $($newProject.Id)"

    Write-Host ""

    [PSCustomObject]@{
        ProjectId   = $newProject.Id
        ProjectName = $ProjectName
        ProjectKey  = $ProjectKey
        Address     = $Address
        City        = $City
        State       = $State
        Division    = $Division
        Phase       = $Phase
        NDA         = [bool]$NDA
    }
}
