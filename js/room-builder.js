(() => {
  "use strict";

  const state = {
    rows: [],
    fileName: "",
    pagesScanned: 0,
    lastCreatedIds: []
  };

  const $ = id => document.getElementById(id);

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function floorFromNumber(roomNumber) {
    const n = Number(roomNumber);

    if (n >= 0 && n <= 99) return "Ground Floor";
    if (n >= 100 && n <= 199) return "First Floor";
    if (n >= 200 && n <= 299) return "Second Floor";

    return "";
  }

  function pageInfo(text) {
    const upper = String(text || "").toUpperCase();

    if (upper.includes("FUTURE GROUND FLOOR PLAN")) {
      return { floor: "Ground Floor", status: "Future" };
    }

    if (upper.includes("GROUND FLOOR PLAN")) {
      return { floor: "Ground Floor", status: "Current" };
    }

    if (upper.includes("FIRST FLOOR PLAN")) {
      return { floor: "First Floor", status: "Current" };
    }

    if (upper.includes("SECOND FLOOR PLAN")) {
      return { floor: "Second Floor", status: "Current" };
    }

    return null;
  }

  function isNoise(value) {
    const text = clean(value);
    const upper = text.toUpperCase();

    if (!text) return true;
    if (/^\d{3}$/.test(text)) return true;
    if (/^\d+(?:\.\d+)?$/.test(text)) return true;
    if (/\bM2\b|\bSQ\.?\s*FT\b/i.test(text)) return true;
    if (/\d+'\s*-/.test(text)) return true;
    if (/^[A-Z]\d+$/.test(upper)) return true;
    if (/^[A-Z]-[A-Z]'?$/.test(upper)) return true;
    if (/^[xX]+$/.test(text)) return true;
    if (/^\(?\d+\s*[xX]?/.test(text)) return true;
    if (upper.includes("PARKING SPACES")) return true;
    if (upper.includes("CADCOACHING")) return true;
    if (upper.includes("10TH STREET")) return true;

    return false;
  }

  function normalizeRoomName(value) {
    let name = clean(value);

    name = name.replace(/\b19 PARKING SPACES\b/gi, "");
    name = name.replace(/\bCRAWL SPACE UNDER SPA\b/gi, "");
    name = name.replace(/\bCRAWL SPACE UNDER INDOOR POOL\b/gi, "");
    name = name.replace(/\bCRAWL SPACE UNDER\b/gi, "");

    return clean(name);
  }

  function buildLines(items) {
    const lines = [];
    let current = [];

    for (const item of items) {
      const value = clean(item.str);

      if (value) {
        current.push(value);
      }

      const standaloneRoomNumber =
        !value &&
        current.length === 1 &&
        /^\d{3}$/.test(current[0]);

      if (item.hasEOL || standaloneRoomNumber) {
        const line = clean(current.join(" "));
        if (line) lines.push(line);
        current = [];
      }
    }

    const remaining = clean(current.join(" "));
    if (remaining) lines.push(remaining);

    return lines;
  }

  function parsePlanLines(lines, pageNumber, plan) {
    const results = [];

    for (let i = 0; i < lines.length; i++) {
      const line = clean(lines[i]);

      // PDF.js sometimes returns the room label and its number
      // on the same text line, e.g. "BATHROOM 6 213".
      const inlineMatch = line.match(/^(.+?)\s+(\d{3})$/);

      if (inlineMatch) {
        const inlineName = normalizeRoomName(inlineMatch[1]);
        const inlineNumber = inlineMatch[2];

        if (inlineName && !isNoise(inlineName)) {
          results.push({
            include: true,
            floor: floorFromNumber(inlineNumber),
            roomNumber: inlineNumber,
            roomName: inlineName,
            sourcePage: String(pageNumber),
            planStatus: plan.status,
            confidence: "High",
            notes: ""
          });

          continue;
        }
      }

      const roomNumber = line;

      if (!/^\d{3}$/.test(roomNumber)) continue;

      const nameParts = [];

      for (let offset = 1; offset <= 3; offset++) {
        const idx = i - offset;
        if (idx < 0) break;

        const candidate = clean(lines[idx]);

        if (/^\d{3}$/.test(candidate)) break;
        if (isNoise(candidate)) break;

        nameParts.unshift(candidate);
      }

      const roomName = normalizeRoomName(nameParts.join(" "));
      if (!roomName) continue;

      results.push({
        include: true,
        floor: floorFromNumber(roomNumber),
        roomNumber,
        roomName,
        sourcePage: String(pageNumber),
        planStatus: plan.status,
        confidence: "High",
        notes: ""
      });
    }

    return results;
  }

  function collapseRows(rawRows) {
    const grouped = new Map();

    for (const row of rawRows) {
      const key = `${row.roomNumber}|${row.roomName.toUpperCase()}`;

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }

    const results = [];

    for (const rows of grouped.values()) {
      const first = { ...rows[0] };

      const pages = [...new Set(rows.map(r => r.sourcePage))]
        .sort((a, b) => Number(a) - Number(b));

      const statuses = [...new Set(rows.map(r => r.planStatus))];

      first.sourcePage = pages.join(",");

      if (statuses.length > 1) {
        first.planStatus = "Current + Future";
        first.notes = "Same room appears in Current and Future plans";
      }

      results.push(first);
    }

    const byNumber = new Map();

    for (const row of results) {
      if (!byNumber.has(row.roomNumber)) byNumber.set(row.roomNumber, []);
      byNumber.get(row.roomNumber).push(row);
    }

    for (const rows of byNumber.values()) {
      const names = new Set(rows.map(r => r.roomName.toUpperCase()));

      if (names.size > 1) {
        for (const row of rows) {
          row.confidence = "Review";
          row.notes = "Same room number has different names in plan set";
        }
      }
    }

    const floorOrder = {
      "Ground Floor": 0,
      "First Floor": 1,
      "Second Floor": 2
    };

    results.sort((a, b) =>
      (floorOrder[a.floor] ?? 9) - (floorOrder[b.floor] ?? 9) ||
      Number(a.roomNumber) - Number(b.roomNumber) ||
      a.roomName.localeCompare(b.roomName)
    );

    return results;
  }

  function renderProjectOptions() {
    const select = $("roomBuilderProject");
    if (!select) return 0;

    const previousValue = select.value;

    let projects = [];

    try {
      projects = Array.isArray(state?.projects)
        ? state.projects.filter(project => !project.archived)
        : [];
    } catch (_) {}

    if (!projects.length) {
      try {
        if (typeof allowedProjects === "function") {
          projects = allowedProjects() || [];
        }
      } catch (_) {}
    }

    select.innerHTML =
      `<option value="">Select project…</option>` +
      projects.map(project => {
        const value =
          project.id ||
          project.projectKey ||
          project.key ||
          project.name ||
          "";

        const label =
          project.name ||
          project.address ||
          project.title ||
          value;

        return `<option value="${esc(value)}">${esc(label)}</option>`;
      }).join("");

    if (previousValue && [...select.options].some(o => o.value === previousValue)) {
      select.value = previousValue;
    }

    return projects.length;
  }

  function waitForProjects(attempt = 0) {
    const count = renderProjectOptions();

    if (!count && attempt < 40) {
      setTimeout(() => waitForProjects(attempt + 1), 500);
    }
  }

  function includedRows() {
    return state.rows.filter(row => row.include);
  }

  function duplicateIncludedNumbers() {
    const counts = new Map();

    for (const row of includedRows()) {
      const number = clean(row.roomNumber);
      if (!number) continue;
      counts.set(number, (counts.get(number) || 0) + 1);
    }

    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([number]) => number)
      .sort((a, b) => Number(a) - Number(b));
  }

  function updateSummary() {
    const rows = state.rows;
    const included = includedRows().length;
    const review = rows.filter(r => r.confidence === "Review").length;
    const duplicates = duplicateIncludedNumbers();

    $("roomBuilderSummary").innerHTML = rows.length
      ? `<strong>${rows.length}</strong> unique locations · ` +
        `<strong>${included}</strong> included · ` +
        `<strong>${review}</strong> needing review · ` +
        `${state.pagesScanned} pages scanned` +
        (duplicates.length
          ? ` · <strong>${duplicates.length}</strong> unresolved duplicate room number${duplicates.length === 1 ? "" : "s"}`
          : "")
      : "No plan has been analyzed yet.";

    const createBtn = $("roomBuilderCreateBtn");
    if (createBtn) {
      createBtn.disabled =
        !rows.length ||
        !included ||
        !$("roomBuilderProject")?.value ||
        duplicates.length > 0;
    }
  }

  function exportReviewCsv() {
    if (!state.rows.length) {
      alert("Analyze a PDF first.");
      return;
    }

    const fields = [
      "include",
      "floor",
      "room_number",
      "room_name",
      "source_page",
      "plan_status",
      "confidence",
      "notes"
    ];

    const quote = value =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;

    const lines = [
      fields.join(","),
      ...state.rows.map(row => [
        row.include ? "Yes" : "No",
        row.floor,
        row.roomNumber,
        row.roomName,
        row.sourcePage,
        row.planStatus,
        row.confidence,
        row.notes
      ].map(quote).join(","))
    ];

    const blob = new Blob(
      [lines.join("\n")],
      { type: "text/csv;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "room-builder-browser-review.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  function renderRows() {
    const tbody = $("roomBuilderRows");
    if (!tbody) return;

    if (!state.rows.length) {
      tbody.innerHTML =
        `<tr><td colspan="8" class="small">Analyze a PDF to build the review list.</td></tr>`;
      updateSummary();
      return;
    }

    tbody.innerHTML = state.rows.map((row, index) => `
      <tr class="${row.confidence === "Review" ? "room-builder-review-row" : ""}">
        <td>
          <input
            type="checkbox"
            data-rb-field="include"
            data-rb-index="${index}"
            ${row.include ? "checked" : ""}
          />
        </td>

        <td>
          <select data-rb-field="floor" data-rb-index="${index}">
            ${["Ground Floor","First Floor","Second Floor"].map(floor =>
              `<option ${floor === row.floor ? "selected" : ""}>${floor}</option>`
            ).join("")}
          </select>
        </td>

        <td>
          <input
            class="room-builder-number"
            data-rb-field="roomNumber"
            data-rb-index="${index}"
            value="${esc(row.roomNumber)}"
          />
        </td>

        <td>
          <input
            class="room-builder-name"
            data-rb-field="roomName"
            data-rb-index="${index}"
            value="${esc(row.roomName)}"
          />
        </td>

        <td>${esc(row.sourcePage)}</td>
        <td>${esc(row.planStatus)}</td>

        <td>
          <span class="room-builder-status ${row.confidence === "Review" ? "review" : "ok"}">
            ${esc(row.confidence)}
          </span>
        </td>

        <td class="small">${esc(row.notes)}</td>
      </tr>
    `).join("");

    tbody.querySelectorAll("[data-rb-field]").forEach(control => {
      control.addEventListener("change", event => {
        const el = event.currentTarget;
        const index = Number(el.dataset.rbIndex);
        const field = el.dataset.rbField;
        const row = state.rows[index];

        if (!row) return;

        row[field] =
          field === "include"
            ? el.checked
            : el.value;

        updateSummary();
      });
    });

    updateSummary();
  }

  async function analyzePdf() {
    const file = $("roomBuilderFile")?.files?.[0];

    if (!file) {
      alert("Choose a PDF plan set first.");
      return;
    }

    if (!window.pdfjsLib) {
      alert("PDF.js did not load. Refresh the dashboard and try again.");
      return;
    }

    const button = $("roomBuilderAnalyzeBtn");
    button.disabled = true;
    button.textContent = "Analyzing…";

    try {
      const bytes = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;

      const rawRows = [];

      state.fileName = file.name;
      state.pagesScanned = pdf.numPages;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();

        const lines = buildLines(content.items);
        const pageText = lines.join("\n");
        const plan = pageInfo(pageText);

        if (!plan) continue;

        rawRows.push(
          ...parsePlanLines(lines, pageNumber, plan)
        );
      }

      state.rows = collapseRows(rawRows);
      renderRows();

      $("roomBuilderFileName").textContent =
        `${file.name} — ${pdf.numPages} pages`;

    } catch (error) {
      console.error("Room Builder PDF analysis failed:", error);
      alert(`Room Builder could not analyze this PDF.\n\n${error.message || error}`);
    } finally {
      button.disabled = false;
      button.textContent = "Analyze PDF";
    }
  }

  function selectedProject() {
    const selected = $("roomBuilderProject")?.value;
    if (!selected) return null;

    let projects = [];

    try {
      if (typeof allowedProjects === "function") {
        projects = allowedProjects() || [];
      }
    } catch (_) {}

    return projects.find(project => {
      const values = [
        project.id,
        project.projectKey,
        project.key,
        project.name,
        project.address
      ]
        .filter(Boolean)
        .map(String);

      return values.includes(String(selected));
    }) || null;
  }

  function rowFields(item) {
    return item?.fields || item || {};
  }

  function rowId(item) {
    return Number(item?.id || item?.sharePointId || rowFields(item)?.id || 0);
  }

  function lookupId(fields, name) {
    return Number(
      fields?.[`${name}LookupId`] ||
      fields?.[name]?.LookupId ||
      fields?.[name]?.lookupId ||
      0
    );
  }

  function validateCreateRows() {
    const project = selectedProject();

    if (!project) {
      throw new Error("Select a project first.");
    }

    if (!project.sharePointId) {
      throw new Error("The selected project does not have a SharePoint lookup ID.");
    }

    const rows = includedRows();

    if (!rows.length) {
      throw new Error("There are no included rooms to create.");
    }

    const duplicates = duplicateIncludedNumbers();

    if (duplicates.length) {
      throw new Error(
        `Resolve the duplicate included room number${duplicates.length === 1 ? "" : "s"} first: ${duplicates.join(", ")}. ` +
        "Uncheck the room you do not want, or edit the room number."
      );
    }

    const allowedFloors = new Set(["Ground Floor", "First Floor", "Second Floor"]);

    for (const row of rows) {
      const number = clean(row.roomNumber);
      const name = clean(row.roomName);
      const floor = clean(row.floor);

      if (!/^\d{3}$/.test(number)) {
        throw new Error(`Room "${name || "Unnamed"}" has an invalid room number: ${number || "(blank)"}.`);
      }

      if (!name) {
        throw new Error(`Room ${number} is missing a room name.`);
      }

      if (!allowedFloors.has(floor)) {
        throw new Error(`Room ${number} has an invalid floor: ${floor || "(blank)"}.`);
      }
    }

    return { project, rows };
  }

  async function locationTypeValues() {
    try {
      const site = await SharePointDataProvider.getSite();
      const listId = await SharePointDataProvider.getListId(
        APP_CONFIG.sharePoint.lists.projectLocations
      );

      const data = await SharePointDataProvider.graph(
        `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/columns?$select=name,choice`
      );

      const column = (data?.value || []).find(item => item.name === "LocationType");
      return column?.choice?.choices || [];
    } catch (error) {
      console.warn("Room Builder could not read Location Type choices.", error);
      return [];
    }
  }

  function chooseLocationType(choices, candidates, fallback) {
    const normalized = new Map(
      (choices || []).map(choice => [String(choice).toLowerCase(), String(choice)])
    );

    for (const candidate of candidates) {
      const match = normalized.get(String(candidate).toLowerCase());
      if (match) return match;
    }

    return fallback;
  }

  async function createLocations() {
    const button = $("roomBuilderCreateBtn");
    const originalText = button?.textContent || "Create Locations";

    try {
      const { project, rows } = validateCreateRows();

      if (button) {
        button.disabled = true;
        button.textContent = "Checking SharePoint…";
      }

      const allLocations = await SharePointDataProvider.getListRows(
        APP_CONFIG.sharePoint.lists.projectLocations
      );

      const projectId = Number(project.sharePointId);

      const projectLocations = (allLocations || []).filter(item => {
        const fields = rowFields(item);
        return lookupId(fields, "Project") === projectId;
      });

      const existingRoomNumbers = new Set(
        projectLocations
          .map(item => clean(rowFields(item).LocationNumber))
          .filter(Boolean)
      );

      const rowsToCreate = rows.filter(
        row => !existingRoomNumbers.has(clean(row.roomNumber))
      );

      const skipped = rows.length - rowsToCreate.length;

      if (!rowsToCreate.length) {
        alert(
          `Nothing to create.\n\nAll ${rows.length} included room${rows.length === 1 ? "" : "s"} already exist for ${project.name || "this project"}.`
        );
        return;
      }

      const neededFloors = [...new Set(rowsToCreate.map(row => clean(row.floor)))];

      const existingFloorByName = new Map();

      for (const item of projectLocations) {
        const fields = rowFields(item);
        const title = clean(fields.Title);
        const parentId = lookupId(fields, "ParentLocation");

        if (!parentId && neededFloors.includes(title)) {
          const id = rowId(item);
          if (id) existingFloorByName.set(title, id);
        }
      }

      const missingFloors = neededFloors.filter(
        floor => !existingFloorByName.has(floor)
      );

      const confirmed = confirm(
        `Create Room Locations for ${project.name || "selected project"}?\n\n` +
        `${rowsToCreate.length} new room${rowsToCreate.length === 1 ? "" : "s"} will be created.\n` +
        `${skipped} existing room${skipped === 1 ? "" : "s"} will be skipped.\n` +
        `${missingFloors.length} floor parent${missingFloors.length === 1 ? "" : "s"} will be created if needed.\n\n` +
        "Nothing will be written until you click OK."
      );

      if (!confirmed) return;

      if (button) button.textContent = "Creating floors…";

      const choices = await locationTypeValues();
      const floorType = chooseLocationType(
        choices,
        ["Floor", "Level", "Level / Floor"],
        choices.includes("Other") ? "Other" : "Other"
      );

      const roomType = chooseLocationType(
        choices,
        ["Room"],
        "Room"
      );

      state.lastCreatedIds = [];

      const floorSort = {
        "Ground Floor": 0,
        "First Floor": 100,
        "Second Floor": 200
      };

      for (const floor of missingFloors) {
        const created = await SharePointDataProvider.createItem(
          APP_CONFIG.sharePoint.lists.projectLocations,
          {
            Title: floor,
            ProjectLookupId: String(project.sharePointId),
            ParentLocationLookupId: null,
            LocationType: floorType,
            SortOrder: floorSort[floor] ?? 0,
            Active: true,
            PlanLevel: floor,
            LocationProgressWeight: 1,
            LocationNumber: ""
          }
        );

        const id = Number(created?.id || 0);

        if (!id) {
          throw new Error(`SharePoint created ${floor}, but no item ID was returned.`);
        }

        existingFloorByName.set(floor, id);
        state.lastCreatedIds.push(id);
      }

      let createdRooms = 0;

      for (let index = 0; index < rowsToCreate.length; index++) {
        const row = rowsToCreate[index];
        const floorId = existingFloorByName.get(clean(row.floor));

        if (!floorId) {
          throw new Error(`No floor parent is available for ${row.floor}.`);
        }

        if (button) {
          button.textContent = `Creating rooms… ${index + 1}/${rowsToCreate.length}`;
        }

        const created = await SharePointDataProvider.createItem(
          APP_CONFIG.sharePoint.lists.projectLocations,
          {
            Title: clean(row.roomName),
            ProjectLookupId: String(project.sharePointId),
            ParentLocationLookupId: String(floorId),
            LocationType: roomType,
            SortOrder: Number(row.roomNumber),
            Active: true,
            PlanLevel: clean(row.floor),
            LocationProgressWeight: 1,
            LocationNumber: clean(row.roomNumber)
          }
        );

        const id = Number(created?.id || 0);
        if (id) state.lastCreatedIds.push(id);

        createdRooms++;
      }

      alert(
        `Room Builder complete.\n\n` +
        `${createdRooms} room${createdRooms === 1 ? "" : "s"} created.\n` +
        `${missingFloors.length} floor parent${missingFloors.length === 1 ? "" : "s"} created.\n` +
        `${skipped} existing room${skipped === 1 ? "" : "s"} skipped.\n\n` +
        "Refresh Site Operations to see the new hierarchy."
      );
    } catch (error) {
      console.error("Room Builder SharePoint create failed:", error);

      const partial =
        state.lastCreatedIds.length
          ? `\n\n${state.lastCreatedIds.length} SharePoint item${state.lastCreatedIds.length === 1 ? "" : "s"} may already have been created before the error.`
          : "";

      alert(
        `Room Builder could not create the locations.\n\n${error.message || error}${partial}`
      );
    } finally {
      if (button) {
        button.textContent = originalText;
      }

      updateSummary();
    }
  }

  function injectStyles() {
    if ($("roomBuilderStyles")) return;

    const style = document.createElement("style");
    style.id = "roomBuilderStyles";
    style.textContent = `
      .room-builder-toolbar{
        display:grid;
        grid-template-columns:minmax(180px,1fr) minmax(240px,2fr) auto;
        gap:12px;
        align-items:end;
      }

      .room-builder-toolbar label{
        display:block;
        margin-bottom:5px;
      }

      .room-builder-toolbar input[type=file],
      .room-builder-toolbar select{
        width:100%;
      }

      .room-builder-summary{
        margin:14px 0 10px;
      }

      .room-builder-table-wrap{
        overflow:auto;
        max-height:620px;
        border:1px solid var(--border,#d7dbe0);
        border-radius:10px;
      }

      .room-builder-table{
        width:100%;
        border-collapse:collapse;
        min-width:1050px;
      }

      .room-builder-table th,
      .room-builder-table td{
        padding:8px;
        border-bottom:1px solid var(--border,#e2e5e9);
        vertical-align:middle;
        text-align:left;
      }

      .room-builder-table th{
        position:sticky;
        top:0;
        background:var(--panel,#fff);
        z-index:2;
      }

      .room-builder-table input,
      .room-builder-table select{
        width:100%;
        min-width:90px;
      }

      .room-builder-number{
        max-width:90px;
      }

      .room-builder-name{
        min-width:220px;
      }

      .room-builder-review-row{
        background:rgba(245,158,11,.10);
      }

      .room-builder-status{
        display:inline-block;
        padding:3px 7px;
        border-radius:999px;
        font-size:12px;
        font-weight:700;
      }

      .room-builder-status.ok{
        background:rgba(34,197,94,.12);
      }

      .room-builder-status.review{
        background:rgba(245,158,11,.18);
      }

      .room-builder-actions{
        display:flex;
        gap:8px;
        justify-content:flex-end;
        margin-top:12px;
      }

      @media (max-width:850px){
        .room-builder-toolbar{
          grid-template-columns:1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function init() {
    if (!$("roomBuilderPanel")) return;

    injectStyles();
    waitForProjects();
    renderRows();

    $("roomBuilderProject")?.addEventListener("focus", renderProjectOptions);
    $("roomBuilderProject")?.addEventListener("mousedown", renderProjectOptions);
    $("roomBuilderProject")?.addEventListener("change", updateSummary);

    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    $("roomBuilderAnalyzeBtn")?.addEventListener("click", analyzePdf);
    $("roomBuilderExportBtn")?.addEventListener("click", exportReviewCsv);
    $("roomBuilderCreateBtn")?.addEventListener("click", createLocations);

    $("roomBuilderSelectCleanBtn")?.addEventListener("click", () => {
      state.rows.forEach(row => {
        row.include = row.confidence !== "Review";
      });

      renderRows();
    });

    $("roomBuilderSelectAllBtn")?.addEventListener("click", () => {
      state.rows.forEach(row => row.include = true);
      renderRows();
    });

    $("roomBuilderClearBtn")?.addEventListener("click", () => {
      state.rows = [];
      state.fileName = "";
      state.pagesScanned = 0;
      state.lastCreatedIds = [];

      if ($("roomBuilderFile")) $("roomBuilderFile").value = "";
      if ($("roomBuilderFileName")) $("roomBuilderFileName").textContent = "";

      renderRows();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

