/*
 * Project Contacts
 * ----------------
 * Project-specific people, companies, consultants, trades and teams.
 *
 * Important:
 * - A Project Contact does NOT need dashboard access.
 * - Dashboard access and Project Contacts remain separate concepts.
 * - Contacts can feed:
 *     Project Plan -> Waiting On
 *     Project Plan -> Owner / Responsible
 *     Information Required -> Requested From
 */

const ProjectContacts = (() => {
  const STORAGE_KEY = "aht-project-contacts-prototype-v1";

  let contacts = [];

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        contacts = [];
        return;
      }

      const parsed = JSON.parse(raw);

      contacts = Array.isArray(parsed)
        ? parsed.map(normalizeContact)
        : [];
    } catch (error) {
      console.warn(
        "Project Contacts local prototype data could not be loaded.",
        error
      );

      contacts = [];
    }
  }

  function persistLocal() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(contacts)
      );
    } catch (error) {
      console.warn(
        "Project Contacts local prototype data could not be saved.",
        error
      );
    }
  }

  function normalizeContact(contact = {}) {
    return {
      id: contact.id || `contact-${Date.now()}`,
      projectId: String(contact.projectId ?? ""),
      name: String(contact.name ?? "").trim(),
      contactPerson: String(contact.contactPerson ?? "").trim(),
      type: String(contact.type ?? "").trim(),
      role: String(contact.role ?? "").trim(),
      email: String(contact.email ?? "").trim(),
      phone: String(contact.phone ?? "").trim(),
      dashboardUser: Boolean(contact.dashboardUser),
      active: contact.active !== false,
      sortOrder: Number(contact.sortOrder || 0)
    };
  }

  function setContacts(nextContacts = []) {
    contacts = Array.isArray(nextContacts)
      ? nextContacts.map(normalizeContact)
      : [];

    persistLocal();

    return getContacts();
  }

  function getContacts() {
    return contacts.map(contact => ({ ...contact }));
  }

  function forProject(projectId, options = {}) {
    const includeInactive = Boolean(options.includeInactive);

    return contacts
      .filter(contact =>
        String(contact.projectId) === String(projectId) &&
        (includeInactive || contact.active)
      )
      .slice()
      .sort((a, b) =>
        Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
        String(a.name).localeCompare(String(b.name))
      );
  }

  function getContact(id) {
    const contact = contacts.find(
      contact => String(contact.id) === String(id)
    );

    return contact ? { ...contact } : null;
  }

  function saveContact(contact = {}) {
    const normalized = normalizeContact(contact);

    const index = contacts.findIndex(
      item => String(item.id) === String(normalized.id)
    );

    if (index >= 0) {
      contacts[index] = normalized;
    } else {
      contacts.push(normalized);
    }

    persistLocal();

    return { ...normalized };
  }

  function setProjectContacts(projectId, nextContacts = []) {
    const key = String(projectId ?? "");

    const otherProjects = contacts.filter(
      contact => String(contact.projectId) !== key
    );

    const projectContacts = Array.isArray(nextContacts)
      ? nextContacts.map(contact =>
          normalizeContact({
            ...contact,
            projectId: key
          })
        )
      : [];

    contacts = [
      ...otherProjects,
      ...projectContacts
    ];

    persistLocal();

    return forProject(key, {
      includeInactive: true
    });
  }

  function setActive(id, active) {
    const index = contacts.findIndex(
      contact => String(contact.id) === String(id)
    );

    if (index < 0) return null;

    contacts[index] = {
      ...contacts[index],
      active: Boolean(active)
    };

    persistLocal();

    return { ...contacts[index] };
  }

  function displayName(contact) {
    if (!contact) return "";

    if (contact.contactPerson && contact.name) {
      return `${contact.name} · ${contact.contactPerson}`;
    }

    return contact.name || contact.contactPerson || "";
  }

  function selectorOptions(projectId, options = {}) {
    return forProject(projectId, options).map(contact => ({
      id: contact.id,
      value: contact.name || contact.contactPerson,
      label: displayName(contact),
      type: contact.type,
      role: contact.role,
      dashboardUser: contact.dashboardUser,
      active: contact.active
    }));
  }

  loadLocal();

  return {
    setContacts,
    setProjectContacts,
    saveContact,
    setActive,
    getContacts,
    forProject,
    getContact,
    displayName,
    selectorOptions
  };
})();

window.ProjectContacts = ProjectContacts;
