// Authentication adapter.
//
// MicrosoftAuthProvider uses MSAL Browser (authorization code + PKCE) for
// AHT Entra sign-in. No client secret is used or stored in this SPA.

let currentUser = null;
let msalInstance = null;
let microsoftAccount = null;

const TEMP_PASSWORDS = {
  stacy: "ahtadmin8626",
  aht: "ahtadmin",
  external: "user"
};

function passwordForUser(user) {
  return TEMP_PASSWORDS[user?.passwordProfile] || "";
}

function populateLoginUsers(selectedUserId = "") {
  const activeUsers = USERS.filter(user => user.active !== false);
  loginUser.innerHTML = activeUsers
    .map(user => `<option value="${user.id}">${user.name} — ${user.role}</option>`)
    .join("");

  if (selectedUserId && activeUsers.some(user => user.id === selectedUserId)) {
    loginUser.value = selectedUserId;
  }
}

const DemoAuthProvider = {
  sessionKey: "aht_demo_user",

  async initialize() {},

  async signIn({ userId, password }) {
    const user = USERS.find(item => item.id === userId && item.active !== false);
    if (!user) throw new Error("The selected user is not active or could not be found.");
    if (password !== passwordForUser(user)) throw new Error("Incorrect password.");
    sessionStorage.setItem(this.sessionKey, user.id);
    return user;
  },

  async signOut() {
    sessionStorage.removeItem(this.sessionKey);
  },

  async restoreSession() {
    const userId = sessionStorage.getItem(this.sessionKey);
    return userId ? USERS.find(item => item.id === userId && item.active !== false) || null : null;
  }
};

function microsoftRedirectUri() {
  return APP_CONFIG.entra.redirectUri || window.location.origin;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function dashboardUserForAccount(account, graphUser = null, sharedProfile = null) {
  const claims = account?.idTokenClaims || {};
  const email = normalizeEmail(account?.username || claims.preferred_username || claims.email);
  const displayName = String(graphUser?.displayName || account?.name || claims.name || "AHT User").trim();
  const entraUserType = String(graphUser?.userType || "").trim().toLowerCase();
  const adminEmails = (APP_CONFIG.entra.adminEmails || []).map(normalizeEmail);

  let user = graphUser?.id ? USERS.find(item => item.entraObjectId === graphUser.id) : null;
  if (!user) user = USERS.find(item => normalizeEmail(item.email) && normalizeEmail(item.email) === email);
  if (!user) {
    user = USERS.find(item => String(item.name || "").trim().toLowerCase() === displayName.toLowerCase());
  }

  const shared = sharedProfile && typeof sharedProfile === "object" ? sharedProfile : null;

  if (adminEmails.includes(email)) {
    const admin = USERS.find(item => item.canAdmin && item.active !== false) || user;
    if (admin) return { ...admin, email, name: displayName || admin.name, authAccount: account.homeAccountId };
  }

  // Entra B2B guests are always external to AHT, even if their email/name
  // happens to match a locally configured dashboard user. If an external
  // dashboard profile exists, preserve its project assignments; otherwise
  // default to no projects until an administrator assigns them.
  if (entraUserType === "guest") {
    const externalUser = user && user.isInternal === false ? user : null;
    const projects = Array.isArray(shared?.p) ? shared.p : (externalUser?.projects || []);
    return {
      ...(externalUser || {}),
      id: externalUser?.id || `entra-${graphUser?.id || account?.localAccountId || "guest"}`,
      entraObjectId: graphUser?.id || externalUser?.entraObjectId || "",
      entraUserType: "Guest",
      name: shared?.n || displayName || externalUser?.name || "External User",
      email: normalizeEmail(shared?.e || graphUser?.mail || graphUser?.userPrincipalName || email),
      company: shared?.c || externalUser?.company || "External",
      role: "External Viewer",
      active: true,
      projects,
      canEdit: false,
      canAdmin: false,
      isInternal: false,
      authAccount: account?.homeAccountId || ""
    };
  }

  if (user || shared) {
    const role = shared?.r || user?.role || "Executive Viewer";
    return {
      ...(user || {}),
      id: user?.id || `entra-${graphUser?.id || account?.localAccountId || "user"}`,
      entraObjectId: graphUser?.id || user?.entraObjectId || "",
      entraUserType: "Member",
      email: normalizeEmail(shared?.e || email || user?.email),
      name: shared?.n || displayName || user?.name || "AHT User",
      company: shared?.c || user?.company || "AHT Global",
      role,
      active: true,
      projects: Array.isArray(shared?.p) ? shared.p : (user?.projects || ["*"]),
      canAdmin: false,
      canEdit: role === "Internal Editor",
      isInternal: true,
      authAccount: account.homeAccountId
    };
  }

  // Safe default for an authenticated AHT tenant user not yet configured in
  // dashboard administration. This prevents accidental edit/admin access.
  return {
    id: `entra-${account?.localAccountId || "user"}`,
    name: displayName,
    email,
    company: "AHT Global",
    role: "AHT Internal",
    active: true,
    projects: ["*"],
    canEdit: false,
    canAdmin: false,
    isInternal: true,
    authAccount: account?.homeAccountId || ""
  };
}

async function loadSharedDashboardProfile(graphUser) {
  const groupId = APP_CONFIG.entra.accessGroupId || "";
  const extensionName = APP_CONFIG.entra.accessProfileExtensionName || "";
  const scopes = APP_CONFIG.entra.accessProfileReadScopes || [];
  if (!graphUser?.id || !groupId || !extensionName || !scopes.length) return null;
  try {
    const accessToken = await getMicrosoftAccessToken(scopes);
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${encodeURIComponent(groupId)}/extensions/${encodeURIComponent(extensionName)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Microsoft profile store failed (${response.status}).`);
    const extension = await response.json();
    const profiles = JSON.parse(extension.profilesJson || "{}");
    return profiles[graphUser.id] || null;
  } catch (error) {
    console.warn("Could not load shared Project Control profile; using safe local/default access.", error);
    return null;
  }
}

const MicrosoftAuthProvider = {
  async initialize() {
    if (!window.msal?.PublicClientApplication) {
      throw new Error("Microsoft sign-in library did not load. Check the network connection and reload the page.");
    }
    if (!APP_CONFIG.entra.tenantId || !APP_CONFIG.entra.clientId) {
      throw new Error("Microsoft sign-in is enabled, but the Entra tenant/client ID is missing from js/config.js.");
    }

    msalInstance = new msal.PublicClientApplication({
      auth: {
        clientId: APP_CONFIG.entra.clientId,
        authority: `https://login.microsoftonline.com/${APP_CONFIG.entra.tenantId}`,
        redirectUri: microsoftRedirectUri(),
        postLogoutRedirectUri: microsoftRedirectUri()
      },
      cache: {
        cacheLocation: "sessionStorage"
      }
    });

    const redirectResult = await msalInstance.handleRedirectPromise();
    microsoftAccount = redirectResult?.account || msalInstance.getAllAccounts()[0] || null;
    if (microsoftAccount) msalInstance.setActiveAccount(microsoftAccount);
  },

  async signIn() {
    // Redirect is more reliable than popup auth for Safari, mobile browsers,
    // Azure Static Web Apps, and cases where the app is itself opened in a popup.
    await msalInstance.loginRedirect({
      scopes: APP_CONFIG.entra.scopes,
      prompt: "select_account",
      redirectStartPage: window.location.href
    });

    // Navigation normally occurs before this line. Keep the return explicit so
    // the caller never treats a redirect-based sign-in as an authenticated user
    // before MSAL handles the redirect response on the next page load.
    return null;
  },

  async signOut() {
    const account = microsoftAccount || msalInstance?.getActiveAccount();
    microsoftAccount = null;
    if (account) {
      await msalInstance.logoutRedirect({
        account,
        postLogoutRedirectUri: microsoftRedirectUri()
      });
    }
  },

  async restoreSession() {
    microsoftAccount = msalInstance?.getActiveAccount() || msalInstance?.getAllAccounts()[0] || null;
    if (!microsoftAccount) return null;
    msalInstance.setActiveAccount(microsoftAccount);

    // User.Read is sufficient for /me and lets Entra tell us whether the
    // authenticated identity is an internal Member or a B2B Guest.
    let graphUser = null;
    try {
      const accessToken = await getMicrosoftAccessToken(["User.Read"]);
      const response = await fetch(
        "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName,userType",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!response.ok) throw new Error(`Microsoft Graph /me failed (${response.status}).`);
      graphUser = await response.json();
    } catch (error) {
      console.warn("Could not read Entra userType; using safe account fallback.", error);
    }

    const sharedProfile = await loadSharedDashboardProfile(graphUser);
    return dashboardUserForAccount(microsoftAccount, graphUser, sharedProfile);
  }
};

let AuthProvider = APP_CONFIG.authProvider === "microsoft" ? MicrosoftAuthProvider : DemoAuthProvider;

async function getMicrosoftAccessToken(scopes = APP_CONFIG.entra.scopes) {
  if (!msalInstance) throw new Error("Microsoft authentication has not been initialized.");
  const account = microsoftAccount || msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
  if (!account) throw new Error("Sign in with Microsoft before accessing SharePoint.");

  try {
    const result = await msalInstance.acquireTokenSilent({ account, scopes });
    return result.accessToken;
  } catch (error) {
    const result = await msalInstance.acquireTokenPopup({ account, scopes });
    return result.accessToken;
  }
}
window.getMicrosoftAccessToken = getMicrosoftAccessToken;

function configureLoginScreen() {
  const microsoftMode = APP_CONFIG.authProvider === "microsoft";
  const userField = loginUser.closest(".field");
  const passwordField = loginPassword.closest(".field");
  const note = loginScreen.querySelector(".demo-note");

  userField?.classList.toggle("hidden", microsoftMode);
  passwordField?.classList.toggle("hidden", microsoftMode);
  loginBtn.textContent = microsoftMode ? "Sign in with Microsoft" : "Sign In";
  if (note) {
    note.textContent = microsoftMode
      ? "Use the email address associated with your Project Control invitation. Microsoft will guide you through sign-in or verification. No Project Control password is stored."
      : "Temporary local passwords are assigned by user type. This interim login is not production security.";
  }
}

function showSignedInApplication() {
  loginScreen.classList.add("hidden");
  app.classList.remove("hidden");
  render();
}

function showLoginScreen() {
  app.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  if (APP_CONFIG.authProvider !== "microsoft") {
    requestAnimationFrame(() => loginPassword.focus());
  }
}

async function handleLogin() {
  try {
    currentUser = await AuthProvider.signIn({
      userId: loginUser.value,
      password: loginPassword.value
    });

    // Microsoft redirect authentication leaves this page and returns through
    // initializeAuthentication(), where handleRedirectPromise restores the
    // signed-in account. Do not render the app before that round trip completes.
    if (APP_CONFIG.authProvider === "microsoft" && !currentUser) return;

    // SharePoint data requires the authenticated Microsoft account/token.
    // Load the live state only after sign-in has completed.
    if (APP_CONFIG.dataProvider === "sharePoint") {
      state = await DataProvider.loadState();
      if (!state || !Array.isArray(state.projects)) {
        throw new Error("Live SharePoint project data could not be loaded.");
      }
      if (!state.auditLog) state.auditLog = [];
    }

    loginPassword.value = "";
    showSignedInApplication();
  } catch (error) {
    console.error(error);
    alert(error.message || "Microsoft sign-in could not be completed.");
  }
}

async function handleLogout() {
  await AuthProvider.signOut();
  currentUser = null;
  showLoginScreen();
}

async function initializeAuthentication({ deferRender = false } = {}) {
  populateLoginUsers();
  configureLoginScreen();
  await AuthProvider.initialize();

  loginBtn.onclick = handleLogin;
  loginPassword.addEventListener("keydown", event => {
    if (event.key !== "Enter" || APP_CONFIG.authProvider === "microsoft") return;
    event.preventDefault();
    handleLogin();
  });
  logoutBtn.onclick = handleLogout;

  currentUser = await AuthProvider.restoreSession();
  if (!deferRender) {
    if (currentUser) showSignedInApplication();
    else showLoginScreen();
  }
  return currentUser;
}
