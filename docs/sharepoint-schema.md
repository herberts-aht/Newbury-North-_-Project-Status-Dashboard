# AHT Project Control — SharePoint Schema

This schema matches the fields currently used by the dashboard. SharePoint is the shared data source; the dashboard remains a separate web application.

## Site

`https://ahtglobalteam.sharepoint.com/sites/NewburyNorth`

The existing **Control Dashboard** list is not deleted or modified by the setup script. The script creates the four lists below.

---

## 1. Projects

**List title:** `Projects`  
**Purpose:** One record per dashboard project.

| Display name | Internal name | Type | Required | Default / notes |
|---|---|---:|:---:|---|
| Project Name | `Title` | Single line text | Yes | Built-in Title field renamed |
| Project Key | `ProjectKey` | Single line text | Yes | Stable dashboard ID such as `2200` |
| Address | `ProjectAddress` | Single line text | No | |
| City | `ProjectCity` | Single line text | No | |
| State | `ProjectState` | Single line text | No | |
| Description | `ProjectDescription` | Single line text | No | |
| Subtitle | `ProjectSubtitle` | Single line text | No | |
| Phase | `ProjectPhase` | Single line text | No | |
| Archived | `Archived` | Yes/No | No | No |
| Last Internal Activity Date | `LastActivityDate` | Date only | No | |
| Last Internal Activity | `LastActivity` | Multiple lines text | No | Plain text |
| Planning Progress | `ProgressPlanning` | Number | No | 0; 0–100 |
| Engineering Progress | `ProgressEngineering` | Number | No | 0; 0–100 |
| Installation Progress | `ProgressInstallation` | Number | No | 0; 0–100 |
| Health Mode | `HealthMode` | Choice | No | `auto` |
| Health Override | `HealthOverride` | Choice | No | Healthy, At Risk, Overdue |
| Health Override Reason | `HealthOverrideReason` | Multiple lines text | No | |
| Health Override Until | `HealthOverrideUntil` | Date only | No | |

**Indexes:** Project Key, Archived.

---

## 2. Deliverables

**List title:** `Deliverables`  
**Purpose:** One record per project deliverable. This list drives deliverable tables, health, Gantt, and calendar dates.

| Display name | Internal name | Type | Required | Default / notes |
|---|---|---:|:---:|---|
| Deliverable | `Title` | Single line text | Yes | Built-in Title field renamed |
| Project | `Project` | Lookup to Projects | Yes | Displays Project Name |
| Legacy ID | `LegacyId` | Number | No | Preserves current local numeric ID |
| Discipline | `Discipline` | Single line text | Yes | Exact wording is preserved |
| Operational Status | `OperationalStatus` | Choice | Yes | Pending |
| Owner | `Owner` | Single line text | No | Exact dashboard wording |
| Current Activity | `CurrentActivity` | Multiple lines text | No | |
| Waiting On | `WaitingOn` | Multiple lines text | No | |
| Next Step | `NextStep` | Multiple lines text | No | |
| Start Date | `StartDate` | Date only | No | |
| Target Date | `TargetDate` | Date only | No | |
| Risk | `Risk` | Multiple lines text | No | |
| Visibility | `Visibility` | Choice | Yes | Shared |
| Archived | `Archived` | Yes/No | No | No |
| Health Mode | `HealthMode` | Choice | No | auto |
| Health Override | `HealthOverride` | Choice | No | Healthy, At Risk, Overdue |
| Health Override Reason | `HealthOverrideReason` | Multiple lines text | No | Required by dashboard when manual |
| Health Override Until | `HealthOverrideUntil` | Date only | No | |

**Operational Status choices:** Not Started; Pending; In Progress; Awaiting Review; Waiting on Information; Blocked; Complete.  
**Visibility choices:** Shared; AHT Internal; Admin Only.  
**Indexes:** Project, Target Date, Archived.

---

## 3. Information Required

**List title:** `Information Required`  
**Purpose:** Outstanding and received information requests shown by the dashboard.

| Display name | Internal name | Type | Required | Default / notes |
|---|---|---:|:---:|---|
| Item Needed | `Title` | Single line text | Yes | Built-in Title field renamed |
| Project | `Project` | Lookup to Projects | Yes | Displays Project Name |
| Legacy ID | `LegacyId` | Number | No | Preserves current local numeric ID |
| Requested From | `RequestedFrom` | Single line text | No | |
| Status | `RequestStatus` | Choice | Yes | Outstanding |
| Blocking | `Blocking` | Multiple lines text | No | Describes what is blocked |
| Needed By | `NeededBy` | Date only | No | |
| Notes | `Notes` | Multiple lines text | No | |
| Visibility | `Visibility` | Choice | Yes | Shared |
| Archived | `Archived` | Yes/No | No | No |

**Status choices:** Outstanding; Pending; Received; No Longer Needed.  
**Visibility choices:** Shared; AHT Internal; Admin Only.  
**Indexes:** Project, Needed By, Archived.

---

## 4. Change Log

**List title:** `Change Log`  
**Purpose:** Append-style history for dashboard changes. The initial read-only connection does not depend on this list, but it is created now so write-back has a stable audit destination.

| Display name | Internal name | Type | Required | Default / notes |
|---|---|---:|:---:|---|
| Record Name | `Title` | Single line text | Yes | Short affected-record description |
| Project | `Project` | Lookup to Projects | No | |
| Change Time | `ChangeTime` | Date and time | Yes | |
| User Name | `UserName` | Single line text | No | Snapshot |
| User Email | `UserEmail` | Single line text | No | Snapshot |
| Action | `Action` | Choice | Yes | Updated |
| Record Type | `RecordType` | Choice | Yes | |
| Details | `Details` | Multiple lines text | No | |
| Visibility | `Visibility` | Choice | Yes | AHT Internal |

**Action choices:** Created; Updated; Archived; Restored; Deleted.  
**Record Type choices:** Project; Deliverable; Information Required.  
**Visibility choices:** Shared; AHT Internal; Admin Only.  
**Indexes:** Project, Change Time.

---

## Relationships

- `Deliverables.Project` → `Projects.Title`
- `Information Required.Project` → `Projects.Title`
- `Change Log.Project` → `Projects.Title`

Deleting a project is restricted by lookup relationships. Projects should normally be archived instead of deleted.

## Versioning

Versioning is enabled on all four lists. The setup script retains up to 100 major versions.

## Setup script

Run `tools/Create-AHTDashboard.ps1` from PowerShell 7. The script is idempotent: it creates missing lists, fields, indexes, and views, while leaving existing matching objects in place.

The script requires an approved Entra application/client ID for PnP interactive sign-in. No client secret is stored in the project.
