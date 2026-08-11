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

function dashboardUserForAccount(account) {
  const claims = account?.idTokenClaims || {};
  const email = normalizeEmail(account?.username || claims.preferred_username || claims.email);
  const displayName = String(account?.name || claims.name || "AHT User").trim();
  const adminEmails = (APP_CONFIG.entra.adminEmails || []).map(normalizeEmail);

  let user = USERS.find(item => normalizeEmail(item.email) && normalizeEmail(item.email) === email);
  if (!user) {
    user = USERS.find(item => String(item.name || "").trim().toLowerCase() === displayName.toLowerCase());
  }

  if (adminEmails.includes(email)) {
    const admin = USERS.find(item => item.canAdmin && item.active !== false) || user;
    if (admin) return { ...admin, email, name: displayName || admin.name, authAccount: account.homeAccountId };
  }

  if (user) {
    return { ...user, email: email || user.email, name: displayName || user.name, authAccount: account.homeAccountId };
  }

  // Safe default for an authenticated AHT tenant user not yet configured in
  // dashboard administration. This prevents accidental edit/admin access.
  return {
    id: `entra-${account?.localAccountId || "user"}`,
    name: displayName,
    email,
    company: "AHT Global",
    role: "Internal Viewer",
    active: true,
    projects: ["*"],
    canEdit: false,
    canAdmin: false,
    isInternal: true,
    authAccount: account?.homeAccountId || ""
  };
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
    return dashboardUserForAccount(microsoftAccount);
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
      ? "Use your AHT Global Microsoft account. No dashboard password is stored."
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

async function initializeAuthentication() {
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
  if (currentUser) showSignedInApplication();
  else showLoginScreen();
}
