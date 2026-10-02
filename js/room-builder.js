(() => {
  "use strict";

  const state = {
    rows: [],
    fileName: "",
    sourceFile: null,
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

  /*
   * Room Builder workflow controller.
   *
   * Step 1: Select Project
   * Step 2: Find SharePoint Plans
   * Step 3: Select / Load Plan
   * Step 4: Analyze Plan
   */
  function updateWorkflowUI() {
    const projectSelect = $("roomBuilderProject");
    const findButton = $("roomBuilderFindPlansBtn");
    const planSelect = $("roomBuilderSharePointFile");
    const useButton = $("roomBuilderUseSharePointBtn");
    const analyzeButton = $("roomBuilderAnalyzeBtn");
    const fileInput = $("roomBuilderFile");

    const hasProject =
      !!String(projectSelect?.value || "").trim();

    const hasPlan =
      !!String(planSelect?.value || "").trim();

    const hasSourceFile =
      !!(
        state.sourceFile ||
        window.__ahtRoomBuilderSharePointFile ||
        fileInput?.files?.[0]
      );

    /*
     * Step 2 — Find SharePoint Plans
     */
    if (findButton) {
      findButton.disabled = !hasProject;

      findButton.classList.toggle(
        "room-builder-step-ready",
        hasProject
      );
    }

    /*
     * Step 3 — Select Plan
     */
    if (planSelect) {
      const hasOptions =
        [...planSelect.options].some(
          option => !!String(option.value || "").trim()
        );

      /*
       * Once SharePoint plans have been found, the document
       * picker must remain editable. The user may go back and
       * choose a different plan at any time.
       */
      planSelect.disabled =
        !hasProject || !hasOptions ? false : false;

      planSelect.classList.toggle(
        "room-builder-step-ready",
        hasOptions
      );
    }

    /*
     * Use Selected Document becomes available only
     * after an actual SharePoint document is selected.
     */
    if (useButton) {
      useButton.disabled =
        !hasProject || !hasPlan;

      useButton.classList.toggle(
        "room-builder-step-ready",
        hasPlan
      );
    }

    /*
     * Step 4 — Analyze Plan
     */
    if (analyzeButton) {
      analyzeButton.disabled = !hasSourceFile;

      analyzeButton.classList.toggle(
        "room-builder-step-ready",
        hasSourceFile
      );
    }

    /*
     * Keep the status area synchronized with the actual
     * workflow rather than leaving contradictory messages.
     */
    const status = $("roomBuilderSharePointStatus");

    if (status && !hasProject) {
      status.textContent =
        "Select a project first.";
    } else if (status && !hasPlan && !hasSourceFile) {
      status.textContent =
        "Find SharePoint plans or upload a PDF from your computer.";
    } else if (status && hasPlan && !hasSourceFile) {
      status.textContent =
        "Select a SharePoint document, then load it.";
    } else if (status && hasSourceFile) {
      status.textContent =
        "Plan loaded. Click Analyze PDF to process it.";
    }
  }

  function waitForProjects(attempt = 0) {
    const count = renderProjectOptions();

    if (count) {
      updateWorkflowUI();
    }

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

  async function findSharePointPlanDocuments() {
    const project = selectedProject();

    if (!project) {
      alert("Select a project first.");
      return;
    }

    if (
      typeof SharePointDataProvider === "undefined" ||
      typeof SharePointDataProvider.getSite !== "function" ||
      typeof SharePointDataProvider.graph !== "function"
    ) {
      throw new Error("SharePoint connection is unavailable.");
    }

    const select = $("roomBuilderSharePointFile");
    const status = $("roomBuilderSharePointStatus");
    const useButton = $("roomBuilderUseSharePointBtn");

    if (!select || !status) return;

    select.innerHTML = '<option value="">Searching SharePoint…</option>';

    if (useButton) {
      useButton.disabled = true;
    }

    status.textContent =
      "Searching the SharePoint Received documents…";

    try {
      /*
       * Room Builder documents live in the office SharePoint site,
       * not necessarily the dashboard's primary SharePoint site.
       */
      const documentSiteUrl =
        APP_CONFIG.sharePoint.roomBuilderSiteUrl ||
        "https://ahtglobalteam.sharepoint.com/sites/Naples";

      const documentSiteParsed =
        new URL(documentSiteUrl);

      const documentSitePath =
        documentSiteParsed.pathname.replace(/^\/+/, "");

      const site =
        await SharePointDataProvider.graph(
          `/sites/${encodeURIComponent(documentSiteParsed.hostname)}:/${documentSitePath}?$select=id,displayName,webUrl`
        );

      /*
       * Resolve the actual Projects document library.
       * We use the SharePoint list because the browser's Graph session
       * may not enumerate every document-library drive even when the
       * library itself is accessible.
       */
      const lists = await SharePointDataProvider.graph(
        `/sites/${encodeURIComponent(site.id)}/lists?$select=id,displayName,webUrl`
      );

      const projectsList = (lists?.value || []).find(
        item =>
          String(item?.displayName || "")
            .trim()
            .toLowerCase() === "projects"
      );

      if (!projectsList?.id) {
        throw new Error(
          `The Projects document library was not found on SharePoint site "${site.displayName || site.webUrl || "this office"}".`
        );
      }

      /*
       * Resolve the actual project folder through Microsoft Graph Search.
       *
       * Do NOT constrain the query with a SharePoint path. Graph Search
       * can return the DriveItem and its SharePoint list/drive metadata,
       * which lets us verify that the result belongs to this office's
       * Projects document library.
       */
      /*
       * Projects folders follow the office's normal convention:
       *
       *   [Client / Company] - [Address]
       *
       * The address is therefore the reliable cross-office identifier.
       */
      const projectAddress =
        String(project.address || "")
          .trim();

      if (!projectAddress) {
        throw new Error(
          "The selected project does not contain an address."
        );
      }

      function normalizeAddress(value) {
        return String(value || "")
          .toLowerCase()
          .replace(/[.,#]/g, " ")
          .replace(/\b(street|st)\b/g, "st")
          .replace(/\b(avenue|ave)\b/g, "ave")
          .replace(/\b(road|rd)\b/g, "rd")
          .replace(/\b(drive|dr)\b/g, "dr")
          .replace(/\b(boulevard|blvd)\b/g, "blvd")
          .replace(/\b(lane|ln)\b/g, "ln")
          .replace(/\b(court|ct)\b/g, "ct")
          .replace(/\b(place|pl)\b/g, "pl")
          .replace(/\s+/g, " ")
          .trim();
      }

      const normalizedAddress =
        normalizeAddress(projectAddress);

      /*
       * The Projects library is a SharePoint document library.
       * Resolve its Drive by matching its SharePoint list ID.
       */
      /*
       * Resolve the document-library drive directly from the
       * SharePoint Projects list.
       *
       * The Projects list ID is already known, so there is no reason
       * to enumerate every drive on the site and guess which one
       * belongs to Projects.
       */
      /*
       * TEMPORARY DIAGNOSTIC:
       * Ask the dashboard's own Graph token which document libraries
       * it can actually see on this SharePoint site.
       */
      const visibleDrives =
        await SharePointDataProvider.graph(
          `/sites/${encodeURIComponent(site.id)}/drives?$select=id,name,webUrl,sharepointIds`
        );

      const visibleDriveSummary =
        (visibleDrives?.value || []).map(item => ({
          id: item?.id || "",
          name: item?.name || "",
          webUrl: item?.webUrl || "",
          listId: item?.sharepointIds?.listId || ""
        }));

      console.log(
        "ROOM BUILDER BROWSER GRAPH DRIVES:",
        visibleDriveSummary
      );

      const projectsDrive =
        (visibleDrives?.value || []).find(item =>
          String(item?.name || "").trim().toLowerCase() === "projects"
        );

      if (!projectsDrive?.id) {
        throw new Error(
          [
            "The dashboard's Graph token cannot see the Projects document library as a drive.",
            "",
            "Drives visible to the dashboard token:",
            visibleDriveSummary.length
              ? visibleDriveSummary
                  .map(item =>
                    `${item.name} | ${item.webUrl} | ListId: ${item.listId}`
                  )
                  .join("\n")
              : "(none)"
          ].join("\n")
        );
      }

      const driveId =
        String(projectsDrive.id);

      /*
       * TEMPORARY GRAPH ACCESS DIAGNOSTIC
       */
      try {
        const diagnosticDrive =
          await SharePointDataProvider.graph(
            `/drives/${encodeURIComponent(driveId)}?$select=id,name,webUrl,sharepointIds`
          );

        console.log(
          "ROOM BUILDER GRAPH DRIVE TEST:",
          diagnosticDrive
        );
      } catch (diagnosticError) {
        console.error(
          "ROOM BUILDER GRAPH DRIVE TEST FAILED:",
          diagnosticError
        );

        throw new Error(
          `Graph can reach the SharePoint site and Projects library, but the dashboard token cannot open the Projects drive: ${diagnosticError.message || diagnosticError}`
        );
      }

      /*
       * Read the root of Projects.
       */
      const rootResult =
        await SharePointDataProvider.graph(
          `/drives/${encodeURIComponent(driveId)}/root/children?$select=id,name,webUrl,parentReference,folder,file&$top=500`
        );

      const rootItems =
        rootResult?.value || [];

      /*
       * Match the project folder by address.
       *
       * Example:
       *   2200 Gordon Dr
       *       matches
       *   Newbury North Associates - 2200 Gordon Dr
       */
      const projectFolders =
        rootItems.filter(item => {
          if (!item?.folder) return false;

          const folderAddress =
            normalizeAddress(item.name || "");

          return (
            folderAddress.includes(normalizedAddress)
          );
        });

      if (!projectFolders.length) {
        const available =
          rootItems
            .filter(item => item?.folder)
            .map(item => item.name)
            .filter(Boolean)
            .slice(0, 100);

        throw new Error(
          [
            "The Projects document library was opened, but the project folder could not be matched.",
            "",
            `Dashboard address: ${projectAddress}`,
            `Normalized address: ${normalizedAddress}`,
            "",
            "Folders returned by Graph:",
            available.length
              ? available.join("\n")
              : "(none)"
          ].join("\n")
        );
      }

      projectFolders.sort((a, b) => {
        const aName =
          normalizeAddress(a.name || "");

        const bName =
          normalizeAddress(b.name || "");

        return (
          (aName === normalizedAddress ? 0 : 1) -
          (bName === normalizedAddress ? 0 : 1)
        );
      });

      const driveItem =
        projectFolders[0];

      if (!driveItem?.id) {
        throw new Error(
          `The SharePoint project folder could not be opened.`
        );
      }

      if (!driveId) {
        throw new Error(
          `The SharePoint project folder was found, but Graph did not return its document-library drive ID.`
        );
      }

      /*
       * Walk a DriveItem tree recursively.
       *
       * This is intentionally scoped to the selected project folder,
       * so we do not search the entire Projects library.
       */
      async function getChildren(itemId) {
        const rows = [];
        let next =
          `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/children?$select=id,name,size,lastModifiedDateTime,webUrl,parentReference,folder,file,@microsoft.graph.downloadUrl&$top=200`;

        while (next) {
          const data =
            await SharePointDataProvider.graph(next);

          rows.push(...(data?.value || []));

          next =
            data?.["@odata.nextLink"] || "";
        }

        return rows;
      }

      const receivedFolders = [];

      const projectChildren =
        await getChildren(driveItem.id);

      for (const item of projectChildren) {
        if (
          item?.folder &&
          String(item.name || "")
            .trim()
            .toLowerCase() === "received"
        ) {
          receivedFolders.push(item);
        }
      }

      if (!receivedFolders.length) {
        throw new Error(
          `The project folder was found, but its Received folder could not be found.`
        );
      }

      const documents = [];
      const visited = new Set();

      async function walkFolder(folderItem) {
        const folderId =
          String(folderItem?.id || "");

        if (!folderId || visited.has(folderId)) {
          return;
        }

        visited.add(folderId);

        const children =
          await getChildren(folderId);

        for (const item of children) {
          if (item?.file && /\.pdf$/i.test(String(item.name || ""))) {
            documents.push(item);
            continue;
          }

          if (item?.folder) {
            await walkFolder(item);
          }
        }
      }

      for (const received of receivedFolders) {
        await walkFolder(received);
      }

      documents.sort((a, b) =>
        String(b.lastModifiedDateTime || "")
          .localeCompare(
            String(a.lastModifiedDateTime || "")
          )
      );

      select.innerHTML = "";

      if (!documents.length) {
        select.innerHTML =
          '<option value="">No matching PDF plans found</option>';

        status.textContent =
          "No PDF plans were found in the selected project's SharePoint Received folder.";

        return;
      }

      /*
       * Show several documents at once so it is obvious that
       * multiple SharePoint plans are available.
       * Keep the existing width; only increase the visible rows.
       */
      select.size = Math.min(5, documents.length);

      documents.forEach(item => {
        const option =
          document.createElement("option");

        option.value = item.id;

        option.textContent =
          `${item.name} — ${new Date(item.lastModifiedDateTime).toLocaleDateString()}`;

        option.dataset.downloadUrl =
          item["@microsoft.graph.downloadUrl"] || "";

        option.dataset.webUrl =
          item.webUrl || "";

        option.dataset.name =
          item.name || "";

        /*
         * Keep the drive ID on the option as a fallback/debug value.
         */
        option.dataset.driveId =
          driveId;

        select.appendChild(option);
      });

      if (useButton) {
        useButton.disabled = false;
      }

      status.textContent =
        `${documents.length} matching Received PDF${documents.length === 1 ? "" : "s"} found.`;

    } catch (error) {
      console.error(
        "Room Builder SharePoint search failed:",
        error
      );

      select.innerHTML =
        '<option value="">SharePoint search failed</option>';

      status.textContent =
        `SharePoint search failed: ${error.message || error}`;

      alert(
        `Room Builder could not search SharePoint.\n\n${error.message || error}`
      );
    }
  }

  async function useSelectedSharePointDocument() {
    const select = $("roomBuilderSharePointFile");
    const option = select?.selectedOptions?.[0];

    if (!option?.value) {
      alert("Select a SharePoint document first.");
      return;
    }

    const driveId =
      option.dataset.driveId || "";

    const itemId =
      option.value || "";

    const name =
      option.dataset.name ||
      option.textContent ||
      "SharePoint PDF";

    if (!driveId || !itemId) {
      throw new Error(
        "SharePoint document information is incomplete. The drive ID or document ID is missing."
      );
    }

    const useButton = $("roomBuilderUseSharePointBtn");

    if (useButton) {
      useButton.disabled = true;
      useButton.textContent = "Loading…";
    }

    try {
      /*
       * Download the actual SharePoint file through Microsoft Graph.
       *
       * We intentionally do not depend on @microsoft.graph.downloadUrl.
       * Graph does not always return that property for these DriveItems.
       */
      const token =
        await SharePointDataProvider.getAccessToken();

      const response =
        await fetch(
          `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

      if (!response.ok) {
        let detail = "";

        try {
          const body = await response.json();
          detail =
            body?.error?.message ||
            body?.error?.code ||
            "";
        } catch (_) {
          detail = await response.text();
        }

        throw new Error(
          `SharePoint document download failed (${response.status})` +
          (detail ? `: ${detail}` : ".")
        );
      }

      const bytes =
        await response.arrayBuffer();

      const file = new File(
        [bytes],
        name,
        { type: "application/pdf" }
      );

      const transfer = new DataTransfer();
      transfer.items.add(file);

      const input = $("roomBuilderFile");

      if (!input) {
        throw new Error("Room Builder PDF input was not found.");
      }

      /*
       * Keep the SharePoint File directly in Room Builder state.
       * Do not depend on programmatically assigning <input type="file">.
       */
      state.sourceFile = file;
      window.__ahtRoomBuilderSharePointFile = file;

      console.log(
        "ROOM BUILDER SHAREPOINT FILE STORED:",
        file.name,
        file.size,
        file.type
      );

      $("roomBuilderFileName").textContent =
        `${name} — loaded from SharePoint Received documents`;

      $("roomBuilderSharePointStatus").textContent =
        "SharePoint document loaded. Click Analyze PDF to process it.";

      updateWorkflowUI();

    } catch (error) {
      console.error(
        "Room Builder SharePoint document load failed:",
        error
      );

      alert(
        `Room Builder could not load the SharePoint document.\n\n${error.message || error}`
      );
    } finally {
      if (useButton) {
        useButton.disabled = false;
        useButton.textContent = "Use Selected Document";
      }
    }
  }

  async function analyzePdf() {
    /*
     * SharePoint documents are stored directly in state.
     * Local computer uploads continue to use the file input.
     */
    const file =
      state.sourceFile ||
      window.__ahtRoomBuilderSharePointFile ||
      $("roomBuilderFile")?.files?.[0];

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

      const existingRoomsByNumber = new Map();

      for (const item of projectLocations) {
        const fields = rowFields(item);
        const number = clean(fields.LocationNumber);
        if (!number) continue;

        existingRoomsByNumber.set(number, {
          id: rowId(item),
          number,
          name: clean(fields.Title),
          floor: clean(fields.PlanLevel)
        });
      }

      const rowsToCreate = [];
      const unchangedRows = [];
      const changedRows = [];

      for (const row of rows) {
        const number = clean(row.roomNumber);
        const incomingName = clean(row.roomName);
        const existing = existingRoomsByNumber.get(number);

        if (!existing) {
          rowsToCreate.push(row);
          continue;
        }

        const sameName =
          existing.name.toUpperCase() === incomingName.toUpperCase();

        if (sameName) {
          unchangedRows.push({
            row,
            existing
          });
        } else {
          changedRows.push({
            row,
            existing
          });
        }
      }

      if (changedRows.length) {
        const changedList = changedRows
          .map(({ row, existing }) =>
            `${row.roomNumber}: "${existing.name}" → "${row.roomName}"`
          )
          .join("\n");

        alert(
          `Revised plan changes detected.\n\n` +
          `${changedRows.length} existing room${changedRows.length === 1 ? "" : "s"} have a different room name in this plan set:\n\n` +
          `${changedList}\n\n` +
          `No SharePoint locations were changed.\n\n` +
          `Review these room changes before creating any new locations.`
        );

        return;
      }

      const skipped = unchangedRows.length;

      if (!rowsToCreate.length) {
        alert(
          `Nothing to create.\n\n` +
          `${unchangedRows.length} included room${unchangedRows.length === 1 ? "" : "s"} already exist and match the current SharePoint locations for ${project.name || "this project"}.`
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
    $("roomBuilderProject")?.addEventListener("change", () => {
      updateSummary();
      updateWorkflowUI();
    });

    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    $("roomBuilderAnalyzeBtn")?.addEventListener("click", analyzePdf);

    $("roomBuilderFindPlansBtn")?.addEventListener(
      "click",
      async () => {
        try {
          await findSharePointPlanDocuments();
        } catch (error) {
          console.error("SharePoint plan search failed:", error);
        }
      }
    );

    $("roomBuilderUseSharePointBtn")?.addEventListener(
      "click",
      async () => {
        try {
          await useSelectedSharePointDocument();
        } catch (error) {
          console.error("SharePoint document load failed:", error);
        }
      }
    );
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
      state.sourceFile = null;
      window.__ahtRoomBuilderSharePointFile = null;

      if ($("roomBuilderFile")) $("roomBuilderFile").value = "";
      if ($("roomBuilderFileName")) $("roomBuilderFileName").textContent = "";

      if ($("roomBuilderSharePointFile")) {
        $("roomBuilderSharePointFile").innerHTML =
          '<option value="">No SharePoint plans loaded</option>';
      }

      if ($("roomBuilderSharePointStatus")) {
        $("roomBuilderSharePointStatus").textContent =
          "Select a project, then find plans from its SharePoint Received documents.";
      }

      if ($("roomBuilderUseSharePointBtn")) {
        $("roomBuilderUseSharePointBtn").disabled = true;
      }

      renderRows();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();


