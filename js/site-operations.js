const SiteOperations = (() => {
  const state = {
    locations: [],
    operations: [],
    projectId: null,
    currentLocationId: null,
    loaded: false,
    loading: false
  };

  const LOCATION_TYPES = [
    "Building",
    "Level",
    "Wing",
    "Room",
    "Exterior",
    "Site Zone",
    "Utility",
    "Other"
  ];

  const ENTRY_TYPES = [
    "Work Activity",
    "Lookahead",
    "Milestone",
    "Issue"
  ];

  const SYSTEMS = [
    "AV",
    "Lighting",
    "Shades",
    "Network",
    "Security",
    "Power",
    "Other"
  ];

  const SITE_PHASES = [
    "Rough-In",
    "Trim",
    "Final"
  ];

  const WORK_STAGES = [
    "Layout",
    "Installation",
    "Programming",
    "Commissioning",
    "Testing",
    "Complete",
    "Other"
  ];

  const STATUSES = [
    "Planned",
    "In Progress",
    "At Risk",
    "Blocked",
    "Complete"
  ];

  function escapeHtml(value) {
    if (typeof esc === "function") return esc(value ?? "");
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function clampPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function nullableNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function lookupId(fields, name) {
    return Number(
      fields?.[`${name}LookupId`] ??
      fields?.[name]?.LookupId ??
      fields?.[name]?.lookupId ??
      0
    );
  }

  function graphDate(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
  }

  function displayDate(value) {
    if (!value) return "—";
    if (typeof fmtDate === "function") return fmtDate(value);
    return graphDate(value);
  }

  function locationById(id) {
    return state.locations.find(x => Number(x.id) === Number(id)) || null;
  }

  function childrenOf(parentId) {
    return state.locations
      .filter(x => {
        if (parentId === null || parentId === undefined) {
          return !Number(x.parentLocationId || 0);
        }
        return Number(x.parentLocationId || 0) === Number(parentId);
      })
      .sort((a, b) =>
        Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
        String(a.name || "").localeCompare(String(b.name || ""))
      );
  }

  function descendantIds(locationId) {
    const result = new Set([Number(locationId)]);
    let changed = true;

    while (changed) {
      changed = false;

      for (const location of state.locations) {
        if (
          !result.has(Number(location.id)) &&
          result.has(Number(location.parentLocationId || 0))
        ) {
          result.add(Number(location.id));
          changed = true;
        }
      }
    }

    return result;
  }

  function operationsForLocation(locationId, includeDescendants = true) {
    if (!locationId) return [];

    const ids = includeDescendants
      ? descendantIds(locationId)
      : new Set([Number(locationId)]);

    return state.operations.filter(op => ids.has(Number(op.locationId)));
  }

  function trackedOperations(locationId, phase = "") {
    return operationsForLocation(locationId, true).filter(op =>
      op.trackProgress &&
      (!phase || op.sitePhase === phase)
    );
  }

  function weightedProgress(records) {
    const usable = records.filter(record =>
      Number.isFinite(Number(record.percentComplete))
    );

    if (!usable.length) return 0;

    let weightedTotal = 0;
    let totalWeight = 0;

    for (const record of usable) {
      const weight =
        Number.isFinite(Number(record.progressWeight)) &&
        Number(record.progressWeight) > 0
          ? Number(record.progressWeight)
          : 1;

      weightedTotal += clampPercent(record.percentComplete) * weight;
      totalWeight += weight;
    }

    return totalWeight
      ? clampPercent(weightedTotal / totalWeight)
      : 0;
  }

  function calculatedLocationProgress(locationId, phase = "") {
    return weightedProgress(trackedOperations(locationId, phase));
  }

  function displayedLocationProgress(location, phase = "") {
    if (!location) return 0;

    const overrideField = phase === "Rough-In"
      ? "roughInProgressOverride"
      : phase === "Trim"
        ? "trimProgressOverride"
        : phase === "Final"
          ? "finalProgressOverride"
          : "overallProgressOverride";

    const override = nullableNumber(location[overrideField]);

    if (override !== null) {
      return clampPercent(override);
    }

    if (phase) {
      return calculatedLocationProgress(location.id, phase);
    }

    return calculatedLocationProgress(location.id);
  }

  function progressIsManual(location, phase = "") {
    const field = phase === "Rough-In"
      ? "roughInProgressOverride"
      : phase === "Trim"
        ? "trimProgressOverride"
        : phase === "Final"
          ? "finalProgressOverride"
          : "overallProgressOverride";

    return nullableNumber(location?.[field]) !== null;
  }

  function progressBar(label, value, manual = false) {
    const pct = clampPercent(value);

    return `
      <div class="so-progress-row">
        <span>${escapeHtml(label)}</span>
        <div class="so-progress-track">
          <span style="width:${pct}%"></span>
        </div>
        <strong>${pct}%${manual ? '<span class="so-manual-mark" title="Manual override">M</span>' : ""}</strong>
      </div>
    `;
  }

  function riskState(records) {
    return records.some(op =>
      op.riskMode === "Force At Risk" ||
      (
        op.riskMode !== "Force On Track" &&
        ["At Risk", "Blocked"].includes(op.status)
      )
    );
  }

  function locationCard(location) {
    const records = operationsForLocation(location.id, true);
    const overall = displayedLocationProgress(location);
    const rough = displayedLocationProgress(location, "Rough-In");
    const trim = displayedLocationProgress(location, "Trim");
    const final = displayedLocationProgress(location, "Final");
    const atRisk = riskState(records);

    return `
      <article class="so-location-card"
        role="button"
        tabindex="0"
        onclick="SiteOperations.openLocation(${Number(location.id)})"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();SiteOperations.openLocation(${Number(location.id)})}">
        <div class="so-location-heading">
          <div>
            <div class="so-location-type">${escapeHtml(location.locationType || "Location")}</div>
            <h3>${escapeHtml(location.name)}</h3>
          </div>
          <div class="so-location-overall">
            <strong>${overall}%</strong>
            <span>Overall</span>
          </div>
        </div>

        ${atRisk ? '<div class="so-risk-flag">At Risk</div>' : ""}

        <div class="so-location-progress">
          ${progressBar("Rough-In", rough, progressIsManual(location, "Rough-In"))}
          ${progressBar("Trim", trim, progressIsManual(location, "Trim"))}
          ${progressBar("Final", final, progressIsManual(location, "Final"))}
        </div>

        <div class="so-location-footer">
          <span>${records.length} site item${records.length === 1 ? "" : "s"}</span>
          <span>View details ›</span>
        </div>
      </article>
    `;
  }

  function operationStatusClass(status) {
    return String(status || "")
      .toLowerCase()
      .replaceAll(" ", "-");
  }

  function operationCard(op) {
    const progress = op.trackProgress
      ? `<div class="so-operation-progress">
          ${progressBar("Progress", op.percentComplete)}
        </div>`
      : "";

    const canEdit = Boolean(currentUser?.canAdmin);

    return `
      <div class="so-operation-card ${operationStatusClass(op.status)}">
        <div class="so-operation-heading">
          <div>
            <div class="so-operation-kicker">
              ${escapeHtml(op.entryType || "Site Item")}
              ${op.system ? ` · ${escapeHtml(op.system)}` : ""}
              ${op.sitePhase ? ` · ${escapeHtml(op.sitePhase)}` : ""}
            </div>
            <h4>${escapeHtml(op.title)}</h4>
          </div>
          <span class="so-status">${escapeHtml(op.status || "Planned")}</span>
        </div>

        ${op.details ? `<div class="so-operation-details">${escapeHtml(op.details)}</div>` : ""}
        ${progress}

        <div class="so-operation-meta">
          ${op.workStage ? `<span>${escapeHtml(op.workStage)}</span>` : ""}
          ${op.activityDate ? `<span>Activity: ${escapeHtml(displayDate(op.activityDate))}</span>` : ""}
          ${op.targetDate ? `<span>Target: ${escapeHtml(displayDate(op.targetDate))}</span>` : ""}
          ${op.leadResponsible ? `<span>Lead: ${escapeHtml(op.leadResponsible)}</span>` : ""}
        </div>

        ${op.blockerDependency
          ? `<div class="so-blocker"><strong>Blocker / Dependency:</strong> ${escapeHtml(op.blockerDependency)}</div>`
          : ""}

        ${canEdit
          ? `<div class="so-operation-actions">
              <button class="btn" type="button" onclick="event.stopPropagation();SiteOperations.editOperation(${Number(op.id)})">Edit</button>
              <button class="btn danger" type="button" onclick="event.stopPropagation();SiteOperations.deleteOperation(${Number(op.id)})">Delete</button>
            </div>`
          : ""}
      </div>
    `;
  }

  function breadcrumbs() {
    const items = [];
    let location = state.currentLocationId
      ? locationById(state.currentLocationId)
      : null;

    while (location) {
      items.unshift(location);
      location = location.parentLocationId
        ? locationById(location.parentLocationId)
        : null;
    }

    return `
      <button type="button" onclick="SiteOperations.openOverview()">Site Operations</button>
      ${items.map(item =>
        `<span>›</span><button type="button" onclick="SiteOperations.openLocation(${Number(item.id)})">${escapeHtml(item.name)}</button>`
      ).join("")}
    `;
  }

  function summaryStrip(records) {
    const current = records.filter(x => x.status === "In Progress").length;
    const upcoming = records.filter(x =>
      x.entryType === "Lookahead" || x.status === "Planned"
    ).length;
    const atRisk = records.filter(x =>
      x.riskMode === "Force At Risk" ||
      (
        x.riskMode !== "Force On Track" &&
        ["At Risk", "Blocked"].includes(x.status)
      )
    ).length;
    const complete = records.filter(x => x.status === "Complete").length;

    return `
      <div class="so-summary-strip">
        <div><strong>${current}</strong><span>Current Work</span></div>
        <div><strong>${upcoming}</strong><span>Upcoming</span></div>
        <div class="${atRisk ? "risk" : ""}"><strong>${atRisk}</strong><span>At Risk</span></div>
        <div><strong>${complete}</strong><span>Completed</span></div>
      </div>
    `;
  }

  function render() {
    const root = document.getElementById("siteOperationsContent");
    const breadcrumb = document.getElementById("siteOperationsBreadcrumb");
    const addLocationBtn = document.getElementById("addSiteLocationBtn");
    const addOperationBtn = document.getElementById("addSiteOperationBtn");

    if (!root || !breadcrumb) return;

    const project = typeof currentProject === "function"
      ? currentProject()
      : null;

    if (!project) {
      root.innerHTML = '<div class="panel"><div class="body">No project selected.</div></div>';
      return;
    }

    addLocationBtn?.classList.toggle("hidden", !currentUser?.canAdmin);
    addOperationBtn?.classList.toggle("hidden", !currentUser?.canAdmin);

    breadcrumb.innerHTML = breadcrumbs();

    if (state.loading) {
      root.innerHTML = `
        <div class="so-loading">
          <div class="startup-spinner"></div>
          <span>Loading Site Operations…</span>
        </div>
      `;
      return;
    }

    if (state.currentLocationId) {
      renderLocationDetail(root);
    } else {
      renderOverview(root);
    }
  }

  function renderOverview(root) {
    const roots = childrenOf(null);
    const records = state.operations;

    root.innerHTML = `
      ${summaryStrip(records)}

      <div class="so-section-heading">
        <div>
          <h3>Project Locations</h3>
          <p>Building and site progress. Select a location to view the detailed work driving these numbers.</p>
        </div>
      </div>

      <div class="so-location-grid">
        ${roots.length
          ? roots.map(locationCard).join("")
          : `<div class="so-empty">
              <strong>No project locations have been added yet.</strong>
              <span>${currentUser?.canAdmin
                ? "Use Add Location to create the first building or site area."
                : "Site Operations locations have not been configured yet."}</span>
            </div>`}
      </div>
    `;
  }

  function renderLocationDetail(root) {
    const location = locationById(state.currentLocationId);

    if (!location) {
      state.currentLocationId = null;
      renderOverview(root);
      return;
    }

    const childLocations = childrenOf(location.id);
    const directOperations = operationsForLocation(location.id, false);
    const allOperations = operationsForLocation(location.id, true);

    const overall = displayedLocationProgress(location);
    const rough = displayedLocationProgress(location, "Rough-In");
    const trim = displayedLocationProgress(location, "Trim");
    const final = displayedLocationProgress(location, "Final");

    root.innerHTML = `
      <div class="so-detail-hero">
        <div>
          <div class="eyebrow">${escapeHtml(location.locationType || "Location")}</div>
          <h3>${escapeHtml(location.name)}</h3>
          <div class="small">${allOperations.length} site item${allOperations.length === 1 ? "" : "s"} within this location</div>
        </div>

        <div class="so-detail-header-actions">
          <div class="so-detail-overall">
            <strong>${overall}%</strong>
            <span>Overall Progress${progressIsManual(location) ? " · Manual" : ""}</span>
          </div>
          ${currentUser?.canAdmin
            ? `<button class="btn" type="button" onclick="SiteOperations.editLocation(${Number(location.id)})">Edit Location</button>`
            : ""}
        </div>
      </div>

      <div class="so-detail-progress">
        ${progressBar("Rough-In", rough, progressIsManual(location, "Rough-In"))}
        ${progressBar("Trim", trim, progressIsManual(location, "Trim"))}
        ${progressBar("Final", final, progressIsManual(location, "Final"))}
      </div>

      ${summaryStrip(allOperations)}

      ${childLocations.length
        ? `
          <div class="so-section-heading">
            <div>
              <h3>Areas</h3>
              <p>Select an area to continue into the project hierarchy.</p>
            </div>
          </div>

          <div class="so-location-grid so-child-grid">
            ${childLocations.map(locationCard).join("")}
          </div>
        `
        : ""}

      <div class="so-section-heading so-work-heading">
        <div>
          <h3>Site Progress & Activity</h3>
          <p>Detailed items assigned directly to ${escapeHtml(location.name)}.</p>
        </div>
      </div>

      <div class="so-operation-list">
        ${directOperations.length
          ? directOperations
              .slice()
              .sort((a, b) =>
                String(b.activityDate || "").localeCompare(String(a.activityDate || "")) ||
                Number(b.id) - Number(a.id)
              )
              .map(operationCard)
              .join("")
          : `<div class="so-empty">
              <strong>No direct Site Operations items here yet.</strong>
              <span>${currentUser?.canAdmin
                ? "Add a progress or activity item when work begins in this location."
                : "No detailed items have been published for this location."}</span>
            </div>`}
      </div>
    `;
  }

  async function load(force = false) {
    const project = typeof currentProject === "function"
      ? currentProject()
      : null;

    if (!project?.sharePointId) {
      state.locations = [];
      state.operations = [];
      state.loaded = true;
      render();
      return;
    }

    if (
      !force &&
      state.loaded &&
      Number(state.projectId) === Number(project.sharePointId)
    ) {
      render();
      return;
    }

    state.loading = true;
    state.projectId = Number(project.sharePointId);
    state.currentLocationId = null;
    render();

    try {
      const [locationRows, operationRows] = await Promise.all([
        SharePointDataProvider.getListRows(
          APP_CONFIG.sharePoint.lists.projectLocations
        ),
        SharePointDataProvider.getListRows(
          APP_CONFIG.sharePoint.lists.siteOperations
        )
      ]);

      state.locations = (locationRows || [])
        .map(item => {
          const fields = item.fields || {};

          return {
            id: Number(item.id),
            sharePointId: Number(item.id),
            projectSharePointId: lookupId(fields, "Project"),
            parentLocationId: lookupId(fields, "ParentLocation"),
            name: fields.Title || "Untitled Location",
            locationType: fields.LocationType || "Other",
            sortOrder: Number(fields.SortOrder || 0),
            active: fields.Active !== false,

            overallProgressOverride: nullableNumber(fields.OverallProgressOverride),
            overallOverrideReason: fields.OverallOverrideReason || "",

            roughInProgressOverride: nullableNumber(fields.RoughInProgressOverride),
            roughInOverrideReason: fields.RoughInOverrideReason || "",

            trimProgressOverride: nullableNumber(fields.TrimProgressOverride),
            trimOverrideReason: fields.TrimOverrideReason || "",

            finalProgressOverride: nullableNumber(fields.FinalProgressOverride),
            finalOverrideReason: fields.FinalOverrideReason || ""
          };
        })
        .filter(location =>
          location.active &&
          Number(location.projectSharePointId) === Number(project.sharePointId)
        );

      state.operations = (operationRows || [])
        .map(item => {
          const fields = item.fields || {};

          return {
            id: Number(item.id),
            sharePointId: Number(item.id),
            projectSharePointId: lookupId(fields, "Project"),
            locationId: lookupId(fields, "Location"),
            title: fields.Title || "Untitled Site Item",
            entryType: fields.EntryType || "Work Activity",
            system: fields.System || "",
            sitePhase: fields.SitePhase || "",
            workStage: fields.WorkStage || "",
            status: fields.Status || "Planned",
            percentComplete: clampPercent(fields.PercentComplete || 0),
            progressWeight:
              Number(fields.ProgressWeight || 0) > 0
                ? Number(fields.ProgressWeight)
                : 1,
            trackProgress: Boolean(fields.TrackProgress),
            activityDate: graphDate(fields.ActivityDate),
            targetDate: graphDate(fields.TargetDate),
            details: fields.Details || "",
            blockerDependency: fields.BlockerDependency || "",
            leadResponsible: fields.LeadResponsible || "",
            projectActivityMode: fields.ProjectActivityMode || "Auto",
            riskMode: fields.RiskMode || "Auto",
            informationRequiredMode: fields.InformationRequiredMode || "Auto",
            relatedInformationRequiredId:
              Number(fields.RelatedInformationRequiredId || 0)
          };
        })
        .filter(op =>
          Number(op.projectSharePointId) === Number(project.sharePointId)
        );

      state.loaded = true;
    } catch (error) {
      console.error("Site Operations load failed", error);

      const root = document.getElementById("siteOperationsContent");

      if (root) {
        root.innerHTML = `
          <div class="panel red">
            <h3>Site Operations could not be loaded</h3>
            <div class="body">${escapeHtml(error.message || String(error))}</div>
          </div>
        `;
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  function openOverview() {
    state.currentLocationId = null;
    render();
  }

  function openLocation(id) {
    if (!locationById(id)) return;
    state.currentLocationId = Number(id);
    render();
    document.getElementById("siteOperations")?.scrollIntoView({ block: "start" });
  }

  function selectOptions(options, selected = "", allowBlank = false, blankText = "None") {
    return `
      ${allowBlank ? `<option value="">${escapeHtml(blankText)}</option>` : ""}
      ${options.map(option =>
        `<option value="${escapeHtml(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`
      ).join("")}
    `;
  }

  function modalShell(title, body, saveLabel = "Save") {
    let backdrop = document.getElementById("siteOperationsModalBackdrop");

    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "siteOperationsModalBackdrop";
      backdrop.className = "modal-backdrop";
      document.body.appendChild(backdrop);
    }

    backdrop.innerHTML = `
      <div class="modal so-modal">
        <div class="so-modal-heading">
          <div>
            <div class="eyebrow">Site Operations</div>
            <h3>${escapeHtml(title)}</h3>
          </div>
          <button class="btn" type="button" onclick="SiteOperations.closeModal()">Close</button>
        </div>

        <form id="siteOperationsModalForm">
          <div class="form-grid">
            ${body}
          </div>

          <div class="modal-actions">
            <span style="flex:1"></span>
            <button class="btn" type="button" onclick="SiteOperations.closeModal()">Cancel</button>
            <button class="btn primary" type="submit">${escapeHtml(saveLabel)}</button>
          </div>
        </form>
      </div>
    `;

    backdrop.style.display = "flex";

    backdrop.onclick = event => {
      if (event.target === backdrop) closeModal();
    };

    return backdrop.querySelector("#siteOperationsModalForm");
  }

  function closeModal() {
    const backdrop = document.getElementById("siteOperationsModalBackdrop");
    if (backdrop) backdrop.style.display = "none";
  }

  function field(label, input, full = false) {
    return `
      <div class="field ${full ? "full" : ""}">
        <label>${escapeHtml(label)}</label>
        ${input}
      </div>
    `;
  }

  function textInput(name, value = "", type = "text", attrs = "") {
    return `<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${attrs}>`;
  }

  function textarea(name, value = "", rows = 3) {
    return `<textarea name="${name}" rows="${rows}">${escapeHtml(value)}</textarea>`;
  }

  function select(name, options, selected = "", allowBlank = false, blankText = "None") {
    return `
      <select name="${name}">
        ${selectOptions(options, selected, allowBlank, blankText)}
      </select>
    `;
  }

  function locationParentOptions(selectedId = null, excludeId = null) {
    const sorted = state.locations
      .filter(location => Number(location.id) !== Number(excludeId || 0))
      .slice()
      .sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      );

    return `
      <option value="">Top Level</option>
      ${sorted.map(location =>
        `<option value="${Number(location.id)}" ${Number(selectedId) === Number(location.id) ? "selected" : ""}>
          ${escapeHtml(location.name)}
        </option>`
      ).join("")}
    `;
  }

  function operationLocationOptions(selectedId = null) {
    return state.locations
      .slice()
      .sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      )
      .map(location =>
        `<option value="${Number(location.id)}" ${Number(selectedId) === Number(location.id) ? "selected" : ""}>
          ${escapeHtml(location.name)}
        </option>`
      )
      .join("");
  }

  function locationFields(record = null) {
    const defaultParent = record
      ? record.parentLocationId
      : state.currentLocationId;

    return `
      ${field(
        "Location Name",
        textInput("name", record?.name || "", "text", "required maxlength='255'")
      )}

      ${field(
        "Location Type",
        select("locationType", LOCATION_TYPES, record?.locationType || "Building")
      )}

      ${field(
        "Parent Location",
        `<select name="parentLocationId">${locationParentOptions(defaultParent, record?.id)}</select>`
      )}

      ${field(
        "Sort Order",
        textInput("sortOrder", record?.sortOrder ?? 0, "number", "step='1'")
      )}

      <div class="field full so-form-divider">
        <label>Progress Overrides <span class="small">(optional)</span></label>
        <div class="small">
          Leave blank to use automatic weighted progress from Site Operations items.
        </div>
      </div>

      ${field(
        "Overall Override %",
        textInput("overallProgressOverride", record?.overallProgressOverride ?? "", "number", "min='0' max='100'")
      )}

      ${field(
        "Overall Override Reason",
        textInput("overallOverrideReason", record?.overallOverrideReason || "")
      )}

      ${field(
        "Rough-In Override %",
        textInput("roughInProgressOverride", record?.roughInProgressOverride ?? "", "number", "min='0' max='100'")
      )}

      ${field(
        "Rough-In Override Reason",
        textInput("roughInOverrideReason", record?.roughInOverrideReason || "")
      )}

      ${field(
        "Trim Override %",
        textInput("trimProgressOverride", record?.trimProgressOverride ?? "", "number", "min='0' max='100'")
      )}

      ${field(
        "Trim Override Reason",
        textInput("trimOverrideReason", record?.trimOverrideReason || "")
      )}

      ${field(
        "Final Override %",
        textInput("finalProgressOverride", record?.finalProgressOverride ?? "", "number", "min='0' max='100'")
      )}

      ${field(
        "Final Override Reason",
        textInput("finalOverrideReason", record?.finalOverrideReason || "")
      )}
    `;
  }

  function operationFields(record = null) {
    const defaultLocationId = record?.locationId || state.currentLocationId || state.locations[0]?.id || "";

    return `
      ${field(
        "Activity / Progress Item",
        textInput("title", record?.title || "", "text", "required maxlength='255'"),
        true
      )}

      ${field(
        "Location",
        `<select name="locationId" required>
          ${operationLocationOptions(defaultLocationId)}
        </select>`
      )}

      ${field(
        "Entry Type",
        select("entryType", ENTRY_TYPES, record?.entryType || "Work Activity")
      )}

      ${field(
        "System",
        select("system", SYSTEMS, record?.system || "", true, "None")
      )}

      ${field(
        "Site Phase",
        select("sitePhase", SITE_PHASES, record?.sitePhase || "", true, "None")
      )}

      ${field(
        "Work Stage",
        select("workStage", WORK_STAGES, record?.workStage || "", true, "None")
      )}

      ${field(
        "Status",
        select("status", STATUSES, record?.status || "Planned")
      )}

      ${field(
        "Percent Complete",
        textInput("percentComplete", record?.percentComplete ?? 0, "number", "min='0' max='100' required")
      )}

      ${field(
        "Progress Weight",
        textInput("progressWeight", record?.progressWeight ?? 1, "number", "min='0.01' step='0.01'")
      )}

      <div class="field">
        <label>Track Progress</label>
        <label class="so-checkbox">
          <input name="trackProgress" type="checkbox" ${record?.trackProgress ? "checked" : ""}>
          Include this item in automatic progress calculations
        </label>
      </div>

      ${field(
        "Activity Date",
        textInput("activityDate", record?.activityDate || new Date().toISOString().slice(0, 10), "date")
      )}

      ${field(
        "Target Date",
        textInput("targetDate", record?.targetDate || "", "date")
      )}

      ${field(
        "Lead / Responsible",
        textInput("leadResponsible", record?.leadResponsible || "")
      )}

      ${field(
        "Details",
        textarea("details", record?.details || "", 3),
        true
      )}

      ${field(
        "Blocker / Dependency",
        textarea("blockerDependency", record?.blockerDependency || "", 3),
        true
      )}

      <div class="field full so-form-divider">
        <label>Dashboard Tie-Ins</label>
        <div class="small">Automatic behavior is the default. Manual controls are retained for exceptions.</div>
      </div>

      ${field(
        "Project Activity",
        select(
          "projectActivityMode",
          ["Auto", "Show", "Hide"],
          record?.projectActivityMode || "Auto"
        )
      )}

      ${field(
        "Risk",
        select(
          "riskMode",
          ["Auto", "Force At Risk", "Force On Track"],
          record?.riskMode || "Auto"
        )
      )}

      ${field(
        "Information Required",
        select(
          "informationRequiredMode",
          ["Auto", "Suggest", "Do Not Suggest"],
          record?.informationRequiredMode || "Auto"
        )
      )}
    `;
  }

  function nullableFormNumber(value) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return null;

    const n = Number(trimmed);
    return Number.isFinite(n) ? clampPercent(n) : null;
  }

  async function saveLocation(record, form) {
    const project = currentProject();
    if (!project?.sharePointId) throw new Error("Project lookup ID is unavailable.");

    const data = new FormData(form);

    const fields = {
      Title: String(data.get("name") || "").trim(),
      ProjectLookupId: String(project.sharePointId),
      LocationType: String(data.get("locationType") || "Other"),
      SortOrder: Number(data.get("sortOrder") || 0),
      Active: true,

      OverallProgressOverride: nullableFormNumber(data.get("overallProgressOverride")),
      OverallOverrideReason: String(data.get("overallOverrideReason") || "").trim(),

      RoughInProgressOverride: nullableFormNumber(data.get("roughInProgressOverride")),
      RoughInOverrideReason: String(data.get("roughInOverrideReason") || "").trim(),

      TrimProgressOverride: nullableFormNumber(data.get("trimProgressOverride")),
      TrimOverrideReason: String(data.get("trimOverrideReason") || "").trim(),

      FinalProgressOverride: nullableFormNumber(data.get("finalProgressOverride")),
      FinalOverrideReason: String(data.get("finalOverrideReason") || "").trim()
    };

    const parentId = Number(data.get("parentLocationId") || 0);

    if (parentId) {
      fields.ParentLocationLookupId = String(parentId);
    } else {
      fields.ParentLocationLookupId = null;
    }

    if (record?.sharePointId) {
      await SharePointDataProvider.updateItem(
        APP_CONFIG.sharePoint.lists.projectLocations,
        record.sharePointId,
        fields
      );
    } else {
      await SharePointDataProvider.createItem(
        APP_CONFIG.sharePoint.lists.projectLocations,
        fields
      );
    }
  }

  async function saveOperation(record, form) {
    const project = currentProject();
    if (!project?.sharePointId) throw new Error("Project lookup ID is unavailable.");

    const data = new FormData(form);

    const fields = {
      Title: String(data.get("title") || "").trim(),
      ProjectLookupId: String(project.sharePointId),
      LocationLookupId: String(Number(data.get("locationId") || 0)),
      EntryType: String(data.get("entryType") || "Work Activity"),
      System: String(data.get("system") || ""),
      SitePhase: String(data.get("sitePhase") || ""),
      WorkStage: String(data.get("workStage") || ""),
      Status: String(data.get("status") || "Planned"),
      PercentComplete: clampPercent(data.get("percentComplete")),
      ProgressWeight: Math.max(0.01, Number(data.get("progressWeight") || 1)),
      TrackProgress: data.get("trackProgress") === "on",
      ActivityDate: data.get("activityDate")
        ? `${data.get("activityDate")}T12:00:00Z`
        : null,
      TargetDate: data.get("targetDate")
        ? `${data.get("targetDate")}T12:00:00Z`
        : null,
      Details: String(data.get("details") || "").trim(),
      BlockerDependency: String(data.get("blockerDependency") || "").trim(),
      LeadResponsible: String(data.get("leadResponsible") || "").trim(),
      ProjectActivityMode: String(data.get("projectActivityMode") || "Auto"),
      RiskMode: String(data.get("riskMode") || "Auto"),
      InformationRequiredMode: String(data.get("informationRequiredMode") || "Auto")
    };

    if (record?.sharePointId) {
      await SharePointDataProvider.updateItem(
        APP_CONFIG.sharePoint.lists.siteOperations,
        record.sharePointId,
        fields
      );
    } else {
      await SharePointDataProvider.createItem(
        APP_CONFIG.sharePoint.lists.siteOperations,
        fields
      );
    }
  }

  function openLocationEditor(record = null) {
    if (!currentUser?.canAdmin) return;

    const form = modalShell(
      record ? "Edit Location" : "Add Location",
      locationFields(record),
      record ? "Save Location" : "Add Location"
    );

    if (record) {
      const actions = form.querySelector(".modal-actions");
      if (actions) {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "btn danger";
        deleteButton.textContent = "Delete Location";
        deleteButton.onclick = () => {
          closeModal();
          deleteLocation(record.id);
        };
        actions.insertBefore(deleteButton, actions.firstChild);
      }
    }

    form.onsubmit = async event => {
      event.preventDefault();

      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;

      try {
        await saveLocation(record, form);
        closeModal();
        await load(true);
      } catch (error) {
        console.error("Site location save failed", error);
        alert(`Location could not be saved: ${error.message}`);
      } finally {
        submit.disabled = false;
      }
    };
  }

  function openOperationEditor(record = null) {
    if (!currentUser?.canAdmin) return;

    if (!state.locations.length) {
      alert("Add at least one Project Location before creating a Site Operations item.");
      return;
    }

    const form = modalShell(
      record ? "Edit Site Item" : "Add Site Item",
      operationFields(record),
      record ? "Save Site Item" : "Add Site Item"
    );

    form.onsubmit = async event => {
      event.preventDefault();

      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;

      try {
        await saveOperation(record, form);
        closeModal();
        await load(true);
      } catch (error) {
        console.error("Site Operations save failed", error);
        alert(`Site Operations item could not be saved: ${error.message}`);
      } finally {
        submit.disabled = false;
      }
    };
  }

  function editLocation(id) {
    const record = locationById(id);
    if (record) openLocationEditor(record);
  }

  function editOperation(id) {
    const record = state.operations.find(x => Number(x.id) === Number(id));
    if (record) openOperationEditor(record);
  }

  async function deleteOperation(id) {
    if (!currentUser?.canAdmin) return;

    const record = state.operations.find(x => Number(x.id) === Number(id));
    if (!record) return;

    if (!confirm(
      `Permanently delete "${record.title}"?\n\n` +
      `This Site Operations item will be removed from SharePoint and cannot be undone.`
    )) return;

    try {
      await SharePointDataProvider.deleteItem(
        APP_CONFIG.sharePoint.lists.siteOperations,
        record.sharePointId || record.id
      );

      const project = currentProject();
      if (project && typeof logChange === "function") {
        logChange(
          "Delete",
          project.id,
          "Site Operations",
          record.title,
          "Site Operations item permanently deleted."
        );
        if (typeof save === "function") await save();
      }

      await load(true);
    } catch (error) {
      console.error("Site Operations delete failed", error);
      alert(`Site Operations item could not be deleted: ${error.message}`);
    }
  }

  async function deleteLocation(id) {
    if (!currentUser?.canAdmin) return;

    const location = locationById(id);
    if (!location) return;

    const childLocations = childrenOf(location.id);
    const attachedOperations = operationsForLocation(location.id, false);

    if (childLocations.length || attachedOperations.length) {
      const blockers = [];

      if (childLocations.length) {
        blockers.push(`${childLocations.length} child location${childLocations.length === 1 ? "" : "s"}`);
      }

      if (attachedOperations.length) {
        blockers.push(`${attachedOperations.length} Site Operations item${attachedOperations.length === 1 ? "" : "s"}`);
      }

      alert(
        `"${location.name}" cannot be deleted because it contains ${blockers.join(" and ")}.\n\n` +
        `Move or delete those records first, then delete the location.`
      );
      return;
    }

    if (!confirm(
      `Permanently delete location "${location.name}"?\n\n` +
      `This location will be removed from SharePoint and cannot be undone.`
    )) return;

    const parentId = Number(location.parentLocationId || 0);

    try {
      await SharePointDataProvider.deleteItem(
        APP_CONFIG.sharePoint.lists.projectLocations,
        location.sharePointId || location.id
      );

      const project = currentProject();
      if (project && typeof logChange === "function") {
        logChange(
          "Delete",
          project.id,
          "Project Location",
          location.name,
          "Project Location permanently deleted."
        );
        if (typeof save === "function") await save();
      }

      await load(true);
      state.currentLocationId = parentId && locationById(parentId) ? parentId : null;
      render();
    } catch (error) {
      console.error("Project Location delete failed", error);
      alert(`Location could not be deleted: ${error.message}`);
    }
  }

  function onProjectChanged() {
    state.loaded = false;
    state.currentLocationId = null;

    const view = document.getElementById("siteOperations");

    if (view?.classList.contains("active")) {
      load(true);
    }
  }

  async function onView() {
    await load(false);
  }

  return {
    onView,
    onProjectChanged,
    openOverview,
    openLocation,
    openLocationEditor,
    openOperationEditor,
    editLocation,
    editOperation,
    deleteLocation,
    deleteOperation,
    closeModal,
    refresh: () => load(true)
  };
})();

window.SiteOperations = SiteOperations;
