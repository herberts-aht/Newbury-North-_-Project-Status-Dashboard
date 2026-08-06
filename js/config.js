// Non-secret application configuration.
//
// Never place passwords, service keys, database secrets, or private SSO
// credentials in this file or any browser-delivered JavaScript.

const APP_CONFIG = Object.freeze({
  appName: "AHT Project Control",
  version: "0.10.0",
  buildDate: "2026-08-06",
  environment: "local",
  authProvider: "demo",

  // "localStorage" keeps the current application behavior.
  // Change to "sharePoint" only after Microsoft sign-in is configured.
  dataProvider: "localStorage",

  // When true, a SharePoint startup/authentication failure automatically
  // falls back to the existing LocalStorage provider instead of stopping.
  allowLocalFallback: true,

  sharePoint: Object.freeze({
    siteUrl: "https://ahtglobalteam.sharepoint.com/sites/NewburyNorth",
    lists: Object.freeze({
      projects: "Projects",
      deliverables: "Deliverables",
      informationRequired: "Information Required",
      changeLog: "Change Log"
    })
  }),

  backupFormatVersion: 2
});
