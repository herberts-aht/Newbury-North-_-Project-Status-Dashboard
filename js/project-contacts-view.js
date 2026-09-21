const ProjectContactsView = (() => {
  let seededProjects = new Set();
  let displayMode = "cards";
  let showArchived = false;
  let editingId = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isAdmin() {
    try {
      if (
        typeof currentUser !== "undefined" &&
        currentUser?.canAdmin
      ) {
        return true;
      }
    } catch {}

    return String(
      document.getElementById("roleLabel")?.textContent || ""
    ).trim().toLowerCase() === "administrator";
  }

  function projectKey() {
    const project =
      typeof currentProject === "function"
        ? currentProject()
        : null;

    if (!project) return "";

    return String(
      project.id ||
      project.sharePointId ||
      ""
    );
  }

  function seedPrototypeContacts() {
    const key = projectKey();
    if (!key) return;

    const existing = ProjectContacts.forProject(
      key,
      { includeInactive: true }
    );

    if (existing.length) {
      seededProjects.add(key);
      return;
    }

    if (seededProjects.has(key)) {
      return;
    }

    seededProjects.add(key);

    ProjectContacts.setProjectContacts(key, [
      {
        id: `${key}-aht`,
        name: "AHT Global",
        type: "Internal",
        role: "Technology Integrator",
        dashboardUser: true,
        active: true,
        sortOrder: 10
      },
      {
        id: `${key}-newbury`,
        name: "Newbury North",
        type: "Builder",
        role: "Builder / Project Team",
        dashboardUser: false,
        active: true,
        sortOrder: 20
      },
      {
        id: `${key}-russell`,
        name: "Russell Edwards",
        type: "Consultant",
        role: "AV Consultant",
        dashboardUser: false,
        active: true,
        sortOrder: 30
      },
      {
        id: `${key}-ces`,
        name: "CES",
        contactPerson: "Eli",
        type: "Engineer / Trade",
        role: "Electrical Engineer",
        dashboardUser: false,
        active: true,
        sortOrder: 40
      },
      {
        id: `${key}-cmea`,
        name: "CMEA",
        type: "Engineer",
        role: "MEP / Engineering Coordination",
        dashboardUser: false,
        active: true,
        sortOrder: 50
      },
      {
        id: `${key}-aquatics`,
        name: "Martin Aquatics",
        type: "Consultant",
        role: "Aquatics Design",
        dashboardUser: false,
        active: true,
        sortOrder: 60
      },
      {
        id: `${key}-landscape`,
        name: "Landscape / Builder",
        type: "Project Team",
        role: "Landscape / Exterior Coordination",
        dashboardUser: false,
        active: true,
        sortOrder: 70
      }
    ]);
  }

  function contactCard(contact) {
    return `
      <article class="pc-card ${contact.active ? "" : "pc-inactive"}">
        <div class="pc-card-top">
          <div>
            <div class="pc-type">
              ${escapeHtml(contact.type || "Contact")}
            </div>

            <h3>
              ${escapeHtml(contact.name || contact.contactPerson)}
            </h3>
          </div>

          ${
            contact.dashboardUser
              ? `<span class="pc-dashboard-user">Dashboard User</span>`
              : ""
          }
        </div>

        <div class="pc-rule"></div>

        <div class="pc-meta">
          <div>
            <span>Contact</span>
            <strong>
              ${escapeHtml(contact.contactPerson || "—")}
            </strong>
          </div>

          <div>
            <span>Role</span>
            <strong>
              ${escapeHtml(contact.role || "—")}
            </strong>
          </div>
        </div>

        ${
          contact.email || contact.phone
            ? `
              <div class="pc-contact-details">
                ${
                  contact.email
                    ? `<div>${escapeHtml(contact.email)}</div>`
                    : ""
                }

                ${
                  contact.phone
                    ? `<div>${escapeHtml(contact.phone)}</div>`
                    : ""
                }
              </div>
            `
            : ""
        }

        <div class="pc-footer">
          <span class="${contact.active ? "" : "pc-archived-label"}">
            ${contact.active ? "Active" : "Archived"}
          </span>

          ${
            isAdmin()
              ? `
                <button
                  class="btn"
                  type="button"
                  onclick="ProjectContactsView.editContact('${String(contact.id).replaceAll("'", "\\'")}')"
                >
                  Edit
                </button>
              `
              : ""
          }
        </div>
      </article>
    `;
  }

  function contactRow(contact) {
    return `
      <div class="pc-row ${contact.active ? "" : "pc-inactive"}">
        <div>
          <strong>
            ${escapeHtml(contact.name || contact.contactPerson)}
          </strong>

          <span>
            ${escapeHtml(contact.type || "Contact")}
          </span>
        </div>

        <div>
          ${escapeHtml(contact.contactPerson || "—")}
        </div>

        <div>
          ${escapeHtml(contact.role || "—")}
        </div>

        <div>
          ${contact.dashboardUser ? "Yes" : "No"}
        </div>

        <div>
          ${contact.active ? "Active" : "Archived"}
        </div>

        <div>
          ${
            isAdmin()
              ? `
                <button
                  class="btn"
                  type="button"
                  onclick="ProjectContactsView.editContact('${String(contact.id).replaceAll("'", "\\'")}')"
                >
                  Edit
                </button>
              `
              : ""
          }
        </div>
      </div>
    `;
  }

  function viewToggle() {
    return `
      <div class="pc-view-control">
        <span>View</span>

        <div class="pc-view-toggle">
          <button
            type="button"
            class="${displayMode === "cards" ? "active" : ""}"
            onclick="ProjectContactsView.setDisplayMode('cards')"
          >
            Cards
          </button>

          <button
            type="button"
            class="${displayMode === "list" ? "active" : ""}"
            onclick="ProjectContactsView.setDisplayMode('list')"
          >
            List
          </button>
        </div>
      </div>
    `;
  }

  function archivedControl() {
    if (!isAdmin()) return "";

    return `
      <label class="pc-show-archived">
        <input
          type="checkbox"
          ${showArchived ? "checked" : ""}
          onchange="ProjectContactsView.setShowArchived(this.checked)"
        >
        Show archived
      </label>
    `;
  }

  function render() {
    const root =
      document.getElementById("projectContactsContent");

    if (!root) return;

    seedPrototypeContacts();

    const contacts =
      ProjectContacts.forProject(
        projectKey(),
        {
          includeInactive:
            isAdmin() && showArchived
        }
      );

    root.innerHTML = `
      <div class="pc-toolbar">

        <div>
          <h3>Project Contact List</h3>

          <p>
            Contacts can be referenced by Project Plan and Information Required
            without needing dashboard access.
          </p>
        </div>

        <div class="pc-toolbar-right">
          ${archivedControl()}
          ${viewToggle()}
        </div>

      </div>

      ${
        contacts.length
          ? (
              displayMode === "cards"
                ? `
                  <div class="pc-card-grid">
                    ${contacts.map(contactCard).join("")}
                  </div>
                `
                : `
                  <div class="pc-list">

                    <div class="pc-row pc-row-head">
                      <div>Company / Name</div>
                      <div>Contact</div>
                      <div>Role</div>
                      <div>Dashboard User</div>
                      <div>Status</div>
                      <div></div>
                    </div>

                    ${contacts.map(contactRow).join("")}

                  </div>
                `
            )
          : `
            <div class="pc-empty">
              No project contacts have been added yet.
            </div>
          `
      }
    `;
  }

  function setDisplayMode(mode) {
    if (!["cards", "list"].includes(mode)) return;

    displayMode = mode;
    render();
  }

  function setShowArchived(value) {
    showArchived = Boolean(value);
    render();
  }

  function ensureEditor() {
    if (
      document.getElementById("projectContactEditorBackdrop")
    ) {
      return;
    }

    const backdrop =
      document.createElement("div");

    backdrop.id =
      "projectContactEditorBackdrop";

    backdrop.className =
      "modal-backdrop pc-editor-backdrop";

    backdrop.innerHTML = `
      <div
        class="modal pc-editor-modal"
        role="dialog"
        aria-modal="true"
      >
        <h3 id="pcEditorTitle">
          Add Contact
        </h3>

        <form id="pcEditorForm">

          <div class="form-grid">

            <div class="field full">
              <label for="pcName">
                Company / Name *
              </label>

              <input
                id="pcName"
                name="name"
                required
                autocomplete="off"
              >
            </div>


            <div class="field">
              <label for="pcContactPerson">
                Contact Person
              </label>

              <input
                id="pcContactPerson"
                name="contactPerson"
                autocomplete="off"
              >
            </div>


            <div class="field">
              <label for="pcType">
                Type
              </label>

              <select
                id="pcType"
                name="type"
              >
                <option value="">Select type…</option>
                <option>Internal</option>
                <option>Builder</option>
                <option>Architect</option>
                <option>Engineer</option>
                <option>Engineer / Trade</option>
                <option>Consultant</option>
                <option>Trade</option>
                <option>Vendor</option>
                <option>Client</option>
                <option>Project Team</option>
                <option>Other</option>
              </select>
            </div>


            <div class="field full">
              <label for="pcRole">
                Role / Responsibility
              </label>

              <input
                id="pcRole"
                name="role"
                autocomplete="off"
              >
            </div>


            <div class="field">
              <label for="pcEmail">
                Email
              </label>

              <input
                id="pcEmail"
                name="email"
                type="email"
                autocomplete="off"
              >
            </div>


            <div class="field">
              <label for="pcPhone">
                Phone
              </label>

              <input
                id="pcPhone"
                name="phone"
                type="tel"
                autocomplete="off"
              >
            </div>


            <div class="field">
              <label class="pc-checkbox-label">
                <input
                  id="pcDashboardUser"
                  name="dashboardUser"
                  type="checkbox"
                >
                Dashboard User
              </label>
            </div>


            <div class="field">
              <label class="pc-checkbox-label">
                <input
                  id="pcActive"
                  name="active"
                  type="checkbox"
                  checked
                >
                Active
              </label>
            </div>

          </div>


          <div class="modal-actions">
            <button
              id="pcArchiveBtn"
              class="btn danger"
              type="button"
              style="display:none"
            >
              Archive
            </button>

            <span style="flex:1"></span>

            <button
              class="btn"
              type="button"
              data-pc-close
            >
              Cancel
            </button>

            <button
              class="btn primary"
              type="submit"
            >
              Save Contact
            </button>
          </div>

        </form>
      </div>
    `;

    backdrop.addEventListener(
      "click",
      event => {
        if (
          event.target === backdrop ||
          event.target.closest("[data-pc-close]")
        ) {
          closeEditor();
        }
      }
    );

    backdrop
      .querySelector("#pcEditorForm")
      .addEventListener(
        "submit",
        saveEditor
      );

    backdrop
      .querySelector("#pcArchiveBtn")
      .addEventListener(
        "click",
        toggleArchive
      );

    document.body.appendChild(backdrop);
  }

  function openEditor(contact = null) {
    if (!isAdmin()) return;

    ensureEditor();

    editingId =
      contact?.id || null;

    document.getElementById(
      "pcEditorTitle"
    ).textContent =
      contact
        ? "Edit Contact"
        : "Add Contact";

    document.getElementById(
      "pcName"
    ).value =
      contact?.name || "";

    document.getElementById(
      "pcContactPerson"
    ).value =
      contact?.contactPerson || "";

    document.getElementById(
      "pcType"
    ).value =
      contact?.type || "";

    document.getElementById(
      "pcRole"
    ).value =
      contact?.role || "";

    document.getElementById(
      "pcEmail"
    ).value =
      contact?.email || "";

    document.getElementById(
      "pcPhone"
    ).value =
      contact?.phone || "";

    document.getElementById(
      "pcDashboardUser"
    ).checked =
      Boolean(contact?.dashboardUser);

    document.getElementById(
      "pcActive"
    ).checked =
      contact
        ? contact.active !== false
        : true;

    const archiveButton =
      document.getElementById(
        "pcArchiveBtn"
      );

    if (contact) {
      archiveButton.style.display = "";

      archiveButton.textContent =
        contact.active === false
          ? "Restore"
          : "Archive";
    } else {
      archiveButton.style.display =
        "none";
    }

    const backdrop =
      document.getElementById(
        "projectContactEditorBackdrop"
      );

    backdrop.style.display =
      "flex";

    setTimeout(() => {
      document
        .getElementById("pcName")
        ?.focus();
    }, 0);
  }

  function closeEditor() {
    const backdrop =
      document.getElementById(
        "projectContactEditorBackdrop"
      );

    if (!backdrop) return;

    backdrop.style.display =
      "none";

    editingId = null;
  }

  function saveEditor(event) {
    event.preventDefault();

    if (!isAdmin()) return;

    const existing =
      editingId
        ? ProjectContacts.getContact(
            editingId
          )
        : null;

    const name =
      String(
        document.getElementById(
          "pcName"
        ).value || ""
      ).trim();

    if (!name) {
      document
        .getElementById("pcName")
        .focus();

      return;
    }

    const projectContacts =
      ProjectContacts.forProject(
        projectKey(),
        { includeInactive: true }
      );

    ProjectContacts.saveContact({
      ...(existing || {}),

      id:
        existing?.id ||
        `${projectKey()}-contact-${Date.now()}`,

      projectId:
        existing?.projectId ||
        projectKey(),

      name,

      contactPerson:
        document.getElementById(
          "pcContactPerson"
        ).value,

      type:
        document.getElementById(
          "pcType"
        ).value,

      role:
        document.getElementById(
          "pcRole"
        ).value,

      email:
        document.getElementById(
          "pcEmail"
        ).value,

      phone:
        document.getElementById(
          "pcPhone"
        ).value,

      dashboardUser:
        document.getElementById(
          "pcDashboardUser"
        ).checked,

      active:
        document.getElementById(
          "pcActive"
        ).checked,

      sortOrder:
        existing?.sortOrder ||
        (
          Math.max(
            0,
            ...projectContacts.map(
              contact =>
                Number(
                  contact.sortOrder || 0
                )
            )
          ) + 10
        )
    });

    closeEditor();
    render();
  }

  function toggleArchive() {
    if (
      !isAdmin() ||
      !editingId
    ) {
      return;
    }

    const contact =
      ProjectContacts.getContact(
        editingId
      );

    if (!contact) return;

    ProjectContacts.setActive(
      editingId,
      !contact.active
    );

    closeEditor();
    render();
  }

  function editContact(id) {
    if (!isAdmin()) return;

    const contact =
      ProjectContacts.getContact(id);

    if (!contact) return;

    openEditor(contact);
  }

  function addContact() {
    if (!isAdmin()) return;

    openEditor();
  }

  function onProjectChanged() {
    render();
  }

  function watchViewActivation() {
    const view =
      document.getElementById(
        "projectContacts"
      );

    if (!view) return;

    const observer =
      new MutationObserver(() => {
        if (
          view.classList.contains(
            "active"
          )
        ) {
          render();
        }
      });

    observer.observe(
      view,
      {
        attributes: true,
        attributeFilter: ["class"]
      }
    );
  }

  document.addEventListener(
    "change",
    event => {
      if (
        !event.target.matches(
          "#projectContacts .project-select-clone"
        )
      ) {
        return;
      }

      setTimeout(
        onProjectChanged,
        0
      );
    }
  );

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      watchViewActivation();

      const addButton =
        document.getElementById(
          "addProjectContactBtn"
        );

      if (addButton) {
        addButton.addEventListener(
          "click",
          addContact
        );
      }
    }
  );

  return {
    render,
    setDisplayMode,
    setShowArchived,
    editContact,
    addContact,
    onProjectChanged
  };
})();

window.ProjectContactsView =
  ProjectContactsView;
