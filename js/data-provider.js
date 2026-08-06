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
    // auth.js will provide this function when Microsoft/Entra sign-in is added.
    // Keeping the dependency behind one function lets the data provider be
    // completed and tested without changing the dashboard screens.
    if (typeof window.getMicrosoftAccessToken === "function") {
      return window.getMicrosoftAccessToken();
    }

    throw new Error(
      "SharePoint mode is configured, but Microsoft sign-in is not ready. " +
      "Switch APP_CONFIG.dataProvider to 'localStorage' or complete Entra setup."
    );
  },

  async request(path, options = {}) {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.config.siteUrl}${path}`, {
      ...options,
      headers: {
        Accept: "application/json;odata=nometadata",
        "Content-Type": "application/json;odata=nometadata",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      let details = "";
      try {
        const body = await response.json();
        details = body?.error?.message || body?.error?.code || "";
      } catch (_) {
        details = await response.text();
      }

      throw new Error(
        `SharePoint request failed (${response.status} ${response.statusText})` +
        (details ? `: ${details}` : "")
      );
    }

    if (response.status === 204) return null;
    return response.json();
  },

  async getListItems(listTitle, query = "") {
    const encodedTitle = encodeURIComponent(listTitle);
    const suffix = query ? `?${query}` : "";
    const result = await this.request(
      `/_api/web/lists/getbytitle('${encodedTitle}')/items${suffix}`
    );
    return Array.isArray(result?.value) ? result.value : [];
  },

  normalizeDate(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
  },

  mapHealth(project) {
    if (project.HealthMode === "manual" && project.HealthOverride) {
      return project.HealthOverride;
    }
    return "On Track";
  },

  async loadState() {
    const lists = this.config.lists;

    const [projectRows, deliverableRows, informationRows] = await Promise.all([
      this.getListItems(
        lists.projects,
        "$select=Id,Title,ProjectKey,ProjectAddress,ProjectCity,ProjectState,ProjectDescription,ProjectSubtitle,ProjectPhase,Archived,LastActivityDate,LastActivity,ProgressPlanning,ProgressEngineering,ProgressInstallation,HealthMode,HealthOverride,HealthOverrideReason,HealthOverrideUntil&$filter=Archived ne 1&$orderby=Title"
      ),
      this.getListItems(
        lists.deliverables,
        "$select=Id,Title,ProjectId,LegacyId,Discipline,OperationalStatus,Owner,CurrentActivity,WaitingOn,NextStep,StartDate,TargetDate,Risk,Visibility,Archived,HealthMode,HealthOverride,HealthOverrideReason,HealthOverrideUntil&$filter=Archived ne 1&$orderby=TargetDate"
      ),
      this.getListItems(
        lists.informationRequired,
        "$select=Id,Title,ProjectId,LegacyId,RequestedFrom,RequestStatus,Blocking,NeededBy,Notes,Visibility,Archived&$filter=Archived ne 1&$orderby=NeededBy"
      )
    ]);

    const projectsBySharePointId = new Map();
    const projects = projectRows.map((row) => {
      const project = {
        id: row.ProjectKey || String(row.Id),
        sharePointId: row.Id,
        name: row.Title || "Untitled Project",
        address: row.ProjectAddress || "",
        city: row.ProjectCity || "",
        state: row.ProjectState || "",
        description: row.ProjectDescription || "",
        subtitle: row.ProjectSubtitle || "",
        phase: row.ProjectPhase || "",
        archived: Boolean(row.Archived),
        health: this.mapHealth(row),
        updated: row.LastActivityDate
          ? new Date(row.LastActivityDate).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric"
            })
          : "",
        lastActivityDate: this.normalizeDate(row.LastActivityDate),
        lastActivity: row.LastActivity || "",
        progressPlanning: Number(row.ProgressPlanning || 0),
        progressEngineering: Number(row.ProgressEngineering || 0),
        progressInstallation: Number(row.ProgressInstallation || 0),
        healthMode: row.HealthMode || "auto",
        healthOverride: row.HealthOverride || "",
        healthOverrideReason: row.HealthOverrideReason || "",
        healthOverrideUntil: this.normalizeDate(row.HealthOverrideUntil),
        deliverables: [],
        info: []
      };
      projectsBySharePointId.set(row.Id, project);
      return project;
    });

    for (const row of deliverableRows) {
      const project = projectsBySharePointId.get(row.ProjectId);
      if (!project) continue;
      project.deliverables.push({
        id: Number(row.LegacyId || row.Id),
        sharePointId: row.Id,
        discipline: row.Discipline || "",
        deliverable: row.Title || "",
        status: row.OperationalStatus || "Pending",
        owner: row.Owner || "",
        current: row.CurrentActivity || "",
        waitingOn: row.WaitingOn || "",
        nextStep: row.NextStep || "",
        startDate: this.normalizeDate(row.StartDate),
        date: this.normalizeDate(row.TargetDate),
        risk: row.Risk || "",
        visibility: row.Visibility || "Shared",
        healthMode: row.HealthMode || "auto",
        healthOverride: row.HealthOverride || "",
        healthOverrideReason: row.HealthOverrideReason || "",
        healthOverrideUntil: this.normalizeDate(row.HealthOverrideUntil)
      });
    }

    for (const row of informationRows) {
      const project = projectsBySharePointId.get(row.ProjectId);
      if (!project) continue;
      project.info.push({
        id: Number(row.LegacyId || row.Id),
        sharePointId: row.Id,
        item: row.Title || "",
        from: row.RequestedFrom || "",
        status: row.RequestStatus || "Outstanding",
        blocking: row.Blocking || "",
        neededBy: this.normalizeDate(row.NeededBy),
        notes: row.Notes || "",
        visibility: row.Visibility || "Shared"
      });
    }

    return {
      currentProjectId: projects[0]?.id || null,
      projects,
      auditLog: []
    };
  },

  async saveState() {
    throw new Error(
      "SharePoint write-back is not enabled yet. Reading will be tested first."
    );
  },

  async loadUsers() {
    // User administration remains local during the read-only SharePoint phase.
    return LocalStorageDataProvider.loadUsers();
  },

  async saveUsers(nextUsers) {
    return LocalStorageDataProvider.saveUsers(nextUsers);
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

  async loadUsers() {
    return LocalStorageDataProvider.loadUsers();
  },

  async saveUsers(nextUsers) {
    return LocalStorageDataProvider.saveUsers(nextUsers);
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
