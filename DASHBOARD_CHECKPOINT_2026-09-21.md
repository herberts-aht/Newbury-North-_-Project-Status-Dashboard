# Dashboard Checkpoint — 2026-09-21

## Project Plan
- Local Task/Subtask persistence working.
- Task validation working with compact message above Save.
- Action Required grouped by Higher-Level Task.
- Early warning states working: Due Soon, At Risk, Overdue.
- Task detail drill-down shows warning state on affected Subtasks.
- Project Contacts remain separate from dashboard users.

## Gantt
- Project mode now uses Project Plan, not Deliverables.
- Site mode remains Site Operations.
- Combined shows Project Plan + Site Operations.
- Project Plan hierarchy expandable inside Gantt.
- Workstream -> Task -> Subtask -> deeper Subtask works.
- Left Task/hierarchy column sticky and widened.
- Timeline opens about 7 days before Today.
- Clicking hierarchy expands/collapses.
- Clicking timeline bar opens actual Project Plan Task.
- Header terminology changed from Deliverable to Task.
- Description changed to Project Plan schedule.

## Calendar
- Project mode now sources Project Plan.
- Site / Combined modes remain.
- Left Upcoming Agenda now has expandable Task/Subtask hierarchy.
- "View task" opens Project Plan Task.
- Calendar description says Project dates from Project Plan.

## NEXT STEP
Finish live Calendar behavior:
1. Right month calendar should stay clean.
2. Subtasks should appear on right calendar when their Higher-Level Task is expanded on left.
3. Unrelated Tasks must remain visible.
4. Add subtle status treatment:
   - Blue = In Progress
   - Orange = Waiting / Awaiting Review
   - Red = Blocked
   - Green = Complete
   - Gray = Planned / Not Started
5. Left Agenda can show explicit status badge.
6. Calendar PDF should ALWAYS print all Tasks/Subtasks fully expanded,
   regardless of live expansion state, with complete status information.

## Pending later
- Calendar PDF source must be aligned to Project Plan.
- Dashboard-wide required-field/validation standards for Deliverables,
  Information Required, Project Plan, Site Operations.
- Help function at end:
  - How to use dashboard
  - Submit help ticket routed to Stacy
