/*
 * Project Work prototype UI
 *
 * Local-only visual proof of the recursive ProjectWorkItems engine.
 * No SharePoint reads/writes occur here.
 */

const ProjectWorkView = (() => {
  let currentWorkItemId = null;
  let seededProjectKey = null;
  let projectWorkMode = "hierarchy";
  let actionDisplayMode = "list";
  const expandedActionGroups = new Set();
  let actionWaitingOnFilter = "all";
  let actionPriorityFilter = "all";
  const skippedDateReviewIds = new Set();
  let deliveryPhaseFilter = "all";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function projectKey() {
    const project = typeof currentProject === "function"
      ? currentProject()
      : null;

    if (!project) return "";

    return String(project.id || project.sharePointId || "");
  }

  function configuredDeliveryPhases() {
    const project =
      typeof currentProject === "function"
        ? currentProject()
        : null;

    return Array.isArray(project?.deliveryPhases)
      ? project.deliveryPhases
          .map(value => String(value || "").trim())
          .filter(Boolean)
      : [];
  }

  function deliveryPhaseFilterOptions(roots = []) {
    const configured = configuredDeliveryPhases();

    const discovered = roots
      .map(item => String(item.phase || "").trim())
      .filter(Boolean);

    const phases = [
      ...new Set([
        ...configured,
        ...discovered
      ])
    ];

    const hasUnassigned =
      roots.some(item => !String(item.phase || "").trim());

    return {
      phases,
      hasUnassigned
    };
  }

  function rootMatchesDeliveryPhase(item) {
    if (deliveryPhaseFilter === "all") {
      return true;
    }

    const phase = String(item?.phase || "").trim();

    if (deliveryPhaseFilter === "__unassigned__") {
      return !phase;
    }

    return phase === deliveryPhaseFilter;
  }

  function setDeliveryPhaseFilter(value) {
    deliveryPhaseFilter =
      String(value || "all");

    currentWorkItemId = null;
    render();
  }

  function dateLabel(value) {
    if (!value) return "—";

    const date = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(String(value))
        ? `${value}T12:00:00`
        : value
    );

    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });
  }

  function progressBar(value) {
    const pct = value == null
      ? 0
      : Math.max(0, Math.min(100, Math.round(Number(value))));

    return `
      <div class="pw-progress">
        <div class="pw-progress-track">
          <span style="width:${pct}%"></span>
        </div>
        <strong>${pct}%</strong>
      </div>
    `;
  }

  function seedPrototypeData() {
    const key = projectKey();

    if (!key) return;

    /*
     * Seed prototype data only when this project truly has no Project Plan
     * records yet. Existing locally saved Tasks/Subtasks must survive reloads.
     */
    const existingProjectItems =
      ProjectWorkItems.getItems().some(item =>
        String(item.projectId ?? "") === key ||
        (
          Number(item.projectSharePointId || 0) > 0 &&
          Number(item.projectSharePointId) ===
            Number(
              typeof currentProject === "function"
                ? currentProject()?.sharePointId || 0
                : 0
            )
        )
      );

    if (existingProjectItems) {
      seededProjectKey = key;
      return;
    }

    seededProjectKey = key;
    currentWorkItemId = null;

    ProjectWorkItems.setProjectItems(key, [
      {
        id: `${key}-engineering`,
        projectId: key,
        title: "Engineering & Design",
        itemType: "Workstream",
        workstream: "Engineering & Design",
        progressWeight: 5,
        sortOrder: 10
      },

      {
        id: `${key}-speaker`,
        projectId: key,
        parentWorkItemId: `${key}-engineering`,
        title: "Speaker Design",
        itemType: "Deliverable",
        workstream: "Engineering & Design",
        system: "Audio",
        owner: "AHT",
        status: "In Progress",
        startDate: "2026-09-14",
        targetDate: "2026-10-08",
        progressWeight: 5,
        sortOrder: 10
      },

      {
        id: `${key}-speaker-layout`,
        projectId: key,
        parentWorkItemId: `${key}-speaker`,
        title: "Preliminary Speaker Layout",
        itemType: "Task",
        owner: "AHT",
        status: "Complete",
        startDate: "2026-09-14",
        targetDate: "2026-09-18",
        percentComplete: 100,
        progressWeight: 3,
        sortOrder: 10
      },

      {
        id: `${key}-speaker-review`,
        projectId: key,
        parentWorkItemId: `${key}-speaker`,
        title: "Consultant Review",
        itemType: "Task Group",
        owner: "Russell Edwards",
        status: "Awaiting Review",
        waitingOn: "Russell Edwards",
        informationRequired: "Review revised speaker locations and return comments.",
        requiredBy: "2026-09-23",
        startDate: "2026-09-18",
        targetDate: "2026-09-25",
        progressWeight: 2,
        sortOrder: 20
      },

      {
        id: `${key}-speaker-send`,
        projectId: key,
        parentWorkItemId: `${key}-speaker-review`,
        title: "Send Revised Speaker Markup",
        owner: "AHT",
        status: "Complete",
        targetDate: "2026-09-18",
        percentComplete: 100,
        progressWeight: 1,
        sortOrder: 10
      },

      {
        id: `${key}-speaker-comments`,
        projectId: key,
        parentWorkItemId: `${key}-speaker-review`,
        title: "Receive Consultant Comments",
        owner: "Russell Edwards",
        status: "Waiting",
        waitingOn: "Russell Edwards",
        informationRequired: "Speaker layout review and comments.",
        requiredBy: "2026-09-23",
        targetDate: "2026-09-23",
        percentComplete: 0,
        progressWeight: 1,
        sortOrder: 20
      },

      {
        id: `${key}-speaker-resolve`,
        projectId: key,
        parentWorkItemId: `${key}-speaker-review`,
        title: "Resolve Review Comments",
        owner: "AHT",
        status: "Not Started",
        predecessorId: `${key}-speaker-comments`,
        targetDate: "2026-09-25",
        percentComplete: 0,
        progressWeight: 1,
        sortOrder: 30
      },

      {
        id: `${key}-speaker-final`,
        projectId: key,
        parentWorkItemId: `${key}-speaker`,
        title: "Final Speaker Drawing Issue",
        owner: "AHT",
        status: "Not Started",
        predecessorId: `${key}-speaker-review`,
        targetDate: "2026-10-08",
        percentComplete: 0,
        progressWeight: 2,
        sortOrder: 30
      },

      {
        id: `${key}-pir`,
        projectId: key,
        parentWorkItemId: `${key}-engineering`,
        title: "KP / PIR Design",
        itemType: "Deliverable",
        workstream: "Engineering & Design",
        system: "Lighting Controls",
        owner: "AHT",
        status: "In Progress",
        startDate: "2026-09-10",
        targetDate: "2026-10-08",
        percentComplete: 75,
        progressWeight: 4,
        sortOrder: 20
      },

      {
        id: `${key}-access`,
        projectId: key,
        parentWorkItemId: `${key}-engineering`,
        title: "Access Control Design",
        itemType: "Deliverable",
        workstream: "Engineering & Design",
        system: "Access Control",
        owner: "AHT",
        status: "In Progress",
        startDate: "2026-09-12",
        targetDate: "2026-10-08",
        percentComplete: 60,
        progressWeight: 4,
        sortOrder: 30
      },

      {
        id: `${key}-cctv`,
        projectId: key,
        parentWorkItemId: `${key}-engineering`,
        title: "CCTV / LiDAR Design",
        itemType: "Deliverable",
        workstream: "Engineering & Design",
        system: "Security",
        owner: "AHT",
        status: "In Progress",
        waitingOn: "Landscape / Builder",
        informationRequired: "Landscape and fence information required to finalize CCTV / LiDAR coverage and device locations.",
        startDate: "2026-09-18",
        targetDate: "2026-10-08",
        percentComplete: 20,
        progressWeight: 4,
        sortOrder: 40
      },

      {
        id: `${key}-power`,
        projectId: key,
        parentWorkItemId: `${key}-engineering`,
        title: "Technical Power Plan",
        itemType: "Deliverable",
        workstream: "Engineering & Design",
        system: "Technical Power",
        owner: "AHT",
        status: "Waiting",
        waitingOn: "AHT / Project Team",
        informationRequired: "Final system loads, lighting/shade quantities and centralized equipment requirements.",
        requiredBy: "2026-09-30",
        targetDate: "2026-10-08",
        percentComplete: 10,
        progressWeight: 5,
        sortOrder: 50
      },

      {
        id: `${key}-external`,
        projectId: key,
        title: "External Coordination",
        itemType: "Workstream",
        workstream: "Coordination",
        progressWeight: 2,
        sortOrder: 20
      },

      {
        id: `${key}-aquatics`,
        projectId: key,
        parentWorkItemId: `${key}-external`,
        title: "Martin Aquatics Drawings",
        itemType: "Dependency",
        owner: "External",
        status: "Waiting",
        waitingOn: "Martin Aquatics",
        informationRequired: "Current aquatics drawings required for auxiliary building coordination.",
        requiredBy: "2026-09-23",
        targetDate: "2026-09-23",
        percentComplete: 0,
        progressWeight: 1,
        sortOrder: 10
      }
    ]);
  }

  function itemSecondaryText(item) {
    const parts = [];

    if (item.itemType) parts.push(item.itemType);
    if (item.phase) parts.push(item.phase);
    if (item.system) parts.push(item.system);

    const children = ProjectWorkItems.childrenOf(item.id);

    if (children.length) {
      parts.push(
        `${children.length} subtask${children.length === 1 ? "" : "s"}`
      );
    }

    return parts.join(" · ");
  }

  function workItemRow(item, options = {}) {
    const buildingPending = ProjectWorkItems.isUnscopedBuilding(item);
    const progress = buildingPending
      ? null
      : ProjectWorkItems.displayedProgress(item.id);
    const children = ProjectWorkItems.childrenOf(item.id);

    const showWarning = Boolean(options.showWarning);
    const warning = showWarning
      ? warningLabel(item)
      : "";

    const warningDetail =
      warning
        ? warningReason(item)
        : "";

    return `
      <div
        class="pw-row pw-row-clickable${buildingPending ? " pw-building-row" : ""}"
        role="button"
        tabindex="0"
        data-project-work-item-id="${escapeHtml(item.id)}"
      >
        <div class="pw-title">
          <strong>${escapeHtml(item.title)}</strong>
          <div class="small">${buildingPending
            ? "Building · Architectural plans pending · No tasks assigned"
            : escapeHtml(itemSecondaryText(item))}</div>
        </div>

        ${buildingPending
          ? '<span class="pw-building-no-progress">Not scoped</span>'
          : progress == null
            ? '<span class="pw-building-no-progress">—</span>'
            : progressBar(progress)}

        <div class="pw-status pw-status-with-warning">
          <span>${buildingPending
            ? '<span class="pw-building-label aht-status-pill aht-status--neutral">Awaiting plans</span>'
            : AHTStatusUI.badge(item.status || "—", escapeHtml)}</span>

          ${
            warning
              ? `
                <span class="pw-warning-inline ${warningClass(item)} ${AHTStatusUI.classFor(warningLabel(item))}">
                  ${escapeHtml(warning)}
                </span>

                ${
                  warningDetail
                    ? `
                      <div class="small pw-warning-reason">
                        ${escapeHtml(warningDetail)}
                      </div>
                    `
                    : ""
                }
              `
              : ""
          }
        </div>

        <div class="pw-meta pw-owner">
          ${escapeHtml(item.owner || "—")}
        </div>

        <div class="pw-meta pw-target">
          ${item.scheduleMode ? escapeHtml(AHTScheduling.dateLabel(item)) : dateLabel(item.targetDate)}
        </div>

        <div
          class="pw-open"
          aria-hidden="true"
          title="${children.length ? "Open subtasks" : "View details"}"
        >›</div>
      </div>
    `;
  }

  function renderBreadcrumb() {
    const root = document.getElementById("projectWorkBreadcrumb");
    if (!root) return;

    if (currentWorkItemId == null) {
      root.innerHTML = `<strong>Project Plan</strong>`;
      return;
    }

    const path = ProjectWorkItems.pathFor(currentWorkItemId);

    root.innerHTML = `
      <button type="button" onclick="ProjectWorkView.openOverview()">
        Project Plan
      </button>
      ${path.map((item, index) => `
        <span>›</span>
        ${
          index === path.length - 1
            ? `<strong>${escapeHtml(item.title)}</strong>`
            : `<button type="button" onclick="ProjectWorkView.openItem('${String(item.id).replaceAll("'", "\\'")}')">${escapeHtml(item.title)}</button>`
        }
      `).join("")}
    `;
  }

  function projectPlanToday() {
    const now = new Date();

    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
  }

  function projectPlanDate(value) {
    if (!value) return null;

    const match = String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

    if (!match) return null;

    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  function daysUntil(value) {
    const date = projectPlanDate(value);

    if (!date) return null;

    return Math.round(
      (date.getTime() - projectPlanToday().getTime()) /
      86400000
    );
  }

  function taskIsComplete(item) {
    return Boolean(
      item &&
      (
        String(item.status || "") === "Complete" ||
        ProjectWorkItems.displayedProgress(item.id) >= 100
      )
    );
  }

  function predecessorIdsFor(item) {
    const ids =
      (
        Array.isArray(
          item?.predecessorIds
        ) &&
        item.predecessorIds.length
      )
        ? item.predecessorIds
        : (
            item?.predecessorId
              ? [item.predecessorId]
              : []
          );

    return [
      ...new Set(
        ids
          .map(id => String(id))
          .filter(Boolean)
      )
    ];
  }

  function predecessorsFor(item) {
    return predecessorIdsFor(item)
      .map(id =>
        ProjectWorkItems.getItem(id)
      )
      .filter(Boolean);
  }

  function incompletePredecessorsFor(item) {
    return predecessorsFor(item)
      .filter(predecessor =>
        !taskIsComplete(predecessor)
      );
  }

  /*
   * Reverse dependency lookup.
   *
   * These are Project Plan relationships only. Site Operations remain
   * a separate source and are not mixed into Project Plan predecessors.
   */
  function dependentsFor(item) {
    if (!item?.id) {
      return [];
    }

    const itemId = String(item.id);
    const projectId = String(item.projectId ?? "");
    const projectSharePointId =
      String(item.projectSharePointId ?? "");

    return ProjectWorkItems.getItems()
      .filter(candidate => {
        if (
          !candidate ||
          candidate.archived ||
          String(candidate.id) === itemId
        ) {
          return false;
        }

        const sameProject =
          (
            projectId &&
            String(candidate.projectId ?? "") === projectId
          ) ||
          (
            projectSharePointId &&
            String(candidate.projectSharePointId ?? "") ===
              projectSharePointId
          );

        return (
          sameProject &&
          predecessorIdsFor(candidate)
            .some(id => String(id) === itemId)
        );
      });
  }

  function incompleteDependentsFor(item) {
    return dependentsFor(item)
      .filter(dependent =>
        !taskIsComplete(dependent)
      );
  }

  function predecessorIncomplete(item) {
    return (
      incompletePredecessorsFor(item)
        .length > 0
    );
  }

  function predecessorDueDate(item) {
    return (
      item?.targetDate ||
      item?.requiredBy ||
      ""
    );
  }

  function dependencyStateFor(item) {
    const predecessors =
      predecessorsFor(item);

    if (!predecessors.length) {
      return {
        hasPredecessors: false,
        incomplete: [],
        overdue: [],
        dueToday: [],
        ready: false,
        label: "",
        detail: ""
      };
    }

    const incomplete =
      incompletePredecessorsFor(item);

    const overdue =
      incomplete.filter(predecessor => {
        const days =
          daysUntil(
            predecessorDueDate(
              predecessor
            )
          );

        return (
          days !== null &&
          days < 0
        );
      });

    const dueToday =
      incomplete.filter(predecessor => {
        const days =
          daysUntil(
            predecessorDueDate(
              predecessor
            )
          );

        return days === 0;
      });

    const ready =
      incomplete.length === 0;

    let label = "";
    let detail = "";

    if (ready) {
      label =
        "Ready to Start";

      detail =
        "All predecessor Tasks are complete.";
    } else {
      label =
        `Blocked by ${incomplete.length} ${
          incomplete.length === 1
            ? "Task"
            : "Tasks"
        }`;

      const parts = [];

      if (overdue.length) {
        parts.push(
          `${overdue.length} predecessor${
            overdue.length === 1
              ? ""
              : "s"
          } overdue`
        );
      }

      if (dueToday.length) {
        parts.push(
          `${dueToday.length} predecessor${
            dueToday.length === 1
              ? ""
              : "s"
          } due today`
        );
      }

      detail =
        parts.length
          ? parts.join(" · ")
          : "Waiting for predecessor Tasks to be completed.";
    }

    return {
      hasPredecessors: true,
      incomplete,
      overdue,
      dueToday,
      ready,
      label,
      detail
    };
  }

  function actionDueDate(item) {
    if (["TBD", "Floating"].includes(item?.scheduleMode) && !item?.targetDate) {
      return item?.requiredBy || "";
    }
    return item?.requiredBy || item?.targetDate || "";
  }

  function scheduleReviewNeeded(item) {
    if (!item || taskIsComplete(item)) return false;
    const mode = item.scheduleMode || "";
    const watchDate = mode === "Tentative"
      ? item.targetDate
      : (mode === "TBD" || (mode === "Floating" && !item.scheduleTriggerDate)) ? item.scheduleReviewDate : "";
    const days = daysUntil(watchDate);
    return days !== null && days < 0;
  }

  /*
   * Base warning evaluates the task itself only.
   * Parent roll-up is handled separately so we do not recurse.
   */
  function baseWarningState(item) {
    if (ProjectWorkItems.isUnscopedBuilding(item)) return "on-track";
    if (!item || item.archived || taskIsComplete(item)) {
      return "on-track";
    }

    if (scheduleReviewNeeded(item)) return "review-needed";

    const dueIn =
      daysUntil(actionDueDate(item));

    const dependencyState =
      dependencyStateFor(item);

    const downstreamCount =
      incompleteDependentsFor(item).length;

    const dependencyPressure = Boolean(
      item.waitingOn ||
      item.blockerDependency ||
      dependencyState.incomplete.length ||
      String(item.status || "") === "Waiting" ||
      String(item.status || "") === "Awaiting Review" ||
      String(item.status || "") === "Blocked"
    );

    /*
     * The task itself has already missed its required/target date.
     */
    if (dueIn !== null && dueIn < 0) {
      return item.scheduleMode === "Tentative" ? "review-needed" : "overdue";
    }

    /*
     * An overdue predecessor creates earlier schedule pressure.
     * Use a 14-day look-ahead so we can surface the threat before
     * the downstream task reaches the normal 7-day warning window.
     */
    if (
      dependencyState.overdue.length &&
      (
        dueIn === null ||
        dueIn <= 14
      )
    ) {
      return "at-risk";
    }

    /*
     * Inside the normal 7-day warning window, either an unresolved
     * dependency or downstream work relying on this task raises the
     * condition from Due Soon to At Risk.
     */
    if (
      dueIn !== null &&
      dueIn <= 7 &&
      (
        dependencyPressure ||
        downstreamCount > 0
      )
    ) {
      return "at-risk";
    }

    if (
      dueIn !== null &&
      dueIn <= 7
    ) {
      return "due-soon";
    }

    return "on-track";
  }

  function warningState(item) {
    if (item?.__actionState) {
      return item.__actionState;
    }

    const ownState =
      baseWarningState(item);

    if (ownState !== "on-track") {
      return ownState;
    }

    if (!item || taskIsComplete(item)) {
      return "on-track";
    }

    const descendants =
      ProjectWorkItems.descendantsOf(item.id);

    const descendantThreat =
      descendants.some(descendant => {
        const state =
          baseWarningState(descendant);

        return (
          state === "overdue" ||
          state === "at-risk"
        );
      });

    return descendantThreat
      ? "parent-at-risk"
      : "on-track";
  }

  function warningLabel(item) {
    switch (warningState(item)) {
      case "review-needed":
        return "Schedule Review Needed";
      case "overdue":
        return "Overdue";

      case "at-risk":
        return "At Risk";

      case "due-soon":
        return "Due Soon";

      case "parent-at-risk":
        return "At Risk";

      default:
        return "";
    }
  }

  function warningClass(item) {
    return `pw-warning-${warningState(item)}`;
  }

  function warningReason(item) {
    if (!item || taskIsComplete(item)) {
      return "";
    }

    const state =
      warningState(item);

    const dueIn =
      daysUntil(actionDueDate(item));

    const dependencyState =
      dependencyStateFor(item);

    const downstreamCount =
      incompleteDependentsFor(item).length;

    if (state === "review-needed") {
      return item.scheduleMode === "Tentative"
        ? "Estimated date passed — reconfirm schedule"
        : "Schedule review date passed — set or confirm next date";
    }

    if (state === "overdue") {
      const daysLate =
        dueIn !== null
          ? Math.abs(dueIn)
          : null;

      return daysLate !== null
        ? `Target passed ${daysLate} ${daysLate === 1 ? "day" : "days"} ago`
        : "Target date has passed";
    }

    if (state === "at-risk") {
      if (dependencyState.overdue.length) {
        const count =
          dependencyState.overdue.length;

        const parts = [
          `${count} overdue predecessor${count === 1 ? "" : "s"}`
        ];

        if (dueIn !== null && dueIn >= 0) {
          parts.push(
            `${dueIn} ${dueIn === 1 ? "day" : "days"} to target`
          );
        }

        return parts.join(" · ");
      }

      if (dependencyState.incomplete.length) {
        const count =
          dependencyState.incomplete.length;

        return (
          `Waiting on ${count} predecessor ` +
          `${count === 1 ? "Task" : "Tasks"}`
        );
      }

      if (downstreamCount > 0) {
        return (
          `Blocks ${downstreamCount} dependent ` +
          `${downstreamCount === 1 ? "Task" : "Tasks"}`
        );
      }

      if (item.waitingOn) {
        return `Waiting on ${item.waitingOn}`;
      }

      if (item.blockerDependency) {
        return String(item.blockerDependency);
      }

      if (dueIn !== null && dueIn >= 0) {
        return (
          `${dueIn} ${dueIn === 1 ? "day" : "days"} to target`
        );
      }

      return "Schedule pressure";
    }

    if (state === "due-soon") {
      if (dueIn === 0) {
        return "Due today";
      }

      if (dueIn !== null) {
        return (
          `${dueIn} ${dueIn === 1 ? "day" : "days"} to target`
        );
      }
    }

    if (state === "parent-at-risk") {
      return "Subtask schedule requires attention";
    }

    return "";
  }

  function warningRank(item) {
    switch (warningState(item)) {
      case "review-needed":
        return 1;
      case "overdue":
        return 1;

      case "at-risk":
        return 2;

      case "parent-at-risk":
        return 3;

      case "due-soon":
        return 4;

      default:
        return 5;
    }
  }

  function isActionableItem(item) {
    if (ProjectWorkItems.isUnscopedBuilding(item)) return false;
    if (!item || item.archived || taskIsComplete(item)) {
      return false;
    }

    const status = String(item.status || "");
    const warning = warningState(item);

    return Boolean(
      item.waitingOn ||
      item.informationRequired ||
      item.blockerDependency ||
      predecessorIncomplete(item) ||
      status === "Waiting" ||
      status === "Awaiting Review" ||
      status === "Blocked" ||
      warning === "review-needed" ||
      warning === "overdue" ||
      warning === "at-risk" ||
      warning === "due-soon" ||
      warning === "parent-at-risk"
    );
  }

  function actionRequiredItems() {
    const key = projectKey();

    const candidates = ProjectWorkItems.getItems()
      .filter(item =>
        String(item.projectId) === key &&
        isActionableItem(item)
      );

    const filtered = candidates.filter(item => {
      const actionableDescendants =
        ProjectWorkItems
          .descendantsOf(item.id)
          .filter(isActionableItem);

      if (!actionableDescendants.length) {
        return true;
      }

      if (warningState(item) === "parent-at-risk") {
        return true;
      }

      /*
       * When actionable child work exists, the child is normally the
       * real thing somebody needs to act on. Do not also show its parent
       * container unless that parent carries a distinct blocker of its own.
       */
      if (item.blockerDependency) {
        const duplicateBlocker = actionableDescendants.some(
          child =>
            String(child.blockerDependency || "").trim() ===
            String(item.blockerDependency || "").trim()
        );

        return !duplicateBlocker;
      }

      return false;
    });

    return filtered.sort((a, b) => {
      const aDate = String(a.requiredBy || a.targetDate || "9999-12-31");
      const bDate = String(b.requiredBy || b.targetDate || "9999-12-31");

      return (
        warningRank(a) - warningRank(b) ||
        aDate.localeCompare(bDate) ||
        String(a.waitingOn || "").localeCompare(String(b.waitingOn || "")) ||
        String(a.title || "").localeCompare(String(b.title || ""))
      );
    });
  }

  function actionGroupRoot(item) {
    if (!item) return null;

    let current = item;
    let parent = current.parentWorkItemId
      ? ProjectWorkItems.getItem(current.parentWorkItemId)
      : null;

    /*
     * Walk upward until the next parent is the Workstream.
     * That gives us the meaningful top-level Task underneath the
     * Workstream rather than rolling warnings all the way up.
     */
    while (
      parent &&
      String(parent.itemType || "") !== "Workstream"
    ) {
      current = parent;

      parent = current.parentWorkItemId
        ? ProjectWorkItems.getItem(current.parentWorkItemId)
        : null;
    }

    return current;
  }

  function actionSummaryState(members) {
    const states = members.map(item => {
      const state = warningState(item);

      return state === "parent-at-risk"
        ? "at-risk"
        : state;
    });

    if (states.includes("overdue")) {
      return "overdue";
    }

    // A child with a floating/TBD/estimated review must not disappear
    // when the Action Required view groups tasks under a workstream.
    if (states.includes("review-needed")) {
      return "review-needed";
    }

    if (states.includes("at-risk")) {
      return "at-risk";
    }

    if (states.includes("due-soon")) {
      return "due-soon";
    }

    return "on-track";
  }

  // Choose the date driving attention, keeping a schedule review distinct
  // from a real deliverable deadline or Input Needed By commitment.
  function attentionDateInfo(item) {
    const mode = String(item?.scheduleMode || "");
    const state = warningState(item);
    if (state === "review-needed") {
      if (mode === "Tentative" && item.targetDate) {
        return { date: item.targetDate, label: "Estimated date · review" };
      }
      if (["TBD", "Floating"].includes(mode) && item.scheduleReviewDate) {
        return { date: item.scheduleReviewDate, label: "Schedule review" };
      }
    }
    if (item?.requiredBy) return { date: item.requiredBy, label: "Input needed by" };
    if (item?.targetDate) return {
      date: item.targetDate,
      label: mode === "Tentative" ? "Estimated target" : mode === "Floating" ? "Dependent target" : "Target date"
    };
    if (["TBD", "Floating"].includes(mode) && item?.scheduleReviewDate) {
      return { date: item.scheduleReviewDate, label: "Schedule review" };
    }
    return { date: "", label: "No date assigned" };
  }

  function actionGroupDateInfo(members, dependencyDate) {
    const ranked = members
      .map(member => ({ member, ...attentionDateInfo(member) }))
      .filter(entry => entry.date)
      .sort((a, b) => warningRank(a.member) - warningRank(b.member) || a.date.localeCompare(b.date));
    if (ranked.length) return { date: ranked[0].date, label: ranked[0].label };
    return dependencyDate
      ? { date: dependencyDate, label: "Predecessor target" }
      : { date: "", label: "No date assigned" };
  }


  function dependencyRequiredBy(item) {
    const dates =
      incompletePredecessorsFor(item)
        .map(predecessor =>
          predecessor.targetDate ||
          predecessor.requiredBy ||
          ""
        )
        .filter(Boolean)
        .sort();

    return dates[0] || "";
  }

  function actionSummaryItems() {
    const raw = actionRequiredItems();
    const groups = new Map();

    raw.forEach(item => {
      /*
       * Workstreams are organizational containers. They should not
       * become duplicate Action Required cards when useful Tasks
       * underneath them already explain the problem.
       */
      if (String(item.itemType || "") === "Workstream") {
        return;
      }

      const root = actionGroupRoot(item) || item;
      const id = String(root.id);

      if (!groups.has(id)) {
        groups.set(id, {
          root,
          members: []
        });
      }

      const group = groups.get(id);

      if (
        !group.members.some(
          member => String(member.id) === String(item.id)
        )
      ) {
        group.members.push(item);
      }
    });

    const summaries = [...groups.values()].map(group => {
      const root = group.root;
      const members = group.members;

      /*
       * Make sure the root's own actionable condition is represented
       * when it is meaningful in addition to descendant conditions.
       */
      if (
        isActionableItem(root) &&
        !members.some(
          member => String(member.id) === String(root.id)
        )
      ) {
        members.push(root);
      }

      const waitingNames = [...new Set(
        members
          .map(member => String(member.waitingOn || "").trim())
          .filter(Boolean)
      )];

      const dependencyDue =
        dependencyRequiredBy(root);

      const actionDate = actionGroupDateInfo(members, dependencyDue);

      return {
        ...root,

        __actionGrouped: members.some(
          member => String(member.id) !== String(root.id)
        ),

        __actionMembers: members,

        __actionState: actionSummaryState(members),

        __actionDate: actionDate.date,
        __actionDateType: actionDate.label,

        waitingOn:
          waitingNames.length === 1
            ? waitingNames[0]
            : waitingNames.length > 1
              ? "Multiple"
              : root.waitingOn,

        requiredBy:
          dependencyDue ||
          root.requiredBy ||
          ""
      };
    });

    return summaries.sort((a, b) => {
      const aDate = String(
        a.__actionDate ||
        a.requiredBy ||
        a.targetDate ||
        "9999-12-31"
      );

      const bDate = String(
        b.__actionDate ||
        b.requiredBy ||
        b.targetDate ||
        "9999-12-31"
      );

      return (
        warningRank(a) - warningRank(b) ||
        aDate.localeCompare(bDate) ||
        String(a.title || "").localeCompare(
          String(b.title || "")
        )
      );
    });
  }

  function actionAttentionSummary(item) {
    const dependency =
      dependencyStateFor(item);

    if (
      dependency.hasPredecessors &&
      dependency.incomplete.length
    ) {
      const names =
        dependency.incomplete
          .map(predecessor =>
            predecessor.title
          )
          .join(", ");

      return (
        `${dependency.label}: ${names}`
      );
    }

    const members =
      Array.isArray(item?.__actionMembers)
        ? item.__actionMembers
        : [item];

    const descendants = members.filter(
      member =>
        String(member.id) !== String(item.id)
    );

    /*
     * When descendants are driving the warning, summarize those.
     * Otherwise this is a directly actionable Task and we retain its
     * normal "what we need" wording.
     */
    if (!descendants.length) {
      if (warningState(item) === "review-needed") {
        const context = item.informationRequired || item.blockerDependency || "Confirm the current schedule";
        return `Schedule review needed · ${context}`;
      }
      return (
        item.informationRequired ||
        item.blockerDependency ||
        item.title ||
        "Action required"
      );
    }

    const counts = {
      "review-needed": 0,
      overdue: 0,
      "at-risk": 0,
      "due-soon": 0,
      waiting: 0
    };

    descendants.forEach(member => {
      let state = warningState(member);

      if (state === "parent-at-risk") {
        state = "at-risk";
      }

      if (state === "review-needed") {
        counts["review-needed"] += 1;
      } else if (state === "overdue") {
        counts.overdue += 1;
      } else if (state === "at-risk") {
        counts["at-risk"] += 1;
      } else if (state === "due-soon") {
        counts["due-soon"] += 1;
      } else if (
        member.waitingOn ||
        String(member.status || "") === "Waiting" ||
        String(member.status || "") === "Awaiting Review" ||
        String(member.status || "") === "Blocked"
      ) {
        counts.waiting += 1;
      }
    });

    const details = [];

    if (counts["review-needed"]) {
      details.push(`${counts["review-needed"]} schedule review${counts["review-needed"] === 1 ? "" : "s"} needed`);
    }

    if (counts.overdue) {
      details.push(
        `${counts.overdue} overdue`
      );
    }

    if (counts["at-risk"]) {
      details.push(
        `${counts["at-risk"]} at risk`
      );
    }

    if (counts["due-soon"]) {
      details.push(
        `${counts["due-soon"]} due soon`
      );
    }

    if (counts.waiting) {
      details.push(
        `${counts.waiting} waiting`
      );
    }

    const count = descendants.length;

    return (
      `${count} subtask${count === 1 ? "" : "s"} need attention` +
      (
        details.length
          ? ` · ${details.join(" · ")}`
          : ""
      )
    );
  }

  function actionWaitingOnName(item) {
    return String(
      item.waitingOn ||
      item.owner ||
      "Unassigned"
    ).trim() || "Unassigned";
  }

  function actionWaitingOnOptions() {
    return [...new Set(
      actionSummaryItems().map(actionWaitingOnName)
    )].sort((a, b) => a.localeCompare(b));
  }

  // Quick filters operate on actual underlying actionable items, not just the
  // single (sometimes inherited) status shown on a workstream summary.
  // Counts therefore describe individual actions; the UI also shows group count.
  function actionFilterCandidates(item) {
    const members = Array.isArray(item?.__actionMembers)
      ? item.__actionMembers
      : [item];
    const grouped = members.some(member => String(member.id) !== String(item.id));
    if (!grouped) return members;

    return members.filter(member => {
      if (String(member.id) !== String(item.id)) return true;
      // An inherited parent-at-risk rollup is not another actionable task.
      // Retain the parent when it carries its own dated or blocking obligation.
      return Boolean(member.targetDate || member.requiredBy || member.waitingOn ||
        member.informationRequired || member.blockerDependency ||
        ["Waiting", "Awaiting Review", "Blocked"].includes(String(member.status || "")));
    });
  }

  function matchesActionPriority(item, priority) {
    if (priority === "all") return true;
    const warning = warningState(item);
    if (priority === "overdue") return warning === "overdue";
    if (priority === "review") return warning === "review-needed";
    if (priority === "risk") return warning === "at-risk" || warning === "parent-at-risk";
    if (priority === "unclassified") return actionDateTypeUnclassified(item);
    if (priority === "waiting") {
      return Boolean(item.waitingOn || item.informationRequired || item.blockerDependency ||
        predecessorIncomplete(item) ||
        ["Waiting", "Awaiting Review", "Blocked"].includes(String(item.status || "")));
    }
    return false;
  }

  function actionPriorityCounts(records) {
    const all = new Map();
    records.forEach(group => actionFilterCandidates(group).forEach(item => all.set(String(item.id),item)));
    const items = [...all.values()];
    return Object.fromEntries(["all", "overdue", "review", "risk", "waiting", "unclassified"]
      .map(type => [type, items.filter(item => matchesActionPriority(item,type)).length]));
  }

  function visibleActionRequiredItems() {
    const records = actionSummaryItems().filter(item =>
      actionWaitingOnFilter === "all" || actionWaitingOnName(item) === actionWaitingOnFilter
    );

    if (actionPriorityFilter === "all") return records;

    return records.map(group => {
      const matching = actionFilterCandidates(group)
        .filter(item => matchesActionPriority(item,actionPriorityFilter));
      if (!matching.length) return null;
      const dateInfo = actionGroupDateInfo(matching, "");
      return {
        ...group,
        __actionMembers: matching,
        __actionGrouped: matching.some(item => String(item.id) !== String(group.id)),
        __actionState: actionSummaryState(matching),
        __actionDate: dateInfo.date,
        __actionDateType: dateInfo.label
      };
    }).filter(Boolean).sort((a,b) =>
      warningRank(a) - warningRank(b) ||
      String(a.__actionDate || "9999-12-31").localeCompare(String(b.__actionDate || "9999-12-31")) ||
      String(a.title || "").localeCompare(String(b.title || ""))
    );
  }

  // Historical target dates stay unclassified until the PM confirms them.
  // Queue only actionable records in the current project and Waiting On filter;
  // the same underlying work item may appear in multiple parent summaries.
  function unclassifiedDateReviewQueue() {
    const seen = new Map();
    actionSummaryItems()
      .filter(group => actionWaitingOnFilter === "all" || actionWaitingOnName(group) === actionWaitingOnFilter)
      .forEach(group => actionFilterCandidates(group).forEach(item => {
        if (actionDateTypeUnclassified(item) && !item.archived && !skippedDateReviewIds.has(String(item.id))) {
          seen.set(String(item.id), item);
        }
      }));
    return [...seen.values()].sort((a,b) =>
      String(a.targetDate || "9999-12-31").localeCompare(String(b.targetDate || "9999-12-31")) ||
      String(a.title || "").localeCompare(String(b.title || ""))
    );
  }

  function dateReviewQueueCount() {
    return unclassifiedDateReviewQueue().length;
  }

  function dateReviewSkippedCount() {
    return skippedDateReviewIds.size;
  }

  function startDateReviewQueue() {
    // A fresh pass includes every remaining unclassified date; skipped tasks are
    // never written to SharePoint and return the next time the PM starts.
    skippedDateReviewIds.clear();
    return reviewNextUnclassifiedDate();
  }

  function skipUnclassifiedDate(id) {
    const record = ProjectWorkItems.getItem(id);
    if (!record || !actionDateTypeUnclassified(record) || record.archived || taskIsComplete(record)) return null;
    skippedDateReviewIds.add(String(record.id));
    const nextId = reviewNextUnclassifiedDate();
    if (!nextId) {
      render();
      window.alert?.(`Review pass finished. ${skippedDateReviewIds.size} task${skippedDateReviewIds.size === 1 ? "" : "s"} skipped without any changes. Select Review dates one by one to revisit them.`);
    }
    return nextId;
  }

  function reviewNextUnclassifiedDate(excludeId = "") {
    const next = unclassifiedDateReviewQueue().find(item => String(item.id) !== String(excludeId));
    if (!next) return null;
    reviewDateType(next.id);
    return next.id;
  }

  function actionPriorityControls(records) {
    const counts = actionPriorityCounts(records);
    const options = [
      ["all", "All actions"],
      ["overdue", "Overdue"],
      ["review", "Schedule Review"],
      ["risk", "At Risk"],
      ["waiting", "Waiting / Blocked"],
      ["unclassified", "Date Type Not Set"]
    ];
    return `<div class="pw-action-priority-bar" role="group" aria-label="Filter action items by urgency">
      ${options.map(([value,label]) => `<button type="button"
         class="pw-action-priority-btn ${actionPriorityFilter === value ? "active" : ""}"
         aria-pressed="${actionPriorityFilter === value}"
         onclick="ProjectWorkView.setActionPriorityFilter('${value}')">
         ${escapeHtml(label)} <span class="pw-action-priority-count">${counts[value]}</span>
       </button>`).join("")}
      ${actionPriorityFilter === "unclassified" && counts.unclassified > 0 ? `
        <button type="button" class="pw-date-review-start"
          onclick="ProjectWorkView.startDateReviewQueue()">
          Review dates one by one →
        </button>` : ""}
    </div>`;
  }

  function actionWaitingOnFilterControl() {
    const options = actionWaitingOnOptions();

    return `
      <div class="pw-action-filter-control">
        <span>Waiting On</span>

        <select
          onchange="ProjectWorkView.setActionWaitingOnFilter(this.value)"
          aria-label="Filter actions by Waiting On"
        >
          <option value="all" ${actionWaitingOnFilter === "all" ? "selected" : ""}>
            All
          </option>

          ${options.map(name => `
            <option
              value="${escapeHtml(name)}"
              ${actionWaitingOnFilter === name ? "selected" : ""}
            >
              ${escapeHtml(name)}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  function actionPath(item) {
    return ProjectWorkItems
      .pathFor(item.id)
      .map(node => node.title)
      .join(" › ");
  }

  function relatedWorkLabel(item) {
    if (item.blockerDependency) {
      return item.blockerDependency;
    }

    const incomplete =
      incompletePredecessorsFor(item);

    if (incomplete.length) {
      return incomplete
        .map(predecessor =>
          predecessor.title
        )
        .join(", ");
    }

    const path =
      ProjectWorkItems.pathFor(
        item.id
      );

    if (path.length >= 2) {
      return (
        path[path.length - 2]?.title ||
        item.title
      );
    }

    return item.title;
  }

  function renderModeToggle() {
    const count = actionSummaryItems().length;

    return `
      <div class="pw-mode-toggle" role="group" aria-label="Project Plan view">

        <button
          type="button"
          class="${projectWorkMode === "hierarchy" ? "active" : ""}"
          onclick="ProjectWorkView.setMode('hierarchy')"
        >
          Hierarchy
        </button>

        <button
          type="button"
          class="${projectWorkMode === "actions" ? "active" : ""}"
          onclick="ProjectWorkView.setMode('actions')"
        >
          Action Required
          <span>${count}</span>
        </button>

      </div>
    `;
  }

  function actionStatusLabel(item) {
    const status =
      String(
        item.status || ""
      ).trim();

    const dependency =
      dependencyStateFor(item);

    if (
      dependency.hasPredecessors &&
      dependency.incomplete.length
    ) {
      return dependency.label;
    }

    if (status === "Blocked") {
      return "Blocked";
    }

    if (status === "Awaiting Review") {
      return "Awaiting Review";
    }

    if (status === "Waiting") {
      return "Waiting";
    }

    if (status) {
      return status;
    }

    if (item.waitingOn) {
      return "Waiting";
    }

    return "Not Started";
  }

  function actionStatusClass(item) {
    const label = actionStatusLabel(item).toLowerCase();

    if (label.includes("blocked")) return "blocked";
    if (label.includes("review")) return "review";
    if (label.includes("waiting")) return "waiting";
    if (label.includes("complete") || label.includes("received")) return "complete";

    return "outstanding";
  }

  function blockingLabel(item) {
    if (item.blockerDependency) {
      return item.blockerDependency;
    }

    const incomplete =
      incompletePredecessorsFor(item);

    if (incomplete.length) {
      return incomplete
        .map(predecessor =>
          predecessor.title
        )
        .join(", ");
    }

    const path =
      ProjectWorkItems.pathFor(
        item.id
      );

    if (path.length >= 2) {
      const parent =
        path[path.length - 2];

      return (
        parent?.title ||
        item.title
      );
    }

    return item.title;
  }

  function actionViewToggle() {
    return `
      <div class="pw-action-view-control">
        <span>View</span>

        <div class="pw-action-view-toggle">
          <button
            type="button"
            class="${actionDisplayMode === "cards" ? "active" : ""}"
            onclick="ProjectWorkView.setActionDisplayMode('cards')"
          >
            Cards
          </button>

          <button
            type="button"
            class="${actionDisplayMode === "list" ? "active" : ""}"
            onclick="ProjectWorkView.setActionDisplayMode('list')"
          >
            List
          </button>
        </div>
      </div>
    `;
  }


  // Action Required keeps groups compact until the PM wants the exact
  // outstanding tasks. Historical records stay actionable; their dates are
  // identified as not yet classified, rather than silently downgraded.
  function actionGroupMembers(item) {
    const all = Array.isArray(item?.__actionMembers) ? item.__actionMembers : [];
    return all.filter(member => String(member.id) !== String(item.id))
      .sort((a, b) => warningRank(a) - warningRank(b) ||
        String(attentionDateInfo(a).date || "9999").localeCompare(String(attentionDateInfo(b).date || "9999")) ||
        String(a.title || "").localeCompare(String(b.title || "")));
  }

  function actionDateTypeUnclassified(item) {
    // An Input Needed By date is NOT a task due date and needs no due-date classification.
    return !item?.scheduleMode && Boolean(item?.targetDate);
  }

  function actionGroupToggle(item) {
    const children = actionGroupMembers(item);
    if (!children.length) return "";
    const expanded = expandedActionGroups.has(String(item.id));
    return `<button type="button" class="pw-action-expand" data-action-group-toggle="${escapeHtml(item.id)}"
      aria-expanded="${expanded}" aria-label="${expanded ? "Hide" : "Show"} ${children.length} tasks under ${escapeHtml(item.title)}"
      onclick="event.stopPropagation();ProjectWorkView.toggleActionGroup(this.dataset.actionGroupToggle)">
        ${expanded ? "Hide tasks ▲" : `View ${children.length} tasks ▼`}
      </button>`;
  }

  function dateReviewButton(item) {
    if (!actionDateTypeUnclassified(item)) return "";
    return `<button type="button" class="pw-verify-date-btn"
       data-review-schedule-id="${escapeHtml(item.id)}"
       title="Review the stored due date without changing it automatically"
       onclick="event.stopPropagation();event.preventDefault();ProjectWorkView.reviewDateType(this.dataset.reviewScheduleId)"
       onkeydown="event.stopPropagation()">Review date type</button>`;
  }

  function reviewDateType(id) {
    const item = ProjectWorkItems.getItem(id);
    if (!item) return;
    window.ProjectTaskEditor?.open({id: item.id, reviewQueue: true});
    // ProjectTaskEditor initially focuses Task Name; move focus to the scheduling choice.
    setTimeout(() => document.getElementById("pteScheduleMode")?.focus(), 50);
  }

  function actionGroupDetails(item) {
    const children = actionGroupMembers(item);
    if (!children.length || !expandedActionGroups.has(String(item.id))) return "";
    return `<div class="pw-action-detail-panel" aria-label="Tasks needing attention under ${escapeHtml(item.title)}">
      ${children.map(child => {
        const due = attentionDateInfo(child);
        const warning = warningLabel(child);
        const dateUnclassified = actionDateTypeUnclassified(child);
        return `<div class="pw-action-detail-item" role="button" tabindex="0" data-project-work-item-id="${escapeHtml(child.id)}"
          aria-label="Open task ${escapeHtml(child.title)}">
          <span class="pw-action-detail-title">${escapeHtml(child.title)}</span>
          <span class="pw-action-detail-state aht-status-pill ${AHTStatusUI.classFor(warning || actionStatusLabel(child))}">${escapeHtml(warning || actionStatusLabel(child))}</span>
          <span class="pw-action-detail-date">${dateLabel(due.date)}<small>${escapeHtml(due.label)}</small></span>
          <span class="pw-action-detail-legacy">${dateUnclassified ? dateReviewButton(child) : ""}</span>
          <span class="pw-action-detail-arrow">›</span>
        </div>`;
      }).join("")}
    </div>`;
  }

  function toggleActionGroup(id) {
    const key = String(id ?? "");
    if (expandedActionGroups.has(key)) expandedActionGroups.delete(key);
    else expandedActionGroups.add(key);
    render();
  }

  function actionRequiredCard(item) {
    const needed =
      actionAttentionSummary(item);

    const neededLabel =
      item.__actionGrouped
        ? "Attention Summary"
        : "What We Need";

    const waitingOn =
      item.waitingOn ||
      item.owner ||
      "Unassigned";

    const due = item.__actionDate || "";
    const dueType = item.__actionDateType || "Next date";

    return `
      <article
        class="pw-action-card" role="button" tabindex="0" data-project-work-item-id="${escapeHtml(item.id)}"
        role="button"
        tabindex="0"
        data-project-work-item-id="${escapeHtml(item.id)}"
      >
        <div class="pw-action-card-top">
          <div>
            <div class="pw-action-card-type">Action Required</div>
            <h3>${escapeHtml(item.title)}</h3>
          </div>

          <div class="pw-action-status-stack">
            ${
              warningLabel(item)
                ? `
                  <span class="pw-warning-badge ${warningClass(item)} ${AHTStatusUI.classFor(warningLabel(item))}">
                    ${escapeHtml(warningLabel(item))}
                  </span>
                `
                : ""
            }

            <span class="pw-action-status ${actionStatusClass(item)} ${AHTStatusUI.classFor(actionStatusLabel(item))}">
              ${escapeHtml(actionStatusLabel(item))}
            </span>
          </div>
        </div>

        <div class="pw-action-card-rule"></div>

        <div class="pw-action-card-meta">

          <div>
            <span>Waiting On</span>
            <strong>${escapeHtml(waitingOn)}</strong>
          </div>

          <div>
            <span>${escapeHtml(dueType)}</span>
            <strong>${dateLabel(due)}</strong>
            ${!item.__actionGrouped ? dateReviewButton(item) : ""}
          </div>

        </div>

        <div class="pw-action-card-block">
          <span>${escapeHtml(neededLabel)}</span>
          <strong>${escapeHtml(needed)}</strong>
        </div>

        <div class="pw-action-card-block">
          <span>Blocking / Related Work</span>
          <strong>${escapeHtml(blockingLabel(item))}</strong>
        </div>

        <div class="pw-action-card-owner">
          <span>Owner</span>
          <strong>${escapeHtml(item.owner || "—")}</strong>
        </div>

        <div class="pw-action-card-path">
          ${escapeHtml(actionPath(item))}
        </div>

        ${actionGroupToggle(item)}
        ${actionGroupDetails(item)}
        <div class="pw-action-card-footer">
          <span>View details</span>
          <strong>›</strong>
        </div>
      </article>
    `;
  }

  function actionRequiredRow(item) {
    const needed =
      actionAttentionSummary(item);

    const neededLabel =
      item.__actionGrouped
        ? "Attention Summary"
        : "What We Need";

    const due = item.__actionDate || "";
    const dueType = item.__actionDateType || "Next date";

    return `
      <div
        class="pw-action-row" role="button" tabindex="0" data-project-work-item-id="${escapeHtml(item.id)}"
        role="button"
        tabindex="0"
        data-project-work-item-id="${escapeHtml(item.id)}"
      >

        <div class="pw-action-who">
          <strong>${escapeHtml(item.waitingOn || item.owner || "Unassigned")}</strong>
          ${AHTStatusUI.badge(actionStatusLabel(item), escapeHtml)}
          ${
            warningLabel(item)
              ? `
                <span class="pw-warning-inline ${warningClass(item)} ${AHTStatusUI.classFor(warningLabel(item))}">
                  ${escapeHtml(warningLabel(item))}
                </span>
              `
              : ""
          }
        </div>

        <div class="pw-action-needed">
          <strong>${escapeHtml(needed)}</strong>
          <span>${escapeHtml(actionPath(item))}</span>
          ${actionGroupToggle(item)}
        </div>

        <div class="pw-action-date">
          <strong>${dateLabel(due)}</strong>
          <span class="pw-action-date-kind">${escapeHtml(dueType)}</span>
          ${!item.__actionGrouped ? dateReviewButton(item) : ""}
        </div>

        <div class="pw-action-related">
          ${escapeHtml(blockingLabel(item))}
        </div>

        <div class="pw-action-owner">
          ${escapeHtml(item.owner || "—")}
        </div>

        <div class="pw-action-chevron">›</div>

      </div>
      ${actionGroupDetails(item)}
    `;
  }

  function renderActionRequired(root) {
    const allRecords = actionSummaryItems();
    const records = visibleActionRequiredItems();

    const filteredGroups = actionWaitingOnFilter === "all"
      ? allRecords
      : allRecords.filter(item => actionWaitingOnName(item) === actionWaitingOnFilter);

    root.innerHTML = `
      <div class="pw-action-view">

        ${renderModeToggle()}

        <div class="pw-action-toolbar">
          <div class="pw-action-toolbar-left">
            <h3>Action Required</h3>
            <p>
              Items from anywhere in the project currently waiting on a person,
              review, decision, or required information.
            </p>

          </div>

          <div class="pw-action-toolbar-right">
            ${actionWaitingOnFilterControl()}
            ${actionViewToggle()}
          </div>
        </div>

        ${actionPriorityControls(filteredGroups)}
        <div class="pw-action-result-count" role="status" aria-live="polite">
          Showing ${records.length} ${records.length === 1 ? "group" : "groups"}
          ${actionPriorityFilter !== "all" ? "matching selected priority" : "requiring attention"}
        </div>

        ${
          actionDisplayMode === "cards"
            ? `
              <div class="pw-action-card-grid">
                ${
                  records.length
                    ? records.map(actionRequiredCard).join("")
                    : `
                      <div class="pw-empty">
                        No outstanding project actions are currently identified.
                      </div>
                    `
                }
              </div>
            `
            : `
              <div class="pw-action-list">

                <div class="pw-action-row pw-action-head">
                  <div>Waiting On</div>
                  <div>What We Need</div>
                  <div>Next Date / Type</div>
                  <div>Blocking / Related Work</div>
                  <div>Owner</div>
                  <div></div>
                </div>

                ${
                  records.length
                    ? records.map(actionRequiredRow).join("")
                    : `
                      <div class="pw-empty">
                        No outstanding project actions are currently identified.
                      </div>
                    `
                }

              </div>
            `
        }

      </div>
    `;
  }

  function renderOverview(root) {
    const key = projectKey();
    const roots = ProjectWorkItems.rootsForProject(key);
    const filteredRoots = roots.filter(rootMatchesDeliveryPhase);
    const overall = ProjectWorkItems.projectProgress(key);

    const {
      phases: deliveryPhases,
      hasUnassigned: hasUnassignedPhase
    } = deliveryPhaseFilterOptions(roots);

    const validFilter =
      deliveryPhaseFilter === "all" ||
      deliveryPhaseFilter === "__unassigned__" ||
      deliveryPhases.includes(deliveryPhaseFilter);

    if (!validFilter) {
      deliveryPhaseFilter = "all";
    }

    const all = ProjectWorkItems.getItems().filter(
      item => String(item.projectId) === key && !item.archived
    );

    const pendingBuildings = all.filter(
      item => ProjectWorkItems.isUnscopedBuilding(item)
    );
    const managedRecords = all.filter(
      item => !ProjectWorkItems.isUnscopedBuilding(item)
    );

    const waiting = managedRecords.filter(
      item =>
        String(item.status).includes("Waiting") ||
        item.status === "Awaiting Review"
    ).length;

    const blocked = managedRecords.filter(
      item => item.status === "Blocked" || item.blockerDependency
    ).length;

    root.innerHTML = `
      <div class="pw-overview">

        ${renderModeToggle()}

        <div class="pw-summary">
          <div class="pw-summary-card">
            <span>Project Plan Progress</span>
            <strong>${overall == null ? "—" : `${overall}%`}</strong>
          </div>

          <div class="pw-summary-card">
            <span>Work Items</span>
            <strong>${managedRecords.length}</strong>
          </div>

          <div
            class="pw-summary-card pw-summary-clickable"
            role="button"
            tabindex="0"
            onclick="ProjectWorkView.setMode('actions')"
          >
            <span>Waiting / Review</span>
            <strong>${waiting}</strong>
            <small>View actions ›</small>
          </div>

          <div class="pw-summary-card">
            <span>Blocked</span>
            <strong>${blocked}</strong>
          </div>
        </div>

        ${pendingBuildings.length ? `
          <div class="pw-building-summary" role="note">
            <strong>${pendingBuildings.length} auxiliary building${pendingBuildings.length === 1 ? "" : "s"} awaiting architectural plans</strong>
            <span>Each building remains separate. No assigned tasks, dates, or progress are expected yet.</span>
          </div>
        ` : ""}

        <div>
          <div class="pw-section-head">
            <div>
              <h3>Project Plan Tasks</h3>
              <div class="small">
                Select a Task to drill into its Subtasks, dependencies, and progress.
              </div>
            </div>

            ${
              deliveryPhases.length || hasUnassignedPhase
                ? `
                  <label class="pw-phase-filter">
                    <span>Delivery Phase</span>
                    <select
                      onchange="ProjectWorkView.setDeliveryPhaseFilter(this.value)"
                    >
                      <option value="all"${
                        deliveryPhaseFilter === "all"
                          ? " selected"
                          : ""
                      }>
                        All Phases
                      </option>

                      ${deliveryPhases.map(phase => `
                        <option
                          value="${escapeHtml(phase)}"${
                            deliveryPhaseFilter === phase
                              ? " selected"
                              : ""
                          }
                        >
                          ${escapeHtml(phase)}
                        </option>
                      `).join("")}

                      ${
                        hasUnassignedPhase
                          ? `
                            <option
                              value="__unassigned__"${
                                deliveryPhaseFilter === "__unassigned__"
                                  ? " selected"
                                  : ""
                              }
                            >
                              Unassigned
                            </option>
                          `
                          : ""
                      }
                    </select>
                  </label>
                `
                : ""
            }
          </div>

          <div class="pw-list">
            ${
              filteredRoots.length
                ? filteredRoots.map(workItemRow).join("")
                : (
                    roots.length
                      ? `
                        <div class="pw-empty">
                          No Tasks are assigned to this Delivery Phase.
                        </div>
                      `
                      : `
                        <div class="pw-empty">
                          No Tasks have been created yet.
                        </div>
                      `
                  )
            }
          </div>
        </div>

      </div>
    `;
  }

  function renderItem(root, item) {
    const buildingPending = ProjectWorkItems.isUnscopedBuilding(item);
    const progress = buildingPending
      ? null
      : ProjectWorkItems.displayedProgress(item.id);
    const children = ProjectWorkItems.childrenOf(item.id);

    const predecessors =
      predecessorsFor(item);

    const incompletePredecessors =
      incompletePredecessorsFor(item);

    const dependencyState =
      dependencyStateFor(item);

    const waitingChildren = children.filter(child =>
      String(child.status || "").includes("Waiting") ||
      child.status === "Awaiting Review" ||
      child.status === "Blocked" ||
      child.waitingOn
    );

    const completeChildren = children.filter(
      child => child.status === "Complete" ||
      ProjectWorkItems.displayedProgress(child.id) === 100
    );

    const hasDependencyDetail =
      item.waitingOn ||
      item.informationRequired ||
      item.requiredBy ||
      item.blockerDependency ||
      predecessors.length;

    root.innerHTML = `
      <div class="pw-detail-banner">

        <div class="pw-detail-box pw-detail-title">
          <span>${buildingPending ? "Building" : "Task"}</span>
          <strong>${escapeHtml(item.title)}</strong>
          <div class="small">
            ${escapeHtml(
              [item.itemType, item.system, item.workstream]
                .filter(Boolean)
                .join(" · ")
            )}
          </div>
        </div>

        <div class="pw-detail-box">
          <span>${buildingPending ? "Scope" : "Progress"}</span>
          <strong>${buildingPending ? "Awaiting plans" : progress == null ? "—" : `${progress}%`}</strong>
        </div>

        <div class="pw-detail-box">
          <span>Status</span>
          <strong>${AHTStatusUI.badge(buildingPending ? "Planning" : item.status || "—", escapeHtml)}</strong>
        </div>

        <div class="pw-detail-box">
          <span>Owner / Responsible</span>
          <strong>${escapeHtml(item.owner || "—")}</strong>
        </div>

        <div class="pw-detail-box">
          <span>Target / Schedule</span>
          <strong>${item.scheduleMode ? escapeHtml(AHTScheduling.dateLabel(item)) : dateLabel(item.targetDate)}</strong>
        </div>

      </div>

      ${buildingPending ? `
        <div class="pw-building-summary" role="note">
          <strong>Architectural plans pending</strong>
          <span>This is a separate building within the project, not an unfinished task. No building-specific work has been assigned yet.</span>
        </div>
      ` : ""}

      <div class="pw-detail-secondary">

        <div class="pw-detail-box">
          <span>Start</span>
          <strong>${dateLabel(item.startDate)}</strong>
        </div>

        <div class="pw-detail-box">
          <span>Subtasks</span>
          <strong>${children.length}</strong>
        </div>

        <div class="pw-detail-box">
          <span>Waiting / Blocked</span>
          <strong>${waitingChildren.length}</strong>
        </div>

        <div class="pw-detail-box">
          <span>Completed</span>
          <strong>${completeChildren.length}</strong>
        </div>

      </div>

      ${
        hasDependencyDetail
          ? `
            <div class="pw-dependency-panel">
              <div class="pw-dependency-title">
                Dependency / Required Input
              </div>

              <div class="pw-dependency-grid">

                <div>
                  <span>Dependency State</span>
                  <strong>
                    ${
                      dependencyState
                        .hasPredecessors
                        ? escapeHtml(
                            dependencyState.label
                          )
                        : "—"
                    }
                  </strong>

                  ${
                    dependencyState
                      .detail
                      ? `
                        <div class="small">
                          ${escapeHtml(
                            dependencyState.detail
                          )}
                        </div>
                      `
                      : ""
                  }
                </div>

                <div>
                  <span>Waiting On</span>
                  <strong>${escapeHtml(item.waitingOn || "—")}</strong>
                </div>

                <div>
                  <span>Input Needed By</span>
                  <strong>${dateLabel(item.requiredBy)}</strong>
                </div>

                <div>
                  <span>Predecessor(s)</span>

                  <strong>
                    ${
                      predecessors.length
                        ? predecessors
                            .map(predecessor => {
                              const incomplete =
                                incompletePredecessors
                                  .some(item =>
                                    String(item.id) ===
                                    String(predecessor.id)
                                  );

                              return `
                                ${escapeHtml(predecessor.title)}
                                ${
                                  incomplete
                                    ? '<span class="small"> · Incomplete</span>'
                                    : ""
                                }
                              `;
                            })
                            .join("<br>")
                        : "—"
                    }
                  </strong>
                </div>

                <div>
                  <span>Blocking / Dependency</span>
                  <strong>${escapeHtml(item.blockerDependency || "—")}</strong>
                </div>

              </div>

              ${
                item.informationRequired
                  ? `
                    <div class="pw-required-input">
                      <span>Information Required</span>
                      <strong>${escapeHtml(item.informationRequired)}</strong>
                    </div>
                  `
                  : ""
              }
            </div>
          `
          : ""
      }

      <div class="pw-work-section">

        <div class="pw-section-head">
          <div>
            <h3>${children.length ? "Subtasks" : "Task Details"}</h3>

            <div class="small">
              ${
                children.length
                  ? "Subtask progress rolls up automatically into this task."
                  : buildingPending
                    ? "No building tasks assigned. Keep this building separate until plans and scope are available."
                    : "This task does not have any subtasks yet. Its entered progress drives the hierarchy above it."
              }
            </div>
          </div>

          ${
            currentUser?.canEdit
              ? `<button
                   class="btn"
                   type="button"
                   onclick="window.ProjectTaskEditor?.open({parentId:'${String(item.id).replaceAll("'", "\\'")}'})"
                 >
                   Add Subtask
                 </button>`
              : ""
          }
        </div>

        ${
          children.length
            ? `
              <div class="pw-list">
                <div class="pw-row pw-row-head">
                  <div>Task</div>
                  <div>Progress</div>
                  <div>Status</div>
                  <div class="pw-owner">Owner</div>
                  <div class="pw-target">Target</div>
                  <div></div>
                </div>

                ${children
                  .map(child =>
                    workItemRow(
                      child,
                      { showWarning: true }
                    )
                  )
                  .join("")}
              </div>
            `
            : buildingPending
              ? '<div class="pw-building-empty">Awaiting building drawings and approved scope; nothing to update.</div>'
              : `
              <div class="pw-leaf-detail">

                <div class="pw-leaf-progress">
                  <span>Entered Progress</span>
                  ${progressBar(item.percentComplete)}
                </div>

                ${
                  item.waitingOn ||
                  item.informationRequired ||
                  item.blockerDependency
                    ? `
                      <div class="pw-leaf-note">
                        This task currently has an active dependency or required input.
                      </div>
                    `
                    : ""
                }

              </div>
            `
        }

      </div>
    `;
  }

  async function deleteProjectPlanTask(item) {

    if (!item) {
      return;
    }

    const canEdit =
      Boolean(
        currentUser?.canEdit ||
        currentUser?.canAdmin
      );

    if (!canEdit) {
      return;
    }

    const children =
      ProjectWorkItems.childrenOf(item.id) || [];

    if (children.length) {
      alert(
        `"${item.title}" cannot be deleted because it contains ` +
        `${children.length} Subtask${children.length === 1 ? "" : "s"}.\n\n` +
        `Delete or move the Subtask${children.length === 1 ? "" : "s"} first, then delete this Task.`
      );
      return;
    }

    if (!confirm(
      `Permanently delete "${item.title}"?\n\n` +
      `This Project Plan Task will be removed from SharePoint and cannot be undone.`
    )) {
      return;
    }

    const originalItems =
      ProjectWorkItems.getItems().slice();

    const deletedId =
      String(item.id);

    const parentId =
      item.parentWorkItemId || null;

    /*
     * Remove the deleted Task and also remove it from any
     * remaining predecessor relationships.
     */
    const next =
      originalItems
        .filter(record =>
          String(record.id) !== deletedId
        )
        .map(record => ({
          ...record,
          predecessorIds:
            Array.isArray(record.predecessorIds)
              ? record.predecessorIds.filter(
                  predecessorId =>
                    String(predecessorId) !== deletedId
                )
              : []
        }));

    try {
      /*
       * Match Site Operations behavior: permanently remove the
       * SharePoint row rather than merely archiving it.
       */
      if (
        item.sharePointId &&
        typeof SharePointDataProvider !== "undefined" &&
        typeof SharePointDataProvider.deleteItem === "function"
      ) {
        await SharePointDataProvider.deleteItem(
          APP_CONFIG.sharePoint.lists.projectWorkItems,
          item.sharePointId
        );
      } else {
        throw new Error(
          "The SharePoint record ID for this Task is not available."
        );
      }

      ProjectWorkItems.setItems(next);

      if (
        typeof DataProvider !== "undefined" &&
        typeof DataProvider.saveProjectWorkItems === "function"
      ) {
        await DataProvider.saveProjectWorkItems(
          ProjectWorkItems.getItems()
        );
      }

      const project =
        typeof currentProject === "function"
          ? currentProject()
          : null;

      if (
        project &&
        typeof logChange === "function"
      ) {
        logChange(
          "Delete",
          project.id,
          "Project Plan",
          item.title,
          "Project Plan Task permanently deleted."
        );

        if (typeof save === "function") {
          await save();
        }
      }

      currentWorkItemId =
        parentId || null;

      window.__projectPlanSelectedTaskId =
        currentWorkItemId;

      render();

    } catch (error) {
      console.error(
        "Project Plan delete failed",
        error
      );

      ProjectWorkItems.setItems(
        originalItems
      );

      alert(
        `Project Plan Task could not be deleted: ${error.message}`
      );

      render();
    }
  }


  function syncProjectPlanHeaderActions() {

    const editButton =
      document.getElementById(
        "editProjectTaskHeaderBtn"
      );

    if (!editButton) {
      return;
    }

    const item =
      (
        projectWorkMode === "hierarchy" &&
        currentWorkItemId != null
      )
        ? ProjectWorkItems.getItem(
            currentWorkItemId
          )
        : null;

    const canEdit =
      Boolean(
        currentUser?.canEdit ||
        currentUser?.canAdmin
      );

    /*
     * Keep Delete beside Edit so Project Plan matches
     * Site Operations without adding another permanent
     * action to the page when no Task is selected.
     */
    let deleteButton =
      document.getElementById(
        "deleteProjectTaskHeaderBtn"
      );

    if (!deleteButton) {
      deleteButton =
        document.createElement("button");

      deleteButton.type =
        "button";

      deleteButton.id =
        "deleteProjectTaskHeaderBtn";

      deleteButton.className =
        "btn danger";

      deleteButton.textContent =
        "Delete";

      editButton.insertAdjacentElement(
        "afterend",
        deleteButton
      );
    }

    editButton.hidden =
      !item || !canEdit;

    deleteButton.hidden =
      !item || !canEdit;

    editButton.onclick =
      item && canEdit
        ? () => {
            window.ProjectTaskEditor?.open({
              id: item.id
            });
          }
        : null;

    deleteButton.onclick =
      item && canEdit
        ? () =>
            deleteProjectPlanTask(
              item
            )
        : null;
  }


  function render() {
    const view = document.getElementById("projectWork");
    const root = document.getElementById("projectWorkContent");

    if (!view || !root) return;

    seedPrototypeData();

    syncProjectPlanHeaderActions();

    if (projectWorkMode === "actions") {
      const breadcrumb = document.getElementById("projectWorkBreadcrumb");

      if (breadcrumb) {
        breadcrumb.innerHTML = "";
      }

      renderActionRequired(root);
      return;
    }

    renderBreadcrumb();

    if (currentWorkItemId == null) {
      renderOverview(root);
      return;
    }

    const item = ProjectWorkItems.getItem(currentWorkItemId);

    if (!item) {
      currentWorkItemId = null;
      window.__projectPlanSelectedTaskId = null;
      syncProjectPlanHeaderActions();
      renderBreadcrumb();
      renderOverview(root);
      return;
    }

    renderItem(root, item);
  }

  function setActionWaitingOnFilter(value) {
    actionWaitingOnFilter = value || "all";
    render();
  }

  function setActionPriorityFilter(value) {
    if (!["all", "overdue", "review", "risk", "waiting", "unclassified"].includes(value)) return;
    actionPriorityFilter = value;
    // Collapse stale panels when their members change after filtering.
    expandedActionGroups.clear();
    render();
  }

  function setActionDisplayMode(mode) {
    if (!["cards", "list"].includes(mode)) return;

    actionDisplayMode = mode;
    render();
  }

  function setMode(mode) {
    if (!["hierarchy", "actions"].includes(mode)) return;

    projectWorkMode = mode;
    currentWorkItemId = null;
    render();
  }

  function openOverview() {
    projectWorkMode = "hierarchy";
    currentWorkItemId = null;
    window.__projectPlanSelectedTaskId = null;
    render();
  }

  function openItem(id) {
    
    window.__projectPlanSelectedTaskId = id;
projectWorkMode = "hierarchy";
currentWorkItemId = id;
    render();
  }

  function onProjectChanged() {
    currentWorkItemId = null;
    window.__projectPlanSelectedTaskId = null;
    seededProjectKey = null;
    projectWorkMode = "hierarchy";
    actionWaitingOnFilter = "all";
    actionPriorityFilter = "all";
    skippedDateReviewIds.clear();
    expandedActionGroups.clear();
    render();
  }

  function watchViewActivation() {
    const view = document.getElementById("projectWork");
    if (!view) return;

    const observer = new MutationObserver(() => {
      if (view.classList.contains("active")) render();
    });

    observer.observe(view, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  document.addEventListener("change", event => {
    if (!event.target.matches("#projectWork .project-select-clone")) return;

    setTimeout(() => {
      onProjectChanged();
    }, 0);
  });

  document.addEventListener("click", event => {
    if (event.target.closest("[data-action-group-toggle]")) return;
    const row = event.target.closest("[data-project-work-item-id], .pw-row-clickable, .pw-action-row:not(.pw-action-head), .pw-action-card");
    if (!row) return;

    const id = row.dataset.projectWorkItemId;
    if (!id) return;

    openItem(id);
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("[data-action-group-toggle]")) return;

    const row = event.target.closest("[data-project-work-item-id], .pw-row-clickable, .pw-action-row:not(.pw-action-head), .pw-action-card");
    if (!row) return;

    const id = row.dataset.projectWorkItemId;
    if (!id) return;

    event.preventDefault();
    openItem(id);
  });

  document.addEventListener("DOMContentLoaded", () => {
    watchViewActivation();

    const addButton = document.getElementById("addProjectWorkItemBtn");

    if (addButton) {
      addButton.addEventListener("click", () => {
        window.ProjectTaskEditor?.open();
      });
    }
  });

  return {
    render,
    setMode,
    setDeliveryPhaseFilter,
    setActionDisplayMode,
    setActionWaitingOnFilter,
    setActionPriorityFilter,
    toggleActionGroup,
    reviewDateType,
    reviewNextUnclassifiedDate,
    startDateReviewQueue,
    skipUnclassifiedDate,
    dateReviewQueueCount,
    dateReviewSkippedCount,
    openOverview,
    openItem,
    onProjectChanged
  };
})();

window.ProjectWorkView = ProjectWorkView;

/* ---------------------------------------------------------
   Project Plan universal task navigation
   ---------------------------------------------------------
   Keeps cards, list rows and hierarchy rows consistently
   clickable regardless of which render mode created them.
--------------------------------------------------------- */

(function bindProjectPlanTaskNavigation(){

  function taskTarget(event){
    return event.target.closest(
      "#projectWork " +
      "[data-project-work-item-id], " +
      "#projectWork .pw-action-card, " +
      "#projectWork .pw-action-row:not(.pw-action-head), " +
      "#projectWork .pw-row-clickable"
    );
  }

  function targetId(target){
    if (!target) return "";

    return (
      target.dataset.projectWorkItemId ||
      target.getAttribute("data-item-id") ||
      target.getAttribute("data-id") ||
      ""
    );
  }

  function openTarget(target){
    const id = targetId(target);

    if (!id) {
      console.warn(
        "Project Plan: clicked task does not have a task id.",
        target
      );
      return;
    }

    if (
      window.ProjectWorkView &&
      typeof window.ProjectWorkView.openItem === "function"
    ) {
      window.ProjectWorkView.openItem(id);
      return;
    }

    console.warn(
      "Project Plan: ProjectWorkView.openItem is not available.",
      id
    );
  }

  document.addEventListener("click", event => {
    if (event.target.closest("[data-action-group-toggle]")) return;
    const target = taskTarget(event);
    if (!target) return;

    /*
     * Allow actual form controls/buttons inside cards to perform
     * their own action. "View details" links/buttons are intentionally
     * allowed through if they do not have their own handler.
     */
    const interactive = event.target.closest(
      "input, select, textarea"
    );

    if (interactive) return;

    event.preventDefault();
    openTarget(target);
  });

  document.addEventListener("keydown", event => {
    if (
      event.key !== "Enter" &&
      event.key !== " "
    ) {
      return;
    }

    if (event.target.closest("[data-action-group-toggle]")) return;
    const target = taskTarget(event);
    if (!target) return;

    event.preventDefault();
    openTarget(target);
  });

})();
