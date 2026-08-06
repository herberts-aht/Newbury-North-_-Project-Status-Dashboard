const els = {
  siteUrl: document.getElementById("siteUrl"),
  listName: document.getElementById("listName"),
  status: document.getElementById("status"),
  responseInput: document.getElementById("responseInput"),
  recordsTable: document.getElementById("recordsTable"),
  fieldsTable: document.getElementById("fieldsTable"),
  rawOutput: document.getElementById("rawOutput"),
  recordSummary: document.getElementById("recordSummary"),
  recordSearch: document.getElementById("recordSearch"),
  itemsEndpoint: document.getElementById("itemsEndpoint"),
  fieldsEndpoint: document.getElementById("fieldsEndpoint"),
  detectedFormat: document.getElementById("detectedFormat"),
  recordsFound: document.getElementById("recordsFound"),
  fieldsFound: document.getElementById("fieldsFound")
};

let discovery = {
  generatedAt: null,
  siteUrl: "",
  listName: "",
  format: "",
  records: [],
  fields: []
};

function cleanSiteUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function escapedListName(value) {
  return value.trim().replace(/'/g, "''");
}

function buildEndpoints() {
  const site = cleanSiteUrl(els.siteUrl.value);
  const list = escapedListName(els.listName.value);

  // Keep the list title readable. The browser will safely encode spaces in the URL.
  // Encoding the title before inserting it into getbytitle() can cause SharePoint
  // personal-site requests to be interpreted incorrectly.
  const base = `${site}/_api/web/lists/getbytitle('${list}')`;

  return {
    items: `${base}/items`,
    fields: `${base}/fields?$select=Title,InternalName,TypeAsString,Hidden,ReadOnlyField&$filter=Hidden eq false`
  };
}

function refreshEndpointDisplay() {
  const endpoints = buildEndpoints();
  els.itemsEndpoint.textContent = endpoints.items;
  els.fieldsEndpoint.textContent = endpoints.fields;
  return endpoints;
}

function setStatus(message, type = "neutral") {
  els.status.textContent = message;
  els.status.className = `status ${type}`;
}

async function tryFetch(kind) {
  const endpoints = refreshEndpointDisplay();
  const url = endpoints[kind];

  setStatus(`Requesting SharePoint ${kind}…`, "neutral");

  try {
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        Accept: "application/json;odata=nometadata"
      }
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    els.responseInput.value = text;
    parseResponse();
    setStatus(`Direct ${kind} request succeeded.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(
      `Direct browser request was blocked or failed. This is expected when the tool runs outside SharePoint. Use “Open REST ${kind === "items" ? "Items" : "Columns"} URL,” then paste the response below. ${error.message}`,
      "warning"
    );
  }
}

function openEndpoint(kind) {
  const endpoints = refreshEndpointDisplay();
  window.open(endpoints[kind], "_blank", "noopener");
  setStatus(
    `Opened the SharePoint ${kind} REST endpoint. Copy the XML or JSON response and paste it below.`,
    "neutral"
  );
}

function parseResponse() {
  const raw = els.responseInput.value.trim();
  if (!raw) {
    setStatus("Paste a SharePoint XML or JSON response first.", "warning");
    return;
  }

  try {
    let result;
    if (raw.startsWith("<")) {
      result = parseXml(raw);
      discovery.format = "SharePoint Atom XML";
    } else {
      result = parseJson(raw);
      discovery.format = "JSON";
    }

    discovery = {
      ...discovery,
      generatedAt: new Date().toISOString(),
      siteUrl: cleanSiteUrl(els.siteUrl.value),
      listName: els.listName.value.trim(),
      records: result.records,
      fields: result.fields
    };

    renderDiscovery();
    setStatus(
      `Parsed ${discovery.records.length} record${discovery.records.length === 1 ? "" : "s"} and ${discovery.fields.length} field${discovery.fields.length === 1 ? "" : "s"}.`,
      "success"
    );
  } catch (error) {
    console.error(error);
    setStatus(`Could not parse the response: ${error.message}`, "error");
  }
}

function parseJson(raw) {
  const payload = JSON.parse(raw);
  const records =
    Array.isArray(payload) ? payload :
    Array.isArray(payload.value) ? payload.value :
    Array.isArray(payload.d?.results) ? payload.d.results :
    payload.d ? [payload.d] :
    [payload];

  const normalized = records.map(flattenRecord);
  return {
    records: normalized,
    fields: discoverFields(normalized)
  };
}

function parseXml(raw) {
  const xml = new DOMParser().parseFromString(raw, "application/xml");
  const parserError = xml.querySelector("parsererror");
  if (parserError) {
    throw new Error("The pasted XML is not valid.");
  }

  const errorMessage = findFirstByLocalName(xml, "message");
  const rootIsError = xml.documentElement.localName.toLowerCase() === "error";
  if (rootIsError) {
    throw new Error(errorMessage?.textContent?.trim() || "SharePoint returned an error.");
  }

  const entries = [...xml.getElementsByTagNameNS("*", "entry")];
  const records = entries.map(entry => {
    const properties = findFirstByLocalName(entry, "properties");
    const record = {};

    if (!properties) return record;

    [...properties.children].forEach(node => {
      const key = node.localName;
      const isNull = [...node.attributes].some(
        attr => attr.localName === "null" && attr.value === "true"
      );
      record[key] = isNull ? null : coerceValue(node.textContent, node);
    });

    const etag = entry.getAttributeNS(
      "http://schemas.microsoft.com/ado/2007/08/dataservices/metadata",
      "etag"
    );
    if (etag) record.__etag = etag;

    return record;
  });

  return {
    records,
    fields: discoverFields(records)
  };
}

function findFirstByLocalName(root, localName) {
  return [...root.getElementsByTagNameNS("*", localName)][0] || null;
}

function coerceValue(value, node) {
  const typeAttr = [...node.attributes].find(attr => attr.localName === "type");
  const type = typeAttr?.value || "";
  const text = value.trim();

  if (/Boolean$/i.test(type)) return text.toLowerCase() === "true";
  if (/Int|Decimal|Double/i.test(type)) {
    const number = Number(text);
    return Number.isNaN(number) ? text : number;
  }
  return text;
}

function flattenRecord(record) {
  const output = {};
  Object.entries(record || {}).forEach(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.entries(value).forEach(([childKey, childValue]) => {
        output[`${key}.${childKey}`] = childValue;
      });
    } else {
      output[key] = value;
    }
  });
  return output;
}

function discoverFields(records) {
  const map = new Map();

  records.forEach(record => {
    Object.entries(record).forEach(([key, value]) => {
      if (!map.has(key)) {
        map.set(key, { internalName: key, valuesFound: 0, sample: null });
      }
      const field = map.get(key);
      if (value !== null && value !== undefined && value !== "") {
        field.valuesFound += 1;
        if (field.sample === null) field.sample = value;
      }
    });
  });

  return [...map.values()].sort((a, b) =>
    a.internalName.localeCompare(b.internalName)
  );
}

function renderDiscovery() {
  els.detectedFormat.textContent = discovery.format || "—";
  els.recordsFound.textContent = String(discovery.records.length);
  els.fieldsFound.textContent = String(discovery.fields.length);
  els.recordSummary.textContent =
    `${discovery.records.length} record${discovery.records.length === 1 ? "" : "s"} loaded.`;

  els.rawOutput.textContent = JSON.stringify(discovery, null, 2);
  els.recordSearch.disabled = discovery.records.length === 0;
  els.recordSearch.value = "";

  renderRecords(discovery.records);
  renderFields(discovery.fields);
}

function renderRecords(records) {
  if (!records.length) {
    els.recordsTable.innerHTML =
      "<thead><tr><th>No records found</th></tr></thead><tbody><tr><td>The response contained no list items.</td></tr></tbody>";
    return;
  }

  const preferred = [
    "ID", "Id", "Title", "project", "discipline", "deliverable",
    "status", "OwnerId", "duedate", "waitinon", "Modified", "Created",
    "AuthorId", "EditorId", "GUID", "__etag"
  ];
  const allColumns = [...new Set(records.flatMap(record => Object.keys(record)))];
  const columns = [
    ...preferred.filter(column => allColumns.includes(column)),
    ...allColumns.filter(column => !preferred.includes(column)).sort()
  ];

  const head = columns.map(column => `<th>${escapeHtml(column)}</th>`).join("");
  const body = records.map(record => {
    const cells = columns.map(column => {
      const value = record[column];
      return `<td>${escapeHtml(formatValue(value))}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  els.recordsTable.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
}

function renderFields(fields) {
  if (!fields.length) {
    els.fieldsTable.innerHTML =
      "<thead><tr><th>Internal name</th><th>Values found</th><th>Sample</th></tr></thead><tbody><tr><td colspan='3'>No fields found.</td></tr></tbody>";
    return;
  }

  const body = fields.map(field => `
    <tr>
      <td><strong>${escapeHtml(field.internalName)}</strong></td>
      <td>${field.valuesFound}</td>
      <td>${escapeHtml(formatValue(field.sample))}</td>
    </tr>
  `).join("");

  els.fieldsTable.innerHTML =
    `<thead><tr><th>Internal name</th><th>Values found</th><th>Sample</th></tr></thead><tbody>${body}</tbody>`;
}

function filterRecords() {
  const query = els.recordSearch.value.trim().toLowerCase();
  if (!query) {
    renderRecords(discovery.records);
    return;
  }

  renderRecords(
    discovery.records.filter(record =>
      JSON.stringify(record).toLowerCase().includes(query)
    )
  );
}

function exportDiscovery() {
  if (!discovery.generatedAt) {
    setStatus("Parse a response before exporting discovery data.", "warning");
    return;
  }

  const blob = new Blob([JSON.stringify(discovery, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sharepoint-discovery-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Discovery JSON exported.", "success");
}

function clearAll() {
  els.responseInput.value = "";
  discovery = {
    generatedAt: null,
    siteUrl: "",
    listName: "",
    format: "",
    records: [],
    fields: []
  };
  renderDiscovery();
  els.rawOutput.textContent = "Nothing loaded.";
  setStatus("Cleared.", "neutral");
}

function loadSample() {
  els.responseInput.value = JSON.stringify({
    value: [
      {
        ID: 1,
        Title: "D001",
        project: "2200 Gordon",
        discipline: "Audio",
        deliverable: "Main Speaker Layout",
        status: "In Progress",
        OwnerId: 4
      }
    ]
  }, null, 2);
  setStatus("Sample JSON loaded. Click Parse Response.", "neutral");
}

function formatValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.getElementById("readItemsBtn").onclick = () => tryFetch("items");
document.getElementById("readFieldsBtn").onclick = () => tryFetch("fields");
document.getElementById("openItemsBtn").onclick = () => openEndpoint("items");
document.getElementById("openFieldsBtn").onclick = () => openEndpoint("fields");
document.getElementById("parseBtn").onclick = parseResponse;
document.getElementById("clearBtn").onclick = clearAll;
document.getElementById("exportBtn").onclick = exportDiscovery;
document.getElementById("loadSampleBtn").onclick = loadSample;
els.recordSearch.oninput = filterRecords;
els.siteUrl.oninput = refreshEndpointDisplay;
els.listName.oninput = refreshEndpointDisplay;

refreshEndpointDisplay();
