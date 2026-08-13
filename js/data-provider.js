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

  async loadState() {
    // Phase 1: Projects only. Deliverables and Information Required remain empty
    // until the Projects/assignment path is proven against the live backend.
    const projectItems = await this.getProjectRows();

    const projects = projectItems
      .map(item => ({ item, fields: item.fields || {} }))
      .filter(({ fields }) => !Boolean(fields.Archived))
      .map(({ item, fields }) => ({
        id: fields.ProjectKey || String(item.id),
        sharePointId: Number(item.id),
        name: fields.Title || "Untitled Project",
        address: fields.ProjectAddress || "",
        city: fields.ProjectCity || "",
        state: fields.ProjectState || "",
        description: fields.ProjectDescription || "",
        subtitle: fields.ProjectSubtitle || "",
        phase: fields.ProjectPhase || "",
        archived: Boolean(fields.Archived),
        health: this.mapHealth(fields),
        updated: fields.LastActivityDate
          ? new Date(fields.LastActivityDate).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric"
            })
          : "",
        lastActivityDate: this.normalizeDate(fields.LastActivityDate),
        lastActivity: fields.LastActivity || "",
        progressPlanning: Number(fields.ProgressPlanning || 0),
        progressEngineering: Number(fields.ProgressEngineering || 0),
        progressInstallation: Number(fields.ProgressInstallation || 0),
        healthMode: fields.HealthMode || "auto",
        healthOverride: fields.HealthOverride || "",
        healthOverrideReason: fields.HealthOverrideReason || "",
        healthOverrideUntil: this.normalizeDate(fields.HealthOverrideUntil),
        deliverables: [],
        info: []
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

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
