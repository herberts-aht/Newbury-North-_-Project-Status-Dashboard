const { app } = require('@azure/functions');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const ACCESS_LIST = process.env.DASHBOARD_ACCESS_LIST || process.env.SHAREPOINT_ACCESS_LIST || 'Dashboard Access';
const PROJECTS_LIST = process.env.PROJECTS_LIST || 'Projects';
const DELIVERABLES_LIST = process.env.DELIVERABLES_LIST || 'Deliverables';
const INFO_LIST = process.env.INFORMATION_REQUIRED_LIST || 'Information Required';

let appTokenCache = { token: '', expiresAt: 0 };
let siteCache = null;
let listIdCache = {};

function json(status, body) {
  return {
    status,
    jsonBody: body,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8'
    }
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function decodeGuestUpn(value) {
  const left = String(value || '').split('#EXT#')[0];
  const pivot = left.lastIndexOf('_');
  return pivot > 0 ? `${left.slice(0, pivot)}@${left.slice(pivot + 1)}` : left;
}

function normalizeProjects(value) {
  if (Array.isArray(value)) return value.map(String).map(x => x.trim()).filter(Boolean);
  return String(value || '').split(/[;,]/).map(x => x.trim()).filter(Boolean);
}

function roleFlags(role) {
  const normalized = String(role || '').trim();
  return {
    canAdmin: normalized === 'Administrator',
    canEdit: normalized === 'Administrator' || normalized === 'Internal Editor',
    isInternal: normalized !== 'External Viewer'
  };
}

function bootstrapAdmins() {
  return String(process.env.BOOTSTRAP_ADMIN_EMAILS || 'stace@ahtglobal.com')
    .split(/[;,]/)
    .map(normalizeEmail)
    .filter(Boolean);
}

async function parseBody(request) {
  try { return await request.json(); } catch { return {}; }
}

async function verifyCaller(request) {
  const auth = request.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error('Microsoft sign-in token is required.'), { status: 401 });

  const response = await fetch(`${GRAPH}/me?$select=id,displayName,mail,userPrincipalName,userType,otherMails`, {
    headers: { Authorization: `Bearer ${match[1]}` }
  });
  if (!response.ok) {
    throw Object.assign(new Error(`Microsoft identity verification failed (${response.status}).`), { status: 401 });
  }
  const me = await response.json();
  const guestDecoded = String(me.userPrincipalName || '').includes('#EXT#') ? decodeGuestUpn(me.userPrincipalName) : '';
  const email = normalizeEmail(me.mail || me.otherMails?.[0] || guestDecoded || me.userPrincipalName);
  if (!email) throw Object.assign(new Error('Microsoft did not return an email address for this account.'), { status: 403 });
  return { ...me, email };
}

async function getAppToken() {
  const now = Date.now();
  if (appTokenCache.token && appTokenCache.expiresAt > now + 120000) return appTokenCache.token;

  const tenantId = process.env.TENANT_ID || process.env.AZURE_TENANT_ID;
  const clientId = process.env.SHAREPOINT_CLIENT_ID || process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw Object.assign(new Error('Azure API SharePoint credentials are not configured.'), { status: 503 });
  }

  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw Object.assign(new Error(data.error_description || 'Azure API could not obtain the SharePoint application token.'), { status: 503 });
  }
  appTokenCache = {
    token: data.access_token,
    expiresAt: now + (Number(data.expires_in || 3600) * 1000)
  };
  return appTokenCache.token;
}

async function graphApp(path, options = {}) {
  const token = await getAppToken();
  const response = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(async () => ({ message: await response.text().catch(() => '') }));
  if (!response.ok) {
    const detail = data?.error?.message || data?.message || response.statusText;
    throw Object.assign(new Error(`SharePoint API failed (${response.status}): ${detail}`), { status: response.status });
  }
  return data;
}

async function getSite() {
  if (siteCache) return siteCache;
  const configured = process.env.SHAREPOINT_SITE_URL || 'https://ahtglobalteam.sharepoint.com/sites/NewburyNorth';
  const siteUrl = new URL(configured);
  const relativePath = siteUrl.pathname.replace(/^\/+/, '');
  siteCache = await graphApp(`/sites/${encodeURIComponent(siteUrl.hostname)}:/${relativePath}?$select=id,displayName,webUrl`);
  return siteCache;
}

async function getListId(displayName) {
  if (listIdCache[displayName]) return listIdCache[displayName];
  const site = await getSite();
  let url = `/sites/${encodeURIComponent(site.id)}/lists?$select=id,displayName`;
  while (url) {
    const data = await graphApp(url);
    for (const list of data.value || []) listIdCache[list.displayName] = list.id;
    url = data['@odata.nextLink'] || '';
  }
  if (!listIdCache[displayName]) throw Object.assign(new Error(`SharePoint list not found: ${displayName}`), { status: 503 });
  return listIdCache[displayName];
}

async function getListRows(displayName, fieldNames = []) {
  const site = await getSite();
  const listId = await getListId(displayName);
  const expand = fieldNames.length ? `fields($select=${fieldNames.join(',')})` : 'fields';
  let url = `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items?$expand=${expand}&$top=500`;
  const rows = [];
  while (url) {
    const data = await graphApp(url);
    rows.push(...(data.value || []));
    url = data['@odata.nextLink'] || '';
  }
  return rows;
}

async function createItem(displayName, fields) {
  const site = await getSite();
  const listId = await getListId(displayName);
  return graphApp(`/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items`, {
    method: 'POST', body: JSON.stringify({ fields })
  });
}

async function updateItem(displayName, itemId, fields) {
  const site = await getSite();
  const listId = await getListId(displayName);
  return graphApp(`/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}/fields`, {
    method: 'PATCH', body: JSON.stringify(fields)
  });
}

function accessProfileFromItem(item) {
  const f = item.fields || {};
  const role = f.DashboardRole || 'External Viewer';
  const flags = roleFlags(role);
  return {
    sharePointId: Number(item.id),
    id: f.ProfileKey || `access-${item.id}`,
    entraObjectId: String(f.EntraObjectId || ''),
    entraUserType: String(f.EntraUserType || ''),
    email: normalizeEmail(f.Title || f.Email || ''),
    name: f.DisplayName || f.Title || 'Dashboard User',
    company: f.Company || (role === 'External Viewer' ? 'External' : 'AHT Global'),
    role,
    active: f.Active !== false,
    projects: normalizeProjects(f.ProjectKeys),
    ...flags
  };
}

async function getAccessProfiles() {
  const rows = await getListRows(ACCESS_LIST, [
    'Title','ProfileKey','DisplayName','Company','DashboardRole','ProjectKeys','Active','EntraObjectId','EntraUserType'
  ]);
  return rows.map(accessProfileFromItem);
}

async function findAccessProfile(identity) {
  const profiles = await getAccessProfiles();
  const byObject = profiles.find(p => p.entraObjectId && p.entraObjectId === identity.id);
  if (byObject) return byObject;
  return profiles.find(p => normalizeEmail(p.email) === normalizeEmail(identity.email)) || null;
}

function effectiveProfile(identity, stored) {
  const email = normalizeEmail(identity.email);
  if (bootstrapAdmins().includes(email)) {
    return {
      ...(stored || {}),
      id: stored?.id || `bootstrap-${identity.id}`,
      entraObjectId: identity.id,
      entraUserType: identity.userType || 'Member',
      email,
      name: stored?.name || identity.displayName || email,
      company: stored?.company || 'AHT Global',
      role: 'Administrator',
      active: true,
      projects: ['*'],
      canAdmin: true,
      canEdit: true,
      isInternal: true
    };
  }
  if (!stored || stored.active === false) return null;
  return {
    ...stored,
    entraObjectId: identity.id || stored.entraObjectId,
    entraUserType: identity.userType || stored.entraUserType,
    email: stored.email || email,
    name: stored.name || identity.displayName || email
  };
}

async function requireProfile(identity) {
  const stored = await findAccessProfile(identity);
  const profile = effectiveProfile(identity, stored);
  if (!profile) throw Object.assign(new Error('No active Project Control access profile is assigned to this Microsoft account.'), { status: 403 });
  return profile;
}

async function requireAdmin(identity) {
  const profile = await requireProfile(identity);
  if (!profile.canAdmin) throw Object.assign(new Error('Administrator access is required.'), { status: 403 });
  return profile;
}

function normalizeDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function projectLookupId(fields) {
  for (const value of [fields.ProjectLookupId, fields.ProjectId, fields.Project, fields.Project_x003a_ID]) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}

function mapDeliverable(item) {
  const fields = item.fields || {};
  const title = fields.Title || 'Untitled Deliverable';
  const current = fields.CurrentActivity || '';
  const targetDate = normalizeDate(fields.TargetDate);
  return {
    id: Number(item.id), sharePointId: Number(item.id), legacyId: Number(fields.LegacyId || 0),
    projectSharePointId: projectLookupId(fields), deliverable: title, name: title,
    discipline: fields.Discipline || '', progressPhase: fields.ProgressPhase || '',
    status: fields.OperationalStatus || 'Pending', owner: fields.Owner || '', current, currentActivity: current,
    waitingOn: fields.WaitingOn || '', nextStep: fields.NextStep || '', startDate: normalizeDate(fields.StartDate),
    date: targetDate, targetDate, risk: fields.Risk || '', visibility: fields.Visibility || 'Shared',
    archived: Boolean(fields.Archived), healthMode: fields.HealthMode || 'auto', healthOverride: fields.HealthOverride || '',
    healthOverrideReason: fields.HealthOverrideReason || '', healthOverrideUntil: normalizeDate(fields.HealthOverrideUntil)
  };
}

function mapInformation(item) {
  const fields = item.fields || {};
  const requestedFrom = fields.RequestedFrom || '';
  return {
    id: Number(item.id), sharePointId: Number(item.id), legacyId: Number(fields.LegacyId || 0),
    projectSharePointId: projectLookupId(fields), item: fields.Title || 'Untitled Information Request',
    from: requestedFrom, requestedFrom, status: fields.RequestStatus || 'Outstanding', blocking: fields.Blocking || '',
    neededBy: normalizeDate(fields.NeededBy), notes: fields.Notes || '', visibility: fields.Visibility || 'Shared', archived: Boolean(fields.Archived)
  };
}

function visibleRecord(record, profile) {
  if (profile.canAdmin) return true;
  if (record.visibility === 'Admin Only') return false;
  if (!profile.isInternal && record.visibility !== 'Shared') return false;
  return true;
}

async function loadStateForProfile(profile) {
  const [projectItems, deliverableItems, informationItems] = await Promise.all([
    getListRows(PROJECTS_LIST),
    getListRows(DELIVERABLES_LIST, [
      'Title','Project','ProjectLookupId','LegacyId','Discipline','ProgressPhase','OperationalStatus','Owner',
      'CurrentActivity','WaitingOn','NextStep','StartDate','TargetDate','Risk','Visibility','Archived','HealthMode',
      'HealthOverride','HealthOverrideReason','HealthOverrideUntil'
    ]),
    getListRows(INFO_LIST, [
      'Title','Project','ProjectLookupId','LegacyId','RequestedFrom','RequestStatus','Blocking','NeededBy','Notes','Visibility','Archived'
    ])
  ]);

  const deliverables = deliverableItems.map(mapDeliverable).filter(x => !x.archived && visibleRecord(x, profile));
  const info = informationItems.map(mapInformation).filter(x => !x.archived && visibleRecord(x, profile));
  const allowed = new Set(profile.projects || []);
  const allProjects = allowed.has('*');

  const projects = projectItems
    .map(item => ({ item, fields: item.fields || {} }))
    .filter(({ fields }) => !Boolean(fields.Archived))
    .map(({ item, fields }) => {
      const sharePointId = Number(item.id);
      const id = fields.ProjectKey || String(item.id);
      if (!allProjects && !allowed.has(id)) return null;
      return {
        id, sharePointId, name: fields.Title || 'Untitled Project', address: fields.ProjectAddress || '',
        city: fields.ProjectCity || '', state: fields.ProjectState || '', description: fields.ProjectDescription || '',
        subtitle: fields.ProjectSubtitle || '', phase: fields.ProjectPhase || '', archived: Boolean(fields.Archived),
        health: fields.HealthMode === 'manual' && fields.HealthOverride ? fields.HealthOverride : 'On Track',
        updated: fields.LastActivityDate ? new Date(fields.LastActivityDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '',
        lastActivityDate: normalizeDate(fields.LastActivityDate), lastActivity: fields.LastActivity || '',
        progressPlanning: Number(fields.ProgressPlanning || 0), progressPlanningMode: fields.ProgressPlanningMode || 'manual',
        progressEngineering: Number(fields.ProgressEngineering || 0), progressEngineeringMode: fields.ProgressEngineeringMode || 'manual',
        progressInstallation: Number(fields.ProgressInstallation || 0), progressInstallationMode: fields.ProgressInstallationMode || 'manual',
        progressOverallMode: fields.ProgressOverallMode || 'auto', progressOverallOverride: Number(fields.ProgressOverallOverride || 0),
        healthMode: fields.HealthMode || 'auto', healthOverride: fields.HealthOverride || '',
        healthOverrideReason: fields.HealthOverrideReason || '', healthOverrideUntil: normalizeDate(fields.HealthOverrideUntil),
        deliverables: deliverables.filter(r => r.projectSharePointId === sharePointId),
        info: info.filter(r => r.projectSharePointId === sharePointId)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { currentProjectId: projects[0]?.id || null, projects, auditLog: [] };
}

function graphDate(value) {
  if (!value) return null;
  return `${String(value).slice(0, 10)}T12:00:00Z`;
}

function projectFields(project) {
  return {
    Title: project.name || project.address || 'Untitled Project', ProjectKey: String(project.id || ''),
    ProjectAddress: project.address || '', ProjectCity: project.city || '', ProjectState: project.state || '',
    ProjectDescription: project.description || '', ProjectSubtitle: project.subtitle || '', ProjectPhase: project.phase || '',
    Archived: Boolean(project.archived), LastActivityDate: graphDate(project.lastActivityDate), LastActivity: project.lastActivity || '',
    ProgressPlanning: Number(project.progressPlanning || 0), ProgressPlanningMode: project.progressPlanningMode || 'manual',
    ProgressEngineering: Number(project.progressEngineering || 0), ProgressEngineeringMode: project.progressEngineeringMode || 'manual',
    ProgressInstallation: Number(project.progressInstallation || 0), ProgressInstallationMode: project.progressInstallationMode || 'manual',
    ProgressOverallMode: project.progressOverallMode || 'auto', ProgressOverallOverride: Number(project.progressOverallOverride || 0),
    HealthMode: project.healthMode || 'auto', HealthOverride: project.healthMode === 'manual' ? (project.healthOverride || null) : null,
    HealthOverrideReason: project.healthMode === 'manual' ? (project.healthOverrideReason || '') : '',
    HealthOverrideUntil: project.healthMode === 'manual' ? graphDate(project.healthOverrideUntil) : null
  };
}

function deliverableFields(record, projectSharePointId) {
  return {
    Title: record.deliverable || record.name || 'Untitled Deliverable', ProjectLookupId: String(projectSharePointId),
    LegacyId: Number(record.legacyId || 0), Discipline: record.discipline || '', ProgressPhase: record.progressPhase || null,
    OperationalStatus: record.status || 'Pending', Owner: record.owner || '', CurrentActivity: record.current || record.currentActivity || '',
    WaitingOn: record.waitingOn || '', NextStep: record.nextStep || '', StartDate: graphDate(record.startDate),
    TargetDate: graphDate(record.date || record.targetDate), Risk: record.risk || '', Visibility: record.visibility || 'Shared',
    Archived: Boolean(record.archived), HealthMode: record.healthMode || 'auto',
    HealthOverride: record.healthMode === 'manual' ? (record.healthOverride || null) : null,
    HealthOverrideReason: record.healthMode === 'manual' ? (record.healthOverrideReason || '') : '',
    HealthOverrideUntil: record.healthMode === 'manual' ? graphDate(record.healthOverrideUntil) : null
  };
}

function informationFields(record, projectSharePointId) {
  return {
    Title: record.item || 'Untitled Information Request', ProjectLookupId: String(projectSharePointId),
    LegacyId: Number(record.legacyId || 0), RequestedFrom: record.from || record.requestedFrom || '',
    RequestStatus: record.status || 'Outstanding', Blocking: record.blocking || '', NeededBy: graphDate(record.neededBy),
    Notes: record.notes || '', Visibility: record.visibility || 'Shared', Archived: Boolean(record.archived)
  };
}

async function saveState(profile, nextState) {
  if (!profile.canEdit) throw Object.assign(new Error('Editing access is required.'), { status: 403 });
  const current = await loadStateForProfile({ ...profile, projects: ['*'], isInternal: true, canAdmin: true });
  const previousProjects = new Map((current.projects || []).map(p => [p.id, p]));
  const allowed = new Set(profile.projects || []);
  const all = allowed.has('*') || profile.canAdmin;

  for (const project of nextState.projects || []) {
    if (!all && !allowed.has(project.id)) throw Object.assign(new Error(`You are not assigned to ${project.name || project.id}.`), { status: 403 });
    const before = previousProjects.get(project.id);
    if (!project.sharePointId) {
      if (!profile.canAdmin) throw Object.assign(new Error('Only an Administrator can create projects.'), { status: 403 });
      const created = await createItem(PROJECTS_LIST, projectFields(project));
      project.sharePointId = Number(created.id);
    } else {
      await updateItem(PROJECTS_LIST, project.sharePointId, projectFields(project));
    }

    const prevDeliverables = new Map(((before && before.deliverables) || []).map(r => [String(r.id), r]));
    const seenDeliverables = new Set();
    for (const record of project.deliverables || []) {
      if (!record.sharePointId) {
        const created = await createItem(DELIVERABLES_LIST, deliverableFields(record, project.sharePointId));
        record.sharePointId = Number(created.id); record.id = Number(created.id);
      } else {
        await updateItem(DELIVERABLES_LIST, record.sharePointId, deliverableFields(record, project.sharePointId));
      }
      seenDeliverables.add(String(record.sharePointId || record.id));
    }
    for (const prior of prevDeliverables.values()) {
      const id = prior.sharePointId || prior.id;
      if (id && !seenDeliverables.has(String(id))) await updateItem(DELIVERABLES_LIST, id, { Archived: true });
    }

    const prevInfo = new Map(((before && before.info) || []).map(r => [String(r.id), r]));
    const seenInfo = new Set();
    for (const record of project.info || []) {
      if (!record.sharePointId) {
        const created = await createItem(INFO_LIST, informationFields(record, project.sharePointId));
        record.sharePointId = Number(created.id); record.id = Number(created.id);
      } else {
        await updateItem(INFO_LIST, record.sharePointId, informationFields(record, project.sharePointId));
      }
      seenInfo.add(String(record.sharePointId || record.id));
    }
    for (const prior of prevInfo.values()) {
      const id = prior.sharePointId || prior.id;
      if (id && !seenInfo.has(String(id))) await updateItem(INFO_LIST, id, { Archived: true });
    }
  }
}

function accessFields(values, identity = {}) {
  const role = values.role || 'External Viewer';
  return {
    Title: normalizeEmail(values.email),
    ProfileKey: values.id || `entra-${values.entraObjectId || identity.id || normalizeEmail(values.email)}`,
    DisplayName: values.name || identity.displayName || normalizeEmail(values.email),
    Company: values.company || (role === 'External Viewer' ? 'External' : 'AHT Global'),
    DashboardRole: role,
    ProjectKeys: normalizeProjects(values.projects).join(';'),
    Active: values.active !== false,
    EntraObjectId: values.entraObjectId || identity.id || '',
    EntraUserType: values.entraUserType || identity.userType || ''
  };
}

async function upsertAccessProfile(values, callerIdentity) {
  const email = normalizeEmail(values.email);
  if (!email) throw Object.assign(new Error('Email is required.'), { status: 400 });
  const profiles = await getAccessProfiles();
  const existing = profiles.find(p => (values.entraObjectId && p.entraObjectId === values.entraObjectId) || p.email === email);
  const fields = accessFields(values, callerIdentity);
  if (existing?.sharePointId) {
    await updateItem(ACCESS_LIST, existing.sharePointId, fields);
    return { ...existing, ...values, ...roleFlags(values.role) };
  }
  const created = await createItem(ACCESS_LIST, fields);
  return { sharePointId: Number(created.id), ...values, ...roleFlags(values.role) };
}

async function deleteAccessProfile(values) {
  const email = normalizeEmail(values.email);
  const objectId = String(values.entraObjectId || '');
  const profiles = await getAccessProfiles();
  const existing = profiles.find(p => (objectId && p.entraObjectId === objectId) || (email && p.email === email));
  if (!existing?.sharePointId) return;
  await updateItem(ACCESS_LIST, existing.sharePointId, { Active: false });
}

app.http('projectControl', {
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: 'project-control/{action}',
  handler: async (request, context) => {
    try {
      const identity = await verifyCaller(request);
      const action = request.params.action;

      if (request.method === 'GET' && action === 'health') {
        return json(200, { ok: true, identity: { email: identity.email, name: identity.displayName } });
      }

      if (request.method === 'GET' && action === 'access-me') {
        const profile = effectiveProfile(identity, await findAccessProfile(identity));
        return profile ? json(200, { profile }) : json(404, { profile: null, message: 'No dashboard access profile is assigned.' });
      }

      if (request.method === 'GET' && action === 'access-users') {
        await requireAdmin(identity);
        return json(200, { profiles: await getAccessProfiles() });
      }

      if (request.method === 'POST' && action === 'access-profile') {
        await requireAdmin(identity);
        const body = await parseBody(request);
        if (body.role === 'Administrator') {
          // Multiple admins are supported. Bootstrap admins remain protected by configuration.
        }
        const saved = await upsertAccessProfile(body, identity);
        return json(200, { profile: saved });
      }

      if (request.method === 'DELETE' && action === 'access-profile') {
        await requireAdmin(identity);
        const body = await parseBody(request);
        if (bootstrapAdmins().includes(normalizeEmail(body.email))) {
          return json(400, { message: 'The bootstrap Administrator cannot be removed from the dashboard.' });
        }
        await deleteAccessProfile(body);
        return json(200, { ok: true });
      }

      if (request.method === 'GET' && action === 'state') {
        const profile = await requireProfile(identity);
        return json(200, await loadStateForProfile(profile));
      }

      if (request.method === 'PUT' && action === 'state') {
        const profile = await requireProfile(identity);
        const body = await parseBody(request);
        await saveState(profile, body);
        return json(200, { ok: true });
      }

      return json(404, { message: 'Unknown API action.' });
    } catch (error) {
      context.error(error);
      return json(error.status || 500, { message: error.message || 'Project Control API error.' });
    }
  }
});
