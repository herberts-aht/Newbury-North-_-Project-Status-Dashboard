const ProjectContactsView = (() => {
  let seededProjectKey = null;
  let displayMode = "cards";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function projectKey() {
    const project =
      typeof currentProject === "function"
        ? currentProject()
        : null;

    if (!project) return "";

    return String(project.id || project.sharePointId || "");
  }

  function seedPrototypeContacts() {
    const key = projectKey();
    if (!key) return;

    if (
      seededProjectKey === key &&
      ProjectContacts.forProject(key).length
    ) {
      return;
    }

    seededProjectKey = key;

    ProjectContacts.setContacts([
      {
        id: `${key}-aht`,
        projectId: key,
        name: "AHT Global",
        type: "Internal",
        role: "Technology Integrator",
        dashboardUser: true,
        sortOrder: 10
      },
      {
        id: `${key}-newbury`,
        projectId: key,
        name: "Newbury North",
        type: "Builder",
        role: "Builder / Project Team",
        dashboardUser: false,
        sortOrder: 20
      },
      {
        id: `${key}-russell`,
        projectId: key,
        name: "Russell Edwards",
        type: "Consultant",
        role: "AV Consultant",
        dashboardUser: false,
        sortOrder: 30
      },
      {
        id: `${key}-ces`,
        projectId: key,
        name: "CES",
        contactPerson: "Eli",
        type: "Engineer / Trade",
        role: "Electrical Engineer",
        dashboardUser: false,
        sortOrder: 40
      },
      {
        id: `${key}-cmea`,
        projectId: key,
        name: "CMEA",
        type: "Engineer",
        role: "MEP / Engineering Coordination",
        dashboardUser: false,
        sortOrder: 50
      },
      {
        id: `${key}-aquatics`,
        projectId: key,
        name: "Martin Aquatics",
        type: "Consultant",
        role: "Aquatics Design",
        dashboardUser: false,
        sortOrder: 60
      },
      {
        id: `${key}-landscape`,
        projectId: key,
        name: "Landscape / Builder",
        type: "Project Team",
        role: "Landscape / Exterior Coordination",
        dashboardUser: false,
        sortOrder: 70
      }
    ]);
  }

  function contactCard(contact) {
    return `
      <article class="pc-card">
        <div class="pc-card-top">
          <div>
            <div class="pc-type">${escapeHtml(contact.type || "Contact")}</div>
            <h3>${escapeHtml(contact.name)}</h3>
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
            <strong>${escapeHtml(contact.contactPerson || "—")}</strong>
          </div>

          <div>
            <span>Role</span>
            <strong>${escapeHtml(contact.role || "—")}</strong>
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
          <span>${contact.active ? "Active" : "Inactive"}</span>
          <button
            class="btn admin-only"
            type="button"
            onclick="ProjectContactsView.editContact('${String(contact.id).replaceAll("'", "\\'")}')"
          >
            Edit
          </button>
        </div>
      </article>
    `;
  }

  function contactRow(contact) {
    return `
      <div class="pc-row">
        <div>
          <strong>${escapeHtml(contact.name)}</strong>
          <span>${escapeHtml(contact.type || "Contact")}</span>
        </div>

        <div>
          ${escapeHtml(contact.contactPerson || "—")}
        </div>

        <div>
          ${escapeHtml(contact.role || "—")}
        </div>

        <div>
          ${
            contact.dashboardUser
              ? "Yes"
              : "No"
          }
        </div>

        <div>
          ${contact.active ? "Active" : "Inactive"}
        </div>

        <button
          class="btn admin-only"
          type="button"
          onclick="ProjectContactsView.editContact('${String(contact.id).replaceAll("'", "\\'")}')"
        >
          Edit
        </button>
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

  function render() {
    const root = document.getElementById("projectContactsContent");
    if (!root) return;

    seedPrototypeContacts();

    const contacts = ProjectContacts.forProject(projectKey());

    root.innerHTML = `
      <div class="pc-toolbar">

        <div>
          <h3>Project Contact List</h3>
          <p>
            Contacts can be referenced by Project Work and Information Required
            without needing dashboard access.
          </p>
        </div>

        <div class="pc-toolbar-right">
          ${viewToggle()}
        </div>

      </div>

      ${
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
      }
    `;
  }

  function setDisplayMode(mode) {
    if (!["cards", "list"].includes(mode)) return;

    displayMode = mode;
    render();
  }

  function editContact(id) {
    const contact = ProjectContacts.getContact(id);

    if (!contact) return;

    alert(
      `Contact editing will be enabled when Project Contacts are connected to SharePoint.\n\n${ProjectContacts.displayName(contact)}`
    );
  }

  function addContact() {
    alert(
      "Adding Project Contacts will be enabled when this prototype is connected to SharePoint."
    );
  }

  function onProjectChanged() {
    seededProjectKey = null;
    render();
  }

  function watchViewActivation() {
    const view = document.getElementById("projectContacts");
    if (!view) return;

    const observer = new MutationObserver(() => {
      if (view.classList.contains("active")) {
        render();
      }
    });

    observer.observe(view, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  document.addEventListener("change", event => {
    if (!event.target.matches("#projectContacts .project-select-clone")) return;

    setTimeout(() => {
      onProjectChanged();
    }, 0);
  });

  document.addEventListener("DOMContentLoaded", () => {
    watchViewActivation();

    const addButton =
      document.getElementById("addProjectContactBtn");

    if (addButton) {
      addButton.addEventListener("click", addContact);
    }
  });

  return {
    render,
    setDisplayMode,
    editContact,
    addContact,
    onProjectChanged
  };
})();

window.ProjectContactsView = ProjectContactsView;
