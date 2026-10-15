/* AHT Project PDF Picker – office + folder boundary checks v3.
 * Uses the existing signed-in SharePointDataProvider. This is a client-side
 * access-control guard and navigation boundary, NOT a SharePoint ACL.
 * Each user's delegated Microsoft Graph rights MUST independently restrict
 * access to confidential libraries, offices, and projects.
 *
 * Room Builder and the dashboard's existing Graph configuration are untouched.
 */
(function () {
  'use strict';

  const ROOT_SITE = 'https://graph.microsoft.com/v1.0/';
  const LIMIT_ITEMS = 6000;
  const LIMIT_RESULTS = 200;
  const LIMIT_DEPTH = 24;
  const LIMIT_DISCOVERY_PAGES = 12;
  const MAX_FILE_BYTES = 100 * 1024 * 1024; // avoid a surprise browser memory spike
  const ui = {};
  const session = {
    editor: null, selection: null, project: null, location: null,
    site: null, drive: null, root: null, crumbs: [],
    generation: 0, busy: false
  };

  function provider() {
    if (typeof SharePointDataProvider === 'undefined' ||
        typeof SharePointDataProvider.graph !== 'function' ||
        typeof SharePointDataProvider.getAccessToken !== 'function') {
      throw new Error('The dashboard Microsoft/SharePoint connection is unavailable.');
    }
    return SharePointDataProvider;
  }
  function hasEditorAccess() {
    try {
      return Boolean(currentUser && currentUser.canEdit &&
        (currentUser.role === 'Admin' || currentUser.role === 'Project Admin' || currentUser.role === 'Editor'));
    } catch (_) { return false; }
  }
  function clean(value) { return String(value == null ? '' : value).trim(); }
  function addressKey(value) {
    return clean(value).toLowerCase().replace(/[.,#]/g,' ')
      .replace(/\b(drive|dr)\b/g,'dr').replace(/\b(road|rd)\b/g,'rd')
      .replace(/\b(street|st)\b/g,'st').replace(/\b(avenue|ave)\b/g,'ave')
      .replace(/\s+/g,' ').trim();
  }
  function officeKey(value) { return clean(value).toLowerCase().replace(/\s+office$/, '').trim(); }
  function authorizedProjectList() {
    if (!hasEditorAccess() || typeof allowedProjects !== 'function') return [];
    // An unscoped '*' role is not an explicit project assignment for Editors.
    // Admins can see dashboard-visible projects, subject to SharePoint ACLs.
    let candidates = allowedProjects() || [];
    const assigned = (typeof currentUser !== 'undefined' && currentUser && Array.isArray(currentUser.projects))
      ? currentUser.projects.map(clean) : [];
    if (assigned.includes('*') && currentUser.role !== 'Admin') {
      return [];
    }
    if (!assigned.includes('*')) {
      candidates = candidates.filter(project => assigned.includes(clean(project.id)));
    }
    return candidates.filter(project => project && !project.archived);
  }
  function locationFor(project) {
    // Only use persisted links within the *verified* office library.
    const officeMatches = (window.AHT_OFFICE_DOCUMENT_LIBRARIES || []).filter(item =>
      item && clean(item.office) && clean(item.siteUrl) && clean(item.library) &&
      officeKey(item.office) === officeKey(project.division || project.office));
    if (officeMatches.length === 1 && clean(project.ahtDocFolderId) && clean(project.ahtDocDriveId) &&
        clean(project.ahtDocSiteUrl) === clean(officeMatches[0].siteUrl)) {
      return {
        ...officeMatches[0],
        folderId: clean(project.ahtDocFolderId),
        driveId: clean(project.ahtDocDriveId),
        folderName: clean(project.ahtDocFolderName)
      };
    }
    const entries = window.AHT_PROJECT_DOCUMENT_LOCATIONS || [];
    const matches = entries.filter(item => {
      if (!item || !clean(item.office) || !clean(item.folder) || !clean(item.library) || !clean(item.siteUrl)) return false;
      // Never cross an office boundary even if different offices use the same address.
      if (officeKey(project.division || project.office) !== officeKey(item.office)) return false;
      if (item.projectId) return clean(item.projectId) === clean(project.id);
      if (item.projectKey) return clean(item.projectKey) === clean(project.projectKey || project.key);
      return Boolean(item.projectAddress && addressKey(item.projectAddress) === addressKey(project.address));
    });
    // Duplicate explicit mappings are unsafe; do not fall back to discovery.
    if (matches.length > 1) return null;
    if (matches.length === 1) return matches[0];

    const offices = (window.AHT_OFFICE_DOCUMENT_LIBRARIES || []).filter(item =>
      item && clean(item.siteUrl) && clean(item.library) && clean(item.office) &&
      officeKey(item.office) === officeKey(project.division || project.office));
    // Require both a verified office and a usable street address.
    if (offices.length !== 1 || !clean(project.address) || clean(project.address).length < 6) return null;
    return offices[0];
  }
  function availableProjects() {
    return authorizedProjectList().map(project => ({ project, location:locationFor(project) }))
      .filter(row => row.location)
      .sort((a,b) => (officeKey(a.location.office).localeCompare(officeKey(b.location.office)) ||
        clean(a.project.name || a.project.address).localeCompare(clean(b.project.name || b.project.address))));
  }
  function ensureCurrentAuthorization() {
    if (!hasEditorAccess() || !session.project || !session.location) throw new Error('Your tool access is unavailable.');
    const live = availableProjects().find(row => clean(row.project.id) === clean(session.project.id) &&
      clean(row.location.siteUrl) === clean(session.location.siteUrl) &&
      clean(row.location.library) === clean(session.location.library) &&
      clean(row.location.folder || row.location.folderId || '') === clean(session.location.folder || session.location.folderId || '') &&
      officeKey(row.project.division || row.project.office) === officeKey(session.location.office));
    if (!live) throw new Error('Your project access or document mapping has changed. Reopen the picker.');
    const frame = document.querySelector('#aht-tools-hub [data-aht-hub-frame]');
    if (!frame || frame.contentWindow !== session.editor || !session.editor ||
        frame.getAttribute('src') === 'about:blank') {
      throw new Error('The active markup editor has changed. Reopen its document picker.');
    }
    return live;
  }
  function text(element, value) { element.textContent = String(value == null ? '' : value); }
  function el(tag, className, txt) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (txt !== undefined) node.textContent = txt;
    return node;
  }
  function showStatus(message, error) {
    text(ui.status, message);
    ui.status.classList.toggle('error', Boolean(error));
  }
  function busy(value) {
    session.busy = value;
    ui.project.disabled = value;
    ui.search.disabled = value;
    ui.searchButton.disabled = value;
    ui.refresh.disabled = value;
  }
  function buildUI() {
    if (ui.layer) return;
    ui.layer = el('div');
    ui.layer.id = 'aht-project-docs';
    ui.layer.hidden = true;
    ui.layer.setAttribute('role','presentation');
    const dialog = el('div','aht-doc-dialog');
    dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-labelledby','ahtDocHeading');
    const head = el('div','aht-doc-head');
    const headline = el('div');
    const heading = el('h2',null,'Open a SharePoint Drawing');
    heading.id = 'ahtDocHeading';
    headline.append(heading, el('p','aht-doc-sub','Choose an assigned project, then browse its PDFs.'));
    ui.close = el('button','aht-doc-close','✕ Close');
    ui.close.type = 'button';
    ui.close.addEventListener('click', close);
    head.append(headline,ui.close);
    const body = el('div','aht-doc-body');
    const label = el('label','aht-doc-label','Authorized project');
    label.htmlFor = 'aht-doc-project';
    ui.project = el('select','aht-doc-select');
    ui.project.id = 'aht-doc-project';
    ui.project.addEventListener('change', () => selectProject(ui.project.value));
    ui.context = el('div','aht-doc-context');
    ui.crumbs = el('div','aht-doc-crumbs');
    ui.crumbs.setAttribute('aria-label','Current SharePoint folder');
    ui.list = el('div','aht-doc-results');
    ui.list.setAttribute('aria-label','Folders and PDFs');
    const searchLabel = el('label','aht-doc-label','Find a PDF anywhere in this project');
    searchLabel.htmlFor = 'aht-doc-search';
    searchLabel.style.marginTop = '14px';
    ui.search = el('input','aht-doc-search');
    ui.search.id = 'aht-doc-search';
    ui.search.type = 'search';
    ui.search.placeholder = 'Part of a PDF filename';
    ui.search.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); searchProject(); }
    });
    const actions = el('div','aht-doc-tools');
    ui.searchButton = el('button',null,'Search whole project');
    ui.searchButton.type='button';
    ui.searchButton.addEventListener('click',searchProject);
    ui.refresh = el('button',null,'Show current folder');
    ui.refresh.type='button';
    ui.refresh.addEventListener('click', () => loadCurrentFolder());
    actions.append(ui.searchButton,ui.refresh);
    ui.status = el('div','aht-doc-status');
    ui.status.setAttribute('role','status');
    ui.status.setAttribute('aria-live','polite');
    body.append(label,ui.project,ui.context,ui.crumbs,ui.list,searchLabel,ui.search,actions,ui.status);
    const foot = el('div','aht-doc-foot');
    foot.append(el('span',null,'Read-only original • Markups export from the editor'),
      el('span',null,'Your Microsoft SharePoint permissions still apply'));
    dialog.append(head,body,foot);
    ui.layer.appendChild(dialog);
    ui.layer.addEventListener('mousedown', event => { if (event.target === ui.layer) close(); });
    document.body.appendChild(ui.layer);
  }
  function close() {
    session.generation++;
    session.editor = null;
    session.project = null;
    session.location = null;
    session.crumbs = [];
    session.root = null;
    ui.layer.hidden = true;
    document.removeEventListener('keydown', onKeyDown);
    busy(false);
  }
  function onKeyDown(event) { if (event.key === 'Escape') { event.preventDefault(); close(); } }
  function renderCrumbs() {
    ui.crumbs.replaceChildren();
    session.crumbs.forEach((item,index) => {
      if (index) ui.crumbs.appendChild(el('span',null,'›'));
      const button = el('button',null,item.name);
      button.type = 'button';
      button.setAttribute('aria-current', index === session.crumbs.length - 1 ? 'page' : 'false');
      button.disabled = session.busy;
      button.addEventListener('click',() => navigate(index));
      ui.crumbs.appendChild(button);
    });
  }
  function messageRow(message) {
    ui.list.replaceChildren(el('div','aht-doc-loading',message));
  }
  async function graph(path) {
    ensureCurrentAuthorization();
    return provider().graph(path);
  }
  // The Graph /children endpoint normally returns items in the requested folder.
  // Re-check each DriveItem's actual parent to reject shortcuts/remote shared
  // items that might jump into an unrelated project or document library.
  // This is defense in depth, NOT a replacement for SharePoint ACLs.
  function verifiedDirectChild(item, parentId, driveId) {
    if (!item || !item.id || item.remoteItem || !(item.folder || item.file)) return false;
    const parent = item.parentReference;
    return Boolean(parent && clean(parent.id) === clean(parentId) &&
      clean(parent.driveId) === clean(driveId));
  }
  async function children(folderId) {
    ensureCurrentAuthorization();
    if (!session.drive?.id || !session.root?.id || !folderId) {
      throw new Error('The authorized project folder is unavailable. Select the project again.');
    }
    // Never follow arbitrary nextLinks or unknown Graph hosts.
    const driveId = session.drive.id;
    const rows=[];
    let next = `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}/children?$select=id,name,size,lastModifiedDateTime,folder,file,parentReference,remoteItem&$top=200`;
    let pages=0, skipped=0, examined=0;
    while (next) {
      if (++pages > 150) throw new Error('This folder contains too many pages to browse safely.');
      const result=await graph(next);
      for (const item of result.value || []) {
        examined++;
        if (verifiedDirectChild(item, folderId, driveId)) {
          rows.push(item);
        } else {
          skipped++;
        }
      }
      next=result['@odata.nextLink']||'';
      if (next && !next.startsWith(ROOT_SITE)) throw new Error('Unexpected Graph pagination URL.');
    }
    if (skipped) console.warn('AHT Project PDFs: ignored items without a verified direct parent in the selected office drive:', skipped);
    if (examined && !rows.length) {
      throw new Error('SharePoint did not return verifiable folder locations. No files were opened. Ask your project administrator to check this document library.');
    }
    return rows;
  }
  function renderItems(items, isSearch, counts) {
    ui.list.replaceChildren();
    const visible = items.filter(item => item.folder || (item.file && /\.pdf$/i.test(clean(item.name))));
    visible.sort((a,b) => Number(Boolean(b.folder))-Number(Boolean(a.folder)) || clean(a.name).localeCompare(clean(b.name)));
    if (!visible.length) { messageRow(isSearch ? 'No matching PDFs found.' : 'No PDF files or subfolders here.'); return; }
    for (const item of visible) {
      const entry = el('button','aht-doc-item'); entry.type = 'button';
      const folder = Boolean(item.folder);
      entry.appendChild(el('span','aht-doc-item-icon',folder?'📁':'📄'));
      const desc = el('div'); desc.style.minWidth='0';
      desc.append(el('span','aht-doc-item-name',item.name));
      const metadata = isSearch && item.displayPath ? item.displayPath :
        folder ? 'Open folder' :
        [item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime).toLocaleDateString() : '',
         typeof item.size === 'number' ? `${(item.size/1048576).toFixed(1)} MB` : ''].filter(Boolean).join(' · ');
      if (metadata) desc.append(el('span','aht-doc-item-meta',metadata));
      entry.append(desc,el('span','aht-doc-item-arrow',folder?'›':'Open →'));
      entry.addEventListener('click',() => {
        if (session.busy) return;
        if (folder) { if (!isSearch) enterFolder(item); }
        else openPDF(item);
      });
      ui.list.appendChild(entry);
    }
    if (counts && counts.truncated) showStatus(`Showing first ${LIMIT_RESULTS} results. Narrow your search.`,false);
  }
  async function loadCurrentFolder() {
    const token=++session.generation;
    try {
      ensureCurrentAuthorization();
      busy(true);
      renderCrumbs();
      messageRow('Loading PDFs and subfolders…');
      showStatus('Reading this project folder…');
      const current=session.crumbs[session.crumbs.length-1];
      if (!current) throw new Error('Choose a project first.');
      const items=await children(current.id);
      if (token!==session.generation) return;
      renderItems(items,false);
      showStatus(`${items.filter(x=>x.folder).length} subfolders · ${items.filter(x=>x.file&&/\.pdf$/i.test(clean(x.name))).length} PDFs in this folder.`);
    } catch(error) {
      if (token===session.generation) { messageRow('This folder could not be opened.'); showStatus(error.message||error,true); }
    } finally { if (token===session.generation) { busy(false); renderCrumbs(); } }
  }
  function enterFolder(item) {
    if (!item.folder || !item.id || session.crumbs.length >= LIMIT_DEPTH) return;
    session.crumbs.push({id:item.id,name:item.name});
    loadCurrentFolder();
  }
  function navigate(index) {
    if (session.busy || index < 0 || index >= session.crumbs.length) return;
    session.crumbs = session.crumbs.slice(0,index+1);
    loadCurrentFolder();
  }
  function safeFolderParts(folder) {
    const parts = clean(folder).split('/').map(clean);
    if (!parts.length || parts.some(p=>!p || p === '.' || p === '..' || p.includes('\\') || p.includes('?') || p.includes('#'))) {
      throw new Error('The saved project folder mapping is invalid.');
    }
    return parts;
  }
  function normalizedStreetAddress(value) {
    return clean(value).toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\b(drive|dr)\b/g, 'dr')
      .replace(/\b(road|rd)\b/g, 'rd')
      .replace(/\b(street|st)\b/g, 'st')
      .replace(/\b(avenue|ave)\b/g, 'ave')
      .replace(/\b(boulevard|blvd)\b/g, 'blvd')
      .replace(/\b(lane|ln)\b/g, 'ln')
      .replace(/\b(court|ct)\b/g, 'ct')
      .replace(/\s+/g,' ').trim();
  }
  function matchesTopLevelProjectFolder(item, project, rootId, driveId) {
    if (!item || !item.folder || !item.id || item.remoteItem || !item.parentReference) return false;
    if (clean(item.parentReference.id) !== clean(rootId)) return false;
    if (item.parentReference.driveId && clean(item.parentReference.driveId) !== clean(driveId)) return false;
    const address = normalizedStreetAddress(project.address);
    const name = normalizedStreetAddress(item.name);
    return address.length >= 6 && (name === address || name.endsWith(' ' + address));
  }
  async function discoverProjectFolder(project, drive) {
    // Graph searches ONLY the selected office's Projects drive, never all sites.
    // Its search results can include file CONTENT hits and remote shared items:
    // explicitly require a unique, immediate child folder of that drive root.
    const root = await graph(`/drives/${encodeURIComponent(drive.id)}/root?$select=id,name,folder`);
    if (!root?.id || !root.folder) throw new Error('The office document-library root could not be verified.');
    const q = clean(project.address).replace(/'/g,"''");
    if (q.length < 6) throw new Error('The project address is missing; add an explicit document-folder mapping.');
    let next = `/drives/${encodeURIComponent(drive.id)}/root/search(q='${encodeURIComponent(q)}')?$select=id,name,folder,parentReference,remoteItem&$top=200`;
    let pages = 0;
    const matching = new Map();
    while (next) {
      if (++pages > LIMIT_DISCOVERY_PAGES) throw new Error('Too many SharePoint search results. Use an explicit folder mapping for this project.');
      const result = await graph(next);
      for (const item of result?.value || []) {
        if (matchesTopLevelProjectFolder(item,project,root.id,drive.id)) matching.set(item.id,item);
      }
      next = result?.['@odata.nextLink'] || '';
      if (next && !next.startsWith(ROOT_SITE)) throw new Error('Unexpected SharePoint search pagination URL.');
    }
    if (matching.size === 0) throw new Error(`No top-level folder ending with "${project.address}" was found in ${project.division}'s ${drive.name} library. Ask a Project Admin to verify the project address or set an exact folder mapping.`);
    if (matching.size !== 1) throw new Error(`Multiple project folders match "${project.address}" in the ${drive.name} library. Ask a Project Admin to set an exact folder mapping; no folder was opened.`);
    return [...matching.values()][0];
  }
  async function selectProject(projectId) {
    const token=++session.generation;
    session.project=null; session.location=null; session.drive=null; session.root=null; session.crumbs=[];
    renderCrumbs();
    messageRow('Opening the project document folder…');
    const entry=availableProjects().find(row=>clean(row.project.id)===clean(projectId));
    if (!entry) { showStatus('Select an authorized and configured project.',true); return; }
    session.project=entry.project;
    session.location=entry.location;
    const where=entry.location;
    text(ui.context,`${where.office} office · ${where.library} library · ${where.folder || 'Automatic folder lookup by address'}`);
    try {
      busy(true);
      showStatus('Connecting to your project documents…');
      const siteURL=new URL(where.siteUrl);
      if (siteURL.protocol!=='https:' || siteURL.hostname.toLowerCase()!=='ahtglobalteam.sharepoint.com') {
        throw new Error('The project mapping must point to the approved AHT SharePoint tenant.');
      }
      const sitePath=siteURL.pathname.replace(/^\/+|\/+$/g,'');
      if (!sitePath.startsWith('sites/')) throw new Error('The project SharePoint site path is invalid.');
      const site=await graph(`/sites/${encodeURIComponent(siteURL.hostname)}:/${sitePath}?$select=id,displayName,webUrl`);
      if (token!==session.generation) return;
      const drives=await graph(`/sites/${encodeURIComponent(site.id)}/drives?$select=id,name,webUrl`);
      if (token!==session.generation) return;
      const matches=(drives.value||[]).filter(x=>officeKey(x.name)===officeKey(where.library));
      if (matches.length!==1) throw new Error(`The mapped '${where.library}' document library is unavailable in this Microsoft session.`);
      session.site=site;
      session.drive=matches[0];
      let root;
      if (where.folderId) {
        if (clean(session.drive.id) !== clean(where.driveId)) {
          throw new Error('The saved project folder belongs to a different document library. Have an administrator verify the link in Room Builder.');
        }
        root=await graph(`/drives/${encodeURIComponent(session.drive.id)}/items/${encodeURIComponent(where.folderId)}?$select=id,name,folder,parentReference,remoteItem`);
        const driveRoot=await graph(`/drives/${encodeURIComponent(session.drive.id)}/root?$select=id,name,folder`);
        if (!root?.folder || root?.remoteItem ||
            clean(root?.parentReference?.id) !== clean(driveRoot?.id)) {
          throw new Error('The saved folder is not a verified top-level project folder in this office library.');
        }
      } else if (where.folder) {
        const path=safeFolderParts(where.folder).map(encodeURIComponent).join('/');
        // Verified per-project override: no office-wide discovery needed.
        root=await graph(`/drives/${encodeURIComponent(session.drive.id)}/root:/${path}?$select=id,name,folder,webUrl`);
      } else {
        showStatus(`Finding the assigned project's folder within ${where.office}…`);
        root=await discoverProjectFolder(entry.project,session.drive);
      }
      if (token!==session.generation) return;
      if (!root.id || !root.folder) throw new Error('The mapped project folder was not found.');
      session.root=root;
      text(ui.context,`${where.office} office · ${where.library} library · ${root.name}${where.folder || where.folderId ? ' (verified)' : ' (auto-matched)'}`);
      session.crumbs=[{id:root.id,name:root.name}];
      await loadCurrentFolder();
    } catch(error) {
      if (token===session.generation) { messageRow('Unable to open this project.'); showStatus(error.message||error,true); }
    } finally { if (token===session.generation) busy(false); }
  }
  async function searchProject() {
    const q=clean(ui.search.value).toLocaleLowerCase();
    if (q.length<2) { showStatus('Enter at least two filename characters before searching.',true); return; }
    const token=++session.generation;
    try {
      ensureCurrentAuthorization();
      if (!session.root) throw new Error('Choose a project first.');
      busy(true);
      messageRow('Searching within the selected project…');
      const queue=[{id:session.root.id, path:session.root.name, depth:0}];
      const visited=new Set();
      const matches=[];
      let inspected=0;
      let truncated=false;
      while (queue.length) {
        if (token!==session.generation) return;
        const folder=queue.shift();
        if (visited.has(folder.id)) continue;
        visited.add(folder.id);
        if (folder.depth>LIMIT_DEPTH || inspected>=LIMIT_ITEMS) {truncated=true;break;}
        showStatus(`Searching project… ${visited.size} folders inspected`);
        const items=await children(folder.id);
        for (const item of items) {
          inspected++;
          if (inspected>LIMIT_ITEMS) {truncated=true;break;}
          if (item.folder && item.id && folder.depth<LIMIT_DEPTH) queue.push({id:item.id,path:`${folder.path} / ${item.name}`,depth:folder.depth+1});
          else if (item.file && /\.pdf$/i.test(clean(item.name)) && clean(item.name).toLocaleLowerCase().includes(q)) {
            matches.push({...item,displayPath:folder.path});
          }
          if (matches.length>=LIMIT_RESULTS) {truncated=true;break;}
        }
        if(truncated)break;
      }
      if (token!==session.generation) return;
      renderItems(matches,true,{truncated});
      showStatus(`${matches.length} matching PDFs found${truncated ? ' (search limit reached; narrow your search)' : ''}.`);
    } catch(error) {
      if(token===session.generation) { messageRow('Search could not be completed.'); showStatus(error.message||error,true); }
    } finally { if(token===session.generation) {busy(false);renderCrumbs();} }
  }
  async function openPDF(item) {
    const token=++session.generation;
    try {
      ensureCurrentAuthorization();
      if (!item.file || !item.id || !/\.pdf$/i.test(clean(item.name))) throw new Error('Select a PDF file.');
      if (!item.parentReference || clean(item.parentReference.driveId) !== clean(session.drive?.id) || item.remoteItem) {
        throw new Error('This PDF does not belong to the selected project library.');
      }
      if (typeof item.size==='number' && item.size>MAX_FILE_BYTES) throw new Error('This PDF is over the 100 MB browser limit. Download it from SharePoint and use the local PDF option.');
      const input=session.editor.document.getElementById('fileInput');
      if (!input) throw new Error('The editor PDF input is not available.');
      const editorName=session.editor.document.getElementById('fileName');
      if (editorName && !/no file chosen/i.test(editorName.textContent || '') &&
          !window.confirm('Loading another PDF may invalidate existing markups. Export your marked-up PDF and Save Work (JSON) first. Replace the current drawing?')) return;
      busy(true);
      showStatus(`Loading ${item.name} from SharePoint…`);
      const tokenString=await provider().getAccessToken();
      if(token!==session.generation) return;
      ensureCurrentAuthorization();
      const url=`${ROOT_SITE}drives/${encodeURIComponent(session.drive.id)}/items/${encodeURIComponent(item.id)}/content`;
      const response=await fetch(url,{headers:{Authorization:`Bearer ${tokenString}`}});
      if(token!==session.generation) return;
      if(!response.ok) {
        let detail='';
        try { const body=await response.json();detail=body?.error?.message||body?.error?.code||''; } catch(_) {}
        throw new Error(`SharePoint PDF download failed (${response.status})${detail ? ': '+detail : ''}.`);
      }
      const buffer=await response.arrayBuffer();
      if(buffer.byteLength>MAX_FILE_BYTES) throw new Error('PDF exceeds the 100 MB browser limit.');
      if(token!==session.generation) return;
      ensureCurrentAuthorization();
      if(buffer.byteLength < 5 || String.fromCharCode(...new Uint8Array(buffer.slice(0,5))) !== '%PDF-') {
        throw new Error('SharePoint returned a file that does not appear to be a PDF.');
      }
      const file=new File([buffer],item.name,{type:'application/pdf'});
      const transfer=new DataTransfer();
      transfer.items.add(file);
      input.files=transfer.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));
      // The tool's existing asynchronous onchange handler loads and renders it.
      close();
    } catch(error) {
      if(token===session.generation) showStatus(error.message||error,true);
    } finally { if(token===session.generation) busy(false); }
  }
  async function openForEditor(win) {
    if(!hasEditorAccess()) { window.alert('SharePoint PDFs are available to authorized Editors and Administrators only.'); return; }
    const frame=document.querySelector('#aht-tools-hub [data-aht-hub-frame]');
    if(!frame || frame.contentWindow!==win || frame.getAttribute('src')==='about:blank') {
      window.alert('Open this PDF tool through the dashboard first.'); return;
    }
    buildUI();
    session.editor=win;
    session.project=null;
    session.location=null;
    session.root=null;
    session.drive=null;
    session.crumbs=[];
    session.generation++;
    const mapped=availableProjects();
    ui.project.replaceChildren(el('option',null,'Select project…'));
    ui.project.firstChild.value='';
    mapped.forEach(row=>{
      const option=el('option',null,`${row.location.office} — ${row.project.name || row.project.address}`);
      option.value=clean(row.project.id);
      ui.project.append(option);
    });
    ui.search.value='';
    text(ui.context,'');
    renderCrumbs();
    messageRow(mapped.length ? 'Choose a project to browse its PDF drawings.' : 'No configured office document library is available for your assigned projects.');
    showStatus(mapped.length ? 'SharePoint originals remain read-only.' : 'Ask a Project Admin to verify your assignments and configure your office SharePoint library.',!mapped.length);
    ui.layer.hidden=false;
    document.addEventListener('keydown',onKeyDown);
    const active = (typeof currentProject === 'function') ? currentProject() : null;
    const match = active && mapped.find(row=>clean(row.project.id)===clean(active.id));
    if(match) { ui.project.value=clean(match.project.id); await selectProject(ui.project.value); }
    else ui.project.focus();
  }
  window.AHTProjectDocumentPicker=Object.freeze({openForEditor});
})();
