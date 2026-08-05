// Replaceable project-data provider.
//
// LocalStorageDataProvider is used now. A hosted database provider can later
// implement the same loadState() and saveState() methods.

const LocalStorageDataProvider = {
  storageKey: "aht_perm_demo_v23",

  async loadState() {
    const saved = localStorage.getItem(this.storageKey);
    return saved ? JSON.parse(saved) : structuredClone(DEMO);
  },

  async saveState(nextState) {
    localStorage.setItem(this.storageKey, JSON.stringify(nextState));
  }
};

// Change this reference when a hosted database is introduced.
let DataProvider = LocalStorageDataProvider;
