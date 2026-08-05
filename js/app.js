// Application entry point.
//
// Data loading and authentication begin here so hosting or database providers
// can change without altering the dashboard screens.

let state = null;
let editContext = null;
let creatingUser = false;

function setStartupStatus({ title = "", message = "", error = false, hidden = false }) {
  startupStatus.classList.toggle("hidden", hidden);
  startupStatus.classList.toggle("error", error);
  startupTitle.textContent = title;
  startupMessage.textContent = message;
  startupRetryBtn.classList.toggle("hidden", !error);
}

function applyApplicationConfig() {
  document.title = `${APP_CONFIG.appName} · ${APP_CONFIG.version}`;
  versionTag.textContent = `Version ${APP_CONFIG.version} · ${APP_CONFIG.environment}`;
}

async function initializeApplication() {
  applyApplicationConfig();
  setStartupStatus({
    title: "Loading dashboard…",
    message: "Preparing project data and sign-in."
  });

  try {
    state = await DataProvider.loadState();

    if (!state || !Array.isArray(state.projects)) {
      throw new Error("Project data could not be loaded.");
    }

    if (!state.auditLog) {
      state.auditLog = [];
    }

    const savedUsers = await DataProvider.loadUsers();
    if (Array.isArray(savedUsers) && savedUsers.length) {
      USERS.splice(0, USERS.length, ...savedUsers);
    }

    await initializeAuthentication();
    setStartupStatus({ hidden: true });
  } catch (error) {
    console.error(error);
    setStartupStatus({
      title: "Dashboard could not start",
      message: error.message || "An unexpected startup error occurred.",
      error: true
    });
  }
}

startupRetryBtn.onclick = initializeApplication;
