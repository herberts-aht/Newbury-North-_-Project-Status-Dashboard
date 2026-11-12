const SiteOperations = (() => {

  // Reported installation percentage override is intentionally owner-only.
  // SharePoint list permissions still govern direct out-of-dashboard edits.
  const REPORTED_PROGRESS_OWNER_ENTRA_ID = "8feae494-8b0e-43a5-be9f-4bb6c5b36298";
  const allowedReportedProgressOwner = () => Boolean(
    currentUser?.canEdit &&
    String(currentUser?.entraObjectId || "").toLowerCase() === REPORTED_PROGRESS_OWNER_ENTRA_ID
  );
  function reportedInstallationState(project, calculated) {
    const manual = String(project?.progressInstallationMode || "auto").toLowerCase() === "manual";
    return {
      manual,
      displayed: manual ? clampPercent(project?.progressInstallation) : clampPercent(calculated),
      calculated: clampPercent(calculated)
    };
  }

  const collapsedOperationIds = new Set();

  function parseStructuredOperationIds(value) {
    if (Array.isArray(value)) {
      return value
        .map(Number)
        .filter(id => Number.isFinite(id) && id > 0);
    }

    const raw = String(value || "").trim();

    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        return parsed
          .map(Number)
          .filter(id => Number.isFinite(id) && id > 0);
      }
    } catch (_) {
      // Support legacy/simple comma-delimited values if ever encountered.
    }

    return raw
      .split(",")
      .map(value => Number(String(value).trim()))
      .filter(id => Number.isFinite(id) && id > 0);
  }

  const state = {
    locations: [],
    operations: [],
    projectId: null,
    currentLocationId: null,
    currentOperationId: null,
    loaded: false,
    loading: false,
    locationSchemaChecked: false,
    planLevelSupported: false,
    locationNumberSupported: false
  };

  const LOCATION_TYPES = [
    "Building",
    "Wing",
    "Area",
    "Room",
    "Exterior",
    "Site Zone",
    "Utility",
    "Other"
  ];

  const COMMON_PLAN_LEVELS = [
    "Ground Level",
    "Level 1",
    "Level 2",
    "Level 3",
    "Lower Level",
    "Basement",
    "Main Level",
    "First Floor",
    "Second Floor"
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

  // Installation weighting is explicit, including phases with no work recorded yet.
  // Rough-In 50%, Trim 30%, Final/Commissioning 20%.
  const PHASE_WEIGHTS = Object.freeze({ "Rough-In": 0.5, Trim: 0.3, Final: 0.2 });
  const PHASE_FIELDS = Object.freeze({
    "Rough-In": "roughInPercent", Trim: "trimPercent", Final: "finalPercent"
  });

  function operationHasPhases(op) {
    return SITE_PHASES.includes(op.sitePhase) ||
      SITE_PHASES.some(phase => op.phaseProgress?.[PHASE_FIELDS[phase]] !== null &&
        op.phaseProgress?.[PHASE_FIELDS[phase]] !== undefined);
  }

  function operationPhasePercent(op, phase) {
    const stored = op.phaseProgress?.[PHASE_FIELDS[phase]];
    if (stored !== null && stored !== undefined && stored !== "") return clampPercent(stored);
    // Backward compatibility: existing task percentages belong to their existing phase.
    return op.sitePhase === phase ? clampPercent(op.percentComplete) : 0;
  }

  function operationOverallPercent(op) {
    if (!operationHasPhases(op)) return clampPercent(op.percentComplete);
    return clampPercent(SITE_PHASES.reduce((sum, phase) =>
      sum + operationPhasePercent(op, phase) * PHASE_WEIGHTS[phase], 0));
  }

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

  async function ensureLocationSchema() {
    if (state.locationSchemaChecked) return;
    state.locationSchemaChecked = true;

    try {
      const site = await SharePointDataProvider.getSite();
      const listId = await SharePointDataProvider.getListId(APP_CONFIG.sharePoint.lists.projectLocations);
      const columnsData = await SharePointDataProvider.graph(
        `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/columns?$select=name`
      );
      state.planLevelSupported = Boolean(
        (columnsData?.value || []).some(column => column.name === "PlanLevel")
      );
      state.locationNumberSupported = Boolean(
        (columnsData?.value || []).some(column => column.name === "LocationNumber")
      );
      state.locationWeightSupported = Boolean(
        (columnsData?.value || []).some(column => column.name === "LocationProgressWeight")
      );
    } catch (error) {
      state.planLevelSupported = false;
      state.locationNumberSupported = false;
      state.locationWeightSupported = false;
      console.warn("Site Operations could not confirm the location metadata SharePoint fields.", error);
    }
  }

  function locationById(id) {
    return state.locations.find(x => Number(x.id) === Number(id)) || null;
  }

  function locationDisplayName(location) {
    if (!location) return "";
    const number = String(location.locationNumber || "").trim();
    const name = String(location.name || "").trim();
    return number ? `${number} · ${name}` : name;
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
      op.trackProgress && (!phase || operationHasPhases(op))
    );
  }

  function weightedProgress(records, phase = "") {
    if (!records.length) return 0;
    let weightedTotal = 0;
    let totalWeight = 0;
    for (const record of records) {
      const weight = Number(record.progressWeight) > 0 ? Number(record.progressWeight) : 1;
      const percent = phase ? operationPhasePercent(record, phase)
        : operationHasPhases(record) ? operationOverallPercent(record)
        : clampPercent(record.percentComplete);
      weightedTotal += percent * weight;
      totalWeight += weight;
    }
    return totalWeight ? clampPercent(weightedTotal / totalWeight) : 0;
  }

  function calculatedLocationProgress(locationId, phase = "") {
    const allTracked = operationsForLocation(locationId, true).filter(op => op.trackProgress);
    const phaseTracked = allTracked.some(operationHasPhases);
    // Legacy locations with no phase-tagged activities retain their previous rollup.
    // For phase-aware locations, the overall must ALWAYS include the unstarted phases.
    if (!phase && phaseTracked) {
      return clampPercent(SITE_PHASES.reduce((sum, currentPhase) =>
        sum + displayedLocationProgress(locationById(locationId), currentPhase) * PHASE_WEIGHTS[currentPhase], 0));
    }

    const directRecords = operationsForLocation(locationId, false).filter(op =>
      op.trackProgress && (!phase || operationHasPhases(op))
    );
    const directProgress = directRecords.length ? weightedProgress(directRecords, phase) : null;
    const childLocations = childrenOf(locationId);
    const components = [];

    // Task weights determine each room's progress; Location Rollup Weights
    // determine how rooms combine into a building, without double-counting rows.
    if (directProgress !== null) components.push({ percent: directProgress, weight: 1 });

    for (const child of childLocations) {
      const childTracked = operationsForLocation(child.id, true).filter(op =>
        op.trackProgress && (!phase || operationHasPhases(op))
      );
      if (!childTracked.length && !progressIsManual(child, phase)) continue;
      components.push({
        percent: displayedLocationProgress(child, phase),
        weight: Number(child.progressWeight) > 0 ? Number(child.progressWeight) : 1
      });
    }

    if (!components.length) return 0;
    const weightedTotal = components.reduce((sum, c) => sum + c.percent * c.weight, 0);
    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    return totalWeight ? clampPercent(weightedTotal / totalWeight) : 0;
  }

  function locationProgressOverride(location, phase = "") {
    if (!location) return null;
    const overrideField = phase === "Rough-In"
      ? "roughInProgressOverride"
      : phase === "Trim"
        ? "trimProgressOverride"
        : phase === "Final"
          ? "finalProgressOverride"
          : "overallProgressOverride";
    const reasonField = phase === "Rough-In"
      ? "roughInOverrideReason"
      : phase === "Trim"
        ? "trimOverrideReason"
        : phase === "Final"
          ? "finalOverrideReason"
          : "overallOverrideReason";
    const override = nullableNumber(location[overrideField]);
    const reason = String(location[reasonField] || "").trim();

    // SharePoint can surface an untouched Number field as 0. Treat a bare 0 as
    // automatic so it cannot suppress real child/activity progress. A deliberate
    // manual 0% remains available by entering an override reason.
    if (override === null) return null;
    if (override === 0 && !reason) return null;
    return clampPercent(override);
  }

  function displayedLocationProgress(location, phase = "") {
    if (!location) return 0;
    const override = locationProgressOverride(location, phase);
    if (override !== null) return override;
    return calculatedLocationProgress(location.id, phase);
  }

  function progressIsManual(location, phase = "") {
    return locationProgressOverride(location, phase) !== null;
  }

  function locationTypeClass(type) {
    return `so-type-${String(type || "other")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "other"}`;
  }

  function projectLevelSuggestions() {
    const projectLevels = state.locations
      .map(location => String(location.planLevel || "").trim())
      .filter(Boolean);
    return Array.from(new Set([...projectLevels, ...COMMON_PLAN_LEVELS]));
  }

  function planLevelInput(value = "") {
    const id = `soPlanLevelSuggestions`;
    return `
      <input name="planLevel" type="text" value="${escapeHtml(value)}" list="${id}"
        placeholder="Use the level / floor name shown on the plans" autocomplete="off" maxlength="100">
      <datalist id="${id}">
        ${projectLevelSuggestions().map(level => `<option value="${escapeHtml(level)}"></option>`).join("")}
      </datalist>
    `;
  }

  function progressBar(label, value, manual = false) {
    const pct = clampPercent(value);

    return `
      <div class="so-progress-row">
        <span class="so-progress-label">${escapeHtml(label)}</span>
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
        data-so-location-name="${escapeHtml(`${String(location.locationNumber || "")} ${String(location.name || "")}`.toLowerCase())}"
        data-so-location-type="${escapeHtml(String(location.locationType || "").toLowerCase())}"
        data-so-location-level="${escapeHtml(String(location.planLevel || "").toLowerCase())}"
        role="button"
        tabindex="0"
        onclick="SiteOperations.openLocation(${Number(location.id)})"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();SiteOperations.openLocation(${Number(location.id)})}">
        <div class="so-location-heading">
          <div class="so-location-title-line">
            <span class="so-location-type ${locationTypeClass(location.locationType)}">${escapeHtml(location.locationType || "Location")}</span>
            <span class="so-location-title-separator">·</span>
            <h3>${escapeHtml(locationDisplayName(location))}</h3>
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
          <span>${location.planLevel ? `${escapeHtml(location.planLevel)} · ` : ""}${records.length} site item${records.length === 1 ? "" : "s"}</span>
          <span>View details ›</span>
        </div>
      </article>
    `;
  }

  function childLocationTypeIsCompact(location) {
    const type = String(location?.locationType || "").trim().toLowerCase();
    return ["room", "area", "space"].includes(type);
  }

  function useCompactChildLocations(childLocations) {
    if (!childLocations?.length) return false;
    return childLocations.length >= 6 || childLocations.every(childLocationTypeIsCompact);
  }

  function childLocationRow(location) {
    const records = operationsForLocation(location.id, true);
    const overall = displayedLocationProgress(location);
    const atRisk = riskState(records);

    return `
      <button class="so-child-location-row" type="button"
        data-so-child-name="${escapeHtml(`${String(location.locationNumber || "")} ${String(location.name || "")}`.toLowerCase())}"
        data-so-child-type="${escapeHtml(String(location.locationType || "").toLowerCase())}"
        onclick="SiteOperations.openLocation(${Number(location.id)})">
        <span class="so-child-location-main">
          <span class="so-location-type">${escapeHtml(location.locationType || "Location")}</span>
          <strong>${escapeHtml(locationDisplayName(location))}</strong>
        </span>
        <span class="so-child-location-progress">
          <span class="so-mini-progress"><span style="width:${overall}%"></span></span>
          <strong>${overall}%</strong>
        </span>
        <span class="so-child-location-count">${records.length} item${records.length === 1 ? "" : "s"}</span>
        <span class="so-child-location-risk">${atRisk ? '<span class="so-status so-status-at-risk">At Risk</span>' : '<span class="so-status so-status-on-track">On Track</span>'}</span>
        <span class="so-child-location-arrow" aria-hidden="true">›</span>
      </button>
    `;
  }

  function applyLocationFilters(scopeId = "") {
    const scope = scopeId ? document.getElementById(scopeId) : document;
    if (!scope) return;

    const controls = document.querySelector(`[data-so-filter-scope="${scopeId}"]`);
    const typeFilter = String(controls?.querySelector('[data-so-filter="type"]')?.value || "").toLowerCase();
    const levelFilter = String(controls?.querySelector('[data-so-filter="level"]')?.value || "").toLowerCase();
    const searchFilter = String(controls?.dataset?.searchValue || "").trim().toLowerCase();

    scope.querySelectorAll(".so-location-card").forEach(card => {
      const name = card.dataset.soLocationName || "";
      const type = card.dataset.soLocationType || "";
      const level = card.dataset.soLocationLevel || "";
      const haystack = `${name} ${type} ${level}`;
      card.hidden = Boolean(
        (searchFilter && !haystack.includes(searchFilter)) ||
        (typeFilter && type !== typeFilter) ||
        (levelFilter && level !== levelFilter)
      );
    });
  }

  function filterChildLocations(value, scopeId = "") {
    const controls = document.querySelector(`[data-so-filter-scope="${scopeId}"]`);
    if (controls) controls.dataset.searchValue = String(value || "");
    applyLocationFilters(scopeId);
  }

  function locationFilterChanged(scopeId) {
    applyLocationFilters(scopeId);
  }

  function locationNavigationControls(items, { id, placeholder, scopeId }) {
    const safeItems = items || [];
    if (safeItems.length < 8) return "";

    const types = Array.from(new Set(safeItems.map(x => String(x.locationType || "").trim()).filter(Boolean))).sort();
    const levels = Array.from(new Set(safeItems.map(x => String(x.planLevel || "").trim()).filter(Boolean))).sort();
    // When there are no secondary filters, keep the lone picker right-aligned.
    const lonePickerStyle = levels.length <= 1 && types.length <= 1
      ? ' style="display:flex;flex:0 1 250px;width:250px;min-width:0;max-width:100%;margin-left:auto;align-items:center;justify-content:flex-end;"'
      : "";

    return `
      <div class="so-location-nav-controls"${lonePickerStyle} data-so-filter-scope="${escapeHtml(scopeId)}" data-search-value="">
        ${locationPickerMarkup({ id, items:safeItems, placeholder, scopeId })}
        ${levels.length > 1 ? `
          <select class="so-location-filter" data-so-filter="level" onchange="SiteOperations.locationFilterChanged('${escapeHtml(scopeId)}')" aria-label="Filter locations by level">
            <option value="">All Levels</option>
            ${levels.map(level => `<option value="${escapeHtml(level.toLowerCase())}">${escapeHtml(level)}</option>`).join("")}
          </select>` : ""}
        ${types.length > 1 ? `
          <select class="so-location-filter" data-so-filter="type" onchange="SiteOperations.locationFilterChanged('${escapeHtml(scopeId)}')" aria-label="Filter locations by type">
            <option value="">All Types</option>
            ${types.map(type => `<option value="${escapeHtml(type.toLowerCase())}">${escapeHtml(type)}</option>`).join("")}
          </select>` : ""}
      </div>
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
          ${progressBar("Overall Task", operationOverallPercent(op))}
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
          <span class="so-status so-status-${operationStatusClass(op.status || "Planned")}">${escapeHtml(op.status || "Planned")}</span>
        </div>

        ${op.details ? `<div class="so-operation-details">${escapeHtml(displayOperationDetails(op.details))}</div>` : ""}
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

  function operationSort(a, b) {
    return (
      String(a.targetDate || "9999-12-31")
        .localeCompare(String(b.targetDate || "9999-12-31")) ||
      String(b.activityDate || "")
        .localeCompare(String(a.activityDate || "")) ||
      Number(b.id) - Number(a.id)
    );
  }

  function operationHierarchyRows(operations) {
    const items =
      (operations || [])
        .slice();

    const byId =
      new Map(
        items.map(operation => [
          Number(operation.id),
          operation
        ])
      );

    const childrenByParent =
      new Map();

    items.forEach(operation => {
      const parentId =
        Number(operation.parentOperationId || 0);

      if (
        !parentId ||
        !byId.has(parentId)
      ) {
        return;
      }

      if (!childrenByParent.has(parentId)) {
        childrenByParent.set(parentId, []);
      }

      childrenByParent
        .get(parentId)
        .push(operation);
    });

    childrenByParent.forEach(children =>
      children.sort(operationSort)
    );

    const roots =
      items
        .filter(operation => {
          const parentId =
            Number(operation.parentOperationId || 0);

          return (
            !parentId ||
            !byId.has(parentId)
          );
        })
        .sort(operationSort);

    const rows = [];
    const visited = new Set();

    const walk = (operation, level = 0) => {
      const id =
        Number(operation.id);

      if (!id || visited.has(id)) {
        return;
      }

      visited.add(id);

      const children =
        childrenByParent.get(id) || [];

      const hasChildren =
        children.length > 0;

      const expanded =
        !collapsedOperationIds.has(id);

      rows.push(
        compactOperationRow(
          operation,
          level,
          hasChildren,
          expanded
        )
      );

      if (
        hasChildren &&
        expanded
      ) {
        children.forEach(child =>
          walk(child, level + 1)
        );
      }
    };

    roots.forEach(root =>
      walk(root, 0)
    );

    // Safety fallback only for true orphan records.
    // Valid children of a collapsed parent must stay hidden rather
    // than being re-added as top-level rows.
    items
      .filter(operation => {
        const id =
          Number(operation.id);

        const parentId =
          Number(operation.parentOperationId || 0);

        return (
          !visited.has(id) &&
          (
            !parentId ||
            !byId.has(parentId)
          )
        );
      })
      .sort(operationSort)
      .forEach(operation =>
        walk(operation, 0)
      );

    return rows.join("");
  }

  function toggleOperationChildren(id) {
    const operationId =
      Number(id);

    if (!operationId) return;

    if (collapsedOperationIds.has(operationId)) {
      collapsedOperationIds.delete(operationId);
    } else {
      collapsedOperationIds.add(operationId);
    }

    if (state.currentLocationId) {
      render();
    }
  }

  function compactOperationRow(
    op,
    level = 0,
    hasChildren = false,
    expanded = true
  ) {
    const pct = op.trackProgress ? operationOverallPercent(op) : null;
    const phase = op.sitePhase || op.system || op.entryType || "Site Item";
    const activityDate = op.activityDate ? displayDate(op.activityDate) : "—";
    const target = op.targetDate ? displayDate(op.targetDate) : "—";
    const status = op.status || "Planned";

    const canDrill = Boolean(currentUser?.canAdmin);
    const tag = canDrill ? "button" : "div";
    const action = canDrill
      ? ` type="button" onclick="SiteOperations.openOperationDetail(${Number(op.id)})"`
      : ` role="group"`;

    return `
      <${tag} class="so-operation-row ${canDrill ? "so-operation-row-drill" : "so-operation-row-readonly"}"${action}>
        <span
          class="so-operation-row-main"
          style="--so-task-level:${Math.max(0, Number(level) || 0)}"
        >
          <span class="so-operation-row-title-line">
            ${
              hasChildren
                ? `<span
                     class="so-operation-hierarchy-toggle"
                     role="button"
                     tabindex="0"
                     title="${expanded ? "Collapse Subtasks" : "Expand Subtasks"}"
                     onclick="event.stopPropagation();SiteOperations.toggleOperationChildren(${Number(op.id)})"
                     onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();SiteOperations.toggleOperationChildren(${Number(op.id)})}"
                   >${expanded ? "▾" : "▸"}</span>`
                : `<span class="so-operation-hierarchy-spacer"></span>`
            }

            <strong>${escapeHtml(op.title)}</strong>

            ${
              String(op.itemType || "Task") === "Milestone"
                ? `<span class="so-operation-itemtype">Milestone</span>`
                : ""
            }
          </span>

          <span>${escapeHtml(phase)}</span>
        </span>
        <span class="so-operation-row-details" title="${escapeHtml(displayOperationDetails(op.details || ""))}">
          ${op.details ? escapeHtml(displayOperationDetails(op.details)) : '<span class="so-detail-empty">—</span>'}
        </span>
        <span class="so-operation-row-progress">
          ${pct === null
            ? '<span class="so-progress-na">—</span>'
            : `<span class="so-mini-progress"><span style="width:${pct}%"></span></span><strong>${pct}%</strong>`}
        </span>
        <span class="so-operation-row-status">
          <span class="so-status so-status-${operationStatusClass(status)}">${escapeHtml(status)}</span>
        </span>
        <span class="so-operation-row-activity-date">${escapeHtml(activityDate)}</span>
        <span class="so-operation-row-target">${escapeHtml(target)}</span>
        ${canDrill ? '<span class="so-operation-row-arrow" aria-hidden="true">›</span>' : '<span class="so-operation-row-arrow so-operation-row-arrow-hidden" aria-hidden="true"></span>'}
      </${tag}>
    `;
  }


  // AHT_SITE_ACTIVITY_VISUAL_ALIGNMENT_20261112
  // Hide import/reconciliation tags only in the UI; original SharePoint notes stay intact.
  function displayOperationDetails(value) {
    return String(value || "")
      .replace(/(^|\n)[ \t]*(?:GH-AP-LOCATIONS-\d{8}:|\[(?:2490|2200|2340)-[A-Z0-9_-]+\])[ \t]*/g, "$1")
      .trim();
  }

  function renderOperationDetail(root) {
    const op = state.operations.find(x => Number(x.id) === Number(state.currentOperationId));
    if (!op) {
      state.currentOperationId = null;
      renderLocationDetail(root);
      return;
    }

    const location = locationById(op.locationId);
    const canEdit = Boolean(currentUser?.canAdmin);

    root.innerHTML = `
      <style>
        .so-item-detail .so-item-detail-actions { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
        .so-item-detail .so-item-detail-actions .so-status { font-size:11px; border-radius:999px; padding:3px 8px; }
        .so-item-detail .so-item-detail-actions .btn { font-size:12px; min-height:30px; padding:5px 11px; border-radius:6px; line-height:1.2; }
        .so-item-phase-progress { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-top:12px; }
        .so-item-phase-progress > div { min-width:0; }
        .so-item-phase-progress strong { display:block; margin:3px 0 5px; }
        .so-item-phase-progress .so-mini-progress { display:block; width:100%; }
        @media(max-width:540px) { .so-item-phase-progress { grid-template-columns:1fr; } }

        /* AHT_SITE_ACTIVITY_VISUAL_ALIGNMENT_20261112: match location progress rows */
        .so-item-detail .so-item-progress-panel.so-item-progress-consistent { max-width:none; padding:12px 0 16px; }
        .so-item-detail .so-item-overall-progress { margin:0 0 12px; }
        .so-item-detail .so-item-overall-progress strong { font-size:26px; }
        .so-item-detail .so-item-progress-phase-rows { border:0; border-radius:0; padding:0; margin:0; background:transparent; }
        .so-item-detail .so-item-progress-phase-rows .so-progress-row { grid-template-columns:80px minmax(100px,1fr) 60px; }

        /* AHT_SITE_ACTIVITY_HEADER_COHESION_20261112: Room/Activity visual parity only */
        .so-item-detail .so-item-detail-heading-aligned { align-items:center; gap:18px; }
        .so-item-detail .so-item-detail-heading-main { min-width:0; }
        .so-item-detail .so-item-detail-title-line { display:flex; align-items:baseline; flex-wrap:wrap; gap:7px; min-width:0; }
        .so-item-detail .so-item-detail-title-line .eyebrow { margin:0; color:var(--blue); font-weight:800; }
        .so-item-detail .so-item-detail-title-line h3 { margin:0; color:var(--navy); font-size:22px; font-weight:800; line-height:1.2; }
        .so-item-detail .so-item-detail-context { display:flex; align-items:center; flex-wrap:wrap; gap:9px; margin-top:5px; }
        .so-item-detail .so-item-detail-context .so-status { font-size:10px; padding:3px 8px; }
        .so-item-detail .so-item-detail-header-actions { align-items:center; gap:12px; flex-shrink:0; }
        .so-item-detail .so-item-detail-header-overall strong { font-size:32px; }
        .so-item-detail .so-item-detail-header-actions .btn { font-size:12px; }
        .so-item-detail .so-item-progress-consistent { padding-top:14px; }
        @media (max-width:760px) {
          .so-item-detail .so-item-detail-heading-aligned { flex-direction:column; align-items:stretch; }
          .so-item-detail .so-item-detail-header-actions { flex-direction:row; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
          .so-item-detail .so-item-detail-header-overall { margin-right:auto; align-items:flex-start; }
        }

        /* AHT_SITE_ACTIVITY_ROOM_STYLE_PARITY_20261112
           Work Activity visual treatment follows the existing Room detail header.
           These rules are scoped to the Work Activity detail card ONLY. */

        /* Same dark, readable title as Room; blue remains for the type label. */
        .so-item-detail .so-item-detail-title-line h3 {
          color: var(--ink, #26353e);
          font-size: 22px;
          font-weight: 700;
          line-height: 1.2;
          letter-spacing: normal;
        }
        .so-item-detail .so-item-detail-title-line .eyebrow {
          color: var(--blue, #0088c7);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .07em;
          text-transform: uppercase;
        }
        .so-item-detail .so-item-detail-title-line .so-location-title-separator {
          color: var(--muted, #66747d);
          font-weight: 700;
        }

        /* Match the Room secondary description; status badge stays a badge. */
        .so-item-detail .so-item-detail-context {
          margin-top: 4px;
          color: var(--muted, #66747d);
          font-size: 11px;
          font-weight: 400;
          line-height: 1.35;
        }
        .so-item-detail .so-item-detail-context > span:first-child {
          color: inherit;
        }

        /* Use the Room's KPI size and regular full-size Edit button treatment. */
        .so-item-detail .so-item-detail-header-overall strong {
          color: var(--navy, #004e84);
          font-size: 29px;
          font-weight: 700;
          line-height: 1;
        }
        .so-item-detail .so-item-detail-header-overall span {
          color: var(--muted, #66747d);
          font-size: 11px;
          font-weight: 400;
          margin-top: 5px;
        }
        .so-item-detail .so-item-detail-header-actions .btn {
          font-size: 13px;
          font-weight: 600;
          line-height: normal;
          padding: 9px 12px;
          border-radius: 7px;
          white-space: nowrap;
        }

        /* Room-style neutral metadata; blue is reserved for actions/labels/KPIs. */
        .so-item-detail .so-item-detail-grid > div > span {
          color: var(--muted, #66747d);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .04em;
          text-transform: uppercase;
        }
        .so-item-detail .so-item-detail-grid > div > strong {
          color: var(--ink, #26353e);
          font-size: 12px;
          font-weight: 700;
        }
        .so-item-detail .so-item-detail-section h4 {
          color: var(--ink, #26353e);
          font-weight: 700;
        }
        .so-item-detail .so-item-detail-section:not(.so-item-detail-blocker) > div {
          color: var(--ink, #26353e);
        }
        /* Preserve red warning state for an actual blocker and Delete action. */
        .so-item-detail .so-item-detail-blocker h4,
        .so-item-detail .so-item-detail-blocker > div {
          color: var(--red, #c00000);
        }

        /* AHT_SITE_ACTIVITY_BUTTON_PARITY_20261112
           Use the same standard .btn sizing as the Room's Edit Location button.
           Both actions share sizing; .btn.danger retains its red warning colors. */
        #siteOperations .so-item-detail .so-item-detail-heading-aligned
          .so-item-detail-header-actions button.btn {
          font-family: inherit;
          font-size: 1rem;
          font-weight: 600;
          line-height: normal;
          padding: 9px 12px;
          border-radius: 7px;
          height: auto;
          min-height: 0;
          width: auto;
          white-space: nowrap;
        }
</style>
      <div class="so-item-detail">
        <div class="so-item-detail-heading so-item-detail-heading-aligned">
          <div class="so-item-detail-heading-main">
            <div class="so-detail-title-line so-item-detail-title-line">
              <span class="eyebrow so-location-type">${escapeHtml(op.entryType || "Work Activity")}</span>
              <span class="so-location-title-separator" aria-hidden="true">·</span>
              <h3>${escapeHtml(op.title)}</h3>
            </div>
            <div class="so-item-detail-context small">
              <span>${location ? escapeHtml(locationDisplayName(location)) : "Site Operations"}${op.sitePhase ? ` · ${escapeHtml(op.sitePhase)}` : ""}</span>
              <span class="so-status so-status-${operationStatusClass(op.status || "Planned")}">${escapeHtml(op.status || "Planned")}</span>
            </div>
          </div>
          <div class="so-detail-header-actions so-item-detail-header-actions">
            ${op.trackProgress ? `
              <div class="so-detail-overall so-item-detail-header-overall">
                <strong>${operationOverallPercent(op)}%</strong>
                <span>Overall Progress</span>
              </div>
            ` : ""}
            ${canEdit ? `<button class="btn" type="button" onclick="SiteOperations.editOperation(${Number(op.id)})">Edit Activity</button>` : ""}
            ${canEdit ? `<button class="btn danger" type="button" onclick="SiteOperations.deleteOperation(${Number(op.id)})">Delete</button>` : ""}
          </div>
        </div>

        ${op.trackProgress ? `
          <div class="so-item-progress-panel so-item-progress-consistent">
            ${operationHasPhases(op) ? `
              <div class="so-detail-progress so-item-progress-phase-rows">
                ${SITE_PHASES.map(phase => progressBar(phase, operationPhasePercent(op, phase))).join("")}
              </div>
            ` : progressBar("Overall Task", operationOverallPercent(op))}
          </div>
        ` : ""}


        <div class="so-item-detail-grid">
          <div><span>System</span><strong>${escapeHtml(op.system || "—")}</strong></div>
          <div><span>Site Phase</span><strong>${escapeHtml(op.sitePhase || "—")}</strong></div>
          <div><span>Work Stage</span><strong>${escapeHtml(op.workStage || "—")}</strong></div>
          <div><span>Lead / Responsible</span><strong>${escapeHtml(op.leadResponsible || "—")}</strong></div>
          <div><span>Activity Date</span><strong>${escapeHtml(displayDate(op.activityDate))}</strong></div>
          <div><span>Target Date</span><strong>${escapeHtml(displayDate(op.targetDate))}</strong></div>
          <div><span>Progress Weight</span><strong>${escapeHtml(op.progressWeight || 1)}</strong></div>
          <div><span>Track Progress</span><strong>${op.trackProgress ? "Yes" : "No"}</strong></div>
        </div>

        ${op.details ? `
          <div class="so-item-detail-section">
            <h4>Details</h4>
            <div>${escapeHtml(displayOperationDetails(op.details))}</div>
          </div>
        ` : ""}

        ${op.blockerDependency ? `
          <div class="so-item-detail-section so-item-detail-blocker">
            <h4>Blocker / Dependency</h4>
            <div>${escapeHtml(op.blockerDependency)}</div>
          </div>
        ` : ""}

        ${(op.projectActivityMode && op.projectActivityMode !== "Auto") ||
          (op.riskMode && op.riskMode !== "Auto") ||
          (op.informationRequiredMode && op.informationRequiredMode !== "Auto")
          ? `
            <div class="so-item-detail-section">
              <h4>Automation Overrides</h4>
              <div class="so-item-detail-grid so-item-automation-grid">
                <div><span>Project Activity</span><strong>${escapeHtml(op.projectActivityMode || "Auto")}</strong></div>
                <div><span>Risk</span><strong>${escapeHtml(op.riskMode || "Auto")}</strong></div>
                <div><span>Information Required</span><strong>${escapeHtml(op.informationRequiredMode || "Auto")}</strong></div>
              </div>
            </div>
          `
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

    const currentOperation = state.currentOperationId
      ? state.operations.find(x => Number(x.id) === Number(state.currentOperationId))
      : null;

    return `
      <button type="button" onclick="SiteOperations.openOverview()">Site Operations</button>
      ${items.map(item =>
        `<span>›</span><button type="button" onclick="SiteOperations.openLocation(${Number(item.id)})">${escapeHtml(locationDisplayName(item))}</button>`
      ).join("")}
      ${currentOperation
        ? `<span>›</span><span class="so-breadcrumb-current">${escapeHtml(currentOperation.title)}</span>`
        : ""}
    `;
  }

  function locationOptionLabel(location) {
    if (!location) return "";
    const type = String(location.locationType || "Location").trim();
    const level = String(location.planLevel || "").trim();
    return `${type} · ${locationDisplayName(location)}${level ? ` · ${level}` : ""}`;
  }

  function locationPickerMarkup({
    id,
    items,
    placeholder = "Find a location…",
    scopeId = "",
    selectedId = null,
    fieldName = "",
    required = false,
    allowTopLevel = false
  }) {
    const safeItems = (items || []).slice().sort((a,b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );
    const selected = safeItems.find(x => Number(x.id) === Number(selectedId));
    const listId = `${id}List`;
    const hidden = fieldName
      ? `<input type="hidden" name="${escapeHtml(fieldName)}" value="${selected ? Number(selected.id) : ""}">`
      : "";
    const topOption = allowTopLevel ? `<option value="Top Level" data-id=""></option>` : "";
    return `
      <div class="so-smart-picker">
        <input
          id="${escapeHtml(id)}"
          class="so-smart-picker-input"
          type="text"
          list="${escapeHtml(listId)}"
          value="${selected ? escapeHtml(locationOptionLabel(selected)) : (allowTopLevel && !selectedId ? "Top Level" : "")}"
          placeholder="${escapeHtml(placeholder)}"
          autocomplete="off"
          ${required ? "required" : ""}
          data-picker-list="${escapeHtml(listId)}"
          data-picker-scope="${escapeHtml(scopeId)}"
          onfocus="this.showPicker?.()"
          oninput="SiteOperations.locationPickerInput(this)"
          onchange="SiteOperations.locationPickerCommit(this)">
        <span class="so-smart-picker-chevron" aria-hidden="true">⌄</span>
        ${hidden}
        <datalist id="${escapeHtml(listId)}">
          ${topOption}
          ${safeItems.map(location =>
            `<option value="${escapeHtml(locationOptionLabel(location))}" data-id="${Number(location.id)}"></option>`
          ).join("")}
        </datalist>
      </div>`;
  }

  function locationPickerMatch(input) {
    const listId = input?.dataset?.pickerList;
    const list = listId ? document.getElementById(listId) : null;
    if (!input || !list) return null;
    const value = String(input.value || "").trim();
    return Array.from(list.options).find(option => option.value === value) || null;
  }

  function locationPickerInput(input) {
    const target = input.closest('.so-smart-picker')?.querySelector('input[type="hidden"]');
    const match = locationPickerMatch(input);
    if (target) target.value = match ? String(match.dataset.id || "") : "";
    if (input.required) {
      input.setCustomValidity(match ? "" : "Choose a location from the list.");
    }
    const scopeId = input.dataset.pickerScope || "";
    if (scopeId) {
      const typed = match ? "" : input.value;
      filterChildLocations(typed, scopeId);
    }
  }

  function locationPickerCommit(input) {
    const match = locationPickerMatch(input);
    locationPickerInput(input);
    if (!match) return;
    const id = Number(match.dataset.id || 0);
    const scopeId = input.dataset.pickerScope || "";
    if (scopeId && id) openLocation(id);
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
        <div class="so-summary-current"><strong>${current}</strong><span>Current Work</span></div>
        <div class="so-summary-upcoming"><strong>${upcoming}</strong><span>Upcoming</span></div>
        <div class="so-summary-risk ${atRisk ? "risk" : ""}"><strong>${atRisk}</strong><span>At Risk</span></div>
        <div class="so-summary-complete"><strong>${complete}</strong><span>Completed</span></div>
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

    const sitePdfBtn = document.getElementById("downloadSiteOperationsPdfBtn");
    const locationPdfBtn = document.getElementById("downloadSiteLocationPdfBtn");
    sitePdfBtn?.classList.toggle("hidden", Boolean(state.currentLocationId || state.currentOperationId));
    locationPdfBtn?.classList.toggle("hidden", !state.currentLocationId || Boolean(state.currentOperationId));

    const hasDrilldown = Boolean(state.currentLocationId || state.currentOperationId);
    breadcrumb.classList.toggle("hidden", !hasDrilldown);
    breadcrumb.innerHTML = hasDrilldown ? breadcrumbs() : "";

    if (state.loading) {
      root.innerHTML = `
        <div class="so-loading">
          <div class="startup-spinner"></div>
          <span>Loading Site Operations…</span>
        </div>
      `;
      return;
    }

    if (state.currentOperationId) {
      renderOperationDetail(root);
    } else if (state.currentLocationId) {
      renderLocationDetail(root);
    } else {
      renderOverview(root);
    }
  }

  // Provisional whole-property rollup. Includes planned 0%-complete tasks and
  // unpopulated leaf rooms, rather than treating the Guest House as the whole job.
  function projectInstallationOverview() {
    const projectRollup = SharePointDataProvider.calculateSiteInstallationRollup(
      state.locations, state.operations, state.projectId
    );
    const phaseCard = phase => {
      const value = projectRollup.phases[phase] || 0;
      return `
        <div style="border:1px solid #e1e8ef;border-radius:6px;padding:10px 12px;min-width:0;">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">
            <span style="font-size:12px;font-weight:700;color:#5b6b79;">${escapeHtml(phase)}</span>
            <strong style="font-size:16px;color:#174d78;">${value}%</strong>
          </div>
          <div role="progressbar" aria-label="${escapeHtml(phase)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"
               style="height:7px;background:#e8eef4;border-radius:10px;overflow:hidden;margin-top:10px;">
            <div style="height:100%;width:${value}%;background:#2d86bb;border-radius:10px;"></div>
          </div>
        </div>`;
    };
    const project = typeof currentProject === "function" ? currentProject() : null;
    const reported = reportedInstallationState(project, projectRollup.overall || 0);
    const overall = reported.displayed;
    const canSeePrivateReportDetails = allowedReportedProgressOwner();
    const note = canSeePrivateReportDetails && reported.manual
      ? `Manual override · Calculated: ${reported.calculated}%`
      : (reported.manual ? "" : "Provisional · Scope under review");
    return `
      <section class="so-installation-overview" aria-label="Project installation overview"
               style="border:1px solid #d7e1ea;background:#fff;border-radius:8px;padding:14px 16px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <h3 style="margin:0;color:#174d78;font-size:16px;">Overall Installation Progress</h3>
            <p style="margin:4px 0 0;font-size:12px;color:#5b6b79;">Whole-property installation · Rough-In 50% · Trim 30% · Final 20%</p>
          </div>
          <div style="text-align:right;">
            <strong style="display:block;color:#174d78;font-size:25px;line-height:1.1;">${overall}%</strong>
            ${note ? `<span style="display:block;font-size:11px;font-weight:700;color:#617588;">${escapeHtml(note)}</span>` : ""}
            ${canSeePrivateReportDetails && reported.manual && project?.progressInstallationOverrideReason ? `<span style="display:block;font-size:11px;color:#617588;max-width:300px;">${escapeHtml(project.progressInstallationOverrideReason)}</span>` : ""}
            ${canSeePrivateReportDetails ? `<button class="btn" type="button" style="margin-top:7px;" onclick="SiteOperations.openReportedInstallationEditor()">${reported.manual ? "Adjust / Restore Auto" : "Adjust Reported Progress"}</button>` : ""}
          </div>
        </div>
        <div role="progressbar" aria-label="Overall installation progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${overall}"
             style="height:9px;background:#e8eef4;border-radius:10px;overflow:hidden;margin-top:12px;">
          <div style="height:100%;width:${overall}%;background:#2d86bb;border-radius:10px;"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:12px;">
          ${SITE_PHASES.map(phaseCard).join("")}
        </div>
        <p style="font-size:11px;color:#596b7b;margin:10px 0 0;">
          ${projectRollup.trackedTasks} tracked tasks · ${projectRollup.emptyLocations} locations without entered tasks count as 0%.
          Task and room weights are included. Scope and relative effort weights remain subject to verification.
          ${projectRollup.unassignedTasks ? `${projectRollup.unassignedTasks} unassigned task(s) included for review.` : ""}
        </p>
      </section>`;
  }

  function renderOverview(root) {
    const roots = childrenOf(null);
    const records = state.operations;

    root.innerHTML = `
      ${projectInstallationOverview()}
      ${summaryStrip(records)}

      <div class="so-section-heading so-locations-heading">
        <div>
          <h3>Project Locations</h3>
          <p>Building and site progress. Select a location to view the detailed work driving these numbers.</p>
        </div>
        ${locationNavigationControls(roots, {
          id:"soProjectLocationPicker",
          placeholder:"Find Location…",
          scopeId:"soProjectLocations"
        })}
      </div>

      <div class="so-location-scroll" id="soProjectLocations">
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
      <div class="so-detail-hero ${currentUser?.canAdmin ? "so-detail-hero-admin" : "so-detail-hero-readonly"}">
        <div>
          <div class="so-detail-title-line">
            <span class="eyebrow so-location-type ${locationTypeClass(location.locationType)}">${escapeHtml(location.locationType || "Location")}</span>
            <span class="so-location-title-separator">·</span>
            <h3>${escapeHtml(locationDisplayName(location))}</h3>
          </div>
          <div class="small">${allOperations.length} site item${allOperations.length === 1 ? "" : "s"} within this location${location.planLevel ? ` · ${escapeHtml(location.planLevel)}` : ""}</div>
        </div>

        ${currentUser?.canAdmin ? `
          <div class="so-detail-header-actions">
            <div class="so-detail-overall">
              <strong>${overall}%</strong>
              <span>Overall Progress${progressIsManual(location) ? " · Manual" : ""}</span>
            </div>
            <button class="btn" type="button" onclick="SiteOperations.editLocation(${Number(location.id)})">Edit Location</button>
          </div>
        ` : ""}
      </div>

      <div class="so-detail-progress">
        ${!currentUser?.canAdmin ? progressBar("Overall", overall, progressIsManual(location)) : ""}
        ${progressBar("Rough-In", rough, progressIsManual(location, "Rough-In"))}
        ${progressBar("Trim", trim, progressIsManual(location, "Trim"))}
        ${progressBar("Final", final, progressIsManual(location, "Final"))}
      </div>

      ${summaryStrip(allOperations)}

      <div class="so-section-heading so-work-heading so-section-heading-strong">
        <div>
          <h3>${escapeHtml(locationDisplayName(location))} Progress & Activity</h3>
          <p>Activities assigned directly to ${escapeHtml(locationDisplayName(location))}.</p>
        </div>
        ${currentUser?.canAdmin ? `<button class="btn" type="button" onclick="SiteOperations.openOperationEditor()">+ Add Activity</button>` : ""}
      </div>

      <div class="so-operation-list so-operation-list-compact so-activity-scroll">
        ${directOperations.length
          ? `
            <div class="so-operation-row-head">
              <span>Activity</span>
              <span>Details</span>
              <span>Progress</span>
              <span>Status</span>
              <span>Activity Date</span>
              <span>Target</span>
              <span></span>
            </div>
            ${operationHierarchyRows(directOperations)}
          `
          : `<div class="so-empty">
              <strong>No direct Site Operations items here yet.</strong>
              <span>${currentUser?.canAdmin
                ? "Use Add Activity above to record an update directly against this location."
                : "No detailed items have been published for this location."}</span>
            </div>`}
      </div>

      ${childLocations.length
        ? `
          <div class="so-section-heading so-child-heading so-section-heading-strong so-areas-heading">
            <div>
              <h3>Areas</h3>
              <p>Select an area to continue into the project hierarchy.</p>
            </div>
            ${locationNavigationControls(childLocations, {
              id:"soChildLocationPicker",
              placeholder:"Find Location…",
              scopeId:"soChildLocations"
            })}
          </div>

          <div class="so-location-scroll so-child-location-scroll" id="soChildLocations">
            <div class="so-location-grid so-child-grid">
              ${childLocations.map(locationCard).join("")}
            </div>
          </div>
        `
        : ""}
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

    const sameProject = Number(state.projectId) === Number(project.sharePointId);
    const restoreLocationId = sameProject ? Number(state.currentLocationId || 0) : 0;
    const restoreOperationId = sameProject ? Number(state.currentOperationId || 0) : 0;

    state.loading = true;
    state.projectId = Number(project.sharePointId);
    if (!sameProject) {
      state.currentLocationId = null;
      state.currentOperationId = null;
    }
    render();

    try {
      await ensureLocationSchema();

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
            locationNumber: fields.LocationNumber || "",
            locationType: fields.LocationType || "Other",
            planLevel: fields.PlanLevel || "",
            progressWeight: Number(fields.LocationProgressWeight || 1) > 0 ? Number(fields.LocationProgressWeight) : 1,
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
            phaseProgress: {
              roughInPercent: String(fields.PhaseProgressVersion || "") === "1" ? nullableNumber(fields.RoughInPercent) : null,
              trimPercent: String(fields.PhaseProgressVersion || "") === "1" ? nullableNumber(fields.TrimPercent) : null,
              finalPercent: String(fields.PhaseProgressVersion || "") === "1" ? nullableNumber(fields.FinalPercent) : null
            },
            progressWeight:
              Number(fields.ProgressWeight || 0) > 0
                ? Number(fields.ProgressWeight)
                : 1,
            trackProgress: Boolean(fields.TrackProgress),
            activityDate: graphDate(fields.ActivityDate),
            targetDate: graphDate(fields.TargetDate),

            // Structured Site schedule relationships.
            // Existing records default to a normal top-level Task with
            // no predecessors, preserving all previous behavior.
            parentOperationId:
              Number(fields.ParentOperationId || 0),

            predecessorIds:
              parseStructuredOperationIds(fields.PredecessorIds),

            itemType:
              fields.ItemType || "Task",

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

      if (restoreOperationId) {
        const restoredOperation = state.operations.find(
          x => Number(x.id) === Number(restoreOperationId)
        );
        if (restoredOperation) {
          state.currentOperationId = Number(restoredOperation.id);
          state.currentLocationId = Number(restoredOperation.locationId || 0) || null;
        } else {
          state.currentOperationId = null;
        }
      }

      if (!state.currentOperationId && restoreLocationId) {
        state.currentLocationId = locationById(restoreLocationId)
          ? restoreLocationId
          : null;
      }

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
    state.currentOperationId = null;
    state.currentLocationId = null;
    render();
  }

  function openLocation(id) {
    if (!locationById(id)) return;
    state.currentOperationId = null;
    state.currentLocationId = Number(id);
    render();
    document.getElementById("siteOperations")?.scrollIntoView({ block: "start" });
  }

  function openOperationDetail(id) {
    const record = state.operations.find(x => Number(x.id) === Number(id));
    if (!record) return;
    state.currentLocationId = Number(record.locationId || 0);

    // Full Site Item detail is an administrator workspace. Other users stop
    // at the location/room activity page, where the useful summary is shown.
    if (!currentUser?.canAdmin) {
      state.currentOperationId = null;
      render();
      document.getElementById("siteOperations")?.scrollIntoView({ block: "start" });
      return;
    }

    state.currentOperationId = Number(record.id);
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
    const excludedIds = excludeId
      ? descendantIds(excludeId)
      : new Set();

    const sorted = state.locations
      .filter(location => !excludedIds.has(Number(location.id)))
      .slice()
      .sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      );

    return `
      <option value="">Top Level</option>
      ${sorted.map(location =>
        `<option value="${Number(location.id)}" ${Number(selectedId) === Number(location.id) ? "selected" : ""}>
          ${escapeHtml(locationDisplayName(location))}
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
          ${escapeHtml(locationDisplayName(location))}
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
        "Location Number",
        textInput("locationNumber", record?.locationNumber || "", "text", "maxlength='50' placeholder='e.g. 118 or 001'")
      )}

      ${field(
        "Location Type",
        select(
          "locationType",
          record?.locationType && !LOCATION_TYPES.includes(record.locationType)
            ? [...LOCATION_TYPES, record.locationType]
            : LOCATION_TYPES,
          record?.locationType || "Building"
        )
      )}

      ${field(
        "Level / Floor (from plans)",
        planLevelInput(record?.planLevel || "")
      )}

      ${field(
        "Parent Location",
        locationPickerMarkup({
          id:"soParentLocationPicker",
          items:state.locations.filter(location => !(record?.id && descendantIds(record.id).has(Number(location.id)))),
          placeholder:"Choose parent location…",
          selectedId:defaultParent,
          fieldName:"parentLocationId",
          allowTopLevel:true
        })
      )}

      ${field(
        "Sort Order",
        textInput("sortOrder", record?.sortOrder ?? 0, "number", "step='1'")
      )}

      ${field(
        "Rollup Weight",
        textInput("progressWeight", record?.progressWeight ?? 1, "number", "min='0.1' step='0.1'")
      )}

      <div class="field full">
        <div class="small">
          Admin rollup weight. Default 1. A higher value makes this room/area/building count more when its parent progress is calculated.
        </div>
      </div>

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

  function siteOperationDescendantIds(operationId) {
    const rootId = Number(operationId || 0);

    if (!rootId) return new Set();

    const descendants = new Set();
    const queue = [rootId];

    while (queue.length) {
      const currentId = queue.shift();

      state.operations.forEach(operation => {
        const operationIdValue = Number(operation.id || 0);
        const parentIdValue = Number(operation.parentOperationId || 0);

        if (
          operationIdValue &&
          parentIdValue === currentId &&
          !descendants.has(operationIdValue)
        ) {
          descendants.add(operationIdValue);
          queue.push(operationIdValue);
        }
      });
    }

    return descendants;
  }

  function togglePredecessorChoice(button) {
    const checkbox =
      button?.querySelector(
        'input[name="predecessorIds"]'
      );

    if (!checkbox) return;

    checkbox.checked =
      !checkbox.checked;

    button.classList.toggle(
      "selected",
      checkbox.checked
    );

    button.setAttribute(
      "aria-pressed",
      checkbox.checked ? "true" : "false"
    );

    const marker =
      button.querySelector(
        ".so-schedule-choice-marker"
      );

    if (marker) {
      marker.textContent =
        checkbox.checked ? "✓" : "";
    }
  }

  function siteOperationOptionLabel(operation) {
    const location =
      state.locations.find(
        item => Number(item.id) === Number(operation.locationId)
      );

    const locationName =
      location
        ? locationDisplayName(location)
        : "";

    return locationName
      ? `${operation.title} · ${locationName}`
      : operation.title;
  }

  function operationFields(record = null) {
    const defaultLocationId = record?.locationId || state.currentLocationId || state.locations[0]?.id || "";

    const recordId =
      Number(record?.id || 0);

    const descendantIds =
      siteOperationDescendantIds(recordId);

    const parentCandidates =
      state.operations
        .filter(operation =>
          Number(operation.id) !== recordId &&
          !descendantIds.has(Number(operation.id))
        )
        .sort((a,b) =>
          String(a.title || "")
            .localeCompare(String(b.title || ""))
        );

    const predecessorCandidates =
      state.operations
        .filter(operation =>
          Number(operation.id) !== recordId
        )
        .sort((a,b) =>
          String(a.title || "")
            .localeCompare(String(b.title || ""))
        );

    const selectedPredecessorIds =
      new Set(
        Array.isArray(record?.predecessorIds)
          ? record.predecessorIds.map(Number)
          : []
      );

    const parentOptions = [
      `<option value="">None — Top-Level Task</option>`,
      ...parentCandidates.map(operation =>
        `<option value="${Number(operation.id)}" ${
          Number(record?.parentOperationId || 0) === Number(operation.id)
            ? "selected"
            : ""
        }>${escapeHtml(siteOperationOptionLabel(operation))}</option>`
      )
    ].join("");

    const predecessorMarkup =
      predecessorCandidates.length
        ? predecessorCandidates.map(operation => `
            <button
              class="so-schedule-choice ${
                selectedPredecessorIds.has(Number(operation.id))
                  ? "selected"
                  : ""
              }"
              type="button"
              aria-pressed="${
                selectedPredecessorIds.has(Number(operation.id))
                  ? "true"
                  : "false"
              }"
              onclick="SiteOperations.togglePredecessorChoice(this)"
            >
              <input
                type="checkbox"
                name="predecessorIds"
                value="${Number(operation.id)}"
                ${
                  selectedPredecessorIds.has(Number(operation.id))
                    ? "checked"
                    : ""
                }
                tabindex="-1"
                aria-hidden="true"
              >
              <span class="so-schedule-choice-marker" aria-hidden="true">
                ${
                  selectedPredecessorIds.has(Number(operation.id))
                    ? "✓"
                    : ""
                }
              </span>
              <span class="so-schedule-choice-label">
                ${escapeHtml(siteOperationOptionLabel(operation))}
              </span>
            </button>
          `).join("")
        : `<div class="small">No other Site Tasks are available yet.</div>`;

    return `
      ${field(
        "Activity / Progress Item",
        textInput("title", record?.title || "", "text", "required maxlength='255'"),
        true
      )}

      ${field(
        "Location",
        locationPickerMarkup({
          id:"soOperationLocationPicker",
          items:state.locations,
          placeholder:"Find / choose a location…",
          selectedId:defaultLocationId,
          fieldName:"locationId",
          required:true
        })
      )}

      <div class="field full so-form-divider so-schedule-divider">
        <label>Schedule Relationships</label>
        <div class="small">
          Use Higher-Level Task for Task/Subtask hierarchy. Use Predecessors only when another Site Task must finish before this one can begin.
        </div>
      </div>

      ${field(
        "Item Type",
        select(
          "itemType",
          ["Task","Milestone"],
          record?.itemType || "Task"
        )
      )}

      ${field(
        "Higher-Level Task",
        `<select name="parentOperationId">${parentOptions}</select>`
      )}

      ${field(
        "Activity / Start Date",
        textInput(
          "activityDate",
          record?.activityDate || new Date().toISOString().slice(0, 10),
          "date"
        )
      )}

      ${field(
        "Target Date",
        textInput(
          "targetDate",
          record?.targetDate || "",
          "date"
        )
      )}

      <div class="field full">
        <label>Predecessor(s)</label>

        <div class="so-schedule-choice-list">
          ${predecessorMarkup}
        </div>

        <div class="small so-schedule-help">
          Select only Tasks that must be completed before this Task can begin.
        </div>
      </div>

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

      <div class="field full so-form-divider so-phase-intro">
        <label>Task progress by phase</label>
        <div class="small">One task, three persistent phases. Finishing Rough-In carries its 100% forward when the task moves to Trim; the overall task uses 50% / 30% / 20%. Existing progress is retained.</div>
      </div>
      ${SITE_PHASES.map(phase => field(
        `${phase} %`,
        textInput(PHASE_FIELDS[phase], record ? operationPhasePercent(record, phase) : 0, "number", "min='0' max='100' step='1' required")
      )).join("")}
      <div class="field so-legacy-percent-field">
        <label>Percent Complete (unphased item)</label>
        ${textInput("percentComplete", record?.percentComplete ?? 0, "number", "min='0' max='100' step='1' required")}
      </div>

      ${field(
        "Progress Weight",
        textInput("progressWeight", record?.progressWeight ?? 1, "number", "min='0.01' step='0.01'")
      )}

      <div class="field full so-track-progress-field">
        <label>Track Progress</label>
        <label class="so-checkbox">
          <input name="trackProgress" type="checkbox" ${record?.trackProgress ? "checked" : ""}>
          Include this item in automatic progress calculations
        </label>
      </div>

      ${field(
        "Lead / Responsible",
        textInput("leadResponsible", record?.leadResponsible || ""),
        true
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

    const requestedLocationNumber = String(data.get("locationNumber") || "").trim();
    if (state.locationNumberSupported) {
      fields.LocationNumber = requestedLocationNumber;
    } else if (requestedLocationNumber) {
      throw new Error("The Location Number SharePoint field is not ready yet. Run the Site Operations location schema upgrade and refresh.");
    }

    const requestedPlanLevel = String(data.get("planLevel") || "").trim();
    if (state.planLevelSupported) {
      fields.PlanLevel = requestedPlanLevel;
    } else if (requestedPlanLevel) {
      throw new Error("The Level / Floor SharePoint field is not ready yet. Refresh Site Operations as an Administrator and try again.");
    }

    const requestedLocationWeight = Number(data.get("progressWeight") || 1);
    if (state.locationWeightSupported) {
      fields.LocationProgressWeight = Number.isFinite(requestedLocationWeight) && requestedLocationWeight > 0
        ? requestedLocationWeight
        : 1;
    } else if (Math.abs(requestedLocationWeight - 1) > 0.0001) {
      throw new Error("The Location Rollup Weight SharePoint field is not ready yet. Run the Site Operations location schema upgrade and refresh.");
    }

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

    const parentOperationId =
      Number(data.get("parentOperationId") || 0);

    const predecessorIds =
      [...form.querySelectorAll(
        'input[name="predecessorIds"]:checked'
      )]
        .map(input => Number(input.value))
        .filter(id =>
          Number.isFinite(id) &&
          id > 0
        );

    if (
      record?.id &&
      parentOperationId === Number(record.id)
    ) {
      throw new Error(
        "A Site Task cannot be its own Higher-Level Task."
      );
    }

    if (
      record?.id &&
      siteOperationDescendantIds(record.id)
        .has(parentOperationId)
    ) {
      throw new Error(
        "That Higher-Level Task would create a circular Task/Subtask hierarchy."
      );
    }

    if (
      record?.id &&
      predecessorIds.includes(Number(record.id))
    ) {
      throw new Error(
        "A Site Task cannot be its own predecessor."
      );
    }

    const phaseProgress = Object.fromEntries(SITE_PHASES.map(phase => [
      phase, clampPercent(data.get(PHASE_FIELDS[phase]))
    ]));
    let activePhase = String(data.get("sitePhase") || "");
    const phaseAware = SITE_PHASES.includes(activePhase);
    const requestedStatus = String(data.get("status") || "Planned");

    if (phaseAware) await requireOperationPhaseSchema();

    if (phaseAware && requestedStatus === "Complete" &&
        SITE_PHASES.some(phase => phaseProgress[phase] < 100)) {
      throw new Error("A phase-aware task cannot be Complete until Rough-In, Trim, and Final are all 100%.");
    }
    // Advance the active stage without deleting progress earned in previous phases.
    if (phaseAware && activePhase === "Rough-In" && phaseProgress["Rough-In"] === 100 && phaseProgress.Trim < 100) {
      activePhase = "Trim";
    }
    if (phaseAware && activePhase === "Trim" && phaseProgress.Trim === 100 && phaseProgress.Final < 100) {
      activePhase = "Final";
    }
    const currentPercent = phaseAware
      ? phaseProgress[activePhase] : clampPercent(data.get("percentComplete"));

    const fields = {
      Title: String(data.get("title") || "").trim(),
      ProjectLookupId: String(project.sharePointId),
      LocationLookupId: String(Number(data.get("locationId") || 0)),
      EntryType: String(data.get("entryType") || "Work Activity"),
      System: String(data.get("system") || ""),
      SitePhase: activePhase,
      WorkStage: String(data.get("workStage") || ""),
      Status: requestedStatus,
      PercentComplete: currentPercent,
      ...(phaseAware ? {
        RoughInPercent: phaseProgress["Rough-In"],
        TrimPercent: phaseProgress.Trim,
        FinalPercent: phaseProgress.Final,
        PhaseProgressVersion: "1"
      } : {}),
      ProgressWeight: Math.max(0.01, Number(data.get("progressWeight") || 1)),
      TrackProgress: data.get("trackProgress") === "on",
      ActivityDate: data.get("activityDate")
        ? `${data.get("activityDate")}T12:00:00Z`
        : null,
      TargetDate: data.get("targetDate")
        ? `${data.get("targetDate")}T12:00:00Z`
        : null,

      ParentOperationId:
        parentOperationId || null,

      PredecessorIds:
        JSON.stringify(predecessorIds),

      ItemType:
        String(data.get("itemType") || "Task"),

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


// This is a report-only adjustment; task percentages, phase credit and weights
// stay untouched. Saving partial project fields avoids overwriting other edits.
async function verifyReportedProgressIdentity() {
  if (!allowedReportedProgressOwner() || APP_CONFIG.authProvider !== "microsoft") {
    throw new Error("This report control is limited to the designated AHT account.");
  }
  if (typeof window.getMicrosoftAccessToken !== "function") {
    throw new Error("Microsoft identity is not available. Sign in again.");
  }
  const token = await window.getMicrosoftAccessToken(["User.Read"]);
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Could not verify Microsoft account identity.");
  const me = await response.json();
  if (String(me?.id || "").toLowerCase() !== REPORTED_PROGRESS_OWNER_ENTRA_ID) {
    throw new Error("This account is not authorized to adjust reported installation progress.");
  }
}

function reportedProgressModeChanged(mode) {
  const form = document.getElementById("siteOperationsModalForm");
  if (!form) return;
  const manual = mode === "manual";
  for (const name of ["reportedPercent", "reportedReason"]) {
    const input = form.querySelector(`[name="${name}"]`);
    if (input) input.disabled = !manual;
  }
}

function openReportedInstallationEditor() {
  if (!allowedReportedProgressOwner()) return;
  const project = typeof currentProject === "function" ? currentProject() : null;
  if (!project?.sharePointId) return;
  const rolled = SharePointDataProvider.calculateSiteInstallationRollup(
    state.locations, state.operations, state.projectId
  );
  const reported = reportedInstallationState(project, rolled.overall);
  const fields = `
    <div class="field" style="grid-column:1/-1;">
      <label>Reported installation mode</label>
      <select name="reportedMode" onchange="SiteOperations.reportedProgressModeChanged(this.value)">
        <option value="auto" ${!reported.manual ? "selected" : ""}>Automatic — use calculated ${reported.calculated}%</option>
        <option value="manual" ${reported.manual ? "selected" : ""}>Manual override — report a different percentage</option>
      </select>
    </div>
    <div class="field" style="grid-column:1/-1;">
      <label>Reported installation (%)</label>
      <input name="reportedPercent" type="number" min="0" max="100" step="1"
             value="${reported.manual ? reported.displayed : reported.calculated}" ${reported.manual ? "" : "disabled"} required>
      <div class="small">Calculated progress continues updating in the background. This does not change any task, room, Rough-In, Trim, or Final values.</div>
    </div>
    <div class="field" style="grid-column:1/-1;">
      <label>Reason / report note (optional)</label>
      <textarea name="reportedReason" maxlength="255" rows="2" ${reported.manual ? "" : "disabled"}>${escapeHtml(project.progressInstallationOverrideReason || "")}</textarea>
    </div>`;
  const form = modalShell("Reported Installation Progress", fields, "Save Reported Progress");
  form.onsubmit = async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      // Never write based on a spoofed currentUser object or role-preview identity.
      await verifyReportedProgressIdentity();
      const data = new FormData(form);
      const mode = String(data.get("reportedMode") || "auto") === "manual" ? "manual" : "auto";
      const raw = Number(data.get("reportedPercent"));
      if (mode === "manual" && (!Number.isInteger(raw) || raw < 0 || raw > 100)) {
        throw new Error("Enter a whole percentage between 0 and 100.");
      }
      const reason = mode === "manual" ? String(data.get("reportedReason") || "").trim().slice(0, 255) : "";
      const fields = {
        ProgressInstallationMode: mode,
        ProgressInstallationOverrideExpl: mode === "manual",
        ProgressInstallationOverrideReas: reason
      };
      if (mode === "manual") fields.ProgressInstallation = raw;
      await SharePointDataProvider.updateItem(APP_CONFIG.sharePoint.lists.projects, project.sharePointId, fields);
      project.progressInstallationMode = mode;
      project.progressInstallationOverrideExplicit = mode === "manual";
      project.progressInstallationOverrideReason = reason;
      if (mode === "manual") project.progressInstallation = raw;
      closeModal();
      if (typeof window.render === "function") window.render();
      render();
    } catch (error) {
      console.error("Reported installation save failed", error);
      alert(`Reported installation progress could not be saved: ${error.message}`);
    } finally {
      if (submit) submit.disabled = false;
    }
  };
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
        const formData = new FormData(form);
        const itemName = String(formData.get("name") || record?.name || "Location").trim();
        await saveLocation(record, form);

        const project = currentProject();
        if (project && typeof logChange === "function") {
          logChange(
            record ? "Update" : "Create",
            project.id,
            "Project Location",
            itemName,
            record ? "Project Location updated." : "Project Location created."
          );
          if (typeof save === "function") await save();
        }

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
        const formData = new FormData(form);
        const itemName = String(formData.get("title") || record?.title || "Site Item").trim();
        await saveOperation(record, form);

        const project = currentProject();
        if (project && typeof logChange === "function") {
          logChange(
            record ? "Update" : "Create",
            project.id,
            "Site Operations",
            itemName,
            record ? "Site Operations item updated." : "Site Operations item created."
          );
          if (typeof save === "function") await save();
        }

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

      const parentLocationId = Number(record.locationId || 0);
      state.currentOperationId = null;
      await load(true);
      if (parentLocationId && locationById(parentLocationId)) {
        state.currentLocationId = parentLocationId;
        render();
      }
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

  function safePdfText(value) {
    return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function safePdfFileName(value) {
    return String(value || "site-operations")
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  const SITE_PDF = {
    navy:[0,78,132], blue:[0,136,199], green:[112,173,71], orange:[237,125,49], red:[192,0,0],
    muted:[97,113,130], line:[220,228,234], soft:[244,247,249],
    lightBlue:[228,242,250], lightGreen:[234,245,225], lightOrange:[253,239,222], lightRed:[250,228,228]
  };

  function pdfStatusCounts(records) {
    const list = records || [];
    return {
      current: list.filter(x => x.status === "In Progress").length,
      upcoming: list.filter(x => x.entryType === "Lookahead" || x.status === "Planned").length,
      risk: list.filter(x => x.riskMode === "Force At Risk" || (x.riskMode !== "Force On Track" && ["At Risk", "Blocked"].includes(x.status))).length,
      complete: list.filter(x => x.status === "Complete").length
    };
  }

  function sitePdfStatusStyle(value) {
    const s = String(value || "").toLowerCase();
    if (s === "complete" || s === "on track") return {fill:SITE_PDF.lightGreen,text:[55,100,35],accent:SITE_PDF.green};
    if (s === "at risk" || s === "blocked") return {fill:SITE_PDF.lightRed,text:[150,30,30],accent:SITE_PDF.red};
    if (s === "planned" || s === "upcoming") return {fill:SITE_PDF.lightOrange,text:[145,84,15],accent:SITE_PDF.orange};
    if (s === "in progress" || s === "current") return {fill:SITE_PDF.lightBlue,text:[20,80,125],accent:SITE_PDF.blue};
    return {fill:SITE_PDF.soft,text:SITE_PDF.navy,accent:SITE_PDF.blue};
  }

  function addSitePdfHeader(doc, title, subtitle = "", reportLabel = "SITE OPERATIONS REPORT") {
    const project = typeof currentProject === "function" ? currentProject() : null;
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 28;
    const generated = new Date();
    doc.setFont("helvetica","bold");
    doc.setFontSize(9);
    doc.setTextColor(...SITE_PDF.navy);
    doc.text("AHT GLOBAL · PROJECT CONTROL", margin, 30);
    doc.setFontSize(23);
    doc.text(safePdfText(title), margin, 53);
    doc.setFont("helvetica","normal");
    doc.setFontSize(9);
    doc.setTextColor(...SITE_PDF.muted);
    if (subtitle) doc.text(safePdfText(subtitle), margin, 67);
    doc.setFontSize(7.5);
    doc.text(reportLabel, pageWidth-margin, 29, {align:"right"});
    doc.text(`Generated ${generated.toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"})}`, pageWidth-margin, 42, {align:"right"});
    if (project?.name) doc.text(safePdfText(project.name), pageWidth-margin, 54, {align:"right"});
    doc.setDrawColor(...SITE_PDF.navy);
    doc.setLineWidth(2);
    doc.line(margin,76,pageWidth-margin,76);
    doc.setLineWidth(.5);
  }

  function addSitePdfFooters(doc, projectName) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 28;
    const total = doc.getNumberOfPages();
    for (let page=1; page<=total; page++) {
      doc.setPage(page);
      doc.setDrawColor(...SITE_PDF.line);
      doc.line(margin,pageHeight-22,pageWidth-margin,pageHeight-22);
      doc.setFont("helvetica","normal");
      doc.setFontSize(7);
      doc.setTextColor(...SITE_PDF.muted);
      doc.text("AHT Global · Project Control",margin,pageHeight-10);
      doc.text(`Page ${page} of ${total}`,pageWidth/2,pageHeight-10,{align:"center"});
      doc.text(`${safePdfText(projectName)} · v${APP_CONFIG.version}`,pageWidth-margin,pageHeight-10,{align:"right"});
    }
  }

  function sitePdfSectionTitle(doc, title, y) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 28;
    if (y > pageHeight-58) { doc.addPage("letter","landscape"); y = 34; }
    doc.setFont("helvetica","bold");
    doc.setFontSize(12);
    doc.setTextColor(...SITE_PDF.navy);
    doc.text(title,margin,y);
    doc.setDrawColor(...SITE_PDF.line);
    doc.line(margin,y+5,pageWidth-margin,y+5);
    return y+16;
  }

  function sitePdfMetricCard(doc, x, y, w, h, label, value, accent, options = {}) {
    doc.setDrawColor(...SITE_PDF.line);
    doc.roundedRect(x,y,w,h,5,5,"S");
    doc.setFillColor(...accent);
    doc.roundedRect(x,y,w,4,2,2,"F");

    doc.setFont("helvetica","bold");
    doc.setFontSize(options.valueSize || 16);
    doc.setTextColor(...SITE_PDF.navy);
    doc.text(String(value),x+w/2,y+22,{align:"center"});

    doc.setFontSize(6.4);
    doc.setTextColor(...SITE_PDF.muted);
    doc.text(String(label).toUpperCase(),x+w/2,y+35,{align:"center"});

    if (Number.isFinite(options.progress)) {
      const pct = Math.max(0,Math.min(100,Number(options.progress)));
      doc.setFillColor(232,237,241);
      doc.roundedRect(x+8,y+h-10,w-16,4,2,2,"F");
      doc.setFillColor(...accent);
      if (pct > 0) doc.roundedRect(x+8,y+h-10,(w-16)*(pct/100),4,2,2,"F");
    }
  }

  function addSitePdfSummary(doc, records, y = 92) {
    const counts = pdfStatusCounts(records);
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 28;
    const gap = 8;
    const cardW = (pageWidth - margin*2 - gap*3) / 4;
    const cards = [
      ["Current Work",counts.current,SITE_PDF.blue],
      ["Upcoming",counts.upcoming,SITE_PDF.orange],
      ["At Risk",counts.risk,SITE_PDF.red],
      ["Completed",counts.complete,SITE_PDF.green]
    ];
    cards.forEach(([label,value,accent],i)=>sitePdfMetricCard(doc,margin+i*(cardW+gap),y,cardW,42,label,value,accent));
    return y+42;
  }

  function addSiteProgressSummary(doc, location, totalItems, y) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 28;
    const gap = 8;
    const cardW = (pageWidth - margin*2 - gap*4) / 5;
    const values = [
      ["Overall Progress", displayedLocationProgress(location), SITE_PDF.blue],
      ["Rough-In", displayedLocationProgress(location,"Rough-In"), SITE_PDF.blue],
      ["Trim", displayedLocationProgress(location,"Trim"), SITE_PDF.blue],
      ["Final", displayedLocationProgress(location,"Final"), SITE_PDF.blue]
    ];
    values.forEach(([label,value,accent],i)=>sitePdfMetricCard(doc,margin+i*(cardW+gap),y,cardW,54,label,`${value}%`,accent,{progress:value}));
    sitePdfMetricCard(doc,margin+4*(cardW+gap),y,cardW,54,"Total Site Items",totalItems,SITE_PDF.blue);
    return y+54;
  }

  async function downloadSitePDF() {
    await load(false);
    if (!window.jspdf?.jsPDF || typeof window.jspdf.jsPDF !== "function") {
      alert("PDF export library is not available. Refresh the dashboard and try again."); return;
    }
    const project = typeof currentProject === "function" ? currentProject() : null;
    if (!project) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({orientation:"landscape",unit:"pt",format:"letter",compress:true});
    addSitePdfHeader(doc, project.name || "Project", project.subtitle || "", "SITE OPERATIONS REPORT");
    const calculatedSite = SharePointDataProvider.calculateSiteInstallationRollup(
      state.locations, state.operations, state.projectId
    );
    const reportedSite = reportedInstallationState(project, calculatedSite.overall);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...SITE_PDF.navy);
    // Export only the selected reported percentage. Override details and
    // automatic comparison are private dashboard controls, not report content.
    doc.text(`Project Installation: ${reportedSite.displayed}%`,28,93);
    let y = addSitePdfSummary(doc,state.operations,109)+18;
    y = sitePdfSectionTitle(doc,"Project Locations",y);
    const roots = childrenOf(null);
    doc.autoTable({
      startY:y,margin:{left:28,right:28,bottom:32},theme:"grid",
      head:[["Type","No.","Location","Level / Floor","Overall","Rough-In","Trim","Final","Site Items","Risk"]],
      body:roots.map(location=>{const records=operationsForLocation(location.id,true);return [
        safePdfText(location.locationType||"Location"),safePdfText(location.locationNumber||"—"),safePdfText(location.name),safePdfText(location.planLevel||"—"),
        `${displayedLocationProgress(location)}%`,`${displayedLocationProgress(location,"Rough-In")}%`,`${displayedLocationProgress(location,"Trim")}%`,`${displayedLocationProgress(location,"Final")}%`,records.length,riskState(records)?"At Risk":"On Track"
      ];}),
      styles:{font:"helvetica",fontSize:7.5,cellPadding:4,lineColor:SITE_PDF.line,lineWidth:.4,textColor:[31,55,78],valign:"top"},
      headStyles:{fillColor:SITE_PDF.lightBlue,textColor:SITE_PDF.navy,fontStyle:"bold",fontSize:6.5},
      didParseCell:data=>{if(data.section==="body"&&data.column.index===9){const look=sitePdfStatusStyle(data.cell.raw);data.cell.styles.fillColor=look.fill;data.cell.styles.textColor=look.text;data.cell.styles.fontStyle="bold";}}
    });
    y=doc.lastAutoTable.finalY+22;
    if(state.operations.length){
      y=sitePdfSectionTitle(doc,"Site Activity Summary",y);
      doc.autoTable({
        startY:y,margin:{left:28,right:28,bottom:32},theme:"grid",
        head:[["Location","Activity","Details","Progress","Status","Activity Date","Target"]],
        body:state.operations.slice().sort((a,b)=>String(a.targetDate||"9999-12-31").localeCompare(String(b.targetDate||"9999-12-31"))).map(op=>{const loc=locationById(op.locationId);return [safePdfText(loc ? locationDisplayName(loc) : "—"),safePdfText(op.title),safePdfText(op.details||"—"),op.trackProgress?`${operationOverallPercent(op)}%`:"—",safePdfText(op.status||"Planned"),safePdfText(displayDate(op.activityDate)),safePdfText(displayDate(op.targetDate))];}),
        styles:{font:"helvetica",fontSize:7,cellPadding:4,lineColor:SITE_PDF.line,lineWidth:.4,textColor:[31,55,78],overflow:"linebreak",valign:"top"},
        headStyles:{fillColor:SITE_PDF.lightBlue,textColor:SITE_PDF.navy,fontStyle:"bold",fontSize:6.5},
        columnStyles:{2:{cellWidth:190}},
        didParseCell:data=>{if(data.section==="body"&&data.column.index===4){const look=sitePdfStatusStyle(data.cell.raw);data.cell.styles.fillColor=look.fill;data.cell.styles.textColor=look.text;data.cell.styles.fontStyle="bold";}}
      });
    }
    addSitePdfFooters(doc,project.name);
    doc.save(`${safePdfFileName(project.name)}-Site-Operations.pdf`);
  }

  async function downloadLocationPDF() {
    await load(false);
    const location=locationById(state.currentLocationId); if(!location)return;
    if(!window.jspdf?.jsPDF||typeof window.jspdf.jsPDF!=="function"){alert("PDF export library is not available. Refresh the dashboard and try again.");return;}
    const project=typeof currentProject==="function"?currentProject():null;
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:"landscape",unit:"pt",format:"letter",compress:true});
    const allOperations=operationsForLocation(location.id,true);
    const directOperations=operationsForLocation(location.id,false);
    const childLocations=childrenOf(location.id);
    const subtitle=`${location.locationType||"Location"}${location.locationNumber?` · No. ${location.locationNumber}`:""}${location.planLevel?` · ${location.planLevel}`:""} · ${project?.name||""}`;
    addSitePdfHeader(doc,`${locationDisplayName(location)} — Site Operations`,subtitle,"LOCATION REPORT");
    let y=addSitePdfSummary(doc,allOperations,92)+12;
    y=addSiteProgressSummary(doc,location,allOperations.length,y)+20;
    y=sitePdfSectionTitle(doc,`${safePdfText(locationDisplayName(location))} Progress & Activity`,y);
    doc.autoTable({
      startY:y,margin:{left:28,right:28,bottom:32},theme:"grid",
      head:[["Activity","Details","Progress","Status","Activity Date","Target"]],
      body:directOperations.length?directOperations.map(op=>[safePdfText(op.title),safePdfText(op.details||"—"),op.trackProgress?`${operationOverallPercent(op)}%`:"—",safePdfText(op.status||"Planned"),safePdfText(displayDate(op.activityDate)),safePdfText(displayDate(op.targetDate))]):[["No direct Site Operations items.","—","—","—","—","—"]],
      styles:{font:"helvetica",fontSize:7.5,cellPadding:4,lineColor:SITE_PDF.line,lineWidth:.4,textColor:[31,55,78],overflow:"linebreak",valign:"top"},
      headStyles:{fillColor:SITE_PDF.lightBlue,textColor:SITE_PDF.navy,fontStyle:"bold",fontSize:6.5},
      columnStyles:{1:{cellWidth:240}},
      didParseCell:data=>{if(data.section==="body"&&data.column.index===3){const look=sitePdfStatusStyle(data.cell.raw);data.cell.styles.fillColor=look.fill;data.cell.styles.textColor=look.text;data.cell.styles.fontStyle="bold";}}
    });
    y=doc.lastAutoTable.finalY+22;
    if(childLocations.length){
      y=sitePdfSectionTitle(doc,"Child Locations / Areas",y);
      doc.autoTable({
        startY:y,margin:{left:28,right:28,bottom:32},theme:"grid",
        head:[["Type","No.","Location","Level / Floor","Overall","Rough-In","Trim","Final","Site Items"]],
        body:childLocations.map(child=>{const records=operationsForLocation(child.id,true);return [safePdfText(child.locationType||"Location"),safePdfText(child.locationNumber||"—"),safePdfText(child.name),safePdfText(child.planLevel||"—"),`${displayedLocationProgress(child)}%`,`${displayedLocationProgress(child,"Rough-In")}%`,`${displayedLocationProgress(child,"Trim")}%`,`${displayedLocationProgress(child,"Final")}%`,records.length];}),
        styles:{font:"helvetica",fontSize:7.5,cellPadding:4,lineColor:SITE_PDF.line,lineWidth:.4,textColor:[31,55,78],valign:"top"},
        headStyles:{fillColor:SITE_PDF.lightBlue,textColor:SITE_PDF.navy,fontStyle:"bold",fontSize:6.5}
      });
    }
    addSitePdfFooters(doc,project?.name||"Project");
    doc.save(`${safePdfFileName(project?.name)}-${safePdfFileName(location.name)}-Site-Operations.pdf`);
  }

  function onProjectChanged() {
    state.loaded = false;
    state.currentLocationId = null;
    state.currentOperationId = null;

    const view = document.getElementById("siteOperations");

    if (view?.classList.contains("active")) {
      load(true);
    }
  }

  async function onView() {
    await load(false);
  }

  async function getScheduleData(force = false) {
    await load(force);
    return {
      locations: state.locations.map(location => ({ ...location })),
      operations: state.operations.map(operation => ({ ...operation }))
    };
  }

  async function openScheduleItem(id) {
    await load(false);
    const record = state.operations.find(x => Number(x.id) === Number(id));
    if (!record) return;
    if (typeof showView === "function") showView("siteOperations");
    openOperationDetail(record.id);
  }

  return {
    onView,
    onProjectChanged,
    openOverview,
    openLocation,
    openOperationDetail,
    openLocationEditor,
    openOperationEditor,
    openReportedInstallationEditor,
    reportedProgressModeChanged,
    editLocation,
    editOperation,
    deleteLocation,
    deleteOperation,
    toggleOperationChildren,
    togglePredecessorChoice,
    getScheduleData,
    openScheduleItem,
    filterChildLocations,
    locationFilterChanged,
    locationPickerInput,
    locationPickerCommit,
    downloadSitePDF,
    downloadLocationPDF,
    closeModal,
    refresh: () => load(true)
  };
})();

window.SiteOperations = SiteOperations;
