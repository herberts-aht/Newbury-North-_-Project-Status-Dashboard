(function(){
  "use strict";

  const HELP_TOPICS = {

    projects:{
      title:"Projects",
      summary:"Choose from the projects currently assigned to you.",
      overview:`
        <p>The <strong>Projects</strong> page is the starting point for selecting which project you want to work with.</p>
        <p>You only see projects your account is permitted to access. Selecting a project opens that project's Executive Summary and makes it the active project throughout Project Control.</p>
      `,
      viewer:[
        {
          title:"How to use Projects",
          steps:[
            "Open Projects from the left navigation.",
            "Locate the project you want to review.",
            "Select the project card.",
            "Project Control changes the active project and opens its Executive Summary.",
            "Use the left navigation to move through Project Plan, Site Operations, Deliverables, Information Required, Calendar, and Gantt for that project."
          ]
        },
        {
          title:"If a project is missing",
          body:`
            <p>A missing project usually means your account has not been assigned to it.</p>
            <p>Use <strong>Help Ticket</strong> if something appears technically wrong. Users with project-management access can use <strong>Access & User Request</strong> when access needs to be added or changed.</p>
          `
        }
      ],
      editor:[],
      admin:[
        {
          title:"Project access",
          body:`
            <p>Project access should be managed through the available Administration controls for your role. If the required person, project, or assignment is unavailable, use <strong>Access & User Request</strong>.</p>
          `
        }
      ]
    },

    executiveSummary:{
      title:"Executive Summary",
      summary:"Management-level view of current project health, work, blockers, schedule risk, and upcoming activity.",
      overview:`
        <p>The <strong>Executive Summary</strong> is designed to answer one question quickly: <em>What needs attention on this project right now?</em></p>
        <p>It combines current work, schedule information, waiting items, project risks, milestone risk, recent activity, and other high-level indicators into one management view.</p>
      `,
      viewer:[
        {
          title:"How to review the Executive Summary",
          steps:[
            "Confirm the correct project is active.",
            "Review overall project health and phase progress.",
            "Look at Waiting, Overdue, and other attention indicators.",
            "Review Project Risks for blockers or schedule conflicts.",
            "Review upcoming or time-sensitive work.",
            "Select supported risk or work items to open the underlying record for more detail."
          ]
        },
        {
          title:"Understanding Project Risks",
          body:`
            <p><strong>Blocked By</strong> means an incomplete predecessor is preventing downstream work from being considered clear.</p>
            <p><strong>Dependency Conflict</strong> means explicit schedule dates make the planned sequence impossible. For example, a Task is scheduled to start before its predecessor is scheduled to finish.</p>
            <p><strong>Milestone at Risk</strong> means a schedule conflict exists somewhere upstream in the chain leading to that Milestone.</p>
          `
        },
        {
          title:"What to look for",
          body:`
            <p>Pay particular attention to overdue work, waiting items with no clear owner, dependency conflicts, milestones at risk, and work approaching its Target Date.</p>
            <p>The Executive Summary is intended to identify where deeper review is needed; the underlying Project Plan, Site Operations, Deliverable, or Information Required record remains the detailed source.</p>
          `
        }
      ],
      editor:[
        {
          title:"Keeping the Executive Summary accurate",
          body:`
            <p>The Executive Summary is largely driven by the project records underneath it. Keep <strong>Owner</strong>, <strong>Status</strong>, dates, <strong>Waiting On</strong>, <strong>Next Step</strong>, hierarchy, predecessors, and milestone information current.</p>
            <p>Do not update a record only to make the summary look better. Update the underlying record to reflect the actual project condition.</p>
          `
        }
      ],
      admin:[]
    },

    projectPlan:{
      title:"Project Plan",
      summary:"Hierarchical project Tasks and Subtasks with ownership, dates, predecessors, dependencies, milestones, and progress.",
      overview:`
        <p><strong>Project Plan</strong> is the primary project-management schedule. It organizes major Tasks and their Subtasks, identifies who owns the work, establishes planned dates, and defines schedule relationships.</p>
        <p>Project Plan feeds other areas including the Executive Summary, Calendar, Agenda, and Gantt.</p>
      `,
      viewer:[
        {
          title:"How to read Project Plan",
          steps:[
            "Use the expand control beside a Task to display its Subtasks.",
            "Review Owner to see who is responsible for the work.",
            "Review Start Date and Target Date to understand the planned work window.",
            "Review Status, Next Step, and Waiting On for the current condition.",
            "Look for Blocked By or Dependency Conflict indicators when schedule relationships exist.",
            "Select a Task or Subtask to open its full detail."
          ]
        },
        {
          title:"Task vs Subtask",
          body:`
            <p>A <strong>Task</strong> can stand on its own or act as a higher-level container for related work.</p>
            <p>A <strong>Subtask</strong> sits beneath a Higher-Level Task. Subtasks allow the schedule to show the individual pieces of work that lead to a larger result.</p>
          `
        },
        {
          title:"Higher-Level Task vs Predecessor",
          body:`
            <p>These are different relationships.</p>
            <p><strong>Higher-Level Task</strong> answers: <em>What larger piece of work does this belong under?</em></p>
            <p><strong>Predecessor</strong> answers: <em>What must happen before this work?</em></p>
            <p>A Task may use both relationships at the same time.</p>
          `
        },
        {
          title:"Blocked By vs Dependency Conflict",
          body:`
            <p><strong>Blocked By</strong> means a predecessor has not been completed.</p>
            <p><strong>Dependency Conflict</strong> is a date problem. It appears when the dependent item has an explicit Start Date earlier than the planned finish of an incomplete predecessor.</p>
            <p>A predecessor finishing on the same date that the dependent work starts is allowed.</p>
          `
        },
        {
          title:"Milestones",
          body:`
            <p>A <strong>Milestone</strong> represents an important date, approval, release point, turnover point, or other significant schedule event rather than normal duration-based work.</p>
            <p>A Milestone can be marked <strong>At Risk</strong> when an upstream schedule conflict exists in the chain leading to it.</p>
          `
        }
      ],
      editor:[
        {
          title:"Create a Task",
          steps:[
            "Open Project Plan.",
            "Choose the option to add a new item.",
            "Enter a clear Task name.",
            "Assign the Owner.",
            "Enter the appropriate Start Date and Target Date.",
            "Set Status and any relevant Next Step or Waiting On information.",
            "Leave Higher-Level Task blank when the item is a top-level Task.",
            "Save the record."
          ]
        },
        {
          title:"Create a Subtask",
          steps:[
            "Create or open the item that should become a Subtask.",
            "Find Higher-Level Task.",
            "Select the Task that this work belongs beneath.",
            "Enter the Subtask's own Owner and dates.",
            "Save the record.",
            "Expand the Higher-Level Task in Project Plan or Gantt to confirm the Subtask appears underneath it."
          ]
        },
        {
          title:"Add a Predecessor",
          steps:[
            "Open the Task or Subtask that should occur later.",
            "Find Predecessor(s).",
            "Select the Task or Tasks that must occur first.",
            "Confirm the dependent item's explicit Start Date does not begin before the predecessor's Target Date.",
            "Save the record.",
            "Review Project Plan or Gantt for Blocked By or Dependency Conflict indicators."
          ]
        },
        {
          title:"Create a Milestone",
          steps:[
            "Create or open the schedule item.",
            "Set Item Type to Milestone.",
            "Use a clear milestone name describing the event or release point.",
            "Enter the planned milestone date.",
            "Add predecessors that must be completed before the milestone is achieved.",
            "Save and confirm the milestone appears correctly in Calendar and Gantt."
          ]
        },
        {
          title:"Common scheduling mistakes",
          body:`
            <p>Do not use Higher-Level Task as a substitute for a predecessor. Hierarchy and schedule dependency are separate concepts.</p>
            <p>Do not create artificial dates simply to eliminate a warning. Correct the actual schedule relationship or planned dates.</p>
            <p>Keep Subtask Target Dates meaningful. A major Task due next month is much more useful when the work leading to it has earlier Subtask dates.</p>
          `
        }
      ],
      admin:[]
    },

    siteOperations:{
      title:"Site Operations",
      summary:"Field execution, room/location work, Tasks/Subtasks, schedule relationships, progress, and blockers.",
      overview:`
        <p><strong>Site Operations</strong> is the field-execution side of Project Control. It organizes work by room, location, or site activity and supports the same basic schedule concepts used in Project Plan.</p>
        <p>Site Operations can feed the Executive Summary, Calendar, and Gantt when Site or Combined schedule views are selected.</p>
      `,
      viewer:[
        {
          title:"How to read Site Operations",
          steps:[
            "Open Site Operations.",
            "Navigate to the relevant room, location, or work area.",
            "Expand Tasks to display Subtasks when available.",
            "Review Owner, Status, Activity/Start Date, and Target Date.",
            "Review Waiting On, blockers, predecessors, and schedule warnings.",
            "Select the item to review its full detail."
          ]
        },
        {
          title:"Schedule relationships",
          body:`
            <p>Site Operations supports Higher-Level Task hierarchy, predecessors, Tasks, Subtasks, and Milestones.</p>
            <p><strong>Blocked By</strong>, <strong>Dependency Conflict</strong>, and <strong>Milestone at Risk</strong> follow the same meaning as they do in Project Plan.</p>
          `
        }
      ],
      editor:[
        {
          title:"Creating field work",
          steps:[
            "Open Site Operations and choose the appropriate project location or work area.",
            "Create the Task or Subtask.",
            "Assign an Owner.",
            "Enter Activity/Start Date and Target Date.",
            "Use Higher-Level Task when this work belongs beneath another Task.",
            "Add Predecessor(s) when other work must happen first.",
            "Set Item Type to Milestone when the record represents a significant field date rather than duration-based work.",
            "Save and verify its position in the hierarchy."
          ]
        },
        {
          title:"Use Site Operations for field execution",
          body:`
            <p>Use Site Operations for actual room/location execution detail rather than duplicating every Project Plan management Task.</p>
            <p>Where Project Plan describes the broader management schedule, Site Operations should make it easy to understand what must happen in the field, where it happens, who owns it, and what is preventing it from proceeding.</p>
          `
        }
      ],
      admin:[]
    },

    deliverables:{
      title:"Deliverables",
      summary:"Project outcomes, ownership, next steps, dates, status, and schedule health.",
      overview:`
        <p><strong>Deliverables</strong> track important project outcomes that need an owner, status, next step, and expected completion.</p>
        <p>A Deliverable is generally broader than an individual Task. Use it when management needs to know whether an important project outcome is moving, waiting, complete, or at risk.</p>
      `,
      viewer:[
        {
          title:"How to review Deliverables",
          steps:[
            "Open Deliverables.",
            "Review Status to understand the current condition.",
            "Review Owner to see who is responsible.",
            "Review Target Date for timing.",
            "Review Next Step for the immediate action.",
            "Review Waiting On when progress depends on another person, trade, decision, or input.",
            "Open the Deliverable for full detail when needed."
          ]
        },
        {
          title:"What makes a useful Deliverable",
          body:`
            <p>A good Deliverable clearly states the outcome being managed. It should have an accountable Owner, meaningful status, useful next step, and realistic date.</p>
            <p>Detailed execution steps normally belong in Project Plan or Site Operations rather than being broken into excessive Deliverables.</p>
          `
        }
      ],
      editor:[
        {
          title:"Updating a Deliverable",
          steps:[
            "Open the Deliverable.",
            "Confirm the Owner is still correct.",
            "Update Status to reflect the actual condition.",
            "Update the Target Date when the planned completion has legitimately changed.",
            "Enter the immediate Next Step.",
            "Use Waiting On when progress depends on someone else.",
            "Save the record."
          ]
        },
        {
          title:"Avoid vague updates",
          body:`
            <p>Entries such as “working on it” are less useful than a specific next action. Whenever possible, state what happens next and who or what is required.</p>
          `
        }
      ],
      admin:[]
    },

    informationRequired:{
      title:"Information Required",
      summary:"Tracks information needed from others and what that missing information is blocking.",
      overview:`
        <p><strong>Information Required</strong> tracks questions, approvals, decisions, documents, selections, or other inputs needed before work can continue efficiently.</p>
        <p>Its purpose is to make unanswered project needs visible instead of allowing them to remain buried in email, meetings, or individual notes.</p>
      `,
      viewer:[
        {
          title:"How to review Information Required",
          steps:[
            "Open Information Required.",
            "Review what information is being requested.",
            "Review who the request is from or waiting on.",
            "Check the needed-by date.",
            "Review what work or decision is being blocked.",
            "Open the record for full context."
          ]
        },
        {
          title:"What belongs here",
          body:`
            <p>Examples include missing design information, selections, engineering answers, approvals, dimensions, documents, access decisions, or information required from another trade.</p>
          `
        }
      ],
      editor:[
        {
          title:"Creating a useful Information Required record",
          steps:[
            "Describe the exact information needed.",
            "Identify who the information is requested from.",
            "Set the needed-by date.",
            "Explain what work, decision, or schedule item is being blocked.",
            "Keep the status current as the request moves from open to answered or resolved.",
            "Close or complete the item when the required information has been received and acted upon."
          ]
        },
        {
          title:"Be specific",
          body:`
            <p>“Need answer from electrician” is less useful than identifying the exact decision, drawing, dimension, load, location, approval, or other information required.</p>
          `
        }
      ],
      admin:[]
    },

    calendar:{
      title:"Calendar & Agenda",
      summary:"Date-based view of Project Plan and Site Operations work.",
      overview:`
        <p>The <strong>Calendar</strong> provides a date-based view of scheduled Project Plan and Site Operations work. The Agenda helps present the same schedule information in a more readable list.</p>
        <p>Depending on the selected mode, the Calendar can show Project Plan, Site Operations, or Combined schedule information.</p>
      `,
      viewer:[
        {
          title:"How to use Calendar",
          steps:[
            "Open Calendar.",
            "Choose Project, Site, or Combined mode when available.",
            "Navigate to the date or period you want to review.",
            "Look for Tasks, Subtasks, and Milestones.",
            "Use the Agenda for a structured list of upcoming work.",
            "Expand hierarchy where available to reveal Subtasks.",
            "Select an item or Agenda row to open the underlying record."
          ]
        },
        {
          title:"Calendar indicators",
          body:`
            <p>Milestones use a milestone indicator. Schedule conflicts can display a warning indicator or conflict treatment.</p>
            <p>The Calendar does not create separate schedule data; it reflects dates stored in Project Plan and Site Operations.</p>
          `
        }
      ],
      editor:[
        {
          title:"Correct Calendar dates at the source",
          body:`
            <p>If something appears on the wrong date, update the underlying Project Plan or Site Operations record rather than trying to correct it only in Calendar.</p>
          `
        }
      ],
      admin:[]
    },

    gantt:{
      title:"Gantt",
      summary:"Timeline view of Project Plan and Site Operations schedules.",
      overview:`
        <p>The <strong>Gantt</strong> shows scheduled work across time. It is especially useful for understanding sequencing, hierarchy, overlap, upcoming work, and dependency problems.</p>
        <p>Project, Site, and Combined modes control which schedule source is displayed.</p>
      `,
      viewer:[
        {
          title:"How to read Gantt",
          steps:[
            "Open Gantt.",
            "Choose Project, Site, or Combined mode when available.",
            "Use the Task column to identify the scheduled work.",
            "Expand higher-level Tasks to show Subtasks.",
            "Read bars against the timeline to understand planned duration.",
            "Look for Milestones, Blocked By indicators, and Dependency Conflict warnings.",
            "Select a Gantt item to open the underlying record."
          ]
        },
        {
          title:"Understanding the timeline",
          body:`
            <p>The Gantt is centered around the current schedule period and includes recent history so you can see what should already have happened and what is approaching.</p>
            <p>Hierarchy is shown separately for Project Plan and Site Operations so similarly numbered records from different schedule sources do not interfere with one another.</p>
          `
        },
        {
          title:"Gantt is not formal critical-path scheduling",
          body:`
            <p>Project Control uses predecessor relationships, blockers, explicit-date conflicts, and upstream milestone risk to provide schedule intelligence.</p>
            <p>These indicators are useful for management, but they should not be interpreted as a full CPM/critical-path scheduling engine unless that capability is added later.</p>
          `
        }
      ],
      editor:[
        {
          title:"Fix schedule problems at the source",
          body:`
            <p>Gantt visualizes Project Plan and Site Operations data. Update hierarchy, dates, Item Type, and predecessor relationships in the underlying record.</p>
            <p>When a Dependency Conflict appears, review the predecessor finish date and the dependent item's explicit Start Date before changing anything.</p>
          `
        }
      ],
      admin:[]
    },

    administration:{
      title:"Administration",
      summary:"Project, user, role, assignment, and access controls available to authorized management roles.",
      overview:`
        <p><strong>Administration</strong> contains project and user management functions available to your role.</p>
        <p>The exact controls shown depend on your administrative scope. Project Admin access is scoped; organization-wide Admin and protected System Owner capabilities remain separate.</p>
      `,
      viewer:[],
      editor:[],
      admin:[
        {
          title:"Before changing access",
          steps:[
            "Confirm the correct person.",
            "Confirm whether the person is an internal AHT user or an external user.",
            "Confirm the correct project or projects.",
            "Confirm the minimum role required.",
            "Check existing access before creating or requesting another assignment.",
            "Use Access & User Request when the required change is outside the controls available to you."
          ]
        },
        {
          title:"Project Admin scope",
          body:`
            <p>Project Admins manage supported projects and users within their assigned management scope. They do not receive unrestricted organization-wide or System Owner access.</p>
          `
        },
        {
          title:"Access & User Request",
          body:`
            <p>Use this workflow for a missing internal AHT employee, a new external user, project access changes, role changes, removal/disable requests, or another access issue that cannot be completed directly.</p>
          `
        },
        {
          title:"Protected controls",
          body:`
            <p>Some functions remain restricted even when a user has administrative access. System Owner protections are intentionally separate from normal Admin or Project Admin permissions.</p>
          `
        }
      ]
    }

  };

  const HELP_DEEP_DIVE = {

    projectPlan:{
      viewer:`
        <section class="help-deep-section">
          <div class="help-deep-kicker">Field Reference</div>
          <h4>Project Plan Fields</h4>

          <div class="help-field-list">

            <div class="help-field-row">
              <strong>Task / Subtask Name</strong>
              <span>The specific piece of work being managed. Use a name that another person can understand without needing additional explanation.</span>
            </div>

            <div class="help-field-row">
              <strong>Item Type</strong>
              <span><strong>Task</strong> represents work. <strong>Milestone</strong> represents an important date, approval, release, turnover point, or other significant schedule event.</span>
            </div>

            <div class="help-field-row">
              <strong>Higher-Level Task</strong>
              <span>Controls hierarchy. Selecting a Higher-Level Task makes the current item a Subtask beneath that Task.</span>
            </div>

            <div class="help-field-row">
              <strong>Owner</strong>
              <span>The person primarily responsible for moving the work forward. Ownership should answer “who is responsible?” without having to read notes.</span>
            </div>

            <div class="help-field-row">
              <strong>Start Date</strong>
              <span>The explicit planned date that work is expected to begin. This date is used when evaluating certain dependency conflicts.</span>
            </div>

            <div class="help-field-row">
              <strong>Target Date</strong>
              <span>The planned completion date. For a predecessor, this is the date downstream work is compared against when Project Control evaluates schedule conflicts.</span>
            </div>

            <div class="help-field-row">
              <strong>Status</strong>
              <span>The current condition of the work. Status should reflect reality, not what the schedule was originally supposed to be.</span>
            </div>

            <div class="help-field-row">
              <strong>Predecessor(s)</strong>
              <span>Identifies work that must occur first. Predecessors create schedule relationships; they do not create hierarchy.</span>
            </div>

            <div class="help-field-row">
              <strong>Next Step</strong>
              <span>The next meaningful action required to move the item forward. This should be specific enough that someone reviewing the project understands what happens next.</span>
            </div>

            <div class="help-field-row">
              <strong>Waiting On</strong>
              <span>Identifies the person, trade, approval, decision, information, or outside action currently preventing progress.</span>
            </div>

          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Core Concept</div>
          <h4>Hierarchy and Dependency Are Not the Same Thing</h4>

          <div class="help-concept-grid">
            <div class="help-concept-card">
              <strong>Higher-Level Task</strong>
              <p>Answers:</p>
              <blockquote>What larger piece of work does this belong under?</blockquote>
              <p>This controls how Tasks and Subtasks are grouped and displayed.</p>
            </div>

            <div class="help-concept-card">
              <strong>Predecessor</strong>
              <p>Answers:</p>
              <blockquote>What must happen before this work can proceed?</blockquote>
              <p>This controls schedule sequence and dependency intelligence.</p>
            </div>
          </div>

          <div class="help-callout">
            A Subtask does <strong>not</strong> automatically depend on its Higher-Level Task, and a predecessor does <strong>not</strong> automatically make something a Subtask.
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Schedule Intelligence</div>
          <h4>How Project Control Interprets Dependencies</h4>

          <div class="help-status-explain">
            <div>
              <strong>Blocked By</strong>
              <p>At least one predecessor is incomplete.</p>
            </div>

            <div>
              <strong>Dependency Conflict</strong>
              <p>The dependent item has an explicit Start Date that occurs before an incomplete predecessor is scheduled to finish.</p>
            </div>

            <div>
              <strong>Milestone at Risk</strong>
              <p>A schedule conflict exists somewhere upstream in the predecessor chain leading to that Milestone.</p>
            </div>
          </div>

          <div class="help-note">
            <strong>Important:</strong> predecessor finish date equal to dependent Start Date is permitted. A conflict occurs only when the predecessor is scheduled to finish <em>after</em> the dependent item's explicit Start Date.
          </div>

          <div class="help-note">
            Project Control does not treat an inferred Gantt start as an explicit dependency conflict. The dependent item must have an actual Start Date entered.
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Where It Goes</div>
          <h4>How Project Plan Data Affects the Rest of the Dashboard</h4>

          <div class="help-flow-list">
            <div>
              <strong>Executive Summary</strong>
              <span>Uses project work, blockers, schedule conflicts, milestone risk, and upcoming work to identify items needing management attention.</span>
            </div>
            <div>
              <strong>Calendar & Agenda</strong>
              <span>Uses Project Plan dates to place Tasks, Subtasks, and Milestones on the schedule.</span>
            </div>
            <div>
              <strong>Gantt</strong>
              <span>Uses hierarchy and schedule dates to build the timeline and displays dependency problems alongside the affected work.</span>
            </div>
            <div>
              <strong>Project Risks</strong>
              <span>Can surface dependency conflicts and downstream Milestones that are placed at risk by upstream schedule problems.</span>
            </div>
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Troubleshooting</div>
          <h4>If Something Looks Wrong</h4>

          <ol class="help-howto-steps">
            <li>Open the affected Task or Subtask.</li>
            <li>Confirm whether it is assigned to the correct Higher-Level Task.</li>
            <li>Confirm the Start Date and Target Date.</li>
            <li>Review every selected predecessor.</li>
            <li>Check whether each predecessor is actually complete.</li>
            <li>Compare the predecessor Target Date with the dependent item's explicit Start Date.</li>
            <li>If the item is a Milestone, trace upstream predecessors for schedule conflicts.</li>
            <li>Correct the underlying record rather than trying to fix only Calendar, Gantt, or Executive Summary.</li>
          </ol>
        </section>
      `,

      editor:`
        <section class="help-deep-section help-editor-deep">
          <div class="help-deep-kicker">Editor Guide</div>
          <h4>Project Plan Quality Checklist</h4>

          <div class="help-checklist">
            <div>✓ Task name clearly describes the work.</div>
            <div>✓ Owner identifies one accountable person.</div>
            <div>✓ Start Date is meaningful when sequencing matters.</div>
            <div>✓ Target Date reflects the real planned completion.</div>
            <div>✓ Higher-Level Task is used only for hierarchy.</div>
            <div>✓ Predecessors represent actual required sequence.</div>
            <div>✓ Status matches the current condition.</div>
            <div>✓ Waiting On identifies the actual blocker.</div>
            <div>✓ Next Step explains what should happen next.</div>
            <div>✓ Milestones represent meaningful project dates or release points.</div>
          </div>
        </section>

        <section class="help-deep-section help-editor-deep">
          <div class="help-deep-kicker">Best Practice</div>
          <h4>Build the Schedule From the Outcome Backward</h4>

          <p>If a major milestone is due on a certain date, identify the work that must occur immediately before it, then the work required before that, and continue backward until the sequence is clear.</p>

          <p>This is usually more useful than creating one large Task with a distant Target Date and no intermediate Subtask dates.</p>

          <div class="help-example">
            <strong>Example</strong>
            <div>Final Client Approval — Milestone</div>
            <div class="help-example-arrow">↑</div>
            <div>Submit Final Package — Task</div>
            <div class="help-example-arrow">↑</div>
            <div>Complete Engineering Review — Task</div>
            <div class="help-example-arrow">↑</div>
            <div>Receive Required Design Information — Task</div>
          </div>
        </section>

        <section class="help-deep-section help-editor-deep">
          <div class="help-deep-kicker">Avoid</div>
          <h4>Common Project Plan Mistakes</h4>

          <div class="help-warning-list">
            <div><strong>Using hierarchy as dependency.</strong> A Subtask relationship does not mean the higher-level Task must finish first.</div>
            <div><strong>Using dependency as hierarchy.</strong> A predecessor relationship does not mean the work belongs underneath that predecessor.</div>
            <div><strong>One giant Task.</strong> Important work should have meaningful Subtasks and earlier dates when management needs visibility into the path to completion.</div>
            <div><strong>Artificial dates.</strong> Do not move dates simply to make a Dependency Conflict disappear. Correct the actual plan.</div>
            <div><strong>Vague Waiting On.</strong> Identify the actual person, trade, approval, document, or decision causing the delay.</div>
            <div><strong>Vague Next Step.</strong> “Follow up” is less useful than stating exactly who is contacting whom and what is needed.</div>
          </div>
        </section>
      `
    },

    siteOperations:{
      viewer:`
        <section class="help-deep-section">
          <div class="help-deep-kicker">Field Reference</div>
          <h4>Site Operations Fields</h4>

          <div class="help-field-list">

            <div class="help-field-row">
              <strong>Task / Subtask</strong>
              <span>The field work being executed in a room, location, system, or site area.</span>
            </div>

            <div class="help-field-row">
              <strong>Location / Work Area</strong>
              <span>Identifies where the work is happening. Site Operations should make it easy to understand physical execution by area.</span>
            </div>

            <div class="help-field-row">
              <strong>Item Type</strong>
              <span>Task represents duration-based field work. Milestone represents a significant site date, inspection, turnover, completion point, or release event.</span>
            </div>

            <div class="help-field-row">
              <strong>Higher-Level Task</strong>
              <span>Creates Task/Subtask hierarchy inside Site Operations.</span>
            </div>

            <div class="help-field-row">
              <strong>Owner</strong>
              <span>The person accountable for moving the field work forward.</span>
            </div>

            <div class="help-field-row">
              <strong>Activity / Start Date</strong>
              <span>The explicit planned start of the field activity.</span>
            </div>

            <div class="help-field-row">
              <strong>Target Date</strong>
              <span>The planned completion date for the activity.</span>
            </div>

            <div class="help-field-row">
              <strong>Predecessor(s)</strong>
              <span>Field activities that must occur before the current activity can proceed.</span>
            </div>

            <div class="help-field-row">
              <strong>Status</strong>
              <span>The current field condition of the activity.</span>
            </div>

            <div class="help-field-row">
              <strong>Waiting On</strong>
              <span>The person, trade, material, access, decision, approval, or prerequisite preventing field progress.</span>
            </div>

          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Purpose</div>
          <h4>Project Plan vs Site Operations</h4>

          <div class="help-concept-grid">
            <div class="help-concept-card">
              <strong>Project Plan</strong>
              <p>Tracks the broader management schedule: engineering, approvals, procurement, coordination, major deliverables, and other project-level work.</p>
            </div>

            <div class="help-concept-card">
              <strong>Site Operations</strong>
              <p>Tracks actual field execution: what needs to happen, where it happens, who owns it, when it should happen, and what is preventing it.</p>
            </div>
          </div>

          <div class="help-callout">
            Do not duplicate every Project Plan Task in Site Operations. Use Site Operations when the field team needs location-specific execution detail.
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Schedule Intelligence</div>
          <h4>Field Dependencies Work the Same Way</h4>

          <div class="help-status-explain">
            <div>
              <strong>Blocked By</strong>
              <p>An incomplete predecessor exists.</p>
            </div>

            <div>
              <strong>Dependency Conflict</strong>
              <p>The activity is explicitly scheduled to begin before an incomplete predecessor is scheduled to finish.</p>
            </div>

            <div>
              <strong>Milestone at Risk</strong>
              <p>An upstream schedule conflict threatens a Site Operations Milestone.</p>
            </div>
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Where It Goes</div>
          <h4>How Site Operations Affects Other Views</h4>

          <div class="help-flow-list">
            <div>
              <strong>Executive Summary</strong>
              <span>Site dependency conflicts and Milestones at Risk can surface as Project Risks.</span>
            </div>
            <div>
              <strong>Calendar & Agenda</strong>
              <span>Site Tasks, Subtasks, Milestones, hierarchy, and schedule conflicts appear when Site or Combined mode is selected.</span>
            </div>
            <div>
              <strong>Gantt</strong>
              <span>Displays Site Operations hierarchy, dates, Milestones, blockers, and conflicts on the timeline.</span>
            </div>
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Troubleshooting</div>
          <h4>If Field Work Appears Out of Sequence</h4>

          <ol class="help-howto-steps">
            <li>Open the affected Site Operations item.</li>
            <li>Confirm it is assigned to the correct location or work area.</li>
            <li>Check Higher-Level Task if it should be a Subtask.</li>
            <li>Review Activity/Start Date and Target Date.</li>
            <li>Review selected predecessors.</li>
            <li>Confirm whether the predecessor is actually incomplete.</li>
            <li>Compare predecessor Target Date against the dependent Activity/Start Date.</li>
            <li>Correct the Site Operations record and then review Calendar or Gantt again.</li>
          </ol>
        </section>
      `,

      editor:`
        <section class="help-deep-section help-editor-deep">
          <div class="help-deep-kicker">Editor Guide</div>
          <h4>Site Operations Quality Checklist</h4>

          <div class="help-checklist">
            <div>✓ Work is assigned to the correct room/location.</div>
            <div>✓ Task name clearly identifies the field activity.</div>
            <div>✓ Owner identifies the accountable person.</div>
            <div>✓ Activity/Start Date reflects the intended field start.</div>
            <div>✓ Target Date reflects the intended field completion.</div>
            <div>✓ Higher-Level Task is used for hierarchy.</div>
            <div>✓ Predecessors represent actual field sequence.</div>
            <div>✓ Waiting On identifies the true blocker.</div>
            <div>✓ Milestones represent meaningful field events.</div>
            <div>✓ Status reflects what is actually happening on site.</div>
          </div>
        </section>

        <section class="help-deep-section help-editor-deep">
          <div class="help-deep-kicker">Example</div>
          <h4>Use Dependencies to Show Real Field Sequence</h4>

          <div class="help-example">
            <div>Final Device Installation</div>
            <div class="help-example-arrow">↑</div>
            <div>Millwork Complete</div>
            <div class="help-example-arrow">↑</div>
            <div>Wall Finish Complete</div>
            <div class="help-example-arrow">↑</div>
            <div>Rough-In / Backbox Complete</div>
          </div>

          <p>When those relationships are entered as predecessors, Project Control can identify when downstream field work is blocked or scheduled too early.</p>
        </section>

        <section class="help-deep-section help-editor-deep">
          <div class="help-deep-kicker">Avoid</div>
          <h4>Common Site Operations Mistakes</h4>

          <div class="help-warning-list">
            <div><strong>Duplicating the entire Project Plan.</strong> Site Operations should provide field execution detail, not a second copy of management scheduling.</div>
            <div><strong>No location context.</strong> Field work should be easy to associate with a physical room or work area whenever applicable.</div>
            <div><strong>Missing predecessors.</strong> If one trade or activity must finish before another can begin, capture that relationship.</div>
            <div><strong>Using only the final due date.</strong> Break work into meaningful Subtasks when intermediate field dates matter.</div>
            <div><strong>Leaving blockers buried in notes.</strong> Use Waiting On and schedule relationships so blockers can surface elsewhere in Project Control.</div>
          </div>
        </section>
      `
    },

    executiveSummary:{
      viewer:`
        <section class="help-deep-section">
          <div class="help-deep-kicker">Purpose</div>
          <h4>What the Executive Summary Is Designed to Tell You</h4>

          <p>The Executive Summary is the management view of the project. It is intended to answer:</p>

          <div class="help-checklist">
            <div>What is currently active?</div>
            <div>What is waiting?</div>
            <div>What is overdue?</div>
            <div>What is blocked?</div>
            <div>What is at schedule risk?</div>
            <div>What needs attention next?</div>
          </div>

          <div class="help-callout">
            The Executive Summary does not replace the underlying records. It points you toward the Project Plan, Site Operations, Deliverable, or Information Required item that needs review.
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Reading the Page</div>
          <h4>How to Review the Executive Summary</h4>

          <ol class="help-howto-steps">
            <li>Confirm you are viewing the correct project.</li>
            <li>Review overall project health and phase progress.</li>
            <li>Review Active, Waiting, Complete, or other current-work indicators.</li>
            <li>Review Project Risks for dependency problems and milestone risk.</li>
            <li>Review upcoming work and dates that are approaching.</li>
            <li>Look for Waiting On information to understand who or what is holding work up.</li>
            <li>Open the underlying record when additional detail is needed.</li>
          </ol>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Project Health</div>
          <h4>Automatic vs Manual Health</h4>

          <p>Project health may be calculated from underlying project conditions or intentionally overridden where authorized.</p>

          <div class="help-concept-grid">
            <div class="help-concept-card">
              <strong>Automatic</strong>
              <p>Health reflects the underlying project information and risk conditions being evaluated by Project Control.</p>
            </div>

            <div class="help-concept-card">
              <strong>Manual Override</strong>
              <p>An authorized user has intentionally set project health and should provide a reason for that override.</p>
            </div>
          </div>

          <div class="help-note">
            A manual health override does not remove the underlying blockers, schedule conflicts, or risks. Those records still need to be managed.
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Risk Intelligence</div>
          <h4>Understanding Project Risks</h4>

          <div class="help-status-explain">
            <div>
              <strong>Blocked By</strong>
              <p>An incomplete predecessor exists and downstream work is still dependent on it.</p>
            </div>

            <div>
              <strong>Dependency Conflict</strong>
              <p>Explicit schedule dates make the planned sequence impossible.</p>
            </div>

            <div>
              <strong>Milestone at Risk</strong>
              <p>An upstream dependency conflict exists somewhere in the chain leading to the Milestone.</p>
            </div>
          </div>

          <div class="help-callout">
            A risk shown here may originate in either Project Plan or Site Operations. Check the source label before opening or correcting the record.
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Troubleshooting</div>
          <h4>If Something on the Executive Summary Looks Wrong</h4>

          <ol class="help-howto-steps">
            <li>Open the underlying item from the Executive Summary when possible.</li>
            <li>Confirm its Owner, Status, dates, Waiting On, and Next Step.</li>
            <li>If it is schedule-related, inspect Higher-Level Task and Predecessor relationships.</li>
            <li>If it is a Milestone risk, trace the upstream schedule chain.</li>
            <li>Correct the source record.</li>
            <li>Return to the Executive Summary and verify the condition now reflects the updated data.</li>
          </ol>
        </section>
      `,

      editor:`
        <section class="help-deep-section help-editor-deep">
          <div class="help-deep-kicker">Editor Guide</div>
          <h4>Keeping the Executive Summary Useful</h4>

          <div class="help-checklist">
            <div>✓ Owners are current.</div>
            <div>✓ Status reflects actual conditions.</div>
            <div>✓ Dates are realistic.</div>
            <div>✓ Waiting On identifies real blockers.</div>
            <div>✓ Next Step is specific.</div>
            <div>✓ Dependencies represent actual sequence.</div>
            <div>✓ Milestones represent meaningful events.</div>
            <div>✓ Completed work is actually marked complete.</div>
          </div>
        </section>

        <section class="help-deep-section help-editor-deep">
          <div class="help-deep-kicker">Avoid</div>
          <h4>Do Not Manage the Summary Instead of the Project</h4>

          <p>If a warning or risk appears, correct the underlying project information rather than changing data simply to remove the warning.</p>

          <div class="help-warning-list">
            <div><strong>Do not hide a blocker.</strong> Resolve it or accurately document what is still required.</div>
            <div><strong>Do not move dates only to make the dashboard green.</strong> Dates should represent the real plan.</div>
            <div><strong>Do not leave completed work active.</strong> Stale status information reduces the value of the entire summary.</div>
          </div>
        </section>
      `
    },

    deliverables:{
      viewer:`
        <section class="help-deep-section">
          <div class="help-deep-kicker">Field Reference</div>
          <h4>Deliverable Information</h4>

          <div class="help-field-list">
            <div class="help-field-row">
              <strong>Deliverable</strong>
              <span>The project outcome being tracked. It should describe a meaningful result rather than a small individual action.</span>
            </div>

            <div class="help-field-row">
              <strong>Owner</strong>
              <span>The person accountable for getting the Deliverable to completion.</span>
            </div>

            <div class="help-field-row">
              <strong>Status</strong>
              <span>The current condition of the Deliverable, such as active, waiting, under review, or complete.</span>
            </div>

            <div class="help-field-row">
              <strong>Target Date</strong>
              <span>The planned completion date for the Deliverable.</span>
            </div>

            <div class="help-field-row">
              <strong>Next Step</strong>
              <span>The immediate action required to move the Deliverable forward.</span>
            </div>

            <div class="help-field-row">
              <strong>Waiting On</strong>
              <span>The person, organization, approval, decision, material, or information preventing progress.</span>
            </div>
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Purpose</div>
          <h4>Deliverable vs Task</h4>

          <div class="help-concept-grid">
            <div class="help-concept-card">
              <strong>Deliverable</strong>
              <p>Tracks an important project outcome management needs visibility into.</p>
            </div>

            <div class="help-concept-card">
              <strong>Task / Subtask</strong>
              <p>Tracks the work required to accomplish an outcome.</p>
            </div>
          </div>

          <div class="help-callout">
            If an item needs multiple steps, sequencing, predecessors, or detailed schedule management, those steps usually belong in Project Plan or Site Operations.
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Review</div>
          <h4>How to Evaluate a Deliverable</h4>

          <ol class="help-howto-steps">
            <li>Confirm the outcome is clearly defined.</li>
            <li>Confirm there is a clear Owner.</li>
            <li>Review Status.</li>
            <li>Review the Target Date.</li>
            <li>Read the Next Step.</li>
            <li>Check Waiting On for outside dependencies.</li>
            <li>Open related project work if detailed schedule information is required.</li>
          </ol>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Troubleshooting</div>
          <h4>Signs a Deliverable Needs Attention</h4>

          <div class="help-warning-list">
            <div><strong>No Owner.</strong> Accountability is unclear.</div>
            <div><strong>No useful Next Step.</strong> The path forward is unclear.</div>
            <div><strong>Past Target Date.</strong> Completion timing may need review.</div>
            <div><strong>Waiting with no explanation.</strong> Management cannot tell what is holding the outcome up.</div>
            <div><strong>Too much execution detail.</strong> Individual work steps may belong in Project Plan or Site Operations instead.</div>
          </div>
        </section>
      `,

      editor:`
        <section class="help-deep-section help-editor-deep">
          <div class="help-deep-kicker">Editor Guide</div>
          <h4>Writing a Strong Deliverable</h4>

          <div class="help-checklist">
            <div>✓ Outcome is specific.</div>
            <div>✓ Owner is accountable.</div>
            <div>✓ Status is current.</div>
            <div>✓ Target Date is meaningful.</div>
            <div>✓ Next Step is actionable.</div>
            <div>✓ Waiting On names the blocker.</div>
          </div>

          <div class="help-example">
            <strong>Weak</strong>
            <div>Lighting drawings</div>
            <br>
            <strong>Better</strong>
            <div>Final coordinated lighting drawings approved for construction</div>
          </div>
        </section>

        <section class="help-deep-section help-editor-deep">
          <div class="help-deep-kicker">Best Practice</div>
          <h4>Make the Next Step Actionable</h4>

          <p>Someone reading the record should be able to understand what needs to happen next without asking the Owner for clarification.</p>

          <div class="help-example">
            <strong>Weak</strong>
            <div>Follow up</div>
            <br>
            <strong>Better</strong>
            <div>PM to obtain revised lighting reflected ceiling plan from design team by Friday</div>
          </div>
        </section>
      `
    },

    informationRequired:{
      viewer:`
        <section class="help-deep-section">
          <div class="help-deep-kicker">Purpose</div>
          <h4>What Information Required Is For</h4>

          <p>Information Required makes unanswered project needs visible and accountable.</p>

          <p>Use it to track information that must come from another person or organization before work, coordination, procurement, engineering, approval, or installation can continue efficiently.</p>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Field Reference</div>
          <h4>Information Required Fields</h4>

          <div class="help-field-list">
            <div class="help-field-row">
              <strong>Information Needed</strong>
              <span>The exact question, decision, document, dimension, selection, approval, or other input required.</span>
            </div>

            <div class="help-field-row">
              <strong>Requested From</strong>
              <span>The person, consultant, trade, client representative, or organization expected to provide the answer.</span>
            </div>

            <div class="help-field-row">
              <strong>Owner</strong>
              <span>The person responsible for tracking the request and making sure it is resolved.</span>
            </div>

            <div class="help-field-row">
              <strong>Needed By</strong>
              <span>The date the information is required to avoid impacting work.</span>
            </div>

            <div class="help-field-row">
              <strong>Status</strong>
              <span>Whether the information request is still open, answered, resolved, or otherwise complete.</span>
            </div>

            <div class="help-field-row">
              <strong>Impact / Blocked Work</strong>
              <span>Explains what cannot proceed, may be delayed, or may be affected while the information remains outstanding.</span>
            </div>
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Examples</div>
          <h4>Good Uses of Information Required</h4>

          <div class="help-flow-list">
            <div>
              <strong>Design</strong>
              <span>Final device location, finish selection, reflected ceiling plan, cabinet detail, or architectural dimension.</span>
            </div>

            <div>
              <strong>Engineering</strong>
              <span>Electrical load, circuit information, network requirement, HVAC condition, structural approval, or equipment clearance.</span>
            </div>

            <div>
              <strong>Client Decision</strong>
              <span>Equipment selection, feature approval, scope confirmation, or budget decision.</span>
            </div>

            <div>
              <strong>Trade Coordination</strong>
              <span>Information required from electrical, millwork, lighting, security, mechanical, or another contractor before AHT work can continue.</span>
            </div>
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Review</div>
          <h4>How to Read an Information Required Item</h4>

          <ol class="help-howto-steps">
            <li>Read exactly what information is being requested.</li>
            <li>Identify who is expected to provide it.</li>
            <li>Identify who owns the follow-up.</li>
            <li>Review the Needed By date.</li>
            <li>Understand what work or decision is being affected.</li>
            <li>Check Status to determine whether the request is still open.</li>
          </ol>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Troubleshooting</div>
          <h4>Weak Information Requests</h4>

          <div class="help-warning-list">
            <div><strong>“Need answer from electrician.”</strong> This does not explain what information is needed.</div>
            <div><strong>No Requested From.</strong> Nobody knows who is expected to respond.</div>
            <div><strong>No Needed By date.</strong> The urgency and schedule impact are unclear.</div>
            <div><strong>No impact described.</strong> Management cannot tell why the missing information matters.</div>
          </div>
        </section>
      `,

      editor:`
        <section class="help-deep-section help-editor-deep">
          <div class="help-deep-kicker">Editor Guide</div>
          <h4>Create an Effective Information Required Item</h4>

          <ol class="help-howto-steps">
            <li>Write the exact information needed.</li>
            <li>Select or identify who must provide it.</li>
            <li>Assign an Owner responsible for follow-up.</li>
            <li>Enter the date the information is needed.</li>
            <li>Explain what work or decision is blocked or at risk.</li>
            <li>Keep Status current while the request is outstanding.</li>
            <li>Mark it resolved only after the answer has actually been received and acted upon.</li>
          </ol>
        </section>

        <section class="help-deep-section help-editor-deep">
          <div class="help-deep-kicker">Example</div>
          <h4>Be Specific</h4>

          <div class="help-example">
            <strong>Weak</strong>
            <div>Need power info from CES</div>
            <br>
            <strong>Better</strong>
            <div>Confirm available circuit, voltage, and breaker size for AV rack ER-2 before final equipment power design</div>
          </div>
        </section>
      `
    },

    calendar:{
      viewer:`
        <section class="help-deep-section">
          <div class="help-deep-kicker">Purpose</div>
          <h4>Calendar vs Agenda</h4>

          <div class="help-concept-grid">
            <div class="help-concept-card">
              <strong>Calendar</strong>
              <p>Best for seeing when scheduled work lands across days, weeks, or a month.</p>
            </div>

            <div class="help-concept-card">
              <strong>Agenda</strong>
              <p>Best for reading upcoming schedule items as a structured list with hierarchy and details.</p>
            </div>
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Schedule Modes</div>
          <h4>Project, Site, and Combined</h4>

          <div class="help-status-explain">
            <div>
              <strong>Project</strong>
              <p>Shows Project Plan schedule information.</p>
            </div>

            <div>
              <strong>Site</strong>
              <p>Shows Site Operations schedule information.</p>
            </div>

            <div>
              <strong>Combined</strong>
              <p>Shows both schedule sources together.</p>
            </div>
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Indicators</div>
          <h4>What You May See</h4>

          <div class="help-field-list">
            <div class="help-field-row">
              <strong>Task</strong>
              <span>Normal scheduled work.</span>
            </div>

            <div class="help-field-row">
              <strong>Subtask</strong>
              <span>Work grouped beneath a Higher-Level Task.</span>
            </div>

            <div class="help-field-row">
              <strong>◆ Milestone</strong>
              <span>An important scheduled event, approval, release point, or completion date.</span>
            </div>

            <div class="help-field-row">
              <strong>Conflict Indicator</strong>
              <span>Signals a dependency/date problem that should be reviewed in the underlying Project Plan or Site Operations record.</span>
            </div>
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Navigation</div>
          <h4>Using the Agenda Efficiently</h4>

          <ol class="help-howto-steps">
            <li>Choose the desired schedule mode.</li>
            <li>Review upcoming items in date order.</li>
            <li>Expand a Higher-Level Task when you need to see its Subtasks.</li>
            <li>Look for Milestones and conflict indicators.</li>
            <li>Select the Agenda item to open its underlying record.</li>
          </ol>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Troubleshooting</div>
          <h4>If Something Is on the Wrong Date</h4>

          <div class="help-callout">
            Calendar does not maintain a separate copy of schedule dates.
          </div>

          <ol class="help-howto-steps">
            <li>Open the underlying Project Plan or Site Operations item.</li>
            <li>Review its Start/Activity Date and Target Date.</li>
            <li>Correct the underlying schedule record if necessary.</li>
            <li>Return to Calendar and confirm the result.</li>
          </ol>
        </section>
      `,

      editor:`
        <section class="help-deep-section help-editor-deep">
          <div class="help-deep-kicker">Editor Guide</div>
          <h4>Calendar Is a Result, Not the Source</h4>

          <p>Do not manage the schedule by trying to make Calendar look right. Maintain Project Plan and Site Operations correctly, and Calendar will reflect those records.</p>

          <div class="help-warning-list">
            <div><strong>Wrong date?</strong> Fix the source Task/Subtask.</div>
            <div><strong>Wrong hierarchy?</strong> Fix Higher-Level Task.</div>
            <div><strong>Wrong conflict?</strong> Review predecessor dates and completion status.</div>
            <div><strong>Wrong Milestone?</strong> Review Item Type and schedule date.</div>
          </div>
        </section>
      `
    },

    gantt:{
      viewer:`
        <section class="help-deep-section">
          <div class="help-deep-kicker">Purpose</div>
          <h4>What Gantt Is Best For</h4>

          <div class="help-checklist">
            <div>See work across time.</div>
            <div>Understand Task/Subtask hierarchy.</div>
            <div>See overlapping work.</div>
            <div>See sequencing.</div>
            <div>Identify schedule conflicts.</div>
            <div>See major Milestones.</div>
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Reading the Timeline</div>
          <h4>How to Read a Gantt Row</h4>

          <ol class="help-howto-steps">
            <li>Find the Task or Subtask in the left column.</li>
            <li>Expand the row if it contains Subtasks.</li>
            <li>Follow the row across to its schedule bar or Milestone.</li>
            <li>Compare the position of related work across the timeline.</li>
            <li>Review Blocked By and Dependency Conflict information shown with the row.</li>
            <li>Select the item when you need to open its underlying record.</li>
          </ol>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Hierarchy</div>
          <h4>Tasks and Subtasks in Gantt</h4>

          <p>Gantt preserves the Task/Subtask hierarchy from the source schedule.</p>

          <div class="help-note">
            Project Plan and Site Operations maintain separate hierarchy identities so similarly numbered records from the two schedule sources do not interfere with one another in Combined mode.
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Schedule Intelligence</div>
          <h4>What the Warnings Mean</h4>

          <div class="help-status-explain">
            <div>
              <strong>Blocked By</strong>
              <p>The item has an incomplete predecessor.</p>
            </div>

            <div>
              <strong>Dependency Conflict</strong>
              <p>An explicit dependent Start Date occurs before an incomplete predecessor is scheduled to finish.</p>
            </div>

            <div>
              <strong>Milestone at Risk</strong>
              <p>An upstream schedule conflict exists in the chain leading to the Milestone.</p>
            </div>
          </div>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Important Limitation</div>
          <h4>This Is Not Yet a Full CPM Engine</h4>

          <p>Project Control uses explicit predecessor relationships, blockers, schedule conflicts, and upstream milestone risk to provide useful schedule intelligence.</p>

          <p>It should not currently be interpreted as a formal Critical Path Method scheduling engine with calculated float, automatic CPM network analysis, or a mathematically derived critical path.</p>
        </section>

        <section class="help-deep-section">
          <div class="help-deep-kicker">Troubleshooting</div>
          <h4>If a Gantt Row Looks Wrong</h4>

          <ol class="help-howto-steps">
            <li>Open the underlying Task or Subtask.</li>
            <li>Confirm its Higher-Level Task.</li>
            <li>Confirm Start/Activity Date and Target Date.</li>
            <li>Review Item Type if it should be a Milestone.</li>
            <li>Review Predecessor relationships.</li>
            <li>Check predecessor completion status.</li>
            <li>Correct the source record and return to Gantt.</li>
          </ol>
        </section>
      `,

      editor:`
        <section class="help-deep-section help-editor-deep">
          <div class="help-deep-kicker">Editor Guide</div>
          <h4>Use Gantt to Validate the Schedule</h4>

          <p>Gantt is particularly useful after schedule data has been entered because visual problems are often easier to spot on a timeline.</p>

          <div class="help-checklist">
            <div>✓ Subtasks appear under the correct Task.</div>
            <div>✓ Work occurs in a logical sequence.</div>
            <div>✓ Target Dates make sense.</div>
            <div>✓ Milestones appear at meaningful points.</div>
            <div>✓ Dependencies reflect real prerequisites.</div>
            <div>✓ Conflict warnings are investigated.</div>
          </div>
        </section>

        <section class="help-deep-section help-editor-deep">
          <div class="help-deep-kicker">Best Practice</div>
          <h4>Do Not Fix the Picture — Fix the Schedule</h4>

          <p>If Gantt exposes a bad relationship, incorrect duration, misplaced Subtask, or schedule conflict, correct the underlying Project Plan or Site Operations record.</p>
        </section>
      `
    }


  };

  const HOW_TO_GUIDES = [

    {
      id:"read-project-status",
      min:1,
      title:"Review Project Status",
      summary:"Quickly determine what is active, waiting, overdue, blocked, or at schedule risk.",
      area:"Executive Summary",

      whenToUse:`
        <p>Use this workflow when you need a quick management-level understanding of the project's current condition.</p>
        <p>The Executive Summary is designed to identify where attention is needed without requiring you to open every individual project record.</p>
      `,

      before:[
        "Confirm you are viewing the correct project.",
        "Know whether you are looking for overall status, a schedule issue, a blocker, or an upcoming deadline.",
        "Remember that the Executive Summary reflects information stored elsewhere in Project Control."
      ],

      steps:[
        "Open Executive Summary.",
        "Confirm the project name at the top of the dashboard.",
        "Review overall project health.",
        "Review phase progress.",
        "Review Active, Waiting, Complete, and other current-work indicators.",
        "Review Project Risks.",
        "Look specifically for Dependency Conflict or Milestone At Risk indicators.",
        "Review upcoming or time-sensitive work.",
        "Review Waiting On information where available.",
        "Select any supported risk, work item, or schedule item that requires deeper review."
      ],

      fieldNotes:[
        {
          name:"Project Health",
          text:"Provides a management-level condition for the project. Health may be driven automatically or intentionally overridden by an authorized user."
        },
        {
          name:"Waiting",
          text:"Highlights work that depends on another person, trade, approval, decision, information item, or outside action."
        },
        {
          name:"Dependency Conflict",
          text:"Indicates explicit schedule dates make a predecessor/dependent sequence impossible."
        },
        {
          name:"Milestone At Risk",
          text:"Indicates an upstream schedule conflict exists in the predecessor chain leading to a Milestone."
        },
        {
          name:"Source",
          text:"Risks may originate from Project Plan or Site Operations. Check the source before correcting the underlying record."
        }
      ],

      expected:`
        <p>After reviewing the Executive Summary, you should be able to identify the few project items that deserve additional attention instead of searching every page manually.</p>
      `,

      verify:[
        "You can identify current project health.",
        "You know which work is waiting or overdue.",
        "You know whether schedule conflicts exist.",
        "You know whether any Milestones are at risk.",
        "You know which underlying records require follow-up."
      ],

      mistakes:[
        "Treating the Executive Summary as a separate source of project data.",
        "Looking only at overall health and ignoring the individual risks beneath it.",
        "Assuming every warning comes from Project Plan; Site Operations can also create risks.",
        "Trying to improve the summary without correcting the underlying source records."
      ],

      troubleshooting:[
        {
          q:"The Executive Summary looks wrong.",
          a:"Open the underlying item and verify Owner, Status, dates, Waiting On, Next Step, hierarchy, and predecessor relationships."
        },
        {
          q:"A risk is shown but I cannot tell where it came from.",
          a:"Check the source label and open the underlying Project Plan or Site Operations item."
        },
        {
          q:"Project health still looks poor after I fixed one item.",
          a:"Review the remaining risks and waiting/overdue conditions. More than one underlying issue may be contributing."
        }
      ],

      related:[
        "find-blocker",
        "use-gantt",
        "use-calendar"
      ]
    },

    {
      id:"find-blocker",
      min:1,
      title:"Find What Is Blocking Work",
      summary:"Determine who or what is preventing a Task, Subtask, Deliverable, or project outcome from moving forward.",
      area:"Executive Summary / Project Plan / Site Operations",

      whenToUse:`
        <p>Use this workflow whenever work appears stalled, waiting, blocked, overdue, or unable to start.</p>
        <p>The goal is to distinguish between a person or information blocker and a schedule predecessor blocker.</p>
      `,

      before:[
        "Identify the affected work item.",
        "Know whether the item comes from Project Plan, Site Operations, Deliverables, or Information Required.",
        "Do not assume Waiting On and Blocked By mean the same thing."
      ],

      steps:[
        "Open the affected item.",
        "Review Status.",
        "Review Waiting On.",
        "Review Next Step where available.",
        "Look for Blocked By.",
        "Review the selected Predecessor or Predecessors.",
        "Open each incomplete predecessor when necessary.",
        "Review Information Required for any missing answer or decision related to the work.",
        "Determine the actual blocker.",
        "Identify who owns the follow-up.",
        "Confirm there is a meaningful date attached to the blocker where timing matters."
      ],

      fieldNotes:[
        {
          name:"Waiting On",
          text:"Identifies the person, trade, approval, material, decision, information, or outside condition currently holding work up."
        },
        {
          name:"Blocked By",
          text:"Indicates at least one predecessor remains incomplete."
        },
        {
          name:"Information Required",
          text:"Use this area when a specific answer, document, selection, approval, or decision is missing."
        },
        {
          name:"Next Step",
          text:"Should describe the immediate action required to move the work forward."
        },
        {
          name:"Owner",
          text:"The person accountable for making sure the issue is followed through, even when the answer must come from someone else."
        }
      ],

      expected:`
        <p>You should be able to answer three questions clearly:</p>
        <p><strong>What is stopping the work? Who needs to act? When is the answer or prerequisite needed?</strong></p>
      `,

      verify:[
        "The blocker is clearly identified.",
        "The responsible Owner is known.",
        "Waiting On identifies the correct outside person or condition where applicable.",
        "Any predecessor relationship is valid.",
        "Any Information Required item clearly states what is needed.",
        "The next action is documented."
      ],

      mistakes:[
        "Using Waiting On for vague notes such as 'someone needs to respond.'",
        "Assuming Blocked By is a date conflict. It means an incomplete predecessor exists.",
        "Leaving the blocker only in comments or email instead of a structured dashboard field.",
        "Not assigning an Owner to follow the issue.",
        "Leaving a blocker active after it has already been resolved."
      ],

      troubleshooting:[
        {
          q:"The item says Blocked By but nothing appears wrong with the dates.",
          a:"Blocked By is based on predecessor completion. Check whether the predecessor is still incomplete."
        },
        {
          q:"The item is waiting but has no predecessor.",
          a:"The blocker may be a person, approval, information request, material, or another outside condition rather than schedule sequence."
        },
        {
          q:"I know what is missing but it is not visible to management.",
          a:"Use Waiting On and, when appropriate, create or update an Information Required item so the missing input is visible."
        }
      ],

      related:[
        "read-project-status",
        "add-predecessor",
        "create-info-required",
        "fix-dependency-conflict"
      ]
    },

    {
      id:"use-calendar",
      min:1,
      title:"Use Calendar & Agenda",
      summary:"Review Project Plan and Site Operations work by date and quickly open the records behind scheduled activity.",
      area:"Calendar",

      whenToUse:`
        <p>Use <strong>Calendar</strong> when you want to understand when work is scheduled.</p>
        <p>Use the <strong>Agenda</strong> when you want the same schedule information in a more readable list with hierarchy and direct access to the underlying records.</p>
      `,

      before:[
        "Confirm the correct project is selected.",
        "Decide whether you want Project Plan, Site Operations, or Combined schedule information.",
        "Know the approximate date range you want to review."
      ],

      steps:[
        "Open Calendar.",
        "Choose Project, Site, or Combined mode.",
        "Navigate to the desired month or schedule period.",
        "Review Tasks, Subtasks, and Milestones on the Calendar.",
        "Look for conflict indicators.",
        "Use the Agenda to review upcoming work in list form.",
        "Expand Higher-Level Tasks to display Subtasks where available.",
        "Select an Agenda item or supported Calendar item to open the underlying record."
      ],

      fieldNotes:[
        {
          name:"Project mode",
          text:"Shows schedule information originating from Project Plan."
        },
        {
          name:"Site mode",
          text:"Shows schedule information originating from Site Operations."
        },
        {
          name:"Combined mode",
          text:"Shows both schedule sources together."
        },
        {
          name:"Milestone",
          text:"Uses Milestone treatment to distinguish an important event from normal duration-based work."
        },
        {
          name:"Conflict indicator",
          text:"Signals a schedule relationship that should be investigated in the underlying record."
        }
      ],

      expected:`
        <p>You should be able to see when important work is planned, identify upcoming Milestones, and move directly from the schedule into the underlying project record.</p>
      `,

      verify:[
        "The correct schedule mode is selected.",
        "Expected Tasks/Subtasks appear in the correct period.",
        "Milestones appear on the expected dates.",
        "Agenda hierarchy matches the underlying Task/Subtask structure.",
        "Selecting an item opens the correct source record."
      ],

      mistakes:[
        "Assuming Calendar maintains its own schedule dates.",
        "Trying to correct a date only in Calendar rather than the source record.",
        "Reviewing Project mode when the work actually comes from Site Operations.",
        "Ignoring the Agenda when the Calendar becomes visually crowded."
      ],

      troubleshooting:[
        {
          q:"An item is on the wrong date.",
          a:"Open the underlying Project Plan or Site Operations item and review its Start/Activity Date and Target Date."
        },
        {
          q:"A Subtask is not showing beneath the expected Task.",
          a:"Review Higher-Level Task on the source record."
        },
        {
          q:"I cannot find a Site Operations item.",
          a:"Confirm Calendar is set to Site or Combined mode."
        },
        {
          q:"A conflict indicator appears.",
          a:"Open the source record and review predecessor relationships and explicit dates."
        }
      ],

      related:[
        "use-gantt",
        "read-project-status",
        "fix-dependency-conflict"
      ]
    },

    {
      id:"use-gantt",
      min:1,
      title:"Use Gantt",
      summary:"Understand Task/Subtask hierarchy, planned timing, overlap, sequencing, Milestones, and schedule conflicts.",
      area:"Gantt",

      whenToUse:`
        <p>Use Gantt when you want to understand how work fits together across time rather than simply viewing individual due dates.</p>
        <p>It is particularly useful for spotting sequencing problems that may be difficult to recognize in a list.</p>
      `,

      before:[
        "Confirm the correct project.",
        "Choose whether you want Project Plan, Site Operations, or Combined schedule data.",
        "Know whether you are reviewing timing, hierarchy, dependencies, or Milestones."
      ],

      steps:[
        "Open Gantt.",
        "Choose Project, Site, or Combined mode.",
        "Use the left Task column to locate the work.",
        "Expand a Higher-Level Task when you need to see its Subtasks.",
        "Follow the row across the timeline to see its planned schedule.",
        "Compare related Tasks to understand overlap and sequence.",
        "Review Milestones.",
        "Review Blocked By indicators.",
        "Review Dependency Conflict warnings.",
        "Select the schedule item to open its underlying record."
      ],

      fieldNotes:[
        {
          name:"Schedule bar",
          text:"Represents the planned timing of duration-based work."
        },
        {
          name:"Milestone",
          text:"Represents an important event or schedule point rather than normal duration-based work."
        },
        {
          name:"Hierarchy",
          text:"Comes from Higher-Level Task relationships in the source schedule."
        },
        {
          name:"Blocked By",
          text:"At least one selected predecessor remains incomplete."
        },
        {
          name:"Dependency Conflict",
          text:"The source record contains an explicit predecessor/date conflict."
        },
        {
          name:"Today",
          text:"Provides a visual reference for the current point in the schedule."
        }
      ],

      expected:`
        <p>You should be able to understand where work sits on the timeline, what runs concurrently, which work is dependent on other work, and where schedule problems exist.</p>
      `,

      verify:[
        "Tasks and Subtasks appear under the correct hierarchy.",
        "Schedule bars align with expected dates.",
        "Milestones appear at meaningful points.",
        "Dependencies make sense.",
        "Warnings correspond to actual source data.",
        "Selecting a row opens the correct record."
      ],

      mistakes:[
        "Treating visual overlap alone as a dependency conflict.",
        "Assuming every Task that appears later must have a predecessor.",
        "Trying to change the Gantt picture instead of correcting the source schedule.",
        "Treating the current dashboard as a formal CPM critical-path engine."
      ],

      troubleshooting:[
        {
          q:"A Task appears under the wrong parent.",
          a:"Review Higher-Level Task in the source Project Plan or Site Operations item."
        },
        {
          q:"A bar appears at the wrong time.",
          a:"Review the source item's Start/Activity Date and Target Date."
        },
        {
          q:"A Dependency Conflict appears.",
          a:"Open the item and compare its explicit Start/Activity Date against each incomplete predecessor's Target Date."
        },
        {
          q:"Project and Site items look mixed together.",
          a:"Check the selected mode. Use Project or Site mode when you want to isolate one schedule source."
        }
      ],

      related:[
        "use-calendar",
        "add-predecessor",
        "fix-dependency-conflict",
        "create-milestone"
      ]
    },

    {
      id:"create-task",
      min:2,
      title:"Create a Task",
      summary:"Create a new top-level Project Plan Task with clear ownership, dates, status, and schedule relationships.",
      area:"Project Plan",

      whenToUse:`
        <p>Use a top-level <strong>Task</strong> for meaningful project work that should be tracked independently or contain related Subtasks beneath it.</p>
        <p>A Task should represent work that management may need to understand, own, schedule, or report on.</p>
      `,

      before:[
        "Decide exactly what work the Task represents.",
        "Identify the person accountable for it.",
        "Determine realistic Start and Target Dates.",
        "Determine whether the Task belongs beneath another Task.",
        "Determine whether other work must occur first."
      ],

      steps:[
        "Open Project Plan.",
        "Choose the option to add a new item.",
        "Enter a clear Task name.",
        "Set Item Type to Task.",
        "Assign an Owner.",
        "Enter a Start Date when the planned start is known.",
        "Enter the Target Date.",
        "Set Status.",
        "Enter a useful Next Step when appropriate.",
        "Enter Waiting On information when progress depends on someone or something else.",
        "Leave Higher-Level Task blank if this is a top-level Task.",
        "Add Predecessor(s) only when other work genuinely must occur first.",
        "Save the Task."
      ],

      fieldNotes:[
        {
          name:"Task name",
          text:"Should clearly describe the work. Avoid vague labels that require additional explanation."
        },
        {
          name:"Owner",
          text:"The person accountable for moving the Task forward."
        },
        {
          name:"Start Date",
          text:"The explicit planned start. This can participate in dependency-conflict logic."
        },
        {
          name:"Target Date",
          text:"The planned completion date."
        },
        {
          name:"Higher-Level Task",
          text:"Leave blank for a top-level Task. Select another Task only when this item should become a Subtask."
        },
        {
          name:"Predecessor(s)",
          text:"Use when other work must be completed first."
        }
      ],

      expected:`
        <p>The new Task should appear in Project Plan and feed supported schedule views such as Calendar and Gantt.</p>
        <p>If dependencies exist, Project Control can begin evaluating Blocked By and Dependency Conflict conditions.</p>
      `,

      verify:[
        "The Task appears in Project Plan.",
        "Owner is correct.",
        "Start and Target Dates are correct.",
        "The Task is top-level unless a Higher-Level Task was intentionally selected.",
        "Any predecessors are valid.",
        "The Task appears appropriately in Calendar and Gantt."
      ],

      mistakes:[
        "Creating a Task with no clear Owner.",
        "Using a vague name such as 'Engineering' when a specific outcome or action can be stated.",
        "Using one giant Task when meaningful Subtasks would improve schedule visibility.",
        "Adding predecessors merely because work happens earlier rather than because it is truly required first.",
        "Using unrealistic dates simply to make the schedule look clean."
      ],

      troubleshooting:[
        {
          q:"The Task appears as a Subtask.",
          a:"Reopen it and review Higher-Level Task. A selected parent makes the item a Subtask."
        },
        {
          q:"The Task is missing from Calendar or Gantt.",
          a:"Review its dates and confirm you are viewing the correct schedule mode."
        },
        {
          q:"The Task immediately shows Blocked By.",
          a:"Review the selected predecessors. At least one is incomplete."
        }
      ],

      related:[
        "create-subtask",
        "add-predecessor",
        "create-milestone"
      ]
    },

    {
      id:"create-subtask",
      min:2,
      title:"Create a Subtask",
      summary:"Break larger work into a smaller, separately owned and scheduled piece of work.",
      area:"Project Plan / Site Operations",

      whenToUse:`
        <p>Use a <strong>Subtask</strong> when a larger Task contains meaningful pieces of work that should be tracked separately.</p>
        <p>A Subtask is especially useful when the work has its own Owner, date, status, predecessor, blocker, or Next Step.</p>
      `,

      before:[
        "Identify the Higher-Level Task the new work belongs beneath.",
        "Decide who should own this specific piece of work.",
        "Determine realistic Start/Activity and Target Dates.",
        "Determine whether another Task must occur before this Subtask can begin."
      ],

      steps:[
        "Open Project Plan or Site Operations.",
        "Create a new item, or open an existing item that should become a Subtask.",
        "Enter a clear name describing the specific piece of work.",
        "Locate Higher-Level Task.",
        "Select the Task that this work belongs beneath.",
        "Assign the Subtask's Owner.",
        "Enter its Start Date or Activity Date when the planned start is known.",
        "Enter its Target Date.",
        "Set the appropriate Status.",
        "Add Next Step and Waiting On information when applicable.",
        "Add Predecessor(s) only when other work must actually occur first.",
        "Save the record."
      ],

      fieldNotes:[
        {
          name:"Higher-Level Task",
          text:"Creates hierarchy. It answers: What larger piece of work does this belong under?"
        },
        {
          name:"Owner",
          text:"The person accountable for moving this specific Subtask forward. The Owner can be different from the Higher-Level Task Owner."
        },
        {
          name:"Start / Activity Date",
          text:"The explicit planned start of this Subtask. This date can participate in dependency-conflict checks."
        },
        {
          name:"Target Date",
          text:"The planned completion date for this specific piece of work."
        },
        {
          name:"Predecessor(s)",
          text:"Creates schedule sequence. This is separate from the Higher-Level Task relationship."
        }
      ],

      expected:`
        <p>The Subtask should appear beneath its Higher-Level Task anywhere hierarchy is supported.</p>
        <p>Its own Owner, dates, Status, blockers, and dependencies remain independent from the Higher-Level Task.</p>
      `,

      verify:[
        "Expand the Higher-Level Task and confirm the Subtask appears beneath it.",
        "Confirm the Subtask Owner and dates are correct.",
        "Open Gantt and verify the Subtask appears beneath the expected Task.",
        "If predecessors were added, confirm the expected Blocked By or Dependency Conflict behavior."
      ],

      mistakes:[
        "Using Higher-Level Task to indicate what must happen first. That requires a predecessor.",
        "Assuming the Subtask automatically depends on the Higher-Level Task.",
        "Giving every Subtask the same distant final Target Date when intermediate dates matter.",
        "Creating tiny Subtasks that provide no useful ownership, schedule, or management visibility."
      ],

      troubleshooting:[
        {
          q:"The Subtask does not appear under the Task.",
          a:"Reopen the Subtask and confirm the correct Higher-Level Task is selected. Save it and refresh the view."
        },
        {
          q:"The Subtask appears in the hierarchy but at the wrong time in Gantt.",
          a:"Review the Subtask's own Start/Activity Date and Target Date. Hierarchy does not control its dates."
        },
        {
          q:"The Subtask says Blocked By.",
          a:"Review its selected predecessors. At least one predecessor remains incomplete."
        }
      ],

      related:[
        "add-predecessor",
        "create-milestone",
        "fix-dependency-conflict"
      ]
    },

    {
      id:"add-predecessor",
      min:2,
      title:"Add a Predecessor",
      summary:"Tell Project Control that one piece of work must occur before another can proceed.",
      area:"Project Plan / Site Operations",

      whenToUse:`
        <p>Use a <strong>Predecessor</strong> when the current Task, Subtask, or Milestone genuinely depends on another item being completed first.</p>
        <p>This should represent a real project prerequisite — not simply two items that happen near each other on the schedule.</p>
      `,

      before:[
        "Identify the downstream item — the work that cannot proceed yet.",
        "Identify the upstream item — the work that must happen first.",
        "Confirm that the relationship is a true prerequisite.",
        "Review the planned dates for both items."
      ],

      steps:[
        "Open the downstream Task, Subtask, or Milestone — the item that must happen later.",
        "Locate Predecessor(s).",
        "Select the upstream Task or Tasks that must occur first.",
        "Review each predecessor's Target Date.",
        "Review the downstream item's explicit Start/Activity Date.",
        "Confirm the dates represent the real project sequence.",
        "Save the downstream item.",
        "Review it in Project Plan or Site Operations.",
        "Open Gantt when you want to review the relationship in timeline context."
      ],

      fieldNotes:[
        {
          name:"Where to add it",
          text:"The predecessor is selected on the downstream item — the work that must wait."
        },
        {
          name:"Blocked By",
          text:"Appears when at least one selected predecessor is incomplete."
        },
        {
          name:"Dependency Conflict",
          text:"Occurs when an incomplete predecessor is scheduled to finish after the downstream item's explicit Start/Activity Date."
        },
        {
          name:"Same-day transition",
          text:"A predecessor Target Date equal to the downstream Start/Activity Date is allowed."
        },
        {
          name:"No explicit start",
          text:"An inferred Gantt start alone does not create a hard Dependency Conflict. The downstream item needs an explicit Start/Activity Date."
        }
      ],

      expected:`
        <p>If the predecessor remains incomplete, the downstream item can show <strong>Blocked By</strong>.</p>
        <p>If its explicit dates create an impossible sequence, it can also show <strong>Dependency Conflict</strong>.</p>
      `,

      verify:[
        "Reopen the downstream item and confirm the predecessor saved correctly.",
        "Check whether Blocked By appears while the predecessor is incomplete.",
        "Compare the predecessor Target Date with the downstream Start/Activity Date.",
        "Open Gantt and confirm the planned sequence makes sense.",
        "If the relationship leads to a Milestone, review whether that Milestone is shown At Risk."
      ],

      mistakes:[
        "Adding the predecessor to the upstream item instead of the downstream item.",
        "Using a predecessor simply to group Tasks. Use Higher-Level Task for hierarchy.",
        "Creating dependencies that do not represent actual project prerequisites.",
        "Changing dates only to make a warning disappear.",
        "Leaving a predecessor incomplete after the work has actually been completed."
      ],

      troubleshooting:[
        {
          q:"Why does it say Blocked By when the dates look fine?",
          a:"Blocked By is based on predecessor completion. Check whether the predecessor is still incomplete."
        },
        {
          q:"Why is there a Dependency Conflict?",
          a:"Compare the predecessor Target Date with the downstream item's explicit Start/Activity Date. A conflict exists when the predecessor is scheduled to finish later."
        },
        {
          q:"Why is there no Dependency Conflict even though the Gantt bars overlap?",
          a:"A hard conflict requires an explicit Start/Activity Date on the downstream item. Inferred Gantt timing alone does not create the conflict."
        },
        {
          q:"Can one item have multiple predecessors?",
          a:"Yes. Use multiple predecessors when several pieces of work genuinely must occur before the downstream item."
        }
      ],

      related:[
        "create-subtask",
        "fix-dependency-conflict",
        "create-milestone"
      ]
    },

    {
      id:"create-milestone",
      min:2,
      title:"Create a Milestone",
      summary:"Track an important approval, release, turnover, completion point, or other significant project date.",
      area:"Project Plan / Site Operations",

      whenToUse:`
        <p>Use a <strong>Milestone</strong> for a significant event rather than normal duration-based work.</p>
        <p>A useful Milestone normally represents something management cares about achieving on a specific date.</p>
      `,

      before:[
        "Identify the significant event being tracked.",
        "Determine the planned Milestone date.",
        "Identify the Tasks that must occur before the Milestone.",
        "Determine who is accountable for achieving it when appropriate."
      ],

      steps:[
        "Create a new schedule item or open an existing item.",
        "Set Item Type to Milestone.",
        "Enter a clear name describing the event.",
        "Enter the planned Milestone date.",
        "Assign an Owner when accountability is required.",
        "Add Predecessor(s) representing the work that must occur before the Milestone.",
        "Set Status appropriately.",
        "Save the record.",
        "Review Calendar and Gantt to confirm the Milestone appears correctly."
      ],

      fieldNotes:[
        {
          name:"Item Type",
          text:"Must be set to Milestone so Project Control treats and displays the record as a milestone event."
        },
        {
          name:"Milestone date",
          text:"Represents the planned date of the event rather than a normal duration of work."
        },
        {
          name:"Predecessors",
          text:"Identify the work that must occur before the Milestone can realistically be achieved."
        },
        {
          name:"Milestone at Risk",
          text:"Can appear when an upstream Dependency Conflict exists somewhere in the predecessor chain leading to the Milestone."
        }
      ],

      expected:`
        <p>The Milestone should appear with Milestone treatment in supported Calendar and Gantt views.</p>
        <p>If upstream schedule conflicts exist, Project Control may identify it as <strong>Milestone At Risk</strong>.</p>
      `,

      verify:[
        "Confirm Item Type is Milestone.",
        "Confirm the Milestone date.",
        "Confirm all required predecessors are attached.",
        "Open Calendar and verify the Milestone indicator appears.",
        "Open Gantt and verify the Milestone appears at the expected point.",
        "Review Executive Summary if upstream conflicts should place the Milestone At Risk."
      ],

      mistakes:[
        "Using a Milestone for normal work that occurs over a duration.",
        "Creating a Milestone without meaningful predecessors even though substantial work must happen first.",
        "Using vague names such as 'Done' or 'Finish'.",
        "Moving the Milestone date only to hide an upstream schedule problem."
      ],

      troubleshooting:[
        {
          q:"The item does not appear as a Milestone.",
          a:"Reopen it and confirm Item Type is set to Milestone."
        },
        {
          q:"Why is the Milestone At Risk?",
          a:"Trace its predecessor chain. An upstream schedule conflict exists somewhere in the work leading to the Milestone."
        },
        {
          q:"The Milestone appears on the wrong date.",
          a:"Correct the underlying source record. Calendar and Gantt reflect that data."
        }
      ],

      related:[
        "add-predecessor",
        "fix-dependency-conflict",
        "use-gantt"
      ]
    },

    {
      id:"fix-dependency-conflict",
      min:2,
      title:"Fix a Dependency Conflict",
      summary:"Find the schedule relationship causing an impossible planned sequence and correct the underlying project data.",
      area:"Project Plan / Site Operations",

      whenToUse:`
        <p>Use this process whenever Project Control displays <strong>Dependency Conflict</strong> on a Task, Subtask, Milestone path, Gantt row, Calendar item, or Executive Summary risk.</p>
      `,

      before:[
        "Identify the item showing the conflict.",
        "Confirm whether the source is Project Plan or Site Operations.",
        "Do not move dates until you understand which dependency is creating the warning."
      ],

      steps:[
        "Open the item showing Dependency Conflict.",
        "Review its explicit Start Date or Activity Date.",
        "Review every selected Predecessor.",
        "Open each incomplete predecessor.",
        "Review each predecessor's Target Date.",
        "Compare each predecessor Target Date with the dependent item's Start/Activity Date.",
        "Identify the predecessor scheduled to finish after the downstream item is scheduled to begin.",
        "Determine what the real project plan should be.",
        "If the predecessor Target Date is wrong, correct the predecessor.",
        "If the downstream Start/Activity Date is wrong, correct the downstream item.",
        "If the dependency itself is incorrect, correct or remove the predecessor relationship.",
        "If the predecessor is actually complete, update its Status appropriately.",
        "Save all corrected records.",
        "Return to the affected schedule or Executive Summary and confirm the conflict has cleared."
      ],

      fieldNotes:[
        {
          name:"Conflict rule",
          text:"A Dependency Conflict exists when an incomplete predecessor's Target Date is later than the downstream item's explicit Start/Activity Date."
        },
        {
          name:"Equal dates",
          text:"A predecessor finishing on the same date that downstream work starts is allowed."
        },
        {
          name:"Completion status",
          text:"If the predecessor is legitimately complete, it should no longer behave like an incomplete blocker."
        },
        {
          name:"Multiple predecessors",
          text:"Review every predecessor. One valid relationship does not mean another predecessor is not causing the conflict."
        },
        {
          name:"Milestone impact",
          text:"An upstream Dependency Conflict can place a related downstream Milestone At Risk."
        }
      ],

      expected:`
        <p>After the real schedule problem is corrected, the <strong>Dependency Conflict</strong> warning should disappear.</p>
        <p>If the predecessor remains incomplete but the dates are now valid, <strong>Blocked By</strong> may remain. That is expected.</p>
      `,

      verify:[
        "Confirm Dependency Conflict is no longer shown.",
        "If Blocked By remains, confirm that the predecessor truly is still incomplete.",
        "Review the relationship in Gantt.",
        "Review Executive Summary if the conflict previously appeared as a Project Risk.",
        "Review related Milestones to confirm any At Risk condition updates appropriately."
      ],

      mistakes:[
        "Moving the downstream Start Date merely to make the warning disappear.",
        "Marking a predecessor complete when the work is not actually complete.",
        "Removing a valid predecessor because its warning is inconvenient.",
        "Trying to fix only the visible Calendar or Gantt symptom instead of the source data.",
        "Checking only one predecessor when several are attached."
      ],

      troubleshooting:[
        {
          q:"Dependency Conflict disappeared but Blocked By remains.",
          a:"That can be correct. The dates are now valid, but the predecessor is still incomplete."
        },
        {
          q:"The dates look equal but the conflict is still shown.",
          a:"Reopen both records and confirm their saved dates. Also confirm you are reviewing the predecessor actually causing the conflict."
        },
        {
          q:"The warning appears on a Milestone instead of the Task I expected.",
          a:"The Milestone may be reflecting an upstream conflict. Trace its predecessor chain backward."
        },
        {
          q:"I corrected the record but the warning remains.",
          a:"Confirm the save completed, refresh the schedule view, and review whether another predecessor is still causing the conflict."
        }
      ],

      related:[
        "add-predecessor",
        "create-milestone",
        "use-gantt",
        "find-blocker"
      ]
    },

    {
      id:"create-info-required",
      min:2,
      title:"Create an Information Required Item",
      summary:"Track a specific answer, approval, document, selection, dimension, or decision needed from someone else.",
      area:"Information Required",

      whenToUse:`
        <p>Use <strong>Information Required</strong> when project work depends on information that has not yet been received.</p>
        <p>The purpose is to keep important unanswered needs from becoming buried in email, meeting notes, or someone's memory.</p>
      `,

      before:[
        "Know exactly what information is missing.",
        "Identify who is expected to provide it.",
        "Identify who within the project owns the follow-up.",
        "Determine when the answer is needed.",
        "Understand what work or decision will be affected if the information is late."
      ],

      steps:[
        "Open Information Required.",
        "Create a new record.",
        "Describe the exact information needed.",
        "Identify Requested From.",
        "Assign the Owner responsible for follow-up.",
        "Enter the Needed By date.",
        "Describe the impact or work being blocked.",
        "Set the appropriate Status.",
        "Save the item.",
        "Follow up as needed.",
        "Update the record when information is received.",
        "Resolve or complete it only after the answer has been received and acted upon."
      ],

      fieldNotes:[
        {
          name:"Information Needed",
          text:"State the exact question, document, selection, approval, dimension, or decision required."
        },
        {
          name:"Requested From",
          text:"The person, trade, consultant, client representative, or organization expected to provide the information."
        },
        {
          name:"Owner",
          text:"The person responsible for tracking and following up on the request."
        },
        {
          name:"Needed By",
          text:"The date the information is required to avoid affecting work."
        },
        {
          name:"Impact",
          text:"Explains what cannot proceed or may be delayed while the information remains outstanding."
        }
      ],

      expected:`
        <p>Anyone reviewing the record should immediately understand <strong>what is needed, who owes it, who is following it, when it is needed, and what it is affecting.</strong></p>
      `,

      verify:[
        "The request clearly states the missing information.",
        "Requested From identifies the correct party.",
        "An Owner is assigned.",
        "Needed By is meaningful.",
        "The impact is understandable.",
        "Status accurately reflects whether the request is still open."
      ],

      mistakes:[
        "Writing vague requests such as 'need answer from electrician.'",
        "Leaving Requested From blank.",
        "Leaving out the Needed By date.",
        "Failing to explain why the information matters.",
        "Closing the request before the answer has actually been incorporated into the work."
      ],

      troubleshooting:[
        {
          q:"People still do not understand what answer is needed.",
          a:"Rewrite the request as a specific question or required deliverable rather than a general topic."
        },
        {
          q:"The request is overdue but nobody is following up.",
          a:"Confirm the Owner and Requested From fields are correct and visible."
        },
        {
          q:"The information was received but the item is still open.",
          a:"Confirm the answer has been acted upon, then update Status appropriately."
        }
      ],

      related:[
        "find-blocker",
        "read-project-status"
      ]
    },

    {
      id:"update-deliverable",
      min:2,
      title:"Update a Deliverable",
      summary:"Keep an important project outcome current, accountable, and actionable.",
      area:"Deliverables",

      whenToUse:`
        <p>Use this workflow whenever the condition, ownership, timing, blocker, or next action for an important Deliverable has changed.</p>
        <p>Deliverables should provide management visibility into outcomes rather than duplicate every execution step.</p>
      `,

      before:[
        "Confirm the Deliverable still represents a meaningful project outcome.",
        "Know who currently owns the outcome.",
        "Know its true current Status.",
        "Know what action should happen next.",
        "Know whether another person or condition is preventing progress."
      ],

      steps:[
        "Open Deliverables.",
        "Open the Deliverable you want to update.",
        "Confirm the Owner.",
        "Update Status to reflect the actual current condition.",
        "Review the Target Date.",
        "Change the Target Date only when the real plan has changed.",
        "Enter the immediate Next Step.",
        "Use Waiting On when progress depends on another person, trade, decision, approval, information item, or outside action.",
        "Save the record.",
        "Review the Deliverables list or Executive Summary to confirm the update is reflected."
      ],

      fieldNotes:[
        {
          name:"Owner",
          text:"The person accountable for getting the Deliverable to completion."
        },
        {
          name:"Status",
          text:"Should reflect reality now, not the original expectation."
        },
        {
          name:"Target Date",
          text:"The planned completion date for the outcome."
        },
        {
          name:"Next Step",
          text:"The immediate action required to move the Deliverable forward."
        },
        {
          name:"Waiting On",
          text:"The person, decision, approval, information, material, or other outside condition currently preventing progress."
        }
      ],

      expected:`
        <p>A person reviewing the Deliverable should understand the outcome, who owns it, its current condition, when it is expected, what happens next, and what is preventing progress.</p>
      `,

      verify:[
        "Owner is current.",
        "Status reflects the actual condition.",
        "Target Date is realistic.",
        "Next Step is specific.",
        "Waiting On clearly identifies any blocker.",
        "The updated condition appears correctly elsewhere in Project Control."
      ],

      mistakes:[
        "Using vague Next Steps such as 'follow up.'",
        "Changing the Target Date simply because the old date is inconvenient.",
        "Leaving Waiting On populated after the blocker is resolved.",
        "Turning a Deliverable into a long list of individual execution steps that belong in Project Plan or Site Operations."
      ],

      troubleshooting:[
        {
          q:"The Deliverable looks stale.",
          a:"Review Owner, Status, Target Date, Next Step, and Waiting On. One or more fields may no longer reflect the actual project condition."
        },
        {
          q:"There are too many details in the Deliverable.",
          a:"Move detailed execution steps into Project Plan or Site Operations and keep the Deliverable focused on the management outcome."
        },
        {
          q:"Management cannot tell why it is waiting.",
          a:"Make Waiting On specific and ensure the Next Step identifies who is doing what next."
        }
      ],

      related:[
        "read-project-status",
        "find-blocker"
      ]
    }

  ];

  const FAQ = [
    {
      min:1,
      q:"How do I open more detail from the dashboard?",
      a:"Click supported cards, Calendar items, Agenda rows, Gantt items, project-risk entries, or other clickable records to open their underlying detail."
    },
    {
      min:1,
      q:"What is the difference between Project Plan and Site Operations?",
      a:"Project Plan is the broader project-management schedule. Site Operations is focused on field execution by location, room, or site work area."
    },
    {
      min:1,
      q:"What does Blocked By mean?",
      a:"At least one predecessor is still incomplete."
    },
    {
      min:1,
      q:"Why does an item say Dependency Conflict?",
      a:"The dependent item has an explicit Start Date that occurs before one of its incomplete predecessors is scheduled to finish."
    },
    {
      min:1,
      q:"Why is a Milestone marked At Risk?",
      a:"A schedule conflict exists somewhere in the predecessor chain leading to that Milestone."
    },
    {
      min:1,
      q:"Where do Calendar and Gantt get their dates?",
      a:"They use schedule dates from Project Plan and Site Operations. Start or Activity Dates control planned starts, while Target Dates control planned completion."
    },
    {
      min:1,
      q:"Why can I see a record but not edit it?",
      a:"Viewing and editing are separate permissions. Your role may allow you to review the record without changing it."
    },

    {
      min:2,
      q:"What is the difference between a Higher-Level Task and a Predecessor?",
      a:"A Higher-Level Task creates Task/Subtask hierarchy. A Predecessor creates schedule order. The same Task can be both, but the two settings serve different purposes."
    },
    {
      min:2,
      q:"When should I use a Milestone instead of a Task?",
      a:"Use a Milestone for an important project date, approval, release point, or completion point rather than work that occurs over a duration."
    },
    {
      min:2,
      q:"What information should I keep current on project work?",
      a:"Keep ownership, status, Start or Activity Date, Target Date, Next Step, Waiting On, and dependency information current so the Executive Summary and schedules remain accurate."
    },
    {
      min:2,
      q:"When should I use Information Required?",
      a:"Use Information Required when project work is waiting on an answer, document, approval, selection, or decision from someone else."
    },

    {
      min:3,
      q:"What should I do if an internal AHT employee is missing?",
      a:"Use Access & User Request and select Internal AHT user missing. Include the person's name, email if known, project, and the access needed."
    },
    {
      min:3,
      q:"How do I request access for an external user?",
      a:"Use Access & User Request and choose External user request. Include the person's name, email, project, requested role, and reason for access."
    },
    {
      min:3,
      q:"What if I cannot make a project or user assignment myself?",
      a:"Use Access & User Request for an assignment or role/access change that falls outside the controls available to your management scope."
    },

    {
      min:4,
      q:"What is different about Administrator access?",
      a:"Administrators can manage organization-wide project and user administration available in Project Control, while protected System Owner controls remain restricted."
    },

    {
      min:5,
      q:"What are System Owner controls?",
      a:"System Owner controls are protected system-level functions such as owner-only administration, protected-user controls, audit/change-log functions, and other system-wide tools."
    }
  ];

  function esc(value){
    return String(value??"")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;");
  }

  function helpCurrentUser(){
    try{
      if(
        typeof currentUser!=="undefined" &&
        currentUser
      ){
        return currentUser;
      }
    }catch(error){}

    return window.currentUser||null;
  }

  function currentRoleName(){
    const user=helpCurrentUser();

    if(user?.isSystemOwner){
      return "System Owner";
    }

    const actualRole=
      String(user?.role||"").trim();

    if(actualRole){
      return actualRole;
    }

    if(user?.canAdmin)return "Administrator";
    if(user?.canManageProjects)return "Project Admin";
    if(user?.canEdit)return "Editor";

    return "Viewer";
  }

  function helpCapabilityLevel(){
    const user=helpCurrentUser();
    const role=currentRoleName().toLowerCase();

    if(
      user?.isSystemOwner ||
      role==="system owner"
    ){
      return 5;
    }

    if(
      user?.canAdmin ||
      role==="administrator" ||
      role==="admin"
    ){
      return 4;
    }

    if(
      user?.canManageProjects ||
      role==="project admin"
    ){
      return 3;
    }

    if(
      user?.canEdit ||
      role==="editor"
    ){
      return 2;
    }

    return 1;
  }

  function roleGuideHtml(){
    const role=currentRoleName();
    const level=helpCapabilityLevel();

    const sections=[
      {
        min:1,
        title:"Viewing & Navigation",
        body:`
          <p>Use the left navigation to move between the Executive Summary, project records, schedules, and other areas available to your account.</p>
          <p>Click supported cards, Agenda rows, Gantt items, Calendar items, and risk entries to open their underlying records.</p>
          <p>Project, Site, and Combined schedule modes control which schedule source you are viewing where those options are available.</p>
        `
      },
      {
        min:1,
        title:"Understanding Project Information",
        body:`
          <p><strong>Project Plan</strong> shows planned project Tasks, Subtasks, dates, ownership, dependencies, and milestones.</p>
          <p><strong>Site Operations</strong> shows field execution by location or work area.</p>
          <p><strong>Blocked By</strong> means a predecessor is incomplete. <strong>Dependency Conflict</strong> means explicit dates make the planned sequence impossible.</p>
          <p><strong>Milestone at Risk</strong> means a schedule conflict exists somewhere upstream in that milestone's predecessor chain.</p>
        `
      },
      {
        min:2,
        title:"Editing Project Work",
        body:`
          <p>You can edit supported project records available to your role.</p>
          <p>In Project Plan and Site Operations, <strong>Higher-Level Task</strong> creates Task/Subtask hierarchy while <strong>Predecessor(s)</strong> define schedule order.</p>
          <p>Keep Owner, Status, Start/Activity Date, Target Date, Next Step, Waiting On, and dependency information current so the Executive Summary, Calendar, and Gantt remain accurate.</p>
        `
      },
      {
        min:2,
        title:"Deliverables & Information Required",
        body:`
          <p>Use <strong>Deliverables</strong> for major project outcomes and ownership rather than detailed task-level work.</p>
          <p>Use <strong>Information Required</strong> when work is waiting on an answer, document, selection, approval, or decision from someone else.</p>
        `
      },
      {
        min:3,
        title:"Project Administration",
        body:`
          <p>You can manage supported project and access functions within your assigned management scope.</p>
          <p>Use Administration for project/user assignments available to your role.</p>
          <p>Use <strong>Access & User Request</strong> when an internal employee is missing, an external user needs access, or an access/role change cannot be completed directly.</p>
        `
      },
      {
        min:4,
        title:"Organization Administration",
        body:`
          <p>You can manage organization-wide project and user administration available to the Admin role.</p>
          <p>Protected System Owner controls remain restricted.</p>
        `
      },
      {
        min:5,
        title:"System Owner Controls",
        body:`
          <p>You have access to protected system-level functions in addition to all standard administration capabilities.</p>
          <p>This includes owner-only controls such as protected-user/system administration, audit/change-log functions, and other system-level tools as they are implemented.</p>
        `
      }
    ];

    return `
      <div class="help-role-current">
        <span>Your current role</span>
        <strong>${esc(role)}</strong>
      </div>

      <div class="help-guide-card">
        <p><strong>${esc(role)}</strong> help is tailored to the features and actions available to your account.</p>
        <p>You will only see guidance for capabilities available at your role level.</p>
      </div>

      <div class="help-role-guide-sections">
        ${sections
          .filter(section=>level>=section.min)
          .map(section=>`
            <details class="help-role-details">
              <summary>${esc(section.title)}</summary>
              <div>${section.body}</div>
            </details>
          `)
          .join("")}
      </div>
    `;
  }

  function howToHtml(){
    const level=helpCapabilityLevel();

    const guides=
      HOW_TO_GUIDES.filter(guide=>
        level>=Number(guide.min||1)
      );

    return `
      <div class="help-howto-page">

        <section class="help-howto-intro">
          <div class="help-section-kicker">Step-by-Step</div>
          <h3>How To</h3>
          <p>
            Choose what you are trying to accomplish.
            Instructions shown here are limited to actions available to your role.
          </p>
        </section>

        <div class="help-howto-grid">
          ${guides.map(guide=>`
            <button
              type="button"
              class="help-howto-card"
              onclick="HelpCenter.openHowTo('${guide.id}')"
            >
              <span class="help-howto-area">${esc(guide.area)}</span>
              <strong>${esc(guide.title)}</strong>
              <small>${esc(guide.summary)}</small>
              <span class="help-howto-open">Open guide →</span>
            </button>
          `).join("")}
        </div>

      </div>
    `;
  }

  function openHowTo(id){
    const level=helpCapabilityLevel();

    const guide=
      HOW_TO_GUIDES.find(item=>
        item.id===id &&
        level>=Number(item.min||1)
      );

    if(!guide)return;

    const title=
      document.getElementById("helpTopicTitle");

    const summary=
      document.getElementById("helpTopicSummary");

    const body=
      document.getElementById("helpTopicBody");

    const backdrop=
      document.getElementById("helpTopicBackdrop");

    if(!title||!summary||!body||!backdrop)return;

    const listHtml=(items,className="help-howto-steps")=>
      Array.isArray(items)&&items.length
        ? `
          <ol class="${className}">
            ${items.map(item=>`
              <li>${esc(item)}</li>
            `).join("")}
          </ol>
        `
        : "";

    const fieldNotesHtml=
      Array.isArray(guide.fieldNotes)&&guide.fieldNotes.length
        ? `
          <section class="help-deep-section">
            <div class="help-deep-kicker">Field & Logic Reference</div>
            <h4>What Matters During This Process</h4>

            <div class="help-field-list">
              ${guide.fieldNotes.map(item=>`
                <div class="help-field-row">
                  <strong>${esc(item.name)}</strong>
                  <span>${esc(item.text)}</span>
                </div>
              `).join("")}
            </div>
          </section>
        `
        : "";

    const troubleshootingHtml=
      Array.isArray(guide.troubleshooting)&&guide.troubleshooting.length
        ? `
          <section class="help-deep-section">
            <div class="help-deep-kicker">Troubleshooting</div>
            <h4>If It Does Not Look Right</h4>

            <div class="help-troubleshooting-list">
              ${guide.troubleshooting.map(item=>`
                <details>
                  <summary>${esc(item.q)}</summary>
                  <p>${esc(item.a)}</p>
                </details>
              `).join("")}
            </div>
          </section>
        `
        : "";

    const relatedGuides=
      Array.isArray(guide.related)
        ? guide.related
            .map(relatedId=>
              HOW_TO_GUIDES.find(item=>
                item.id===relatedId &&
                level>=Number(item.min||1)
              )
            )
            .filter(Boolean)
        : [];

    const relatedHtml=
      relatedGuides.length
        ? `
          <section class="help-deep-section">
            <div class="help-deep-kicker">Keep Going</div>
            <h4>Related How To Guides</h4>

            <div class="help-related-guides">
              ${relatedGuides.map(item=>`
                <button
                  type="button"
                  onclick="HelpCenter.openHowTo('${item.id}')"
                >
                  <strong>${esc(item.title)}</strong>
                  <span>${esc(item.summary)}</span>
                </button>
              `).join("")}
            </div>
          </section>
        `
        : "";

    title.textContent=guide.title;
    summary.textContent=guide.area;

    body.innerHTML=`
      <article class="help-article help-howto-detail">

        <section class="help-article-intro">
          <p>${esc(guide.summary)}</p>
        </section>

        ${guide.whenToUse ? `
          <section class="help-deep-section">
            <div class="help-deep-kicker">When to Use This</div>
            <h4>When This Workflow Applies</h4>
            ${guide.whenToUse}
          </section>
        ` : ""}

        ${Array.isArray(guide.before)&&guide.before.length ? `
          <section class="help-deep-section help-before-start">
            <div class="help-deep-kicker">Before You Start</div>
            <h4>Have This Information Ready</h4>
            ${listHtml(guide.before,"help-preflight-list")}
          </section>
        ` : ""}

        <section class="help-article-section">
          <div class="help-deep-kicker">Step-by-Step</div>
          <h4>${esc(guide.title)}</h4>
          ${listHtml(guide.steps)}
        </section>

        ${fieldNotesHtml}

        ${guide.expected ? `
          <section class="help-deep-section help-expected-result">
            <div class="help-deep-kicker">Expected Result</div>
            <h4>What Should Happen</h4>
            ${guide.expected}
          </section>
        ` : ""}

        ${Array.isArray(guide.verify)&&guide.verify.length ? `
          <section class="help-deep-section">
            <div class="help-deep-kicker">Verify</div>
            <h4>Confirm It Worked</h4>
            ${listHtml(guide.verify,"help-verify-list")}
          </section>
        ` : ""}

        ${Array.isArray(guide.mistakes)&&guide.mistakes.length ? `
          <section class="help-deep-section">
            <div class="help-deep-kicker">Common Mistakes</div>
            <h4>Things to Avoid</h4>

            <div class="help-warning-list">
              ${guide.mistakes.map(item=>`
                <div>${esc(item)}</div>
              `).join("")}
            </div>
          </section>
        ` : ""}

        ${troubleshootingHtml}

        ${Array.isArray(guide.tips)&&guide.tips.length ? `
          <section class="help-deep-section">
            <div class="help-deep-kicker">Remember</div>
            <h4>Important Notes</h4>

            <div class="help-note-list">
              ${guide.tips.map(tip=>`
                <div>${esc(tip)}</div>
              `).join("")}
            </div>
          </section>
        ` : ""}

        ${relatedHtml}

      </article>
    `;

    backdrop.style.display="flex";
  }

  function faqHtml(){
    const level=helpCapabilityLevel();

    const visibleFaq=
      FAQ.filter(item=>
        level>=Number(item.min||1)
      );

    return `
      <div class="help-faq-list">
        ${visibleFaq.map(item=>`
          <details class="help-faq-item">
            <summary>${esc(item.q)}</summary>
            <p>${esc(item.a)}</p>
          </details>
        `).join("")}
      </div>
    `;
  }

  function guideTopicsHtml(){
    const level=helpCapabilityLevel();

    const minimumLevel={
      projects:1,
      executiveSummary:1,
      projectPlan:1,
      siteOperations:1,
      deliverables:1,
      informationRequired:1,
      calendar:1,
      gantt:1,
      administration:3
    };

    return `
      <div class="help-topic-grid">
        ${Object.entries(HELP_TOPICS)
          .filter(([key])=>
            level>=Number(minimumLevel[key]||1)
          )
          .map(([key,topic])=>`
            <button
              type="button"
              class="help-topic-card"
              onclick="HelpCenter.openTopic('${key}')"
            >
              <strong>${esc(topic.title)}</strong>
              <small>${esc(topic.summary)}</small>
            </button>
          `)
          .join("")}
      </div>
    `;
  }

  function helpCurrentProject(){
    try{
      if(typeof currentProject==="function"){
        return currentProject();
      }
    }catch(error){}

    try{
      if(typeof window.currentProject==="function"){
        return window.currentProject();
      }
    }catch(error){}

    return null;
  }

  function helpTicketHtml(){
    const project=helpCurrentProject();

    return `
      <form id="dashboardHelpTicketForm" class="help-request-form">
        <div class="help-form-note">
          Use this for dashboard usage questions, something not working correctly, or data/display issues.
          Access and user changes should use <strong>Access & User Request</strong>.
        </div>

        <div class="form-grid">
          <div class="field">
            <label>Project</label>
            <input name="project" value="${esc(project?.name||"")}" readonly />
          </div>

          <div class="field">
            <label>Page / Area</label>
            <input name="area" value="${esc(document.querySelector(".view.active h2")?.textContent||"")}" readonly />
          </div>

          <div class="field full">
            <label>Subject</label>
            <input name="subject" maxlength="160" required />
          </div>

          <div class="field">
            <label>Type</label>
            <select name="type">
              <option>How do I…?</option>
              <option>Something is not working</option>
              <option>Data appears incorrect</option>
              <option>Suggestion / Improvement</option>
              <option>Other</option>
            </select>
          </div>

          <div class="field">
            <label>Urgency</label>
            <select name="urgency">
              <option>Normal</option>
              <option>Important</option>
              <option>Blocking my work</option>
            </select>
          </div>

          <div class="field full">
            <label>Description</label>
            <textarea name="description" rows="5" maxlength="3000" required placeholder="Describe what you were trying to do, what happened, and what you expected."></textarea>
          </div>
        </div>

        <div class="help-request-actions">
          <div
            id="dashboardHelpTicketStatus"
            class="help-request-status"
            aria-live="polite"
          ></div>

          <button
            class="btn primary"
            type="submit"
          >
            Submit Help Ticket
          </button>
        </div>
      </form>
    `;
  }

  function accessRequestHtml(){
    const project=helpCurrentProject();

    return `
      <form id="dashboardAccessRequestForm" class="help-request-form">
        <div class="help-form-note">
          Use this for missing internal AHT users, external-user requests, project access changes, role changes, or removal/deactivation requests.
        </div>

        <div class="form-grid">
          <div class="field">
            <label>Request Type</label>
            <select name="requestType">
              <option>Internal AHT user missing</option>
              <option>Add internal user access</option>
              <option>External user request</option>
              <option>Change role / project access</option>
              <option>Remove / disable access</option>
              <option>Other access request</option>
            </select>
          </div>

          <div class="field">
            <label>Project</label>
            <input name="project" value="${esc(project?.name||"")}" />
          </div>

          <div class="field">
            <label>Person Name</label>
            <input name="personName" />
          </div>

          <div class="field">
            <label>Email</label>
            <input name="email" type="email" />
          </div>

          <div class="field">
            <label>Requested Role</label>
            <select name="requestedRole">
              <option value="">Not applicable / unsure</option>
              <option>External Viewer</option>
              <option>Viewer</option>
              <option>Editor</option>
              <option>Project Admin</option>
              <option>Admin</option>
            </select>
          </div>

          <div class="field">
            <label>Internal / External</label>
            <select name="userType">
              <option>Internal AHT</option>
              <option>External</option>
            </select>
          </div>

          <div class="field full">
            <label>Reason / Details</label>
            <textarea name="details" rows="5" maxlength="3000" placeholder="Explain what access is needed and why."></textarea>
          </div>
        </div>

        <div class="help-request-actions">
          <div
            id="dashboardAccessRequestStatus"
            class="help-request-status"
            aria-live="polite"
          ></div>

          <button
            class="btn primary"
            type="submit"
          >
            Submit Access Request
          </button>
        </div>
      </form>
    `;
  }

  async function submitHelpTicket(form){
    const user=helpCurrentUser();
    const project=helpCurrentProject();

    if(!user){
      throw new Error(
        "Signed-in user information is unavailable."
      );
    }

    if(
      typeof SharePointDataProvider==="undefined" ||
      typeof SharePointDataProvider.createItem!=="function"
    ){
      throw new Error(
        "SharePoint connection is unavailable."
      );
    }

    const data=new FormData(form);

    const subject=
      String(data.get("subject")||"").trim();

    const description=
      String(data.get("description")||"").trim();

    if(!subject){
      throw new Error("Subject is required.");
    }

    if(!description){
      throw new Error("Description is required.");
    }

    const fields={
      Title:subject,

      RequesterName:
        String(user.name||"").trim(),

      RequesterEmail:
        String(user.email||"").trim(),

      RequesterRole:
        currentRoleName(),

      RequesterUserId:
        String(user.id||"").trim(),

      ProjectName:
        String(
          project?.name ||
          data.get("project") ||
          ""
        ).trim(),

      ProjectKey:
        String(
          project?.projectKey ||
          project?.id ||
          ""
        ).trim(),

      ProjectSharePointId:
        Number(project?.sharePointId||0) || null,

      PageArea:
        String(data.get("area")||"").trim(),

      RequestType:
        String(data.get("type")||"").trim(),

      Urgency:
        String(data.get("urgency")||"Normal").trim(),

      Description:
        description,

      Status:"Open",

      SourceUrl:
        String(window.location.href||""),

      BrowserInfo:
        String(navigator.userAgent||"")
    };

    return SharePointDataProvider.createItem(
      APP_CONFIG.sharePoint.lists.dashboardHelpTickets,
      fields
    );
  }


  async function submitAccessRequest(form){
    if(!adminRequestAllowed()){
      throw new Error(
        "Your role does not allow Access & User Requests."
      );
    }

    const user=helpCurrentUser();
    const project=helpCurrentProject();

    if(!user){
      throw new Error(
        "Signed-in user information is unavailable."
      );
    }

    if(
      typeof SharePointDataProvider==="undefined" ||
      typeof SharePointDataProvider.createItem!=="function"
    ){
      throw new Error(
        "SharePoint connection is unavailable."
      );
    }

    const data=new FormData(form);

    const requestType=
      String(data.get("requestType")||"").trim();

    const personName=
      String(data.get("personName")||"").trim();

    const personEmail=
      String(data.get("email")||"").trim();

    const details=
      String(data.get("details")||"").trim();

    if(!requestType){
      throw new Error("Request Type is required.");
    }

    if(
      requestType!=="Other access request" &&
      !personName &&
      !personEmail
    ){
      throw new Error(
        "Enter the person's name or email."
      );
    }

    const fields={
      Title:
        [requestType,personName||personEmail]
          .filter(Boolean)
          .join(" - "),

      RequesterName:
        String(user.name||"").trim(),

      RequesterEmail:
        String(user.email||"").trim(),

      RequesterRole:
        currentRoleName(),

      RequesterUserId:
        String(user.id||"").trim(),

      RequestType:
        requestType,

      ProjectName:
        String(
          project?.name ||
          data.get("project") ||
          ""
        ).trim(),

      ProjectKey:
        String(
          project?.projectKey ||
          project?.id ||
          ""
        ).trim(),

      ProjectSharePointId:
        Number(project?.sharePointId||0) || null,

      PersonName:
        personName,

      PersonEmail:
        personEmail,

      RequestedRole:
        String(
          data.get("requestedRole")||""
        ).trim(),

      UserType:
        String(data.get("userType")||"").trim(),

      Details:
        details,

      Status:"Open",

      SourceUrl:
        String(window.location.href||"")
    };

    return SharePointDataProvider.createItem(
      APP_CONFIG.sharePoint.lists.accessUserRequests,
      fields
    );
  }


  function bindRequestForms(){
    const helpForm=
      document.getElementById(
        "dashboardHelpTicketForm"
      );

    if(
      helpForm &&
      !helpForm.dataset.submitBound
    ){
      helpForm.dataset.submitBound="1";

      helpForm.addEventListener(
        "submit",
        async event=>{
          event.preventDefault();

          const status=
            document.getElementById(
              "dashboardHelpTicketStatus"
            );

          const button=
            helpForm.querySelector(
              'button[type="submit"]'
            );

          try{
            if(button){
              button.disabled=true;
              button.textContent="Submitting…";
            }

            if(status){
              status.className=
                "help-request-status working";

              status.textContent=
                "Submitting help ticket…";
            }

            const created=
              await submitHelpTicket(helpForm);

            const ticketNumber=
              created?.id
                ? `HELP-${created.id}`
                : "submitted";

            if(status){
              status.className=
                "help-request-status success";

              status.textContent=
                `Help ticket ${ticketNumber} submitted successfully.`;
            }

            const subject=
              helpForm.querySelector(
                '[name="subject"]'
              );

            const description=
              helpForm.querySelector(
                '[name="description"]'
              );

            if(subject)subject.value="";
            if(description)description.value="";

          }catch(error){
            console.error(
              "Help Ticket submission failed.",
              error
            );

            if(status){
              status.className=
                "help-request-status error";

              status.textContent=
                error?.message ||
                "Help ticket could not be submitted.";
            }
          }finally{
            if(button){
              button.disabled=false;
              button.textContent=
                "Submit Help Ticket";
            }
          }
        }
      );
    }


    const accessForm=
      document.getElementById(
        "dashboardAccessRequestForm"
      );

    if(
      accessForm &&
      !accessForm.dataset.submitBound
    ){
      accessForm.dataset.submitBound="1";

      accessForm.addEventListener(
        "submit",
        async event=>{
          event.preventDefault();

          const status=
            document.getElementById(
              "dashboardAccessRequestStatus"
            );

          const button=
            accessForm.querySelector(
              'button[type="submit"]'
            );

          try{
            if(button){
              button.disabled=true;
              button.textContent="Submitting…";
            }

            if(status){
              status.className=
                "help-request-status working";

              status.textContent=
                "Submitting access request…";
            }

            const created=
              await submitAccessRequest(accessForm);

            const requestNumber=
              created?.id
                ? `ACCESS-${created.id}`
                : "submitted";

            if(status){
              status.className=
                "help-request-status success";

              status.textContent=
                `Access request ${requestNumber} submitted successfully.`;
            }

          }catch(error){
            console.error(
              "Access Request submission failed.",
              error
            );

            if(status){
              status.className=
                "help-request-status error";

              status.textContent=
                error?.message ||
                "Access request could not be submitted.";
            }
          }finally{
            if(button){
              button.disabled=false;
              button.textContent=
                "Submit Access Request";
            }
          }
        }
      );
    }
  }


  function adminRequestAllowed(){
    const user=helpCurrentUser();

    return Boolean(
      user?.canAdmin ||
      user?.canManageProjects ||
      user?.isSystemOwner
    );
  }

  function setTab(tab){
    document.querySelectorAll("[data-help-tab]").forEach(button=>{
      const active=button.dataset.helpTab===tab;
      button.classList.toggle("active",active);
      button.setAttribute("aria-selected",active?"true":"false");
    });

    const content=document.getElementById("helpCenterContent");
    if(!content)return;

    if(tab==="guide"){
      const role=currentRoleName();

      content.innerHTML=`
        <div class="help-section help-guide-shell">
          <section class="help-hero">
            <div class="help-hero-copy">
              <div class="help-hero-kicker">Start Here</div>
              <h3>Project Control User Guide</h3>
              <p>
                Help tailored to your role, with quick explanations of the areas
                and workflows available to you.
              </p>
            </div>

            <div class="help-hero-role">
              <span>Signed in as</span>
              <strong>${esc(role)}</strong>
            </div>
          </section>

          <section class="help-common-tasks">
            <div class="help-section-title-row">
              <div>
                <div class="help-section-kicker">Quick Access</div>
                <h4>Common Tasks</h4>
              </div>
            </div>

            <div class="help-common-task-grid">
              <button type="button" class="help-common-task-card" onclick="HelpCenter.openTopic('executiveSummary')">
                <span class="help-common-task-icon">01</span>
                <span>
                  <strong>Read Project Status</strong>
                  <small>Executive Summary, risks, blockers, and upcoming work.</small>
                </span>
              </button>

              <button type="button" class="help-common-task-card" onclick="HelpCenter.openTopic('projectPlan')">
                <span class="help-common-task-icon">02</span>
                <span>
                  <strong>Understand Project Plan</strong>
                  <small>Tasks, Subtasks, predecessors, milestones, and dates.</small>
                </span>
              </button>

              <button type="button" class="help-common-task-card" onclick="HelpCenter.openTopic('calendar')">
                <span class="help-common-task-icon">03</span>
                <span>
                  <strong>Use the Schedule</strong>
                  <small>Calendar, Agenda, and Gantt views.</small>
                </span>
              </button>

              <button type="button" class="help-common-task-card" onclick="HelpCenter.setTab('faq')">
                <span class="help-common-task-icon">04</span>
                <span>
                  <strong>Find a Quick Answer</strong>
                  <small>Frequently asked questions for your role.</small>
                </span>
              </button>
            </div>
          </section>

          <section class="help-role-section">
            <div class="help-section-title-row">
              <div>
                <div class="help-section-kicker">Your Access</div>
                <h4>What You Can Do</h4>
              </div>
            </div>

            ${roleGuideHtml()}
          </section>

          <section class="help-dashboard-areas">
            <div class="help-section-title-row">
              <div>
                <div class="help-section-kicker">Reference</div>
                <h4>Dashboard Areas</h4>
              </div>
            </div>

            ${guideTopicsHtml()}
          </section>
        </div>
      `;
      return;
    }

    if(tab==="howto"){
      content.innerHTML=howToHtml();
      return;
    }

    if(tab==="faq"){
      content.innerHTML=`
        <div class="help-section">
          <div class="help-section-head">
            <h3>Frequently Asked Questions</h3>
            <p>Common dashboard, schedule, role, and access questions.</p>
          </div>
          ${faqHtml()}
        </div>
      `;
      return;
    }

    if(tab==="ticket"){
      content.innerHTML=`
        <div class="help-section">
          <div class="help-section-head">
            <h3>Submit Help Ticket</h3>
            <p>Dashboard usage, data, or functionality support.</p>
          </div>
          ${helpTicketHtml()}
        </div>
      `;

      bindRequestForms();
      return;
    }

    if(tab==="access"){
      if(!adminRequestAllowed()){
        setTab("guide");
        return;
      }

      content.innerHTML=`
        <div class="help-section">
          <div class="help-section-head">
            <h3>Access & User Request</h3>
            <p>Administrative user, role, and project-access requests.</p>
          </div>
          ${accessRequestHtml()}
        </div>
      `;

      bindRequestForms();
    }
  }

  function open(tab="guide"){
    const backdrop=document.getElementById("helpCenterBackdrop");
    if(!backdrop)return;

    const accessTab=document.querySelector('[data-help-tab="access"]');
    if(accessTab){
      accessTab.classList.toggle(
        "hidden",
        !adminRequestAllowed()
      );
    }

    if(
      tab==="access" &&
      !adminRequestAllowed()
    ){
      tab="guide";
    }

    backdrop.style.display="flex";
    setTab(tab);

    const closeButton=
      document.getElementById("closeHelpCenterBtn");

    closeButton?.focus();
  }

  function close(){
    const backdrop=
      document.getElementById("helpCenterBackdrop");

    if(backdrop){
      backdrop.style.display="none";
    }
  }

  function openTopic(topicKey){
    const topic=HELP_TOPICS[topicKey];

    if(!topic)return;

    const level=helpCapabilityLevel();

    const title=
      document.getElementById("helpTopicTitle");

    const summary=
      document.getElementById("helpTopicSummary");

    const body=
      document.getElementById("helpTopicBody");

    const backdrop=
      document.getElementById("helpTopicBackdrop");

    if(!title||!summary||!body||!backdrop)return;

    const sectionHtml=(section)=>{
      const steps=Array.isArray(section.steps)
        ? `
          <ol class="help-howto-steps">
            ${section.steps.map(step=>`
              <li>${step}</li>
            `).join("")}
          </ol>
        `
        : "";

      return `
        <section class="help-article-section">
          <h4>${section.title}</h4>
          ${section.body||""}
          ${steps}
        </section>
      `;
    };

    const sections=[
      ...(topic.viewer||[]),
      ...(level>=2 ? (topic.editor||[]) : []),
      ...(level>=3 ? (topic.admin||[]) : [])
    ];

    const deepDive=
      HELP_DEEP_DIVE[topicKey]||null;

    const deepDiveHtml=deepDive
      ? `
        <div class="help-deep-dive">
          <div class="help-deep-divider">
            <span>Detailed Guide</span>
          </div>

          ${deepDive.viewer||""}
          ${level>=2 ? (deepDive.editor||"") : ""}
        </div>
      `
      : "";

    title.textContent=topic.title||"Help";
    summary.textContent=topic.summary||"";

    body.innerHTML=`
      <article class="help-article">
        <section class="help-article-intro">
          ${topic.overview||""}
        </section>

        ${sections.map(sectionHtml).join("")}

        ${deepDiveHtml}
      </article>
    `;

    backdrop.style.display="flex";
  }

  function closeTopic(){
    const backdrop=
      document.getElementById("helpTopicBackdrop");

    if(backdrop){
      backdrop.style.display="none";
    }
  }


  const FIELD_HELP={
    "higher-level-task":{
      title:"Higher-Level Task",
      text:"Controls where this item sits in the Task/Subtask hierarchy.",
      options:[
        "None / Top-Level Task — the item stands on its own at the main Task level.",
        "Select another Task — this item becomes a Subtask beneath that Task.",
        "This controls hierarchy only. It does not create a schedule dependency or require the higher-level Task to finish first."
      ]
    },

    "predecessor":{
      title:"Predecessor",
      text:"Defines work that must occur before this Task or activity can proceed.",
      options:[
        "No predecessor selected — there is no explicit schedule dependency on another Task.",
        "Select one or more Tasks — those Tasks must be completed before this item is considered unblocked.",
        "An incomplete predecessor creates a Blocked By condition.",
        "If a predecessor finishes after this item's explicit Start / Activity Date, the dashboard can show a Dependency Conflict.",
        "A predecessor finishing on the same day this item starts is allowed."
      ],
      howTo:"add-predecessor"
    },

    "start-date":{
      title:"Start / Activity Date",
      text:"Sets the explicit planned date when work is expected to begin.",
      options:[
        "Enter a date when the Task or Site activity has a known planned start.",
        "Leaving the field blank allows the schedule/Gantt to position the item without creating a hard start-date conflict.",
        "This date is compared with predecessor Target Dates when checking for Dependency Conflicts.",
        "It is different from Target Date, which represents when the work should be complete."
      ]
    },

    "target-date":{
      title:"Target Date",
      text:"Sets the planned completion date for the Task, activity, Deliverable, or schedule item.",
      options:[
        "Use this for when the work itself is expected to be finished.",
        "It drives schedule views such as Calendar, Agenda, Gantt, upcoming work, and dependency logic.",
        "For a predecessor, its Target Date is treated as the date that predecessor is expected to finish.",
        "Do not use Target Date simply to duplicate Required By or Needed By — those describe when information or another requirement is needed."
      ]
    },

    "required-by":{
      title:"Required By",
      text:"Identifies when something needed by this Task must be available.",
      options:[
        "Use it for an approval, answer, drawing, decision, material, or other prerequisite needed before the Task can continue.",
        "This date should represent when the requirement is needed, not necessarily when the Task itself will be complete.",
        "Required By should normally be on or before the Task Target Date."
      ]
    },

    "needed-by":{
      title:"Needed By",
      text:"Identifies when requested information must be received so dependent work can continue.",
      options:[
        "Use this for the actual deadline for the requested information.",
        "The date should reflect when AHT needs the information, not when the overall project item is expected to finish.",
        "This date helps Information Required items appear in upcoming work and project status reporting."
      ]
    },

    "project-task-type":{
      title:"Task Type",
      text:"Describes what kind of Project Plan item you are creating.",
      options:[
        "Task — normal project work or an action that needs to be completed.",
        "Review — work whose primary purpose is reviewing, checking, or approving something.",
        "Decision — a decision or direction that must be made before work can progress.",
        "Coordination — work centered on coordination between people, trades, consultants, or teams.",
        "Milestone — a significant approval, release, turnover, completion point, or other major project date rather than normal duration-based work.",
        "Task Type describes what the item is. Higher-Level Task and Predecessor control its relationships to other work."
      ],
      howTo:"create-milestone"
    },

    "site-item-type":{
      title:"Item Type",
      text:"Describes what kind of Site Operations schedule item you are creating.",
      options:[
        "Task — normal field or site work that may have duration, progress, a start date, and a target date.",
        "Milestone — a significant inspection, release, turnover, completion point, or other major site date.",
        "Milestones can also be shown At Risk when upstream schedule relationships contain conflicts."
      ],
      howTo:"create-milestone"
    },

    "waiting-on":{
      title:"Waiting On",
      text:"Identifies the person, trade, consultant, or other party whose action is currently needed before the Task can advance.",
      options:[
        "Not Waiting On Anyone — the Task is not currently dependent on another person's response or action.",
        "Select a person or contact — that party is currently holding the next required action.",
        "Waiting On is different from Owner / Responsible. The Owner remains accountable for managing and advancing the Task even while waiting on someone else."
      ]
    }
  };


  let activeFieldHelpButton=null;


  function closeFieldHelp(){
    document
      .getElementById("fieldHelpPopover")
      ?.remove();

    activeFieldHelpButton=null;
  }


  function openFieldHelp(key,button){
    const item=FIELD_HELP[key];
    if(!item)return;

    closeFieldHelp();

    activeFieldHelpButton=button||null;

    const popover=document.createElement("div");
    popover.id="fieldHelpPopover";
    popover.className="field-help-popover";
    popover.setAttribute("role","dialog");
    popover.setAttribute(
      "aria-label",
      `${item.title} help`
    );

    popover.innerHTML=`
      <div class="field-help-popover-head">
        <strong>${esc(item.title)}</strong>

        <button
          type="button"
          class="field-help-popover-close"
          aria-label="Close help"
        >
          ×
        </button>
      </div>

      <div class="field-help-popover-text">
        ${esc(item.text)}
      </div>

      ${
        Array.isArray(item.options) &&
        item.options.length
          ? `
            <ul class="field-help-options">
              ${item.options
                .map(option=>`
                  <li>${esc(option)}</li>
                `)
                .join("")}
            </ul>
          `
          : ""
      }

      ${
        item.howTo
          ? `
            <button
              type="button"
              class="field-help-learn-more"
              data-field-help-howto="${esc(item.howTo)}"
            >
              Learn more
            </button>
          `
          : ""
      }
    `;

    document.body.appendChild(popover);

    const rect=
      button?.getBoundingClientRect?.();

    if(rect){
      const width=300;
      const left=Math.min(
        Math.max(
          12,
          rect.left
        ),
        window.innerWidth-width-12
      );

      popover.style.left=`${left}px`;
      popover.style.top=
        `${rect.bottom+window.scrollY+7}px`;
    }

    popover
      .querySelector(
        ".field-help-popover-close"
      )
      ?.addEventListener(
        "click",
        closeFieldHelp
      );

    popover
      .querySelector(
        "[data-field-help-howto]"
      )
      ?.addEventListener(
        "click",
        event=>{
          const id=
            event.currentTarget
              .dataset.fieldHelpHowto;

          closeFieldHelp();

          if(id){
            openHowTo(id);
          }
        }
      );
  }


  function fieldHelpButton(key){
    const item=FIELD_HELP[key];
    if(!item)return null;

    const button=document.createElement("button");

    button.type="button";
    button.className="field-help-button";
    button.textContent="?";

    button.setAttribute(
      "aria-label",
      `Help: ${item.title}`
    );

    button.addEventListener(
      "click",
      event=>{
        event.preventDefault();
        event.stopPropagation();

        openFieldHelp(
          key,
          button
        );
      }
    );

    return button;
  }


  function decorateFieldLabel(
    field,
    key
  ){
    if(!field)return;

    const label=
      field.matches?.("label")
        ? field
        : field.querySelector?.("label");

    if(
      !label ||
      label.querySelector(
        `[data-field-help="${key}"]`
      )
    ){
      return;
    }

    const button=
      fieldHelpButton(key);

    if(!button)return;

    button.dataset.fieldHelp=key;

    const labelText=
      label.querySelector(
        "span"
      );

    if(
      labelText &&
      labelText.children.length===0
    ){
      const wrap=
        document.createElement("span");

      wrap.className=
        "field-help-label-wrap";

      labelText.parentNode.insertBefore(
        wrap,
        labelText
      );

      wrap.appendChild(labelText);
      wrap.appendChild(button);

      return;
    }

    label.appendChild(button);
  }


  function closestField(element){
    return element?.closest?.(
      ".field, label.field, .pte-field"
    ) || element?.parentElement;
  }


  function decorateEditableFieldHelp(){
    /*
     * These controls exist only inside editable forms.
     * Therefore Viewer / External Viewer users never receive
     * these contextual editing hints.
     */

    const projectFields=[
      ["#pteParent","higher-level-task"],
      ["#pteWaitingOn","waiting-on"],
      ["#pteStartDate","start-date"],
      ["#pteTargetDate","target-date"],
      ["#pteRequiredBy","required-by"],
      ["#ptePredecessor","predecessor"],
      ["#pteItemType","project-task-type"]
    ];

    projectFields.forEach(
      ([selector,key])=>{
        const control=
          document.querySelector(selector);

        if(control){
          decorateFieldLabel(
            closestField(control),
            key
          );
        }
      }
    );


    const siteFields=[
      [
        '[name="parentOperationId"]',
        "higher-level-task"
      ],
      [
        '[name="activityDate"]',
        "start-date"
      ],
      [
        '[name="targetDate"]',
        "target-date"
      ],
      [
        '[name="itemType"]',
        "site-item-type"
      ]
    ];

    siteFields.forEach(
      ([selector,key])=>{
        const controls=
          document.querySelectorAll(
            selector
          );

        controls.forEach(control=>{
          const form=
            control.closest(
              "form"
            );

          if(
            form &&
            (
              form.closest(
                ".so-modal, .so-dialog, .modal"
              ) ||
              form.querySelector(
                '[name="predecessorIds"]'
              )
            )
          ){
            decorateFieldLabel(
              closestField(control),
              key
            );
          }
        });
      }
    );


    const sitePredecessor=
      document.querySelector(
        'input[name="predecessorIds"]'
      );

    if(sitePredecessor){
      let field=
        sitePredecessor.closest(
          ".field"
        );

      if(!field){
        let node=
          sitePredecessor.parentElement;

        while(
          node &&
          node!==document.body
        ){
          if(
            /Predecessor/i.test(
              node.textContent||""
            )
          ){
            field=node;
            break;
          }

          node=node.parentElement;
        }
      }

      if(field){
        decorateFieldLabel(
          field,
          "predecessor"
        );
      }
    }


    /*
     * Information Required uses the shared dashboard edit modal.
     * Limit this specifically to the Information Request form by
     * requiring the unique item/from/neededBy combination.
     */
    const infoNeededBy=
      document.querySelector(
        '#editForm [name="neededBy"]'
      );

    if(
      infoNeededBy &&
      document.querySelector(
        '#editForm [name="item"]'
      ) &&
      document.querySelector(
        '#editForm [name="from"]'
      )
    ){
      decorateFieldLabel(
        closestField(infoNeededBy),
        "needed-by"
      );
    }
  }


  let fieldHelpObserver=null;

  function startFieldHelpObserver(){
    decorateEditableFieldHelp();

    if(fieldHelpObserver)return;

    fieldHelpObserver=
      new MutationObserver(()=>{
        decorateEditableFieldHelp();

        const popover=
          document.getElementById(
            "fieldHelpPopover"
          );

        if(!popover)return;

        const anchor=
          activeFieldHelpButton;

        if(
          !anchor ||
          !anchor.isConnected ||
          anchor.offsetParent===null
        ){
          closeFieldHelp();
        }
      });

    fieldHelpObserver.observe(
      document.body,
      {
        childList:true,
        subtree:true,
        attributes:true,
        attributeFilter:[
          "class",
          "style",
          "hidden"
        ]
      }
    );
  }


  function init(){
    startFieldHelpObserver();

    document.addEventListener(
      "click",
      event=>{
        const popover=
          document.getElementById(
            "fieldHelpPopover"
          );

        if(!popover)return;

        if(
          popover.contains(event.target) ||
          event.target.closest?.(
            ".field-help-button"
          )
        ){
          return;
        }

        closeFieldHelp();
      },
      true
    );

    document.getElementById("sidebarHelpBtn")
      ?.addEventListener("click",()=>open("guide"));

    document.getElementById("adminAccessRequestBtn")
      ?.addEventListener("click",()=>open("access"));

    document.getElementById("closeHelpCenterBtn")
      ?.addEventListener("click",close);

    document.getElementById("closeHelpTopicBtn")
      ?.addEventListener("click",closeTopic);

    document.querySelectorAll("[data-help-tab]")
      .forEach(button=>
        button.addEventListener(
          "click",
          ()=>setTab(button.dataset.helpTab)
        )
      );

    document.getElementById("helpCenterBackdrop")
      ?.addEventListener("click",event=>{
        if(event.target===event.currentTarget){
          close();
        }
      });

    document.getElementById("helpTopicBackdrop")
      ?.addEventListener("click",event=>{
        if(event.target===event.currentTarget){
          closeTopic();
        }
      });

    document.addEventListener("keydown",event=>{
      if(event.key!=="Escape")return;

      if(
        document.getElementById(
          "fieldHelpPopover"
        )
      ){
        closeFieldHelp();
        return;
      }

      const topic=
        document.getElementById("helpTopicBackdrop");

      if(topic?.style.display==="flex"){
        closeTopic();
        return;
      }

      const center=
        document.getElementById("helpCenterBackdrop");

      if(center?.style.display==="flex"){
        close();
      }
    });
  }

  window.HelpCenter={
    openHowTo,
    open,
    close,
    setTab,
    openTopic,
    closeTopic,
    openFieldHelp,
    decorateEditableFieldHelp,
    topics:HELP_TOPICS
  };

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",init);
  }else{
    init();
  }
})();
