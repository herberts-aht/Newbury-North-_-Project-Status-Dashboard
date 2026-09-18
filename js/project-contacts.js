/*
 * Project Contacts
 * ----------------
 * Project-specific people, companies, consultants, trades and teams.
 *
 * Important:
 * - A Project Contact does NOT need dashboard access.
 * - Dashboard access and Project Contacts remain separate concepts.
 * - Contacts can later feed:
 *     Project Work -> Waiting On
 *     Project Work -> Owner
 *     Information Required -> Requested From
 */

const ProjectContacts = (() => {
  let contacts = [];

  function normalizeContact(contact = {}) {
    return {
      id: contact.id,
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
    return contacts.find(
      contact => String(contact.id) === String(id)
    ) || null;
  }

  function displayName(contact) {
    if (!contact) return "";

    if (contact.contactPerson && contact.name) {
      return `${contact.name} · ${contact.contactPerson}`;
    }

    return contact.name || contact.contactPerson || "";
  }

  function selectorOptions(projectId) {
    return forProject(projectId).map(contact => ({
      id: contact.id,
      value: contact.name || contact.contactPerson,
      label: displayName(contact),
      type: contact.type,
      role: contact.role,
      dashboardUser: contact.dashboardUser
    }));
  }

  return {
    setContacts,
    getContacts,
    forProject,
    getContact,
    displayName,
    selectorOptions
  };
})();

window.ProjectContacts = ProjectContacts;
