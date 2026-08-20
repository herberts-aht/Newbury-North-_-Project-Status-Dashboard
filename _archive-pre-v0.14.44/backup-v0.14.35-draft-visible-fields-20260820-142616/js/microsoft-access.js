// Live Microsoft Entra access-group administration.
//
// Entra controls who can enter the application. The dashboard's local user
// profiles only store dashboard-specific role/edit/project settings.

const MicrosoftAccess = (() => {
  const GRAPH = "https://graph.microsoft.com/v1.0";
  let loadedOnce = false;
  let loading = false;
  let directoryMembers = [];
  let sharedProfiles = {};
  let profileExtensionExists = false;
  let lastRedeemUrl = "";
  let lastInviteContext = null;

  function el(id) { return document.getElementById(id); }
  function escText(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
  function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
  function normalizeDashboardRole(value, isGuest = false) {
    if (isGuest) return "External Viewer";
    let role = String(value || "").trim();
    if (role === "Internal Editor") role = "Editor";
    if (role === "Executive Viewer") role = "Viewer";
    return ["Administrator", "Editor", "Viewer"].includes(role) ? role : "Viewer";
  }
  function groupId() { return APP_CONFIG.entra.accessGroupId || ""; }
  function editGroupId() { return APP_CONFIG.entra.editAccessGroupId || ""; }
  function managementScopes() { return APP_CONFIG.entra.accessManagementScopes || []; }
  function profileExtensionName() { return APP_CONFIG.entra.accessProfileExtensionName || ""; }
  function profileReadScopes() { return APP_CONFIG.entra.accessProfileReadScopes || []; }
  function memberEmail(member) {
    const mail = normalizeEmail(member.mail);
    if (mail) return mail;
    const upn = normalizeEmail(member.userPrincipalName);
    return upn.includes("#ext#") ? "" : upn;
  }
  function dashboardType(member) {
    const email = memberEmail(member);
    if ((APP_CONFIG.entra.adminEmails || []).map(normalizeEmail).includes(email)) return "Admin";
    return String(member.userType || "").toLowerCase() === "guest" ? "External" : "AHT Internal";
  }
  function setStatus(message, tone = "") {
    const target = el("entraAccessStatus");
    if (!target) return;
    target.textContent = message;
    target.className = `entra-access-status ${tone}`.trim();
  }
  function setBusy(value) {
    loading = value;
    ["refreshEntraUsersBtn", "inviteExternalBtn", "addInternalBtn"].forEach(id => {
      const node = el(id); if (node) node.disabled = value;
    });
  }

  async function token(scopes = managementScopes()) {
    if (!currentUser?.canAdmin) throw new Error("Administrator access is required.");
    if (!groupId()) throw new Error("The Entra access group Object ID is missing from js/config.js.");
    return getMicrosoftAccessToken(scopes);
  }

  async function graph(url, options = {}, scopes = managementScopes()) {
    const accessToken = await token(scopes);
    const response = await fetch(url.startsWith("http") ? url : `${GRAPH}${url}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || `${response.status} ${response.statusText}`;
      throw new Error(message);
    }
    return data;
  }

  async function loadSharedProfiles() {
    sharedProfiles = {};
    profileExtensionExists = false;
    const name = profileExtensionName();
    if (!name) return sharedProfiles;
    const accessToken = await token(profileReadScopes().length ? profileReadScopes() : managementScopes());
    const response = await fetch(`${GRAPH}/groups/${encodeURIComponent(groupId())}/extensions/${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
    });
    if (response.status === 404) return sharedProfiles;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `Could not read dashboard profile store (${response.status}).`);
    profileExtensionExists = true;
    try { sharedProfiles = JSON.parse(data.profilesJson || "{}"); } catch { sharedProfiles = {}; }
    return sharedProfiles;
  }

  async function persistSharedProfiles() {
    const name = profileExtensionName();
    if (!name) throw new Error("The shared dashboard profile extension name is missing from js/config.js.");
    const profilesJson = JSON.stringify(sharedProfiles);
    if (new TextEncoder().encode(profilesJson).length > 1800) {
      throw new Error("The Entra dashboard profile store is nearing its size limit. Move profiles to the shared backend before adding more users.");
    }
    const body = {
      "@odata.type": "#microsoft.graph.openTypeExtension",
      extensionName: name,
      profilesJson
    };
    if (profileExtensionExists) {
      await graph(`/groups/${encodeURIComponent(groupId())}/extensions/${encodeURIComponent(name)}`, { method: "PATCH", body: JSON.stringify(body) }, managementScopes());
    } else {
      await graph(`/groups/${encodeURIComponent(groupId())}/extensions`, { method: "POST", body: JSON.stringify(body) }, managementScopes());
      profileExtensionExists = true;
    }
  }

  function compactProfile(profile) {
    const isGuest = String(profile.entraUserType || "").toLowerCase() === "guest";
    return {
      r: normalizeDashboardRole(profile.role, isGuest),
      p: Array.isArray(profile.projects) ? profile.projects.filter(Boolean) : [],
      c: profile.company || (isGuest ? "External" : "AHT Global"),
      n: profile.name || "",
      e: normalizeEmail(profile.email)
    };
  }

  async function saveDashboardProfile(profile) {
    if (!currentUser?.canAdmin || !profile) return;

    // Always start from the current shared store so an admin save cannot
    // accidentally overwrite profiles written by another session.
    await loadSharedProfiles();

    let objectId = String(profile.entraObjectId || "").trim();
    if (!objectId) {
      const email = normalizeEmail(profile.email);
      if (!email) throw new Error("This dashboard user has no email address to resolve in Microsoft Entra.");

      const members = await listGroupUsers();
      const member = members.find(item => {
        const mail = normalizeEmail(item.mail);
        const upn = normalizeEmail(item.userPrincipalName);
        return mail === email || upn === email;
      });

      if (!member?.id) {
        throw new Error(`Could not match ${email} to a member of the Project Control access group.`);
      }

      objectId = member.id;
      profile.entraObjectId = objectId;
      if (member.userType) profile.entraUserType = member.userType;
    }

    sharedProfiles[objectId] = compactProfile(profile);
    await persistSharedProfiles();

    if (String(profile.entraUserType || "").toLowerCase() !== "guest") {
      await syncSharePointEditAccess(objectId, profile.role);
    }
  }

  async function saveProfileForObject(objectId, values) {
    const isGuest = String(values.entraUserType || "").toLowerCase() === "guest" || values.role === "External Viewer";
    sharedProfiles[objectId] = {
      r: normalizeDashboardRole(values.role, isGuest),
      p: values.projects || [],
      c: values.company || "",
      n: values.name || "",
      e: normalizeEmail(values.email)
    };
    await persistSharedProfiles();
  }

  async function removeProjectFromProfiles(projectId) {
    if (!currentUser?.canAdmin || !projectId) return;

    await loadSharedProfiles();

    let changed = false;

    Object.keys(sharedProfiles).forEach(objectId => {
      const profile = sharedProfiles[objectId];
      if (!profile || !Array.isArray(profile.p) || profile.p.includes("*")) return;

      const updated = profile.p.filter(id => id !== projectId);

      if (updated.length !== profile.p.length) {
        profile.p = updated;
        changed = true;
      }
    });

    if (changed) {
      await persistSharedProfiles();
    }
  }

  function selectedProjects(containerId) {
    return [...(el(containerId)?.querySelectorAll('input[type="checkbox"]:checked') || [])].map(x => x.value);
  }

  function renderInviteProjects() {
    const markup = (state.projects || []).filter(p => !p.archived).map(p =>
      `<label><input type="checkbox" value="${escText(p.id)}">${escText(p.name)}</label>`
    ).join("") || '<span class="small">No active projects are available.</span>';
    const internal = el("internalInviteProjects"); if (internal) internal.innerHTML = markup;
    const external = el("externalInviteProjects"); if (external) external.innerHTML = markup;
  }

  async function listGroupUsers() {
    let url = `/groups/${encodeURIComponent(groupId())}/members?$select=id,displayName,mail,userPrincipalName,userType,accountEnabled`;
    const users = [];
    while (url) {
      const data = await graph(url);
      for (const item of data.value || []) {
        const type = String(item["@odata.type"] || "");
        if (!type || type.endsWith(".user")) users.push(item);
      }
      url = data["@odata.nextLink"] || "";
    }
    return users.sort((a,b) => String(a.displayName || "").localeCompare(String(b.displayName || "")));
  }

  function existingProfile(member) {
    const email = memberEmail(member);
    let profile = USERS.find(u => u.entraObjectId === member.id);
    if (!profile && email) profile = USERS.find(u => normalizeEmail(u.email) === email);
    if (!profile && String(member.userType || "").toLowerCase() !== "guest") {
      profile = USERS.find(u => String(u.name || "").trim().toLowerCase() === String(member.displayName || "").trim().toLowerCase());
    }
    return profile || null;
  }

  function applyDirectoryIdentity(profile, member) {
    const stored = sharedProfiles[member.id] || null;
    if (stored) {
      if (stored.n) profile.name = stored.n;
      if (stored.e) profile.email = stored.e;
      if (stored.c) profile.company = stored.c;
      if (stored.r) profile.role = stored.r;
      if (Array.isArray(stored.p)) profile.projects = [...stored.p];
    }
    const email = memberEmail(member);
    const isGuest = String(member.userType || "").toLowerCase() === "guest";
    const isAdmin = (APP_CONFIG.entra.adminEmails || []).map(normalizeEmail).includes(email);
    profile.entraObjectId = member.id;
    profile.entraUserType = isGuest ? "Guest" : "Member";
    profile.managedByEntraAccessGroup = true;
    profile.active = member.accountEnabled !== false;
    profile.name = member.displayName || profile.name || email || "Microsoft User";
    if (email) profile.email = email;

    if (isAdmin) {
      profile.role = "Administrator";
      profile.canAdmin = true;
      profile.canEdit = true;
      profile.isInternal = true;
      profile.projects = ["*"];
      profile.company = profile.company || "AHT Global";
      return;
    }

    if (isGuest) {
      profile.role = "External Viewer";
      profile.canAdmin = false;
      profile.canEdit = false;
      profile.isInternal = false;
      profile.projects = Array.isArray(profile.projects) ? profile.projects.filter(x => x !== "*") : [];
      profile.company = profile.company && profile.company !== "AHT Global" ? profile.company : "External";
    } else {
      profile.role = normalizeDashboardRole(profile.role, false);
      profile.canAdmin = profile.role === "Administrator";
      profile.canEdit = profile.role === "Administrator" || profile.role === "Editor";
      profile.isInternal = true;
      if (profile.canAdmin) profile.projects = ["*"];
      else if (!stored && (!Array.isArray(profile.projects) || !profile.projects.length)) profile.projects = ["*"];
      profile.company = "AHT Global";
    }
  }

  async function syncProfiles(members) {
    const currentIds = new Set(members.map(m => m.id));
    let changed = false;
    for (const member of members) {
      let profile = existingProfile(member);
      if (!profile) {
        const isGuest = String(member.userType || "").toLowerCase() === "guest";
        profile = {
          id: `entra-${member.id}`,
          name: member.displayName || "Microsoft User",
          email: memberEmail(member),
          company: isGuest ? "External" : "AHT Global",
          role: isGuest ? "External Viewer" : "Viewer",
          passwordProfile: isGuest ? "external" : "aht",
          active: true,
          projects: isGuest ? [] : ["*"],
          canEdit: false,
          canAdmin: false,
          isInternal: !isGuest
        };
        USERS.push(profile);
        changed = true;
      }
      const before = JSON.stringify(profile);
      applyDirectoryIdentity(profile, member);
      if (JSON.stringify(profile) !== before) changed = true;
    }

    for (const profile of USERS) {
      if (profile.managedByEntraAccessGroup && profile.entraObjectId && !currentIds.has(profile.entraObjectId)) {
        if (profile.active !== false) { profile.active = false; changed = true; }
      }
    }
    if (changed) await DataProvider.saveUsers(USERS);
  }

  function renderMembers() {
    const body = el("entraUsersBody");
    const count = el("entraUserCount");
    if (!body) return;
    if (count) count.textContent = `${directoryMembers.length} user${directoryMembers.length === 1 ? "" : "s"}`;
    body.innerHTML = directoryMembers.length ? directoryMembers.map(member => {
      const profile = existingProfile(member);
      const email = memberEmail(member) || member.userPrincipalName || "—";
      const type = dashboardType(member);
      const projects = profile?.projects?.includes("*") ? "All projects" : (profile?.projects || []).map(id => state.projects.find(p=>p.id===id)?.name || id).join(", ") || "No projects";
      const locked = type === "Admin";
      return `<tr>
        <td><strong>${escText(member.displayName || "Microsoft User")}</strong><div class="small">${escText(email)}</div></td>
        <td><span class="entra-type ${type === "External" ? "external" : "internal"}">${escText(type)}</span></td>
        <td>${escText(normalizeDashboardRole(profile?.role, type === "External"))}</td>
        <td>${escText(projects)}</td>
        <td class="entra-row-actions">
          <button class="btn" type="button" data-manage-profile="${escText(profile?.id || "")}">Manage</button>
          <button class="btn danger" type="button" data-remove-entra="${escText(member.id)}" ${locked ? "disabled title=\"Admin access is protected\"" : ""}>Remove Access</button>
        </td>
      </tr>`;
    }).join("") : '<tr><td colspan="5" class="small">No direct user members are currently in the Project Control access group.</td></tr>';

    body.querySelectorAll("[data-manage-profile]").forEach(btn => btn.addEventListener("click", () => manageProfile(btn.dataset.manageProfile)));
    body.querySelectorAll("[data-remove-entra]").forEach(btn => btn.addEventListener("click", () => removeAccess(btn.dataset.removeEntra)));
  }

  function manageProfile(profileId) {
    const profile = USERS.find(u => u.id === profileId);
    if (!profile) return;
    creatingUser = false;
    adminUserSelect.value = profile.id;
    renderAdmin();
    document.getElementById("dashboardProfilePanel")?.scrollIntoView({behavior:"smooth", block:"start"});
  }

  async function refresh(force = true) {
    if (!currentUser?.canAdmin || loading) return;
    if (!groupId()) { setStatus("Security Group Object ID is not configured.", "error"); return; }
    setBusy(true);
    setStatus("Loading live Microsoft access group…");
    try {
      await loadSharedProfiles();
      directoryMembers = await listGroupUsers();
      await syncProfiles(directoryMembers);
      renderInviteProjects();
      loadedOnce = true;
      renderMembers();
      renderAdmin();
      setStatus(`Connected to Entra access group · ${directoryMembers.length} direct user member${directoryMembers.length === 1 ? "" : "s"}.`, "success");
    } catch (error) {
      console.error("Microsoft access refresh failed", error);
      setStatus(`Microsoft access could not be loaded: ${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function groupHasMember(targetGroupId, objectId) {
    if (!targetGroupId || !objectId) return false;

    let url =
      `/groups/${encodeURIComponent(targetGroupId)}/members` +
      `?$select=id&$top=999`;

    while (url) {
      const data = await graph(url);
      if ((data.value || []).some(item => String(item.id) === String(objectId))) {
        return true;
      }
      url = data["@odata.nextLink"] || "";
    }

    return false;
  }

  async function syncSharePointEditAccess(objectId, role) {
    const targetGroupId = editGroupId();
    if (!targetGroupId || !objectId) return;

    const normalizedRole = normalizeDashboardRole(role, false);
    const needsEdit =
      normalizedRole === "Administrator" ||
      normalizedRole === "Editor";

    const isMember = await groupHasMember(targetGroupId, objectId);

    if (needsEdit && !isMember) {
      await graph(`/groups/${encodeURIComponent(targetGroupId)}/members/$ref`, {
        method: "POST",
        body: JSON.stringify({
          "@odata.id": `${GRAPH}/directoryObjects/${objectId}`
        })
      });
    }

    if (!needsEdit && isMember) {
      await graph(
        `/groups/${encodeURIComponent(targetGroupId)}/members/${encodeURIComponent(objectId)}/$ref`,
        { method: "DELETE" }
      );
    }
  }

  async function addMemberObjectId(objectId) {
    const delays = [0, 1000, 2000, 4000];
    let lastError = null;

    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt]) {
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      }

      try {
        await graph(`/groups/${encodeURIComponent(groupId())}/members/$ref`, {
          method: "POST",
          body: JSON.stringify({ "@odata.id": `${GRAPH}/directoryObjects/${objectId}` })
        });
        return;
      } catch (error) {
        lastError = error;
        const message = String(error?.message || error || "");

        const alreadyMember =
          message.includes("already exist") ||
          message.includes("added object references already exist") ||
          message.includes("One or more added object references already exist");

        if (alreadyMember) {
          return;
        }

        const retryable =
          message.includes("does not exist") ||
          message.includes("Request_ResourceNotFound") ||
          message.includes("Directory_ObjectNotFound");

        if (!retryable || attempt === delays.length - 1) {
          throw error;
        }
      }
    }

    throw lastError || new Error("Could not add the user to the Project Control access group.");
  }

  async function addInternal() {
    const input = el("internalUserEmail");
    const email = normalizeEmail(input?.value);
    const role = el("internalUserRole")?.value || "Viewer";
    const projects = selectedProjects("internalInviteProjects");
    if (!email) { alert("Enter the AHT user's email address."); return; }
    if (!projects.length) { alert("Select at least one project before granting access."); return; }
    if (!/@ahtglobal\.com$/i.test(email)) {
      if (!confirm(`${email} is not an @ahtglobal.com address. Continue as an internal-user lookup?`)) return;
    }
    setBusy(true); setStatus(`Preparing ${email}…`);
    try {
      await loadSharedProfiles();
      const user = await graph(`/users/${encodeURIComponent(email)}?$select=id,displayName,mail,userPrincipalName,userType,accountEnabled`);
      await saveProfileForObject(user.id, { role, projects, company: "AHT Global", name: user.displayName || email, email });
      await addMemberObjectId(user.id);
      await syncSharePointEditAccess(user.id, role);

      const localProfile = USERS.find(item => normalizeEmail(item.email) === email);
      if (localProfile) {
        localProfile.entraObjectId = user.id;
        localProfile.entraUserType = "Member";
        localProfile.managedByEntraAccessGroup = true;
        localProfile.role = normalizeDashboardRole(role, false);
        localProfile.canAdmin = localProfile.role === "Administrator";
        localProfile.canEdit = localProfile.role === "Administrator" || localProfile.role === "Editor";
        localProfile.isInternal = true;
        localProfile.projects = [...projects];
        localProfile.active = true;
        localProfile.company = "AHT Global";
        await DataProvider.saveUsers(USERS);
      }

      if (!directoryMembers.some(item => item.id === user.id)) {
        directoryMembers.push(user);
        directoryMembers.sort((a,b) => String(a.displayName || "").localeCompare(String(b.displayName || "")));
      }

      if (input) input.value = "";
      el("internalInviteProjects")?.querySelectorAll('input[type="checkbox"]').forEach(x => x.checked = false);
      setStatus(`${user.displayName || email} was configured and granted Project Control access.`, "success");
      await refresh();
    } catch (error) {
      console.error(error); setStatus(`Could not add AHT user: ${error.message}`, "error");
    } finally { setBusy(false); }
  }

  async function findExistingExternalGuest(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;

    const safe = normalized.replace(/'/g, "''");
    const filter = encodeURIComponent(`mail eq '${safe}'`);
    const data = await graph(
      `/users?$filter=${filter}&$select=id,displayName,mail,userPrincipalName,userType,accountEnabled`
    );

    return (data?.value || []).find(user =>
      String(user.userType || "").toLowerCase() === "guest" &&
      normalizeEmail(user.mail) === normalized
    ) || null;
  }

  function openExternalInviteDraft({ email, name, projects, redeemUrl }) {
    const enteredName = String(name || "").trim();
    const firstName = enteredName && normalizeEmail(enteredName) !== normalizeEmail(email)
      ? enteredName.split(/\s+/)[0]
      : "";

    const greeting = firstName ? `Hi ${firstName},` : "Hi,";
    const projectText = Array.isArray(projects) && projects.length
      ? projects.join(" & ")
      : "your assigned project(s)";

    const subject = `AHT Project Control Access - ${projectText}`;
    const body = [
      greeting,
      "",
      `You've been granted access to the AHT Project Control dashboard for ${projectText}.`,
      "",
      "Activate your Project Control access:",
      redeemUrl,
      "",
      "Once completed, you can sign in to Project Control using this email address.",
      "",
      // Intentionally no manual closing/signature.
      // Outlook's configured signature can be used instead.
    ].join("\n");

    const mailto =
      `mailto:${encodeURIComponent(email)}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    // macOS mailto: is configured to open Microsoft Outlook.
    window.location.href = mailto;
  }
  async function copyRedeemLink() {
    const link = el("inviteRedeemLink")?.value || lastRedeemUrl;
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setStatus("Invitation redemption link copied.", "success"); }
    catch { prompt("Copy this redemption link:", link); }
  }

  function openCurrentInviteDraft() {
    const link = String(el("inviteRedeemLink")?.value || lastRedeemUrl || "").trim();

    if (!lastInviteContext?.email) {
      alert("Invite or select an external user first so Project Control knows who the draft is for.");
      return;
    }

    if (!link) {
      alert("Paste or generate a Microsoft invitation link first.");
      return;
    }

    openExternalInviteDraft({
      ...lastInviteContext,
      redeemUrl: link
    });
  }

  function onAdminView() {
    if (!currentUser?.canAdmin) return;
    if (!loadedOnce) refresh(); else renderMembers();
  }

  function initialize() {
    // Project choices are rendered after the live application state has loaded.
    // Calling renderInviteProjects here runs before app.js initializes `state`.
    el("refreshEntraUsersBtn")?.addEventListener("click", () => refresh());
    el("inviteExternalBtn")?.addEventListener("click", inviteExternal);
    el("addInternalBtn")?.addEventListener("click", addInternal);
    el("copyRedeemLinkBtn")?.addEventListener("click", copyRedeemLink);
    el("openInviteDraftBtn")?.addEventListener("click", openCurrentInviteDraft);
    if (APP_CONFIG.authProvider === "microsoft") {
      el("legacyPasswordControls")?.classList.add("hidden");
      el("newUserBtn")?.classList.add("hidden");
    }
  }

  return { initialize, onAdminView, refresh, saveDashboardProfile, removeProjectFromProfiles, renderInviteProjects };
})();

MicrosoftAccess.initialize();
window.MicrosoftAccess = MicrosoftAccess;
