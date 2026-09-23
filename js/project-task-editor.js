const ProjectTaskEditor = (() => {

  let editingId = null;
  let saveInProgress = false;

  function isAdmin() {
    if (
      typeof currentUser !== "undefined" &&
      currentUser
    ) {
      return Boolean(currentUser.canAdmin);
    }

    const role = String(
      document.getElementById("roleLabel")?.textContent || ""
    ).trim().toLowerCase();

    return role === "administrator" || role === "admin";
  }

  function canEdit() {
    if (
      typeof currentUser !== "undefined" &&
      currentUser
    ) {
      return Boolean(currentUser.canEdit);
    }

    const role = String(
      document.getElementById("roleLabel")?.textContent || ""
    ).trim().toLowerCase();

    return [
      "editor",
      "project admin",
      "administrator",
      "admin"
    ].includes(role);
  }

  function canProjectAdmin() {
    if (
      typeof currentUser !== "undefined" &&
      currentUser
    ) {
      return Boolean(
        currentUser.canProjectAdmin ||
        currentUser.canAdmin
      );
    }

    const role = String(
      document.getElementById("roleLabel")?.textContent || ""
    ).trim().toLowerCase();

    return [
      "project admin",
      "administrator",
      "admin"
    ].includes(role);
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function projectId() {
    /*
     * Use the dashboard's canonical project key everywhere in Project Plan.
     * The project selector may contain a SharePoint numeric ID, which is not
     * necessarily the same value used by currentProject().id.
     */
    try {
      if (typeof currentProject === "function") {
        const project = currentProject();

        if (project) {
          return String(
            project.id ||
            project.sharePointId ||
            ""
          );
        }
      }
    } catch {}

    const select = document.querySelector(
      "#projectWork .project-select-clone"
    );

    return String(select?.value || "");
  }

  function projectSharePointId() {
    try {
      if (typeof currentProject === "function") {
        return Number(
          currentProject()?.sharePointId || 0
        );
      }
    } catch {}

    return 0;
  }

  function projectItems() {
    const id = projectId();

    return ProjectWorkItems
      .getItems()
      .filter(item =>
        String(item.projectId) === id ||
        String(item.projectSharePointId) === id
      );
  }

  function contactProjectId() {
    /*
     * Project Contacts use the dashboard's actual project key.
     * Fall back to the Project Plan selector only if currentProject()
     * is unavailable.
     */
    try {
      if (typeof currentProject === "function") {
        const project = currentProject();

        if (project) {
          return String(
            project.id ||
            project.sharePointId ||
            projectId()
          );
        }
      }
    } catch {}

    return projectId();
  }


  function seedContactsIfNeeded() {
    if (!window.ProjectContacts) return;

    const id = contactProjectId();

    /*
     * Include inactive here only to determine whether the project
     * already has a contact list. We do NOT want archived contacts
     * returned as normal Task selections.
     */
    if (
      ProjectContacts.forProject(
        id,
        { includeInactive: true }
      ).length
    ) {
      return;
    }

    /*
     * During the local prototype the Contacts view seeds the initial
     * project contact list. Once SharePoint persistence is added this
     * fallback can disappear.
     */
    if (window.ProjectContactsView?.render) {
      ProjectContactsView.render();
    }
  }


  function contactNames(existing = "") {
    seedContactsIfNeeded();

    const names = [];

    if (window.ProjectContacts) {
      ProjectContacts
        .forProject(contactProjectId())
        .forEach(contact => {
          const value =
            contact.name ||
            contact.contactPerson ||
            "";

          if (value) {
            names.push(value);
          }
        });
    }

    /*
     * An archived contact should not be offered on NEW Tasks.
     *
     * But if an existing Task already references that person/company,
     * preserve its current value so editing the Task does not silently
     * remove or replace the historical assignment.
     */
    if (existing) {
      names.push(existing);
    }

    return [...new Set(names)]
      .filter(Boolean)
      .sort((a, b) =>
        a.localeCompare(b)
      );
  }


  function selectOptions(
    values,
    selected,
    blankLabel
  ) {
    return `
      <option value="">${esc(blankLabel)}</option>

      ${values.map(value => `
        <option
          value="${esc(value)}"
          ${String(value) === String(selected) ? "selected" : ""}
        >
          ${esc(value)}
        </option>
      `).join("")}
    `;
  }

  function invalidParentIds(itemId) {
    const invalid = new Set();

    if (!itemId) return invalid;

    invalid.add(String(itemId));

    ProjectWorkItems
      .descendantsOf(itemId)
      .forEach(item => {
        invalid.add(String(item.id));
      });

    return invalid;
  }

  function higherLevelOptions(
    selected,
    itemId
  ) {
    const invalid =
      invalidParentIds(itemId);

    return `
      <option value="">
        — Top Level —
      </option>

      ${projectItems()
        .filter(item =>
          !invalid.has(String(item.id))
        )
        .map(item => {
          const path =
            ProjectWorkItems
              .pathFor(item.id)
              .map(x => x.title)
              .join(" › ");

          return `
            <option
              value="${esc(item.id)}"
              ${
                String(item.id) === String(selected)
                  ? "selected"
                  : ""
              }
            >
              ${esc(path || item.title)}
            </option>
          `;
        })
        .join("")}
    `;
  }

  function predecessorOptions(
    selected,
    itemId
  ) {
    const selectedIds =
      new Set(
        (
          Array.isArray(selected)
            ? selected
            : selected
              ? [selected]
              : []
        )
          .map(id => String(id))
      );

    const choices =
      projectItems()
        .filter(item =>
          String(item.id) !==
          String(itemId || "")
        )
        .map(item => {
          const path =
            ProjectWorkItems
              .pathFor(item.id)
              .map(node => node.title)
              .join(" › ");

          const id =
            String(item.id);

          return `
            <label class="pte-predecessor-option">
              <input
                type="checkbox"
                name="ptePredecessor"
                value="${esc(id)}"
                ${
                  selectedIds.has(id)
                    ? "checked"
                    : ""
                }
              >
              <span>${esc(path || item.title)}</span>
            </label>
          `;
        })
        .join("");

    return (
      choices ||
      `
        <div class="pte-predecessor-empty">
          No other Tasks are available.
        </div>
      `
    );
  }

  function ensureModal() {

    if (
      document.getElementById(
        "projectTaskEditorModal"
      )
    ) {
      return;
    }

    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <div
        id="projectTaskEditorModal"
        class="pte-modal hidden"
        aria-hidden="true"
      >

        <div
          class="pte-backdrop"
          data-pte-close
        ></div>

        <section
          class="modal pte-dialog"
          role="dialog"
          aria-modal="true"
        >

          <div class="pte-dialog-header">

            <div>
              <div class="pte-eyebrow">
                Project Plan
              </div>

              <h2 id="projectTaskEditorTitle">
                Add Task
              </h2>

              <p>
                Define who owns the task, who you are waiting on,
                when it is needed, and what is blocking progress.
              </p>
            </div>

            <button
              class="pte-close"
              type="button"
              data-pte-close
            >
              ×
            </button>

          </div>


          <form id="projectTaskEditorForm" novalidate>

            <div class="form-grid pte-deliverable-grid">

              <label class="field pte-field">
                <span>Higher-Level Task</span>
                <select id="pteParent"></select>
              </label>

              <label class="field pte-field">
                <span>Task Type</span>
                <select id="pteItemType">
                  <option>Task</option>
                  <option>Review</option>
                  <option>Decision</option>
                  <option>Coordination</option>
                  <option>Milestone</option>
                </select>
              </label>


              <label class="field pte-field">
                <span>Delivery Phase *</span>
                <select id="ptePhase"></select>
                <small>
                  Required for top-level Tasks. Subtasks inherit the parent phase.
                </small>
              </label>


              <label class="field full pte-field pte-full">
                <span>Task Name *</span>
                <input
                  id="pteTitle"
                  required
                  autocomplete="off"
                >
              </label>


              <label class="field pte-field">
                <span>Owner / Responsible</span>
                <select id="pteOwner"></select>
              </label>

              <label class="field pte-field">
                <span>Waiting On</span>
                <select id="pteWaitingOn"></select>
              </label>


              <label class="field pte-field">
                <span>Start Date</span>
                <input
                  id="pteStartDate"
                  type="date"
                >
              </label>

              <label class="field pte-field">
                <span>Target Date</span>
                <input
                  id="pteTargetDate"
                  type="date"
                >
              </label>


              <label class="field pte-field">
                <span>Input Needed By</span>
                <input
                  id="pteRequiredBy"
                  type="date"
                >
              </label>

              <div class="field pte-field">
                <span>Predecessor(s)</span>

                <div
                  id="ptePredecessor"
                  class="pte-predecessor-list"
                ></div>

                <small>
                  Select all Tasks that must be completed first.
                </small>
              </div>


              <label class="field full pte-field pte-full">
                <span>Information Required</span>
                <textarea
                  id="pteInformationRequired"
                  rows="3"
                ></textarea>
              </label>


              <label class="field full pte-field pte-full">
                <span>Blocker / Dependency</span>
                <textarea
                  id="pteBlockerDependency"
                  rows="3"
                ></textarea>
              </label>


              <label class="field pte-field">
                <span>Status</span>
                <select id="pteStatus">
                  <option>Planned</option>
                  <option>In Progress</option>
                  <option>Waiting</option>
                  <option>Awaiting Review</option>
                  <option>Blocked</option>
                  <option>Complete</option>
                </select>
              </label>

              <label class="field pte-field">
                <span>Progress</span>
                <div class="pte-progress-field">
                  <input
                    id="ptePercent"
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                  >
                  <span>%</span>
                </div>
              </label>

            </div>


            <details class="pte-advanced">
              <summary>
                Organization
              </summary>

              <div class="form-grid pte-deliverable-grid pte-org-grid">

                <label class="field pte-field">
                  <span>Workstream</span>
                  <input id="pteWorkstream">
                </label>

                <label class="field pte-field">
                  <span>System</span>
                  <input id="pteSystem">
                </label>

              </div>
            </details>


            <div class="modal-actions pte-actions">
              <button
                class="btn"
                type="button"
                data-pte-close
              >
                Cancel
              </button>

              <button
                class="btn primary"
                type="submit"
              >
                Save Task
              </button>
            </div>

          </form>

        </section>
      </div>
      `
    );


    document
      .querySelectorAll("[data-pte-close]")
      .forEach(element => {
        element.addEventListener(
          "click",
          close
        );
      });


    document
      .getElementById(
        "projectTaskEditorForm"
      )
      .addEventListener(
        "submit",
        save
      );
  }


  function deliveryPhaseOptions(selected = "") {
    const project =
      typeof currentProject === "function"
        ? currentProject()
        : null;

    const configured =
      Array.isArray(project?.deliveryPhases)
        ? project.deliveryPhases
        : [];

    const values = [
      ...configured
    ];

    /*
     * Preserve legacy/existing phase values even if the project's
     * configured list has since changed.
     */
    if (
      selected &&
      !values.includes(selected)
    ) {
      values.push(selected);
    }

    const safe = value =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    return [
      `<option value="">— No Delivery Phase —</option>`,
      ...values.map(value =>
        `<option value="${safe(value)}" ${
          value === selected
            ? "selected"
            : ""
        }>${safe(value)}</option>`
      )
    ].join("");
  }


  function syncDeliveryPhaseControl(
    item = {},
    fallbackParentId = ""
  ) {
    const phaseSelect =
      document.getElementById("ptePhase");

    const parentSelect =
      document.getElementById("pteParent");

    if (!phaseSelect || !parentSelect) {
      return;
    }

    const parentId =
      parentSelect.value ||
      fallbackParentId ||
      "";

    const parent =
      parentId
        ? ProjectWorkItems.getItem(parentId)
        : null;

    const isSubtask =
      Boolean(parentId);

    /*
     * Top-level items choose their own Delivery Phase.
     * Subtasks inherit the parent phase automatically.
     * Administrators may override a Subtask phase.
     */
    if (isSubtask) {
      const inheritedPhase =
        parent?.phase || "";

      const selectedPhase =
        item.phase ||
        inheritedPhase;

      phaseSelect.innerHTML =
        deliveryPhaseOptions(
          selectedPhase
        );

      phaseSelect.value =
        selectedPhase;

      phaseSelect.disabled =
        !isAdmin();

      phaseSelect.title =
        isAdmin()
          ? "This Subtask inherits its parent Delivery Phase. Administrators may override it."
          : "This Subtask inherits its parent Delivery Phase.";
    } else {
      phaseSelect.innerHTML =
        deliveryPhaseOptions(
          item.phase || ""
        );

      phaseSelect.value =
        item.phase || "";

      phaseSelect.disabled =
        false;

      phaseSelect.title =
        "Delivery Phase is required for top-level Project Plan items.";
    }
  }


  function fill(
    item = {},
    parentId = ""
  ) {

    editingId =
      item.id || null;


    document.getElementById(
      "projectTaskEditorTitle"
    ).textContent =
      editingId
        ? "Edit Task"
        : parentId
          ? "Add Subtask"
          : "Add Task";


    document.getElementById(
      "pteTitle"
    ).value =
      item.title || "";


    document.getElementById(
      "pteParent"
    ).innerHTML =
      higherLevelOptions(
        item.parentWorkItemId ||
        parentId ||
        "",
        editingId
      );


    document.getElementById(
      "pteItemType"
    ).value =
      item.itemType || "Task";

    document.getElementById(
      "pteParent"
    )?.addEventListener(
      "change",
      () => {
        syncDeliveryPhaseControl(
          item,
          ""
        );
      }
    );


    document.getElementById(
      "pteOwner"
    ).innerHTML =
      selectOptions(
        contactNames(
          item.owner || ""
        ),
        item.owner || "",
        "— Unassigned —"
      );


    document.getElementById(
      "pteWaitingOn"
    ).innerHTML =
      selectOptions(
        contactNames(
          item.waitingOn || ""
        ),
        item.waitingOn || "",
        "— Not Waiting On Anyone —"
      );


    document.getElementById(
      "pteTargetDate"
    ).value =
      item.targetDate || "";


    document.getElementById(
      "pteRequiredBy"
    ).value =
      item.requiredBy || "";


    document.getElementById(
      "pteInformationRequired"
    ).value =
      item.informationRequired || "";


    document.getElementById(
      "pteBlockerDependency"
    ).value =
      item.blockerDependency || "";


    document.getElementById(
      "ptePredecessor"
    ).innerHTML =
      predecessorOptions(
        (
          Array.isArray(
            item.predecessorIds
          ) &&
          item.predecessorIds.length
        )
          ? item.predecessorIds
          : (
              item.predecessorId
                ? [item.predecessorId]
                : []
            ),
        editingId
      );


    document.getElementById(
      "pteStartDate"
    ).value =
      item.startDate || "";


    document.getElementById(
      "pteStatus"
    ).value =
      item.status || "Planned";


    document.getElementById(
      "ptePercent"
    ).value =
      Number(
        item.percentComplete || 0
      );


    document.getElementById(
      "pteWorkstream"
    ).value =
      item.workstream || "";


    syncDeliveryPhaseControl(
      item,
      parentId
    );


    document.getElementById(
      "pteSystem"
    ).value =
      item.system || "";
  }


  function open(options = {}) {

    const readOnly = !canEdit();

    ensureModal();

    const editorForm =
      document.getElementById("projectTaskEditorForm");

    if (editorForm) {
      editorForm
        .querySelectorAll("input, select, textarea")
        .forEach(control => {
          control.disabled = readOnly;
        });

      editorForm
        .querySelectorAll('button[type="submit"]')
        .forEach(button => {
          button.classList.toggle("hidden", readOnly);
        });
    }

    let item = {};

    if (options.id) {
      item =
        ProjectWorkItems.getItem(
          options.id
        ) || {};
    }

    fill(
      item,
      options.parentId || ""
    );

    const modal =
      document.getElementById(
        "projectTaskEditorModal"
      );

    modal.classList.remove("hidden");

    modal.setAttribute(
      "aria-hidden",
      "false"
    );

    setTimeout(() => {
      document
        .getElementById("pteTitle")
        ?.focus();
    }, 0);
  }


  function close() {

    const modal =
      document.getElementById(
        "projectTaskEditorModal"
      );

    if (!modal) return;

    modal.classList.add("hidden");

    modal.setAttribute(
      "aria-hidden",
      "true"
    );

    editingId = null;
  }


  function value(id) {
    return String(
      document.getElementById(id)
        ?.value || ""
    ).trim();
  }


  function clearValidationState() {
    document
      .querySelectorAll(".pte-invalid")
      .forEach(element =>
        element.classList.remove("pte-invalid")
      );
  }

  function showValidationToast(message) {
    let toast =
      document.getElementById(
        "projectTaskValidationToast"
      );

    if (!toast) {
      toast = document.createElement("div");

      toast.id =
        "projectTaskValidationToast";

      toast.className =
        "pte-validation-toast";

      toast.setAttribute(
        "role",
        "alert"
      );

      toast.setAttribute(
        "aria-live",
        "assertive"
      );

      const actions =
        document.querySelector(
          "#projectTaskEditorModal .pte-actions"
        );

      if (actions?.parentNode) {
        actions.parentNode.insertBefore(
          toast,
          actions
        );
      } else {
        document.body.appendChild(toast);
      }
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(
      showValidationToast.timer
    );

    showValidationToast.timer =
      setTimeout(() => {
        toast.classList.remove("show");
      }, 3500);
  }

  function failValidation(
    message,
    fieldId
  ) {
    const field =
      document.getElementById(fieldId);

    field?.classList.add(
      "pte-invalid"
    );

    field?.focus();

    showValidationToast(message);

    return false;
  }

  function validateTaskForm() {
    clearValidationState();

    const title =
      value("pteTitle");

    const startDate =
      value("pteStartDate");

    const targetDate =
      value("pteTargetDate");

    const requiredBy =
      value("pteRequiredBy");

    const parentId =
      value("pteParent");

    const deliveryPhase =
      value("ptePhase");

    if (!title) {
      return failValidation(
        "Can't save Task — Task Name is required.",
        "pteTitle"
      );
    }

    if (!targetDate) {
      return failValidation(
        "Can't save Task — Target Date is required.",
        "pteTargetDate"
      );
    }

    if (
      !parentId &&
      !deliveryPhase
    ) {
      return failValidation(
        "Can't save Task — Delivery Phase is required for a top-level Task or Milestone.",
        "ptePhase"
      );
    }

    if (!requiredBy) {
      return failValidation(
        "Can't save Task — Input Needed By is required.",
        "pteRequiredBy"
      );
    }

    if (
      startDate &&
      startDate > targetDate
    ) {
      return failValidation(
        "Can't save Task — Start Date cannot be after Target Date.",
        "pteStartDate"
      );
    }

    if (
      requiredBy > targetDate
    ) {
      return failValidation(
        "Can't save Task — Input Needed By must be on or before Target Date.",
        "pteRequiredBy"
      );
    }

    return true;
  }

  async function save(event) {

    event.preventDefault();

    if (saveInProgress) {
      return;
    }

    if (!canEdit()) {
      return;
    }

    if (!validateTaskForm()) {
      return;
    }

    const title =
      value("pteTitle");


    const all =
      ProjectWorkItems.getItems();


    const existing =
      editingId
        ? ProjectWorkItems.getItem(
            editingId
          )
        : null;


    const parentId =
      value("pteParent");


    const parent =
      parentId
        ? ProjectWorkItems.getItem(
            parentId
          )
        : null;


    const predecessorIds =
      [
        ...document.querySelectorAll(
          '#ptePredecessor input[name="ptePredecessor"]:checked'
        )
      ]
        .map(input => input.value)
        .filter(Boolean);


    const record = {

      ...(existing || {}),

      id:
        existing?.id ||
        `local-task-${Date.now()}`,

      projectId:
        existing?.projectId ||
        projectId(),

      projectSharePointId:
        existing?.projectSharePointId ||
        projectSharePointId() ||
        0,

      title,

      parentWorkItemId:
        parentId || null,

      itemType:
        value("pteItemType") ||
        "Task",

      owner:
        value("pteOwner"),

      waitingOn:
        value("pteWaitingOn"),

      startDate:
        value("pteStartDate"),

      targetDate:
        value("pteTargetDate"),

      requiredBy:
        value("pteRequiredBy"),

      informationRequired:
        value(
          "pteInformationRequired"
        ),

      blockerDependency:
        value(
          "pteBlockerDependency"
        ),

      predecessorIds,

      predecessorId:
        predecessorIds[0] ||
        null,

      status:
        value("pteStatus") ||
        "Planned",

      percentComplete:
        Math.max(
          0,
          Math.min(
            100,
            Number(
              value("ptePercent") || 0
            )
          )
        ),

      trackProgress: true,

      progressWeight:
        Number(
          existing?.progressWeight || 1
        ),

      workstream:
        value("pteWorkstream") ||
        parent?.workstream ||
        "",

      phase:
        parentId
          ? (
              canProjectAdmin()
                ? (
                    value("ptePhase") ||
                    parent?.phase ||
                    ""
                  )
                : (
                    existing?.phase ||
                    parent?.phase ||
                    ""
                  )
            )
          : value("ptePhase"),

      system:
        value("pteSystem") ||
        parent?.system ||
        "",

      visibility:
        existing?.visibility ||
        "Internal",

      archived: false,

      sortOrder:
        Number(
          existing?.sortOrder ||
          all.length + 1
        )
    };


    const next =
      existing
        ? all.map(item =>
            String(item.id) ===
            String(existing.id)
              ? record
              : item
          )
        : [...all, record];


    saveInProgress = true;

    ProjectWorkItems.setItems(next);

    try {
      if (DataProvider?.saveProjectWorkItems) {
        await DataProvider.saveProjectWorkItems(
          ProjectWorkItems.getItems()
        );

        /*
         * Persist returned SharePoint IDs back into the local
         * normalized collection after the first migration save.
         */
        ProjectWorkItems.setItems(
          ProjectWorkItems.getItems()
        );
      }
    } catch (error) {
      console.error(
        "Project Work Item SharePoint save failed.",
        error
      );

      alert(
        `The Task was saved locally, but SharePoint sync failed: ${error.message}`
      );
    } finally {
      saveInProgress = false;
    }

    close();

    window.ProjectWorkView
      ?.openItem?.(record.id);
  }


  return {
    open,
    close,
    isAdmin,
    canEdit,
    canProjectAdmin
  };

})();


window.ProjectTaskEditor =
  ProjectTaskEditor;


/* ==========================================================
   BUTTON ROUTING
   ========================================================== */

document.addEventListener(
  "click",
  event => {

    if (!ProjectTaskEditor.canEdit()) {
      return;
    }


    const addTask =
      event.target.closest(
        "#addProjectTaskBtn"
      );

    if (addTask) {

      event.preventDefault();
      event.stopImmediatePropagation();

      ProjectTaskEditor.open();

      return;
    }


    const button =
      event.target.closest(
        "#projectWork button"
      );

    if (!button) {
      return;
    }


    const label =
      button.textContent
        .replace(/\s+/g, " ")
        .trim();


    if (label === "Add Subtask") {

      const parentId =
        window.__projectPlanSelectedTaskId;

      if (!parentId) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      ProjectTaskEditor.open({
        parentId
      });
    }

  },
  true
);


/* ==========================================================
   EDIT TASK BUTTON
   ========================================================== */

function syncProjectTaskEditButton() {

  /*
   * Edit Task is now rendered directly by project-work-view.js.
   * Keep this legacy hook inactive for backward compatibility.
   */
  return;

  const root =
    document.getElementById(
      "projectWorkContent"
    );

  if (!root) {
    return;
  }


  const existing =
    root.querySelector(
      ".pte-detail-actions"
    );


  const taskId =
    window.__projectPlanSelectedTaskId;


  const isDetail =
    Boolean(
      taskId &&
      root.querySelector(
        ".pw-detail-banner"
      )
    );


  if (
    !ProjectTaskEditor.isAdmin() ||
    !isDetail
  ) {

    existing?.remove();

    return;
  }


  if (existing) {
    return;
  }


  const actions =
    document.createElement("div");

  actions.className =
    "pte-detail-actions";


  actions.innerHTML = `
    <button
      class="btn"
      type="button"
      id="editProjectTaskBtn"
    >
      Edit Task
    </button>
  `;


  actions
    .querySelector(
      "#editProjectTaskBtn"
    )
    .addEventListener(
      "click",
      () => {

        ProjectTaskEditor.open({
          id:
            window
              .__projectPlanSelectedTaskId
        });

      }
    );


  root.prepend(actions);
}


const projectWorkRoot =
  document.getElementById(
    "projectWorkContent"
  );


if (projectWorkRoot) {

  new MutationObserver(() => {

    requestAnimationFrame(
      syncProjectTaskEditButton
    );

  }).observe(
    projectWorkRoot,
    {
      childList: true,
      subtree: true
    }
  );

}


document.addEventListener(
  "DOMContentLoaded",
  syncProjectTaskEditButton
);
