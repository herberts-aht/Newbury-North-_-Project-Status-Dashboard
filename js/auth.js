// Authentication adapter.
//
// The dashboard currently uses DemoAuthProvider. A hosted login or AHT SSO
// provider can replace it later without changing the dashboard screens.

let currentUser = null;

const DemoAuthProvider = {
  sessionKey: "aht_demo_user",

  async signIn({ userId, password }) {
    if (password !== "demo") {
      throw new Error("Use demo as the password.");
    }

    const user = USERS.find(item => item.id === userId);
    if (!user) {
      throw new Error("The selected user could not be found.");
    }

    sessionStorage.setItem(this.sessionKey, user.id);
    return user;
  },

  async signOut() {
    sessionStorage.removeItem(this.sessionKey);
  },

  async restoreSession() {
    const userId = sessionStorage.getItem(this.sessionKey);
    return userId ? USERS.find(item => item.id === userId) || null : null;
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
  loginUser.innerHTML = USERS
    .map(user => `<option value="${user.id}">${user.name} — ${user.role}</option>`)
    .join("");

  loginBtn.onclick = handleLogin;
  logoutBtn.onclick = handleLogout;

  currentUser = await AuthProvider.restoreSession();

  if (currentUser) {
    showSignedInApplication();
  } else {
    showLoginScreen();
  }
}
