[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectKey,

    [Parameter(Mandatory = $true)]
    [string[]]$Modules
)

$ErrorActionPreference = "Stop"

# ============================================================
# MODULE DEFINITIONS
# ============================================================

$moduleDefinitions = @{
    "Core" = @(
        @{
            Suffix     = "preconstruction"
            Title      = "Preconstruction & Project Readiness"
            ItemType   = "Task"
            WorkStatus = "Planned"
        },
        @{
            Suffix     = "engineering"
            Title      = "Engineering & Design Coordination"
            ItemType   = "Task"
            WorkStatus = "Planned"
        },
        @{
            Suffix     = "roughin"
            Title      = "Rough-In Planning & Execution"
            ItemType   = "Task"
            WorkStatus = "Planned"
        },
        @{
            Suffix     = "trim-final"
            Title      = "Trim / Final / Commissioning"
            ItemType   = "Task"
            WorkStatus = "Planned"
        }
    )

    "AV" = @(
        @{
            Suffix     = "avit"
            Title      = "AV / IT Coordination"
            ItemType   = "Task"
            WorkStatus = "Planned"
        }
    )

    "Lighting" = @(
        @{
            Suffix     = "lighting-shading"
            Title      = "Lighting & Shading Coordination"
            ItemType   = "Task"
            WorkStatus = "Planned"
        }
    )

    "Security" = @(
        @{
            Suffix     = "security"
            Title      = "Security / CCTV / Access Coordination"
            ItemType   = "Task"
            WorkStatus = "Planned"
        }
    )

    "Network" = @(
        @{
            Suffix     = "network"
            Title      = "Network / Wi-Fi Coordination"
            ItemType   = "Task"
            WorkStatus = "Planned"
        }
    )

    "Procurement" = @(
        @{
            Suffix     = "procurement"
            Title      = "Equipment & Procurement Planning"
            ItemType   = "Task"
            WorkStatus = "Planned"
        }
    )

    "Theater" = @(
        @{
            Suffix     = "theater"
            Title      = "Home Theater Coordination"
            ItemType   = "Task"
            WorkStatus = "Planned"
        }
    )

    "Power" = @(
        @{
            Suffix     = "power"
            Title      = "Electrical / Power Coordination"
            ItemType   = "Task"
            WorkStatus = "Planned"
        }
    )

    "LifeSafety" = @(
        @{
            Suffix     = "life-safety"
            Title      = "Life Safety Coordination"
            ItemType   = "Task"
            WorkStatus = "Planned"
        }
    )

    "Plant" = @(
        @{
            Suffix     = "plant"
            Title      = "Plant / Facilities Coordination"
            ItemType   = "Task"
            WorkStatus = "Planned"
        }
    )

    "Aquatics" = @(
        @{
            Suffix     = "aquatics"
            Title      = "Aquatics / Pool Coordination"
            ItemType   = "Task"
            WorkStatus = "Planned"
        }
    )

    "SiteLandscape" = @(
        @{
            Suffix     = "site-landscape"
            Title      = "Site / Landscape Coordination"
            ItemType   = "Task"
            WorkStatus = "Planned"
        }
    )
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

$projectTitle = $project["Title"]

# ============================================================
# VALIDATE MODULES
# ============================================================

$requestedModules = @()

foreach ($module in $Modules) {
    if ([string]::IsNullOrWhiteSpace($module)) {
        continue
    }

    $cleanModule = $module.Trim()

    if (-not $moduleDefinitions.ContainsKey($cleanModule)) {
        throw "Invalid module '$cleanModule'. Valid modules: $($moduleDefinitions.Keys -join ', ')"
    }

    if ($cleanModule -notin $requestedModules) {
        $requestedModules += $cleanModule
    }
}

if ("Core" -notin $requestedModules) {
    $requestedModules = @("Core") + $requestedModules
}

# ============================================================
# PREVIEW
# ============================================================

Write-Host ""
Write-Host "AHT PROJECT PLAN INITIALIZATION"
Write-Host "-------------------------------"
Write-Host "Project Name : $projectTitle"
Write-Host "Project Key  : $projectKeyNormalized"
Write-Host ""
Write-Host "Modules:"
foreach ($module in $requestedModules) {
    Write-Host "  - $module"
}
Write-Host ""

# ============================================================
# LOAD EXISTING WORK ITEMS
# ============================================================

$existingWorkItems = Get-PnPListItem -List "Project Work Items" -PageSize 1000

# ============================================================
# BUILD / CREATE
# ============================================================

foreach ($module in $requestedModules) {

    foreach ($definition in $moduleDefinitions[$module]) {

        $workItemKey = "$projectKeyNormalized-$($definition.Suffix)"

        $existing = $existingWorkItems |
            Where-Object {
                $_["WorkItemKey"] -eq $workItemKey
            } |
            Select-Object -First 1

        if ($existing) {
            Write-Host "EXISTS: $workItemKey | $($existing['Title'])"
            continue
        }

        $values = @{
            "ProjectKey"  = $projectKeyNormalized
            "WorkItemKey" = $workItemKey
            "Title"       = $definition.Title
            "ItemType"    = $definition.ItemType
            "WorkStatus"  = $definition.WorkStatus
            "Archived"    = $false
        }

        if ($PSCmdlet.ShouldProcess(
            "$projectTitle -> $($definition.Title)",
            "Create Project Plan branch"
        )) {
            $newItem = Add-PnPListItem `
                -List "Project Work Items" `
                -Values $values

            Write-Host "CREATED: $workItemKey | $($definition.Title) | ID $($newItem.Id)"
        }
    }
}
