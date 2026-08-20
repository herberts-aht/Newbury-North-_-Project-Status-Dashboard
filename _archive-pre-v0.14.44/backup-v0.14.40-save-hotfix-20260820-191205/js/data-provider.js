// Replaceable project-data providers.
//
// LocalStorageDataProvider remains the active production-safe provider until
// APP_CONFIG.dataProvider is changed to "sharePoint". SharePointDataProvider
// maps the four SharePoint Lists back into the same state shape already used
// by the dashboard, so no dashboard rendering code needs to change.

const LocalStorageDataProvider = {
  name: "localStorage",
  storageKey: "aht_perm_demo_v23",
  usersKey: "aht_users_v1",

  async loadState() {
    const saved = localStorage.getItem(this.storageKey);
    return saved ? JSON.parse(saved) : structuredClone(DEMO);
  },

  async saveState(nextState) {
    localStorage.setItem(this.storageKey, JSON.stringify(nextState));
  },

  async loadUsers() {
    const saved = localStorage.getItem(this.usersKey);
    return saved ? JSON.parse(saved) : structuredClone(USERS);
  },

  async saveUsers(nextUsers) {
    localStorage.setItem(this.usersKey, JSON.stringify(nextUsers));
  }
};

const SharePointDataProvider = {
  name: "sharePoint",

  get config() {
    return APP_CONFIG.sharePoint;
  },

  async getAccessToken() {
    if (typeof window.getMicrosoftAccessToken === "function") {
      return window.getMicrosoftAccessToken(APP_CONFIG.entra.scopes);
    }
    throw new Error("Microsoft sign-in is not ready.");
  },

  async graph(path, options = {}) {
    const token = await this.getAccessToken();
    const response = await fetch(
      path.startsWith("http") ? path : `https://graph.microsoft.com/v1.0${path}`,
      {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      }
    );

    if (!response.ok) {
      let details = "";
      try {
        const body = await response.json();
        details = body?.error?.message || body?.error?.code || "";
      } catch (_) {
        details = await response.text();
      }
      throw new Error(
        `Microsoft Graph request failed (${response.status} ${response.statusText})` +
        (details ? `: ${details}` : "")
      );
    }

    if (response.status === 204) return null;
    return response.json();
  },

  normalizeDate(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
  },

  mapHealth(fields) {
    if (fields.HealthMode === "manual" && fields.HealthOverride) {
      return fields.HealthOverride;
    }
    return "On Track";
  },

  async getSite() {
    if (this._site) return this._site;

    const siteUrl = new URL(this.config.siteUrl);
    const relativePath = siteUrl.pathname.replace(/^\/+/, "");
    this._site = await this.graph(
      `/sites/${encodeURIComponent(siteUrl.hostname)}:/${relativePath}?$select=id,displayName,webUrl`
    );
    return this._site;
  },

  async getListId(displayName) {
    this._listIds ||= {};
    if (this._listIds[displayName]) return this._listIds[displayName];

    const site = await this.getSite();
    let url = `/sites/${encodeURIComponent(site.id)}/lists?$select=id,displayName`;
    while (url) {
      const data = await this.graph(url);
      for (const list of data.value || []) {
        this._listIds[list.displayName] = list.id;
      }
      url = data["@odata.nextLink"] || "";
    }

    const id = this._listIds[displayName];
    if (!id) throw new Error(`SharePoint list not found: ${displayName}`);
    return id;
  },

  async getProjectRows() {
    const site = await this.getSite();
    const listId = await this.getListId(this.config.lists.projects);

    let url =
      `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}` +
      `/items?$expand=fields&$top=200`;

    const rows = [];
    while (url) {
      const data = await this.graph(url);
      rows.push(...(data.value || []));
      url = data["@odata.nextLink"] || "";
    }
    return rows;
  },

  async getListRows(displayName, fieldNames = []) {
    const site = await this.getSite();
    const listId = await this.getListId(displayName);

    const expand = fieldNames.length
      ? `fields($select=${fieldNames.join(",")})`
      : "fields";

    let url =
      `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}` +
      `/items?$expand=${expand}&$top=500`;

    const rows = [];
    while (url) {
      const data = await this.graph(url);
      rows.push(...(data.value || []));
      url = data["@odata.nextLink"] || "";
    }
    return rows;
  },

  projectLookupId(fields) {
    const candidates = [
      fields.ProjectLookupId,
      fields.ProjectId,
      fields.Project,
      fields.Project_x003a_ID
    ];
    for (const value of candidates) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
    }
    return 0;
  },

  mapDeliverable(item) {
    const fields = item.fields || {};
    const title = fields.Title || "Untitled Deliverable";
    const current = fields.CurrentActivity || "";
    const targetDate = this.normalizeDate(fields.TargetDate);
    return {
      id: Number(item.id),
      sharePointId: Number(item.id),
      legacyId: Number(fields.LegacyId || 0),
      projectSharePointId: this.projectLookupId(fields),
      deliverable: title,
      name: title,
      discipline: fields.Discipline || "",
      progressPhase: fields.ProgressPhase || "",
      status: fields.OperationalStatus || "Pending",
      owner: fields.Owner || "",
      current,
      currentActivity: current,
      waitingOn: fields.WaitingOn || "",
      nextStep: fields.NextStep || "",
      startDate: this.normalizeDate(fields.StartDate),
      date: targetDate,
      targetDate,
      risk: fields.Risk || "",
      visibility: fields.Visibility || "Shared",
      archived: Boolean(fields.Archived),
      healthMode: fields.HealthMode || "auto",
      healthOverride: fields.HealthOverride || "",
      healthOverrideReason: fields.HealthOverrideReason || "",
      healthOverrideUntil: this.normalizeDate(fields.HealthOverrideUntil)
    };
  },

  mapInformationRequired(item) {
    const fields = item.fields || {};
    const requestedFrom = fields.RequestedFrom || "";
    return {
      id: Number(item.id),
      sharePointId: Number(item.id),
      legacyId: Number(fields.LegacyId || 0),
      projectSharePointId: this.projectLookupId(fields),
      item: fields.Title || "Untitled Information Request",
      from: requestedFrom,
      requestedFrom,
      status: fields.RequestStatus || "Outstanding",
      blocking: fields.Blocking || "",
      neededBy: this.normalizeDate(fields.NeededBy),
      notes: fields.Notes || "",
      visibility: fields.Visibility || "Shared",
      archived: Boolean(fields.Archived)
    };
  },

  mapChangeLog(item) {
    const fields = item.fields || {};
    return {
      id: Number(item.id),
      sharePointId: Number(item.id),
      timestamp: fields.EventTimestamp || item.createdDateTime || "",
      userId: fields.UserId || "",
      userName: fields.UserName || "System",
      projectId: fields.ProjectKey || "",
      projectName: fields.ProjectName || "Administration",
      action: fields.Action || "Update",
      recordType: fields.RecordType || "",
      recordName: fields.Title || "",
      details: fields.Details || ""
    };
  },

  changeLogFields(record) {
    return {
      Title: String(record.recordName || "Dashboard change").slice(0,255),
      EventTimestamp: record.timestamp || new Date().toISOString(),
      UserId: record.userId || "",
      UserName: record.userName || "System",
      ProjectKey: record.projectId || "",
      ProjectName: record.projectName || "Administration",
      Action: record.action || "Update",
      RecordType: record.recordType || "",
      Details: record.details || ""
    };
  },

  async loadState() {
    const [projectItems, deliverableItems, informationItems, changeLogItems] = await Promise.all([
      this.getProjectRows(),
      this.getListRows(this.config.lists.deliverables, [
        "Title","Project","ProjectLookupId","LegacyId","Discipline","ProgressPhase","OperationalStatus","Owner",
        "CurrentActivity","WaitingOn","NextStep","StartDate","TargetDate","Risk",
        "Visibility","Archived","HealthMode","HealthOverride",
        "HealthOverrideReason","HealthOverrideUntil"
      ]),
      this.getListRows(this.config.lists.informationRequired, [
        "Title","Project","ProjectLookupId","LegacyId","RequestedFrom","RequestStatus","Blocking",
        "NeededBy","Notes","Visibility","Archived"
      ]),
      this.getListRows(this.config.lists.changeLog, [
        "Title","EventTimestamp","UserId","UserName","ProjectKey","ProjectName",
        "Action","RecordType","Details"
      ])
    ]);

    const deliverables = deliverableItems
      .map(item => this.mapDeliverable(item))
      .filter(item => !item.archived);

    const informationRequired = informationItems
      .map(item => this.mapInformationRequired(item))
      .filter(item => !item.archived);

    if (informationRequired.length) {
      console.debug(
        "Information Required lookup check",
        informationRequired.map(item => ({
          id: item.id,
          legacyId: item.legacyId,
          projectSharePointId: item.projectSharePointId,
          item: item.item
        }))
      );
    }

    const projects = projectItems
      .map(item => ({ item, fields: item.fields || {} }))
      .filter(({ fields }) => !Boolean(fields.Archived))
      .map(({ item, fields }) => {
        const sharePointId = Number(item.id);

        return {
          id: fields.ProjectKey || String(item.id),
          sharePointId,
          name: fields.Title || "Untitled Project",
          address: fields.ProjectAddress || "",
          city: fields.ProjectCity || "",
          state: fields.ProjectState || "",
          description: fields.ProjectDescription || "",
          subtitle: fields.ProjectSubtitle || "",
          phase: fields.ProjectPhase || "",
          executiveLead: fields.ExecutiveLead || "",
          seniorProjectManager: fields.SeniorProjectManager || "",
          projectManagerSiteLead: fields.ProjectManagerSiteLead || "",
          archived: Boolean(fields.Archived),
          health: this.mapHealth(fields),

          // SharePoint is the permanent source for project Last Updated.
          lastUpdatedAt: item.lastModifiedDateTime || "",
          lastUpdatedBy:
            item.lastModifiedBy?.user?.displayName ||
            item.lastModifiedBy?.application?.displayName ||
            "",

          updated: item.lastModifiedDateTime
            ? new Date(item.lastModifiedDateTime).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric"
              })
            : "",

          lastActivityDate: this.normalizeDate(fields.LastActivityDate),
          lastActivity: fields.LastActivity || "",
          progressPlanning: Number(fields.ProgressPlanning || 0),
          progressPlanningMode: fields.ProgressPlanningMode || "manual",
          progressEngineering: Number(fields.ProgressEngineering || 0),
          progressEngineeringMode: fields.ProgressEngineeringMode || "manual",
          progressInstallation: Number(fields.ProgressInstallation || 0),
          progressInstallationMode: fields.ProgressInstallationMode || "manual",
          progressOverallMode: fields.ProgressOverallMode || "auto",
          progressOverallOverride: Number(fields.ProgressOverallOverride || 0),
          healthMode: fields.HealthMode || "auto",
          healthOverride: fields.HealthOverride || "",
          healthOverrideReason: fields.HealthOverrideReason || "",
          healthOverrideUntil: this.normalizeDate(fields.HealthOverrideUntil),
          deliverables: deliverables.filter(record => record.projectSharePointId === sharePointId),
          info: informationRequired.filter(record => record.projectSharePointId === sharePointId)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const savedProjectId = localStorage.getItem("ahtProjectControl.currentProjectId");
    const currentProjectId = projects.some(project => project.id === savedProjectId)
      ? savedProjectId
      : (projects[0]?.id || null);

    const result = {
      currentProjectId,
      projects,
      auditLog: changeLogItems
        .map(item => this.mapChangeLog(item))
        .sort((a,b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
    };
    this._lastState = structuredClone(result);
    return result;
  },

  graphDate(value) {
    if (!value) return null;
    return `${String(value).slice(0, 10)}T12:00:00Z`;
  },

  async createItem(displayName, fields) {
    const site = await this.getSite();
    const listId = await this.getListId(displayName);
    return this.graph(
      `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items`,
      { method: "POST", body: JSON.stringify({ fields }) }
    );
  },

  async updateItem(displayName, itemId, fields) {
    const site = await this.getSite();
    const listId = await this.getListId(displayName);
    return this.graph(
      `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}/fields`,
      { method: "PATCH", body: JSON.stringify(fields) }
    );
  },

  async deleteItem(displayName, itemId) {
    if (!itemId) return;
    const site = await this.getSite();
    const listId = await this.getListId(displayName);
    await this.graph(
      `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
      { method: "DELETE" }
    );
  },

  projectFields(project) {
    return {
      Title: project.name || project.address || "Untitled Project",
      ProjectKey: String(project.id || ""),
      ProjectAddress: project.address || "",
      ProjectCity: project.city || "",
      ProjectState: project.state || "",
      ProjectDescription: project.description || "",
      ProjectSubtitle: project.subtitle || "",
      ProjectPhase: project.phase || "",
      ExecutiveLead: project.executiveLead || "",
      SeniorProjectManager: project.seniorProjectManager || "",
      ProjectManagerSiteLead: project.projectManagerSiteLead || "",
      Archived: Boolean(project.archived),
      LastActivityDate: this.graphDate(project.lastActivityDate),
      LastActivity: project.lastActivity || "",
      ProgressPlanning: Number(project.progressPlanning || 0),
      ProgressPlanningMode: project.progressPlanningMode || "manual",
      ProgressEngineering: Number(project.progressEngineering || 0),
      ProgressEngineeringMode: project.progressEngineeringMode || "manual",
      ProgressInstallation: Number(project.progressInstallation || 0),
      ProgressInstallationMode: project.progressInstallationMode || "manual",
      ProgressOverallMode: project.progressOverallMode || "auto",
      ProgressOverallOverride: Number(project.progressOverallOverride || 0),
      HealthMode: project.healthMode || "auto",
      HealthOverride: project.healthMode === "manual" ? (project.healthOverride || null) : null,
      HealthOverrideReason: project.healthMode === "manual" ? (project.healthOverrideReason || "") : "",
      HealthOverrideUntil: project.healthMode === "manual" ? this.graphDate(project.healthOverrideUntil) : null
    };
  },

  deliverableFields(record, projectSharePointId) {
    return {
      Title: record.deliverable || record.name || "Untitled Deliverable",
      ProjectLookupId: String(projectSharePointId),
      LegacyId: Number(record.legacyId || 0),
      Discipline: record.discipline || "",
      ProgressPhase: record.progressPhase || null,
      OperationalStatus: record.status || "Pending",
      Owner: record.owner || "",
      CurrentActivity: record.current || record.currentActivity || "",
      WaitingOn: record.waitingOn || "",
      NextStep: record.nextStep || "",
      StartDate: this.graphDate(record.startDate),
      TargetDate: this.graphDate(record.date || record.targetDate),
      Risk: record.risk || "",
      Visibility: record.visibility || "Shared",
      Archived: Boolean(record.archived),
      HealthMode: record.healthMode || "auto",
      HealthOverride: record.healthMode === "manual" ? (record.healthOverride || null) : null,
      HealthOverrideReason: record.healthMode === "manual" ? (record.healthOverrideReason || "") : "",
      HealthOverrideUntil: record.healthMode === "manual" ? this.graphDate(record.healthOverrideUntil) : null
    };
  },

  informationFields(record, projectSharePointId) {
    return {
      Title: record.item || "Untitled Information Request",
      ProjectLookupId: String(projectSharePointId),
      LegacyId: Number(record.legacyId || 0),
      RequestedFrom: record.from || record.requestedFrom || "",
      RequestStatus: record.status || "Outstanding",
      Blocking: record.blocking || "",
      NeededBy: this.graphDate(record.neededBy),
      Notes: record.notes || "",
      Visibility: record.visibility || "Shared",
      Archived: Boolean(record.archived)
    };
  },

  comparable(value) {
    return JSON.stringify(value ?? null);
  },

  async saveState(nextState) {
    const previous = this._lastState || { projects: [] };
    const previousProjects = new Map((previous.projects || []).map(project => [project.id, project]));

    // Projects are updated first so newly-created projects have a SharePoint lookup ID
    // before their child records are written.
    for (const project of nextState.projects || []) {
      const before = previousProjects.get(project.id);

      const projectWasTouched =
        Boolean(before) &&
        String(before.lastUpdatedAt || "") !== String(project.lastUpdatedAt || "");

      if (!project.sharePointId) {
        const created = await this.createItem(this.config.lists.projects, this.projectFields(project));
        project.sharePointId = Number(created.id);
      } else if (
        !before ||
        projectWasTouched ||
        this.comparable(this.projectFields(before)) !== this.comparable(this.projectFields(project))
      ) {
        await this.updateItem(
          this.config.lists.projects,
          project.sharePointId,
          this.projectFields(project)
        );
      }

      const previousDeliverables = new Map(((before && before.deliverables) || []).map(record => [String(record.id), record]));
      const currentDeliverableIds = new Set();
      for (const record of project.deliverables || []) {
        const key = String(record.id);
        const prior = previousDeliverables.get(key);
        if (!record.sharePointId) {
          const created = await this.createItem(this.config.lists.deliverables, this.deliverableFields(record, project.sharePointId));
          record.sharePointId = Number(created.id);
          record.id = Number(created.id);
        } else if (!prior || this.comparable(this.deliverableFields(prior, project.sharePointId)) !== this.comparable(this.deliverableFields(record, project.sharePointId))) {
          await this.updateItem(this.config.lists.deliverables, record.sharePointId, this.deliverableFields(record, project.sharePointId));
        }
        currentDeliverableIds.add(String(record.sharePointId || record.id));
      }
      for (const prior of previousDeliverables.values()) {
        const priorId = prior.sharePointId || prior.id;
        if (priorId && !currentDeliverableIds.has(String(priorId))) {
          await this.updateItem(this.config.lists.deliverables, priorId, { Archived: true });
        }
      }

      const previousInfo = new Map(((before && before.info) || []).map(record => [String(record.id), record]));
      const currentInfoIds = new Set();
      for (const record of project.info || []) {
        const key = String(record.id);
        const prior = previousInfo.get(key);
        if (!record.sharePointId) {
          const created = await this.createItem(this.config.lists.informationRequired, this.informationFields(record, project.sharePointId));
          record.sharePointId = Number(created.id);
          record.id = Number(created.id);
        } else if (!prior || this.comparable(this.informationFields(prior, project.sharePointId)) !== this.comparable(this.informationFields(record, project.sharePointId))) {
          await this.updateItem(this.config.lists.informationRequired, record.sharePointId, this.informationFields(record, project.sharePointId));
        }
        currentInfoIds.add(String(record.sharePointId || record.id));
      }
      for (const prior of previousInfo.values()) {
        const priorId = prior.sharePointId || prior.id;
        if (priorId && !currentInfoIds.has(String(priorId))) {
          await this.updateItem(this.config.lists.informationRequired, priorId, { Archived: true });
        }
      }
    }

    // Persist newly-created audit entries. Existing SharePoint rows are immutable audit history.
    const previousAuditIds = new Set((previous.auditLog || []).map(record => String(record.sharePointId || record.id)));
    for (const record of nextState.auditLog || []) {
      const existingId = record.sharePointId || (Number.isInteger(record.id) && record.id < 1000000000 ? record.id : null);
      if (existingId && previousAuditIds.has(String(existingId))) continue;
      if (record.sharePointId) continue;
      const created = await this.createItem(this.config.lists.changeLog, this.changeLogFields(record));
      record.sharePointId = Number(created.id);
      record.id = Number(created.id);
    }

    this._lastState = structuredClone(nextState);
  },

  async deleteProject(project) {
    if (!project) throw new Error("Project was not supplied for deletion.");

    // Delete child records first so SharePoint lookup relationships cannot
    // leave orphaned records behind.
    for (const record of project.deliverables || []) {
      const itemId = record.sharePointId || record.id;
      if (itemId) {
        await this.deleteItem(this.config.lists.deliverables, itemId);
      }
    }

    for (const record of project.info || []) {
      const itemId = record.sharePointId || record.id;
      if (itemId) {
        await this.deleteItem(this.config.lists.informationRequired, itemId);
      }
    }

    // Remove the project row itself.
    if (project.sharePointId) {
      await this.deleteItem(this.config.lists.projects, project.sharePointId);
    }

    // Remove this project key from users with explicit assignments.
    // "*" remains all-project access and needs no change.
    const accessRows = await this.getDashboardAccessRows();

    for (const row of accessRows) {
      const raw = String(row.fields?.ProjectKeys || "").trim();
      if (!raw || raw === "*") continue;

      const keys = raw
        .split(/[;,|]/)
        .map(value => value.trim())
        .filter(Boolean);

      if (!keys.includes(project.id)) continue;

      const updated = keys
        .filter(value => value !== project.id)
        .join(";");

      await this.updateItem(
        this.config.lists.dashboardAccess,
        row.id,
        { ProjectKeys: updated }
      );
    }
  },

  async getDashboardAccessRows() {
    return this.getListRows(this.config.lists.dashboardAccess, [
      "Title",
      "ProfileKey",
      "DisplayName",
      "Company",
      "DashboardRole",
      "ProjectKeys",
      "Active",
      "EntraObjectId",
      "EntraUserType"
    ]);
  },

  dashboardAccessProjects(value) {
    return String(value || "")
      .split(/[;,|]/)
      .map(projectKey => projectKey.trim())
      .filter(Boolean);
  },

  dashboardAccessUser(row) {
    const fields = row.fields || {};
    const role = fields.DashboardRole || "Viewer";

    return {
      id: fields.ProfileKey || `sharepoint-user-${row.id}`,
      sharePointAccessId: Number(row.id),
      name: fields.DisplayName || fields.Title || "AHT User",
      email: "",
      company: fields.Company || "AHT Global",
      role,
      active: fields.Active !== false,
      projects: this.dashboardAccessProjects(fields.ProjectKeys),
      entraObjectId: fields.EntraObjectId || "",
      entraUserType: fields.EntraUserType || "Member",
      managedByEntraAccessGroup: Boolean(fields.EntraObjectId),
      canAdmin: role === "Administrator",
      canEdit: role === "Administrator" || role === "Editor",
      isInternal: String(fields.EntraUserType || "Member").toLowerCase() !== "guest"
    };
  },

  async getDashboardAccessProfile(graphUser) {
    if (!graphUser?.id) return null;

    const rows = await this.getDashboardAccessRows();

    const objectId = String(graphUser.id || "").trim().toLowerCase();
    const displayName = String(graphUser.displayName || "").trim().toLowerCase();
    const graphEmail = String(
      graphUser.mail ||
      graphUser.userPrincipalName ||
      ""
    ).trim().toLowerCase();

    let row = rows.find(item =>
      String(item.fields?.EntraObjectId || "").trim().toLowerCase() === objectId
    );

    if (!row && graphEmail) {
      row = rows.find(item =>
        String(item.fields?.ProfileKey || "").trim().toLowerCase() === graphEmail
      );
    }

    // Deliberately do NOT fall back to display name here.
    // Names are mutable and can collide; sign-in identity must be anchored
    // to Entra Object ID or exact ProfileKey/email.
    if (!row || row.fields?.Active === false) return null;

    const user = this.dashboardAccessUser(row);

    return {
      r: user.role,
      p: user.projects,
      c: user.company,
      n: user.name,
      e: graphEmail,
      entraObjectId: user.entraObjectId,
      active: user.active
    };
  },

  async loadUsers() {
    const localUsers = await LocalStorageDataProvider.loadUsers();

    try {
      const rows = await this.getDashboardAccessRows();
      const sharePointUsers = rows
        .filter(row => String(row.fields?.EntraUserType || "Member").toLowerCase() !== "guest")
        .map(row => this.dashboardAccessUser(row));

      const merged = [...localUsers];

      for (const spUser of sharePointUsers) {
        const index = merged.findIndex(localUser => {
          const sameObjectId =
            spUser.entraObjectId &&
            localUser.entraObjectId &&
            String(localUser.entraObjectId).toLowerCase() === String(spUser.entraObjectId).toLowerCase();

          const sameId =
            String(localUser.id || "").toLowerCase() === String(spUser.id || "").toLowerCase();

          const sameName =
            String(localUser.name || "").trim().toLowerCase() ===
            String(spUser.name || "").trim().toLowerCase();

          return sameObjectId || sameId || sameName;
        });

        if (index >= 0) {
          merged[index] = {
            ...merged[index],
            ...spUser,
            email: merged[index].email || spUser.email || ""
          };
        } else {
          merged.push(spUser);
        }
      }

      await LocalStorageDataProvider.saveUsers(merged);
      return merged;
    } catch (error) {
      console.warn("Could not load Dashboard Access from SharePoint; using cached users.", error);
      return localUsers;
    }
  },

  async saveUsers(nextUsers) {
    await LocalStorageDataProvider.saveUsers(nextUsers);

    const rows = await this.getDashboardAccessRows();

    const byProfileKey = new Map();
    const byObjectId = new Map();
    const bySharePointId = new Map();
    const byDisplayName = new Map();

    for (const row of rows) {
      const profileKey = String(row.fields?.ProfileKey || "").trim().toLowerCase();
      const objectId = String(row.fields?.EntraObjectId || "").trim().toLowerCase();
      const displayName = String(
        row.fields?.DisplayName ||
        row.fields?.Title ||
        ""
      ).trim().toLowerCase();

      if (profileKey) byProfileKey.set(profileKey, row);
      if (objectId) byObjectId.set(objectId, row);
      if (row.id != null) bySharePointId.set(String(row.id), row);
      if (displayName) byDisplayName.set(displayName, row);
    }

    const internalUsers = (nextUsers || []).filter(user => {
      const entraType = String(user.entraUserType || "Member").toLowerCase();
      return (
        user &&
        user.isInternal !== false &&
        user.role !== "External Viewer" &&
        entraType !== "guest"
      );
    });

    for (const user of internalUsers) {
      const email = String(user.email || "").trim();
      const profileKey = email || String(user.id || "").trim();
      if (!profileKey) continue;

      const objectId = String(user.entraObjectId || "").trim();
      const displayName = String(user.name || profileKey).trim();

      const role =
        user.canAdmin || user.role === "Administrator"
          ? "Administrator"
          : (user.canEdit || user.role === "Editor")
            ? "Editor"
            : "Viewer";

      const fields = {
        Title: displayName,
        ProfileKey: profileKey,
        DisplayName: displayName,
        Company: user.company || "AHT Global",
        DashboardRole: role,
        ProjectKeys: Array.isArray(user.projects)
          ? user.projects.filter(Boolean).join(";")
          : "",
        Active: user.active !== false,
        EntraObjectId: objectId,
        EntraUserType: "Member"
      };

      const sharePointAccessId = String(user.sharePointAccessId || "").trim();

      let existing =
        (objectId && byObjectId.get(objectId.toLowerCase())) ||
        (profileKey && byProfileKey.get(profileKey.toLowerCase())) ||
        (sharePointAccessId && bySharePointId.get(sharePointAccessId)) ||
        null;

      if (
        !existing &&
        !objectId &&
        !profileKey &&
        !sharePointAccessId &&
        displayName
      ) {
        existing = byDisplayName.get(displayName.toLowerCase()) || null;
      }

      if (existing) {
        await this.updateItem(
          this.config.lists.dashboardAccess,
          existing.id,
          fields
        );

        existing.fields = {
          ...(existing.fields || {}),
          ...fields
        };

        user.sharePointAccessId = Number(existing.id);
      } else {
        const created = await this.createItem(
          this.config.lists.dashboardAccess,
          fields
        );

        const row = {
          id: created.id,
          fields
        };

        user.sharePointAccessId = Number(created.id);

        byProfileKey.set(profileKey.toLowerCase(), row);
        if (objectId) byObjectId.set(objectId.toLowerCase(), row);
        if (created.id != null) bySharePointId.set(String(created.id), row);
        if (displayName) byDisplayName.set(displayName.toLowerCase(), row);
      }
    }

    return nextUsers;
  }
};

const FallbackDataProvider = {
  name: "sharePointWithLocalFallback",
  fallbackWasUsed: false,

  async loadState() {
    try {
      this.fallbackWasUsed = false;
      return await SharePointDataProvider.loadState();
    } catch (error) {
      if (!APP_CONFIG.allowLocalFallback) throw error;
      this.fallbackWasUsed = true;
      console.warn("SharePoint unavailable; using LocalStorage data.", error);
      return LocalStorageDataProvider.loadState();
    }
  },

  async saveState(nextState) {
    if (this.fallbackWasUsed) {
      return LocalStorageDataProvider.saveState(nextState);
    }
    return SharePointDataProvider.saveState(nextState);
  },

  async deleteProject(project) {
    if (this.fallbackWasUsed) return;
    return SharePointDataProvider.deleteProject(project);
  },

  async loadUsers() {
    if (this.fallbackWasUsed) {
      return LocalStorageDataProvider.loadUsers();
    }
    return SharePointDataProvider.loadUsers();
  },

  async saveUsers(nextUsers) {
    if (this.fallbackWasUsed) {
      return LocalStorageDataProvider.saveUsers(nextUsers);
    }
    return SharePointDataProvider.saveUsers(nextUsers);
  },

  async getDashboardAccessProfile(graphUser) {
    if (this.fallbackWasUsed) return null;
    return SharePointDataProvider.getDashboardAccessProfile(graphUser);
  }
};

function selectDataProvider() {
  switch (APP_CONFIG.dataProvider) {
    case "sharePoint":
      return APP_CONFIG.allowLocalFallback
        ? FallbackDataProvider
        : SharePointDataProvider;
    case "localStorage":
    default:
      return LocalStorageDataProvider;
  }
}

let DataProvider = selectDataProvider();
