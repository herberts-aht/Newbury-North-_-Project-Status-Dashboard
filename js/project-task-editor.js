const ProjectTaskEditor = (() => {

  let editingId = null;
  let saveInProgress = false;
  let reviewQueueActive = false;
  let reviewQueueOriginalForm = "";

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


  function ownerNames(existing = "") {
    const values = ["AHT"];

    const directory =
      typeof DataProvider?.getCachedEmployeeDirectory === "function"
        ? DataProvider.getCachedEmployeeDirectory()
        : [];

    directory
      .filter(employee =>
        employee &&
        String(
          employee.employmentStatus ||
          employee.status ||
          "Employed"
        ).toLowerCase() !== "terminated"
      )
      .map(employee =>
        String(
          employee.name ||
          employee.displayName ||
          employee.title ||
          employee.email ||
          ""
        ).trim()
      )
      .filter(Boolean)
      .forEach(name => values.push(name));

    const current = String(existing || "").trim();

    if (
      current &&
      !values.some(
        value =>
          value.toLowerCase() === current.toLowerCase()
      )
    ) {
      values.push(current);
    }

    return [
      ...new Set(values)
    ].sort((a,b) => {
      if(a==="AHT") return -1;
      if(b==="AHT") return 1;
      return a.localeCompare(b);
    });
  }



  function ownerDirectoryRecords(existing = "") {
    const directory =
      typeof DataProvider !== "undefined" &&
      typeof DataProvider.getCachedEmployeeDirectory === "function"
        ? DataProvider.getCachedEmployeeDirectory()
        : [];

    const records = [];

    records.push({
      name: "AHT",
      email: "",
      division: "",
      department: "",
      jobTitle: "",
      pinned: true
    });

    directory
      .filter(employee => {
        if (!employee) return false;

        const status = String(
          employee.employmentStatus ||
          employee.status ||
          "Employed"
        ).trim().toLowerCase();

        return ![
          "terminated",
          "inactive",
          "former",
          "separated"
        ].includes(status);
      })
      .forEach(employee => {
        const name = String(
          employee.name ||
          employee.displayName ||
          employee.title ||
          employee.email ||
          ""
        ).trim();

        if (!name) return;

        records.push({
          name,
          email: String(employee.email || "").trim(),
          division: String(employee.division || "").trim(),
          department: String(employee.department || "").trim(),
          jobTitle: String(
            employee.jobTitle ||
            employee.position ||
            ""
          ).trim(),
          pinned: false
        });
      });

    /*
     * Deduplicate by employee display name because OwnerName
     * is currently stored as plain text in SharePoint.
     */
    const byName = new Map();

    records.forEach(record => {
      const key = record.name.toLowerCase();

      if (!byName.has(key)) {
        byName.set(key, record);
      }
    });

    const current = String(existing || "").trim();

    if (
      current &&
      !byName.has(current.toLowerCase())
    ) {
      byName.set(current.toLowerCase(), {
        name: current,
        email: "",
        division: "",
        department: "",
        jobTitle: "Current saved owner",
        pinned: false,
        legacy: true
      });
    }

    return [...byName.values()];
  }


  function ownerPickerCurrentValue() {
    return String(
      document.getElementById("pteOwner")?.value || ""
    ).trim();
  }


  function ownerPickerMeta(record) {
    if (record?.legacy) {
      return "Current saved owner";
    }

    return [
      record?.division,
      record?.jobTitle
    ]
      .filter(Boolean)
      .join(" · ");
  }


  function closeOwnerPicker() {
    const menu =
      document.getElementById("pteOwnerMenu");

    const trigger =
      document.getElementById("pteOwnerButton");

    menu?.classList.remove("is-open");

    trigger?.setAttribute(
      "aria-expanded",
      "false"
    );
  }


  function renderOwnerPickerResults() {
    const results =
      document.getElementById("pteOwnerResults");

    const search =
      String(
        document.getElementById("pteOwnerSearch")?.value ||
        ""
      )
        .trim()
        .toLowerCase();

    const division =
      String(
        document.getElementById("pteOwnerDivision")?.value ||
        ""
      ).trim();

    if (!results) return;

    const current =
      ownerPickerCurrentValue();

    let records =
      ownerDirectoryRecords(current);

    records = records.filter(record => {
      if (record.pinned) return true;

      if (
        division &&
        record.division !== division
      ) {
        return false;
      }

      if (!search) return true;

      const haystack = [
        record.name,
        record.email,
        record.division,
        record.department,
        record.jobTitle
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });


    const pinned =
      records.filter(record => record.pinned);

    const employees =
      records
        .filter(record => !record.pinned)
        .sort((a,b) => {
          const divisionCompare =
            String(a.division || "Other")
              .localeCompare(
                String(b.division || "Other")
              );

          if (divisionCompare !== 0) {
            return divisionCompare;
          }

          return a.name.localeCompare(b.name);
        });


    const groups = new Map();

    employees.forEach(record => {
      const key =
        record.division ||
        "Other / Unassigned";

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(record);
    });


    const optionHtml = record => {
      const selected =
        record.name === current;

      const meta =
        ownerPickerMeta(record);

      return `
        <button
          class="pte-owner-option${selected ? " is-selected" : ""}"
          type="button"
          role="option"
          aria-selected="${selected ? "true" : "false"}"
          data-owner-value="${esc(record.name)}"
        >
          <span class="pte-owner-option-main">
            ${esc(record.name)}
          </span>

          ${
            meta
              ? `
                <span class="pte-owner-option-meta">
                  ${esc(meta)}
                </span>
              `
              : ""
          }
        </button>
      `;
    };


    const pinnedHtml =
      pinned.length
        ? `
          <div class="pte-owner-pinned">
            ${pinned.map(optionHtml).join("")}
          </div>
        `
        : "";


    const groupedHtml =
      [...groups.entries()]
        .map(([group,items]) => `
          <div class="pte-owner-group">
            <div class="pte-owner-group-title">
              ${esc(group)}
            </div>

            ${items.map(optionHtml).join("")}
          </div>
        `)
        .join("");


    results.innerHTML =
      pinnedHtml ||
      groupedHtml
        ? pinnedHtml + groupedHtml
        : `
          <div class="pte-owner-empty">
            No employees match this search.
          </div>
        `;


    results
      .querySelectorAll(".pte-owner-option")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            const value =
              String(
                button.dataset.ownerValue || ""
              );

            const native =
              document.getElementById("pteOwner");

            if (native) {
              /*
               * Ensure the selected value exists in the
               * hidden native select before assigning it.
               */
              if (
                ![...native.options].some(
                  option => option.value === value
                )
              ) {
                native.add(
                  new Option(value,value)
                );
              }

              native.value = value;
            }

            const display =
              document.getElementById(
                "pteOwnerSelected"
              );

            if (display) {
              display.textContent =
                value || "— Unassigned —";
            }

            closeOwnerPicker();
          }
        );
      });
  }


  function populateOwnerDivisionFilter(existing = "") {
    const select =
      document.getElementById("pteOwnerDivision");

    if (!select) return;

    const previous =
      select.value;

    const divisions = [
      ...new Set(
        ownerDirectoryRecords(existing)
          .map(record => record.division)
          .filter(Boolean)
      )
    ].sort((a,b) => a.localeCompare(b));

    select.innerHTML =
      '<option value="">All Divisions</option>' +
      divisions
        .map(division =>
          `<option value="${esc(division)}">${esc(division)}</option>`
        )
        .join("");

    if (
      previous &&
      divisions.includes(previous)
    ) {
      select.value = previous;
    }
  }


  function initializeOwnerPicker(existing = "") {
    const native =
      document.getElementById("pteOwner");

    const trigger =
      document.getElementById("pteOwnerButton");

    const display =
      document.getElementById("pteOwnerSelected");

    const menu =
      document.getElementById("pteOwnerMenu");

    const search =
      document.getElementById("pteOwnerSearch");

    const division =
      document.getElementById("pteOwnerDivision");

    if (
      !native ||
      !trigger ||
      !display ||
      !menu
    ) {
      return;
    }


    const current =
      String(existing || "").trim();

    /*
     * Keep the native select populated because all existing
     * save logic reads pteOwner.value.
     */
    native.innerHTML =
      selectOptions(
        ownerNames(current),
        current,
        "— Unassigned —"
      );

    native.value = current;

    display.textContent =
      current || "— Unassigned —";


    populateOwnerDivisionFilter(current);


    if (search) {
      search.value = "";

      search.oninput =
        renderOwnerPickerResults;
    }

    if (division) {
      division.value = "";

      division.onchange =
        renderOwnerPickerResults;
    }


    trigger.onclick = event => {
      event.preventDefault();
      event.stopPropagation();

      const opening =
        !menu.classList.contains("is-open");

      closeOwnerPicker();

      if (!opening) return;

      menu.classList.add("is-open");

      trigger.setAttribute(
        "aria-expanded",
        "true"
      );

      renderOwnerPickerResults();

      setTimeout(
        () => search?.focus(),
        0
      );
    };


    renderOwnerPickerResults();
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

            <div id="pteDateReviewQueueBanner" class="pte-date-review-queue-banner" hidden role="status">
              <strong>Historical date review</strong>
              <span id="pteDateReviewQueueCount"></span>
              <small>Confirm each scheduling type individually. Existing dates are not changed unless you edit them.</small>
            </div>

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
                <select
                  id="pteOwner"
                  class="pte-owner-native"
                  tabindex="-1"
                  aria-hidden="true"
                ></select>

                <div
                  class="pte-owner-picker"
                  id="pteOwnerPicker"
                >
                  <button
                    class="pte-owner-trigger"
                    id="pteOwnerButton"
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded="false"
                  >
                    <span id="pteOwnerSelected">— Unassigned —</span>
                    <span
                      class="pte-owner-trigger-chevron"
                      aria-hidden="true"
                    >▼</span>
                  </button>

                  <div
                    class="pte-owner-menu"
                    id="pteOwnerMenu"
                  >
                    <div class="pte-owner-picker-toolbar">
                      <input
                        id="pteOwnerSearch"
                        class="pte-owner-search"
                        type="search"
                        placeholder="Search employees…"
                        autocomplete="off"
                      >

                      <select
                        id="pteOwnerDivision"
                        class="pte-owner-division"
                        aria-label="Filter employees by division"
                      >
                        <option value="">All Divisions</option>
                      </select>
                    </div>

                    <div
                      class="pte-owner-results"
                      id="pteOwnerResults"
                      role="listbox"
                    ></div>
                  </div>
                </div>
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
                <span>Due Date Type *</span>
                <select id="pteScheduleMode" required>
                  <option value="">— Select due date type —</option>
                  <option value="Firm">Firm Date</option>
                  <option value="Tentative">Tentative Date</option>
                  <option value="Floating">Floating / Dependent</option>
                  <option value="TBD">TBD / Unknown</option>
                </select>
              </label>

              <div class="pte-legacy-schedule-note pte-field full" id="pteLegacyScheduleNotice" hidden role="status">
                This existing task has no confirmed due-date type. The stored date may be a placeholder.
                Choose Firm, Tentative, Floating, or TBD before saving; the date will not change unless you change it.
              </div>

              <label class="field pte-field" id="pteTargetDateField">
                <span id="pteTargetLabel">Target Date *</span>
                <input id="pteTargetDate" type="date">
              </label>

              <div class="field full pte-field pte-schedule-extra" id="pteScheduleExtra" hidden>
                <div id="pteTbdControls" hidden>
                  <label class="field"><span>Why is the due date unknown? *</span>
                    <textarea id="pteScheduleReason" rows="2" placeholder="What prevents us from setting a responsible date?"></textarea>
                  </label>
                </div>
                <div id="pteFloatingControls" hidden>
                  <label class="field"><span>Triggering event / dependency *</span>
                    <input id="pteScheduleTrigger" placeholder="e.g. Architectural plans received">
                  </label>
                  <div class="pte-schedule-inline">
                    <label class="field"><span>Working days after trigger *</span>
                      <input id="pteScheduleOffset" type="number" min="0" max="365" step="1" value="10">
                    </label>
                    <label class="field"><span>Actual trigger date (when confirmed)</span>
                      <input id="pteScheduleTriggerDate" type="date">
                    </label>
                  </div>
                  <small>A target date is calculated only after the trigger date is confirmed. Calculation excludes weekends, not holidays.</small>
                </div>
                <label class="field" id="pteReviewDateField"><span>Next schedule review *</span>
                  <input id="pteScheduleReviewDate" type="date">
                  <small>This is a review reminder, NOT the task's due date.</small>
                </label>
              </div>


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

              <button id="pteSkipDateReview" type="button" class="btn pte-skip-date-review" hidden
                title="Leave this task unchanged and move to the next unclassified date">
                Skip &amp; Next
              </button>

              <button
                id="pteSaveAndNextReview"
                class="btn pte-save-next-review"
                type="submit"
                data-pte-save-next
                hidden
              >
                Save &amp; Next Review
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


    document.getElementById("pteScheduleMode")
      .addEventListener("change", syncScheduleFields);
    for (const id of ["pteScheduleTriggerDate", "pteScheduleOffset"]) {
      document.getElementById(id).addEventListener("change", syncScheduleFields);
    }
    document.getElementById("pteSkipDateReview")
      .addEventListener("click", skipDateReview);
    document.getElementById("projectTaskEditorForm")
      .addEventListener("submit", save);
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


    initializeOwnerPicker(
      item.owner || ""
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


    // Never silently convert an older task's unclassified date into a Firm commitment.
    // Also require an explicit selection for newly created tasks.
    document.getElementById("pteScheduleMode").value =
      item.scheduleMode || "";
    document.getElementById("pteScheduleReason").value = item.scheduleReason || "";
    document.getElementById("pteScheduleReviewDate").value = item.scheduleReviewDate || "";
    document.getElementById("pteScheduleTrigger").value = item.scheduleTrigger || "";
    document.getElementById("pteScheduleOffset").value = String(item.scheduleOffsetDays ?? 10);
    document.getElementById("pteScheduleTriggerDate").value = item.scheduleTriggerDate || "";
    document.getElementById("pteTargetDate").value = item.targetDate || "";
    const legacyNote = document.getElementById("pteLegacyScheduleNotice");
    if (legacyNote) legacyNote.dataset.legacyRecord = item.id && !item.scheduleMode ? "yes" : "";
    syncScheduleFields();


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

    reviewQueueActive = Boolean(options.reviewQueue && options.id);
    const queueBanner = document.getElementById("pteDateReviewQueueBanner");
    const saveNext = document.getElementById("pteSaveAndNextReview");
    const count = reviewQueueActive ? (window.ProjectWorkView?.dateReviewQueueCount?.() || 1) : 0;
    if (queueBanner) queueBanner.hidden = !reviewQueueActive;
    if (reviewQueueActive) {
      const countText = document.getElementById("pteDateReviewQueueCount");
      if (countText) countText.textContent = `${count} date${count === 1 ? "" : "s"} remaining to review`;
    }
    if (saveNext) {
      saveNext.hidden = !reviewQueueActive;
      saveNext.textContent = count > 1 ? "Save & Next Review" : "Save & Finish Review";
    }
    const skipButton = document.getElementById("pteSkipDateReview");
    if (skipButton) skipButton.hidden = !reviewQueueActive;
    if (reviewQueueActive && queueBanner) {
      const skipped = window.ProjectWorkView?.dateReviewSkippedCount?.() || 0;
      const countText = document.getElementById("pteDateReviewQueueCount");
      if (countText) countText.textContent = `${count} remaining this pass${skipped ? ` · ${skipped} skipped` : ""}`;
    }
    reviewQueueOriginalForm = snapshotDateReviewForm();

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
    reviewQueueActive = false;
    reviewQueueOriginalForm = "";
  }

  // Compare the actual form controls, including predecessor selections. A skipped
  // task must never be written to SharePoint, and unsaved edits need a warning.
  function snapshotDateReviewForm() {
    const form = document.getElementById("projectTaskEditorForm");
    if (!form) return "";
    return JSON.stringify(Array.from(form.querySelectorAll("input,select,textarea"))
      .map(el => [el.id || el.name || "", el.type === "checkbox" || el.type === "radio" ? el.checked : el.value]));
  }

  function skipDateReview() {
    if (!reviewQueueActive || !editingId || saveInProgress) return;
    if (snapshotDateReviewForm() !== reviewQueueOriginalForm &&
        !window.confirm("Discard your unsaved edits to this task and move to the next date review?")) return;
    const skippedId = editingId;
    close();
    const nextId = window.ProjectWorkView?.skipUnclassifiedDate?.(skippedId);
    if (!nextId) window.ProjectWorkView?.render?.();
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

  function syncScheduleFields() {
    const mode = value("pteScheduleMode");
    const tbd = mode === "TBD";
    const floating = mode === "Floating";
    const needsReview = tbd || floating;
    const legacyNote = document.getElementById("pteLegacyScheduleNotice");
    if (legacyNote) legacyNote.hidden = Boolean(mode) || !legacyNote.dataset.legacyRecord;
    document.getElementById("pteScheduleExtra").hidden = !needsReview;
    document.getElementById("pteTbdControls").hidden = !tbd;
    document.getElementById("pteFloatingControls").hidden = !floating;
    document.getElementById("pteReviewDateField").hidden = !needsReview;
    const target = document.getElementById("pteTargetDate");
    const wrapper = document.getElementById("pteTargetDateField");
    wrapper.hidden = tbd;
    target.readOnly = floating;
    document.getElementById("pteTargetLabel").textContent =
      floating ? "Calculated Target (after trigger)" : mode === "Tentative" ? "Estimated Target Date *" : mode === "Firm" ? "Committed Target Date *" : "Target Date (not classified)";
    if (floating) {
      target.value = AHTScheduling.businessDays(
        value("pteScheduleTriggerDate"), value("pteScheduleOffset")
      );
    } else if (tbd) {
      target.value = "";
    }
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

    const mode = value("pteScheduleMode");
    if (!["Firm", "Tentative", "Floating", "TBD"].includes(mode)) {
      return failValidation("Choose a Due Date Type.", "pteScheduleMode");
    }
    if (["Firm", "Tentative"].includes(mode) && !targetDate) {
      return failValidation("A date is required for Firm or Tentative scheduling.", "pteTargetDate");
    }
    if (mode === "TBD" && !value("pteScheduleReason")) {
      return failValidation("Explain why the due date is unknown.", "pteScheduleReason");
    }
    if (mode === "Floating") {
      if (!value("pteScheduleTrigger")) {
        return failValidation("Name the trigger/dependency.", "pteScheduleTrigger");
      }
      const offsetText = value("pteScheduleOffset");
      if (offsetText === "" || !Number.isInteger(Number(offsetText)) || Number(offsetText) < 0 || Number(offsetText) > 365) {
        return failValidation("Working-day offset must be a whole number from 0–365.", "pteScheduleOffset");
      }
      if (value("pteScheduleTriggerDate") && !targetDate) {
        return failValidation("Unable to calculate the floating target date.", "pteScheduleTriggerDate");
      }
    }
    if (["TBD", "Floating"].includes(mode) && !value("pteScheduleReviewDate")) {
      return failValidation("Set the next schedule review date (not a task due date).", "pteScheduleReviewDate");
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

    // Input Needed By is optional unless a genuine information deadline exists.

    if (
      startDate &&
      targetDate &&
      startDate > targetDate
    ) {
      return failValidation(
        "Can't save Task — Start Date cannot be after Target Date.",
        "pteStartDate"
      );
    }

    if (
      targetDate &&
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

    // The submitter is explicit; normal Save Task never advances the review queue.
    const saveAndNext = reviewQueueActive && Boolean(event.submitter?.hasAttribute("data-pte-save-next"));

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
      scheduleMode: value("pteScheduleMode"),
      scheduleReason: value("pteScheduleMode") === "TBD" ? value("pteScheduleReason") : "",
      scheduleReviewDate: ["TBD", "Floating"].includes(value("pteScheduleMode")) ? value("pteScheduleReviewDate") : "",
      scheduleTrigger: value("pteScheduleMode") === "Floating" ? value("pteScheduleTrigger") : "",
      scheduleOffsetDays: value("pteScheduleMode") === "Floating" ? Number(value("pteScheduleOffset")) : 0,
      scheduleTriggerDate: value("pteScheduleMode") === "Floating" ? value("pteScheduleTriggerDate") : "",

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
      console.error("Project Work Item SharePoint save failed.", error);
      // Revert optimistic local update; keep editor open so the user can retry.
      ProjectWorkItems.setItems(all);
      alert(`Task was NOT saved to SharePoint. Nothing was finalized.\n\n${error.message}`);
      return;
    } finally {
      saveInProgress = false;
    }

    close();

    if (saveAndNext) {
      // Only move after SharePoint confirms the save. The queue is recalculated
      // from fresh records so the item just classified is removed automatically.
      const nextId = window.ProjectWorkView?.reviewNextUnclassifiedDate?.(record.id);
      if (!nextId) window.ProjectWorkView?.render?.();
      return;
    }

    window.ProjectWorkView
      ?.openItem?.(record.id);
  }


  document.addEventListener(
    "click",
    event => {
      if (
        !event.target.closest(
          "#pteOwnerPicker"
        )
      ) {
        closeOwnerPicker();
      }
    }
  );


  document.addEventListener(
    "keydown",
    event => {
      if (event.key === "Escape") {
        closeOwnerPicker();
      }
    }
  );



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

      if (!currentUser?.canEdit) {
        return;
      }

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

      event.preventDefault();
      event.stopImmediatePropagation();

      if (!currentUser?.canEdit) {
        return;
      }

      const parentId =
        window.__projectPlanSelectedTaskId;

      if (!parentId) {
        return;
      }

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
