// Authentication adapter.
//
// The dashboard currently uses DemoAuthProvider. A hosted login or AHT SSO
// provider can replace it later without changing the dashboard screens.

let currentUser = null;

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

  async signIn({ userId, password }) {
    const user = USERS.find(item => item.id === userId && item.active !== false);

    if (!user) {
      throw new Error("The selected user is not active or could not be found.");
    }

    if (password !== passwordForUser(user)) {
      throw new Error("Incorrect password.");
    }

    sessionStorage.setItem(this.sessionKey, user.id);
    return user;
  },

  async signOut() {
    sessionStorage.removeItem(this.sessionKey);
  },

  async restoreSession() {
    const userId = sessionStorage.getItem(this.sessionKey);
    return userId
      ? USERS.find(item => item.id === userId && item.active !== false) || null
      : null;
  }
};

// Change only this reference when a hosted provider or AHT SSO is added.
let AuthProvider = DemoAuthProvider;

function showSignedInApplication() {
  loginScreen.classList.add("hidden");
  app.classList.remove("hidden");
  render();
}

function showLoginScreen() {
  app.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

async function handleLogin() {
  try {
    currentUser = await AuthProvider.signIn({
      userId: loginUser.value,
      password: loginPassword.value
    });
    loginPassword.value = "";
    showSignedInApplication();
  } catch (error) {
    alert(error.message);
  }
}

async function handleLogout() {
  await AuthProvider.signOut();
  currentUser = null;
  showLoginScreen();
}

async function initializeAuthentication() {
  populateLoginUsers();

  loginBtn.onclick = handleLogin;
  logoutBtn.onclick = handleLogout;

  currentUser = await AuthProvider.restoreSession();

  if (currentUser) {
    showSignedInApplication();
  } else {
    showLoginScreen();
  }
}
