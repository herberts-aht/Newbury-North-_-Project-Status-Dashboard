// Replaceable project-data provider.
//
// LocalStorageDataProvider is used now. A hosted database provider can later
// implement the same state and user methods.

const LocalStorageDataProvider = {
  storageKey: "aht_perm_demo_v23",
  usersKey: "aht_users_v1",

  async loadState() {
    const saved = localStorage.getItem(this.storageKey);
    return saved ? JSON.parse(saved) : structuredClone(DEMO);
  },

  async saveState(nextState) {
    localStorage.setItem(this.storageKey, JSON.stringify(nextState));
  },

  async loadUsers() {
    const saved = localStorage.getItem(this.usersKey);
    return saved ? JSON.parse(saved) : structuredClone(USERS);
  },

  async saveUsers(nextUsers) {
    localStorage.setItem(this.usersKey, JSON.stringify(nextUsers));
  }
};

// Change this reference when a hosted database is introduced.
let DataProvider = LocalStorageDataProvider;
