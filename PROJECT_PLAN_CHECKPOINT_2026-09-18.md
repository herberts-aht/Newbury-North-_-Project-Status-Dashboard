# Project Plan Development Checkpoint
Date: September 18, 2026

## Current state

Project Plan prototype is functional and remains LOCAL ONLY.
No Project Plan task data is being written to SharePoint yet.

Current dashboard visible version:
- v0.14.60

Latest Project Plan prototype asset work:
- approximately v0.14.88

## Terminology decided

User-facing terminology:

- Project Work -> Project Plan
- Work Item -> Task
- Child Work Item -> Subtask
- Parent Work Item -> Higher-Level Task
- Blocker / Dependency retained
- Owner / Responsible
- Waiting On
- Required By
- Target Date
- Information Required
- Predecessor

Internal JavaScript names such as ProjectWorkItems and parentWorkItemId
have intentionally NOT been renamed.

## Project Plan hierarchy

Hierarchy engine exists in:

- js/project-work-items.js

Supports:

- hierarchical tasks
- subtasks
- weighted progress rollup
- calculated parent progress
- project progress
- predecessors
- dependencies/blockers
- owner
- Waiting On
- Required By
- Target Date
- schedule bridge
- hierarchy validation

## Project Plan UI

Main UI exists in:

- js/project-work-view.js
- css/project-work.css

Current modes:

- Hierarchy
- Action Required

Action Required provides a flattened list of tasks waiting on someone,
a review, a decision, or required information.

Supports:

- Cards / List
- Waiting On filter
- entire cards/rows clickable
- task detail drilldown

## Project Contacts

Project Contacts prototype exists.

Important architecture decision:

Project Contacts are PROJECT SPECIFIC and are separate from Dashboard Users.

Contacts may include:

- AHT personnel
- builder
- architect
- engineer
- consultant
- trade
- vendor
- client
- other external parties

Waiting On / Requested From must NOT require the person/company
to have a dashboard login.

Access decision:

- all project users may view Project Contacts
- Add/Edit/Archive should remain restricted
- currently intended as Administrator maintenance

## Task editor

Task editor exists in:

- js/project-task-editor.js
- css/project-task-editor.css

Working behavior reached before stopping:

- Add Task opens editor
- Add Subtask opens editor with Higher-Level Task populated
- Task details open
- Edit Task appears for administrator task details
- existing tasks can be loaded into editor

Primary Task fields:

- Higher-Level Task
- Task Type
- Task Name
- Owner / Responsible
- Waiting On
- Start Date
- Target Date
- Required By
- Predecessor
- Information Required
- Blocker / Dependency
- Status
- Progress
- Organization fields

## Russell workflow requirement

The core Project Plan design is centered around:

WHO:
- Owner / Responsible
- Waiting On

WHEN:
- Required By
- Target Date

WHAT IS BLOCKED:
- Information Required
- Blocker / Dependency
- Predecessor

Goal:
At any point someone should be able to determine:

- who has the ball
- what exactly is needed
- when it is needed
- what becomes blocked if it is not received

## Editor visual standard

Decision made:

Use the existing Deliverable / Information Required modal scale as the
dashboard-wide editor standard.

Existing shared app classes:

- .modal
- .form-grid
- .field
- .field.full
- .modal-actions

Existing shared modal baseline in css/styles.css:

- width: min(860px, 100%)
- max-height: 90vh
- padding: 20px
- radius: 12px
- form grid: 2 columns
- gap: 12px
- labels: 12px
- controls: 9px 10px padding

Task editor was changed to inherit these shared classes rather than
maintaining an independent scale.

## Last change made

A Task editor overflow correction was added because the right column
was pushing beyond the modal and producing a horizontal scrollbar.

The intended fix:

- minmax(0, 1fr) columns
- min-width: 0 on grid children
- width/max-width containment on controls
- overflow-x hidden on task modal
- vertical scrolling only

This was approximately cache version:

css/project-task-editor.css?v=0.14.88

VERIFY THIS FIRST WHEN RESUMING.

## Known cleanup still needed

1. Verify Task editor no longer has horizontal scrollbar.
2. Verify both Task columns remain completely inside the modal.
3. Change remaining visible breadcrumb:
   Project Work -> Project Plan
4. Change:
   "Child work rolls up automatically..."
   to something like:
   "Subtask progress rolls up automatically into this task."
5. Review any remaining "Workstream" terminology.
6. Confirm Add/Edit permissions with Viewer/Editor/Admin roles.
7. Eventually use Project Contacts as the real selectors for:
   - Owner / Responsible
   - Waiting On
   - Requested From
8. Do NOT connect Project Plan to SharePoint until hierarchy,
   workflow, and editor UX are approved.
9. Later connect Project Plan records into the existing Project-side
   Gantt and Calendar instead of maintaining a separate schedule.

## Architecture decisions to preserve

- Keep one Gantt and one Calendar.
- Project Plan feeds project schedule.
- Site Operations feeds site schedule.
- Combined mode can show both.
- Do not create separate Engineering/Site Gantts.
- Project Plan should remain generic enough for company-wide use.
- Do not make external contacts become dashboard users just to assign
  Waiting On.
- Preserve the existing Site Operations weighted hierarchy model.
- Build incrementally rather than replacing working dashboard modules.

## Resume instruction

When resuming:

Start by verifying the Task editor at v0.14.88.

Do not redesign it again unless necessary.

Then continue with:
1. terminology cleanup
2. Project Contacts -> Task selector integration
3. local task add/edit persistence behavior
4. permissions
5. only then SharePoint schema/storage
