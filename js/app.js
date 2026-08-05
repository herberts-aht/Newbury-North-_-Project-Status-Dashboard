// Application entry point.
//
// Data loading and authentication begin here so hosting or database providers
// can change without altering the dashboard screens.

let state = null;
let editContext = null;
let creatingUser = false;

async function initializeApplication() {
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
  } catch (error) {
    console.error(error);
    alert(`The dashboard could not start: ${error.message}`);
  }
}
