const ProjectTaskEditor = (() => {

  let editingId = null;

  function isAdmin() {
    const role = String(
      document.getElementById("roleLabel")?.textContent || ""
    ).trim().toLowerCase();

    return role === "administrator";
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
    const select = document.querySelector(
      "#projectWork .project-select-clone"
    );

    return String(select?.value || "");
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

  function seedContactsIfNeeded() {
    if (!window.ProjectContacts) return;

    const id = projectId();

    if (ProjectContacts.forProject(id).length) {
      return;
    }

    /*
     * The Contacts prototype currently creates its local sample
     * records when the Contacts view renders.
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
        .forProject(projectId())
        .forEach(contact => {
          const value =
            contact.name ||
            contact.contactPerson ||
            "";

          if (value) names.push(value);
        });
    }

    /*
     * Preserve values already present in prototype tasks.
     */
    projectItems().forEach(item => {
      if (item.owner) names.push(item.owner);
      if (item.waitingOn) names.push(item.waitingOn);
    });

    if (existing) names.push(existing);

    return [...new Set(names)]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
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
    return `
      <option value="">
        — None —
      </option>

      ${projectItems()
        .filter(item =>
          String(item.id) !==
          String(itemId || "")
        )
        .map(item => `
          <option
            value="${esc(item.id)}"
            ${
              String(item.id) === String(selected)
                ? "selected"
                : ""
            }
          >
            ${esc(item.title)}
          </option>
        `)
        .join("")}
    `;
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


          <form id="projectTaskEditorForm">

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
                <span>Required By</span>
                <input
                  id="pteRequiredBy"
                  type="date"
                >
              </label>

              <label class="field pte-field">
                <span>Predecessor</span>
                <select id="ptePredecessor"></select>
              </label>


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
                  <span>Phase</span>
                  <input id="ptePhase">
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
        item.predecessorId || "",
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


    document.getElementById(
      "ptePhase"
    ).value =
      item.phase || "";


    document.getElementById(
      "pteSystem"
    ).value =
      item.system || "";
  }


  function open(options = {}) {

    if (!isAdmin()) {
      return;
    }

    ensureModal();

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


  function save(event) {

    event.preventDefault();

    if (!isAdmin()) {
      return;
    }

    const title =
      value("pteTitle");

    if (!title) {
      return;
    }


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
        "",

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

      predecessorId:
        value("ptePredecessor") ||
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
        value("ptePhase") ||
        parent?.phase ||
        "",

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


    ProjectWorkItems.setItems(next);

    close();

    window.ProjectWorkView
      ?.openItem?.(record.id);
  }


  return {
    open,
    close,
    isAdmin
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

    if (!ProjectTaskEditor.isAdmin()) {
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
      (
        root.textContent.includes(
          "Task Details"
        ) ||
        root.textContent.includes(
          "DEPENDENCY / REQUIRED INPUT"
        )
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
