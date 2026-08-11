// Entra-backed access administration for Project Control.
// Requires a dedicated Security Group Object ID in APP_CONFIG.entra.accessGroupId.
// Admin Graph scopes are requested only when an Administrator uses these controls.

function entraAdminConfigured() {
  return APP_CONFIG.authProvider === "microsoft" && !!APP_CONFIG.entra.accessGroupId;
}

function setEntraAdminStatus(message, kind = "") {
  const el = document.getElementById("entraAdminStatus");
  if (!el) return;
  el.textContent = message;
  el.className = `entra-admin-status ${kind}`.trim();
}

async function entraAdminToken() {
  if (!currentUser?.canAdmin) throw new Error("Administrator access is required.");
  if (!entraAdminConfigured()) {
    throw new Error("The Project Control access-group ID has not been configured yet.");
  }
  return getMicrosoftAccessToken(APP_CONFIG.entra.adminScopes);
}

async function graphRequest(path, options = {}) {
  const token = await entraAdminToken();
  const headers = { Authorization: `Bearer ${token}`, ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, { ...options, headers });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.error?.message || `Microsoft Graph request failed (${response.status}).`;
    throw new Error(detail);
  }
  return body;
}

function entraMemberEmail(member) {
  const upn = String(member.userPrincipalName || "");
  if (String(member.userType || "").toLowerCase() === "guest" && upn.includes("#EXT#")) {
    return String(member.mail || "");
  }
  return String(member.mail || member.userPrincipalName || "");
}

function dashboardRoleForEntraMember(member) {
  const email = normalizeEmail(entraMemberEmail(member));
  const admins = (APP_CONFIG.entra.adminEmails || []).map(normalizeEmail);
  if (admins.includes(email)) return "Admin";
  return String(member.userType || "").toLowerCase() === "guest" ? "External" : "AHT Internal";
}

async function refreshEntraAccessUsers() {
  const body = document.getElementById("entraAccessBody");
  if (!body || !currentUser?.canAdmin) return;
  if (!entraAdminConfigured()) {
    body.innerHTML = '<tr><td colspan="6" class="small">Waiting for the dedicated Entra Security Group Object ID.</td></tr>';
    setEntraAdminStatus("Waiting for Anthony/AHT IT to provide the dedicated Project Control Security Group Object ID.");
    return;
  }
  body.innerHTML = '<tr><td colspan="6" class="small">Loading Microsoft access list…</td></tr>';
  setEntraAdminStatus("Reading live access from Microsoft Entra…");
  try {
    const groupId = encodeURIComponent(APP_CONFIG.entra.accessGroupId);
    const data = await graphRequest(`/groups/${groupId}/members/microsoft.graph.user?$select=id,displayName,mail,userPrincipalName,userType,accountEnabled`);
    const members = (data?.value || []).slice().sort((a,b) => String(a.displayName||"").localeCompare(String(b.displayName||"")));
    body.innerHTML = members.length ? members.map(member => {
      const email = entraMemberEmail(member);
      const role = dashboardRoleForEntraMember(member);
      const protectedAdmin = role === "Admin";
      return `<tr>
        <td>${esc(member.displayName || "Unnamed user")}</td>
        <td>${esc(email)}</td>
        <td>${esc(member.userType || "Member")}</td>
        <td>${esc(role)}</td>
        <td>${member.accountEnabled === false ? "Disabled" : "Granted"}</td>
        <td>${protectedAdmin ? '<span class="small">Protected</span>' : `<button class="btn danger" type="button" onclick="removeEntraAccess('${member.id}','${esc(String(member.displayName||email).replace(/'/g,"&#39;"))}')">Remove Access</button>`}</td>
      </tr>`;
    }).join("") : '<tr><td colspan="6" class="small">No users are currently assigned through the Project Control access group.</td></tr>';
    setEntraAdminStatus(`${members.length} user${members.length===1?"":"s"} currently have dashboard access through the dedicated Entra group.`, "ok");
  } catch (error) {
    console.error(error);
    body.innerHTML = `<tr><td colspan="6" class="small">${esc(error.message)}</td></tr>`;
    setEntraAdminStatus(error.message, "error");
  }
}

async function addUserToAccessGroup(userId) {
  const groupId = encodeURIComponent(APP_CONFIG.entra.accessGroupId);
  await graphRequest(`/groups/${groupId}/members/$ref`, {
    method: "POST",
    body: JSON.stringify({ "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userId}` })
  });
}

async function inviteExternalFromDashboard() {
  const email = document.getElementById("entraGuestEmail").value.trim();
  const name = document.getElementById("entraGuestName").value.trim();
  if (!email || !name) { alert("Enter the external user's email and display name."); return; }
  if (!confirm(`Invite ${name} (${email}) and grant access to Project Control?\n\nThis does not add them to SharePoint.`)) return;
  setEntraAdminStatus(`Inviting ${email}…`);
  try {
    const invitation = await graphRequest("/invitations", {
      method: "POST",
      body: JSON.stringify({
        invitedUserEmailAddress: email,
        invitedUserDisplayName: name,
        inviteRedirectUrl: window.location.origin,
        sendInvitationMessage: true,
        invitedUserMessageInfo: {
          customizedMessageBody: "You have been invited to the AHT Newbury North Project Control Dashboard. Use your email identity to accept the invitation and sign in."
        }
      })
    });
    const userId = invitation?.invitedUser?.id;
    if (!userId) throw new Error("Microsoft created the invitation but did not return the guest user ID.");
    await addUserToAccessGroup(userId);
    document.getElementById("entraGuestEmail").value = "";
    document.getElementById("entraGuestName").value = "";
    document.getElementById("entraGuestCompany").value = "";
    setEntraAdminStatus(`Invitation sent and dashboard access granted to ${email}.`, "ok");
    await refreshEntraAccessUsers();
  } catch (error) {
    console.error(error);
    setEntraAdminStatus(error.message, "error");
    alert(`Could not complete the external invitation.\n\n${error.message}`);
  }
}

async function addInternalFromDashboard() {
  const email = document.getElementById("entraInternalEmail").value.trim();
  if (!email) { alert("Enter the AHT user's email address."); return; }
  if (!/@ahtglobal\.com$/i.test(email)) {
    alert("Use an @ahtglobal.com address here. External users belong in Invite External User.");
    return;
  }
  setEntraAdminStatus(`Finding ${email} in AHT Entra…`);
  try {
    const safe = email.replace(/'/g, "''");
    const filter = encodeURIComponent(`mail eq '${safe}' or userPrincipalName eq '${safe}'`);
    const result = await graphRequest(`/users?$filter=${filter}&$select=id,displayName,mail,userPrincipalName,userType`);
    // Some tenants reject encoded filter literals; retry with a direct UPN lookup when needed.
    let user = result?.value?.[0];
    if (!user) {
      user = await graphRequest(`/users/${encodeURIComponent(email)}?$select=id,displayName,mail,userPrincipalName,userType`);
    }
    await addUserToAccessGroup(user.id);
    document.getElementById("entraInternalEmail").value = "";
    setEntraAdminStatus(`${user.displayName || email} now has Project Control access.`, "ok");
    await refreshEntraAccessUsers();
  } catch (error) {
    console.error(error);
    setEntraAdminStatus(error.message, "error");
    alert(`Could not grant internal access.\n\n${error.message}`);
  }
}

async function removeEntraAccess(userId, displayName) {
  if (!confirm(`Remove Project Control access for ${displayName}?\n\nThis removes only the dedicated dashboard group membership; it does not delete the Microsoft account.`)) return;
  try {
    const groupId = encodeURIComponent(APP_CONFIG.entra.accessGroupId);
    await graphRequest(`/groups/${groupId}/members/${encodeURIComponent(userId)}/$ref`, { method: "DELETE" });
    setEntraAdminStatus(`${displayName} no longer has Project Control access.`, "ok");
    await refreshEntraAccessUsers();
  } catch (error) {
    console.error(error);
    setEntraAdminStatus(error.message, "error");
    alert(`Could not remove access.\n\n${error.message}`);
  }
}
window.removeEntraAccess = removeEntraAccess;

function initializeEntraAdminControls() {
  const refresh = document.getElementById("refreshEntraUsersBtn");
  const invite = document.getElementById("inviteExternalBtn");
  const addInternal = document.getElementById("addInternalBtn");
  if (refresh) refresh.onclick = refreshEntraAccessUsers;
  if (invite) invite.onclick = inviteExternalFromDashboard;
  if (addInternal) addInternal.onclick = addInternalFromDashboard;
  if (!entraAdminConfigured()) {
    setEntraAdminStatus("UI ready. Waiting for the dedicated Project Control Security Group Object ID and Microsoft admin consent.");
  }
}

document.addEventListener("DOMContentLoaded", initializeEntraAdminControls);
