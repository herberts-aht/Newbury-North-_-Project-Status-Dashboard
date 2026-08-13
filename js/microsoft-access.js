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

  function el(id) { return document.getElementById(id); }
  function escText(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
  function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
  function groupId() { return APP_CONFIG.entra.accessGroupId || ""; }
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
    return {
      r: profile.role || (profile.entraUserType === "Guest" ? "External Viewer" : "Executive Viewer"),
      p: Array.isArray(profile.projects) ? profile.projects.filter(Boolean) : [],
      c: profile.company || (profile.entraUserType === "Guest" ? "External" : "AHT Global"),
      n: profile.name || "",
      e: normalizeEmail(profile.email)
    };
  }

  async function saveDashboardProfile(profile) {
    if (!currentUser?.canAdmin || !profile?.entraObjectId) return;
    sharedProfiles[profile.entraObjectId] = compactProfile(profile);
    await persistSharedProfiles();
  }

  async function saveProfileForObject(objectId, values) {
    sharedProfiles[objectId] = {
      r: values.role, p: values.projects || [], c: values.company || "", n: values.name || "", e: normalizeEmail(values.email)
    };
    await persistSharedProfiles();
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
      if (!["Internal Editor", "Executive Viewer"].includes(profile.role)) profile.role = "Executive Viewer";
      profile.canAdmin = false;
      profile.canEdit = profile.role === "Internal Editor";
      profile.isInternal = true;
      if (!stored && (!Array.isArray(profile.projects) || !profile.projects.length)) profile.projects = ["*"];
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
          role: isGuest ? "External Viewer" : "Executive Viewer",
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
        <td>${escText(profile?.role || (type === "External" ? "External Viewer" : "Executive Viewer"))}</td>
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

  async function addMemberObjectId(objectId) {
    await graph(`/groups/${encodeURIComponent(groupId())}/members/$ref`, {
      method: "POST",
      body: JSON.stringify({ "@odata.id": `${GRAPH}/directoryObjects/${objectId}` })
    });
  }

  async function addInternal() {
    const input = el("internalUserEmail");
    const email = normalizeEmail(input?.value);
    const role = el("internalUserRole")?.value || "Executive Viewer";
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
      if (input) input.value = "";
      el("internalInviteProjects")?.querySelectorAll('input[type="checkbox"]').forEach(x => x.checked = false);
      setStatus(`${user.displayName || email} was configured and granted Project Control access.`, "success");
      await refresh();
    } catch (error) {
      console.error(error); setStatus(`Could not add AHT user: ${error.message}`, "error");
    } finally { setBusy(false); }
  }

  async function inviteExternal() {
    const emailInput = el("externalInviteEmail");
    const nameInput = el("externalInviteName");
    const companyInput = el("externalInviteCompany");
    const email = normalizeEmail(emailInput?.value);
    const name = String(nameInput?.value || "").trim();
    const company = String(companyInput?.value || "").trim();
    const role = "External Viewer";
    const projects = selectedProjects("externalInviteProjects");
    if (!email) { alert("Enter the external user's email address."); return; }
    if (!projects.length) { alert("Select at least one project before sending the invitation."); return; }
    setBusy(true); setStatus(`Inviting ${email}…`);
    try {
      await loadSharedProfiles();
      const invitation = await graph("/invitations", {
        method: "POST",
        body: JSON.stringify({
          invitedUserEmailAddress: email,
          invitedUserDisplayName: name || email,
          inviteRedirectUrl: APP_CONFIG.hosting.publicUrl || window.location.origin,
          sendInvitationMessage: true,
          invitedUserMessageInfo: {
            customizedMessageBody: "You have been invited to the AHT Newbury North Project Control dashboard."
          }
        })
      });
      const objectId = invitation?.invitedUser?.id;
      if (!objectId) throw new Error("Microsoft created the invitation but did not return a guest user ID.");
      // Save role/projects before group membership is granted. This prevents a
      // newly invited user from entering Project Control before configuration is complete.
      await saveProfileForObject(objectId, { role, projects, company: company || "External", name: name || email, email });
      await addMemberObjectId(objectId);
      lastRedeemUrl = invitation.inviteRedeemUrl || "";
      if (emailInput) emailInput.value = "";
      if (nameInput) nameInput.value = "";
      if (companyInput) companyInput.value = "";
      el("externalInviteProjects")?.querySelectorAll('input[type="checkbox"]').forEach(x => x.checked = false);
      setStatus(`Invitation created, access configured, and ${email} was granted Project Control access.`, "success");
      const redeem = el("inviteRedeemArea");
      if (redeem) {
        redeem.classList.toggle("hidden", !lastRedeemUrl);
        const link = el("inviteRedeemLink"); if (link) link.value = lastRedeemUrl;
      }
      await refresh();
    } catch (error) {
      console.error(error); setStatus(`Could not invite external user: ${error.message}`, "error");
    } finally { setBusy(false); }
  }

  async function removeAccess(objectId) {
    const member = directoryMembers.find(m => m.id === objectId);
    const label = member?.displayName || memberEmail(member || {}) || "this user";
    if (!confirm(`Remove Project Control access for ${label}?\n\nThis removes only membership in the dedicated Project Control access group. It does not delete the Microsoft/guest account.`)) return;
    setBusy(true); setStatus(`Removing access for ${label}…`);
    try {
      await graph(`/groups/${encodeURIComponent(groupId())}/members/${encodeURIComponent(objectId)}/$ref`, { method: "DELETE" });
      if (sharedProfiles[objectId]) { delete sharedProfiles[objectId]; await persistSharedProfiles(); }
      setStatus(`${label} no longer has Project Control access.`, "success");
      await refresh();
    } catch (error) {
      console.error(error); setStatus(`Could not remove access: ${error.message}`, "error");
    } finally { setBusy(false); }
  }

  async function copyRedeemLink() {
    const link = el("inviteRedeemLink")?.value || lastRedeemUrl;
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setStatus("Invitation redemption link copied.", "success"); }
    catch { prompt("Copy this redemption link:", link); }
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
    if (APP_CONFIG.authProvider === "microsoft") {
      el("legacyPasswordControls")?.classList.add("hidden");
      el("newUserBtn")?.classList.add("hidden");
    }
  }

  return { initialize, onAdminView, refresh, saveDashboardProfile, renderInviteProjects };
})();

MicrosoftAccess.initialize();
window.MicrosoftAccess = MicrosoftAccess;
