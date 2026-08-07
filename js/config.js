

// Non-secret application configuration.
//
// This file is intentionally the single place for environment-specific values.
// Never place passwords, client secrets, service keys, certificates, or other
// private credentials in browser-delivered JavaScript.

const APP_CONFIG = Object.freeze({
  appName: "AHT Project Control",
  version: "0.11.0",
  buildDate: "2026-08-07",

  // Development stays fully local until Entra and hosting are approved.
  environment: "development",

  // Supported values today:
  //   "demo"      = temporary local login
  //   "microsoft" = reserved for Entra/MSAL integration
  authProvider: "demo",

  // "localStorage" preserves the current dashboard behavior.
  // Change to "sharePoint" only after Microsoft authentication is configured
  // and the SharePoint read-only connection test passes.
  dataProvider: "localStorage",

  // During the first SharePoint tests, a failed SharePoint load can fall back
  // to the existing local data instead of making the dashboard unusable.
  allowLocalFallback: true,

  hosting: Object.freeze({
    // Final HTTPS origin supplied by whoever hosts the static application.
    // Example: "https://projectcontrol.ahtglobal.com"
    publicUrl: "",

    // Keep "/" when hosted at the root of a hostname.
    // If IT hosts under a sub-path, record that path here before deployment.
    basePath: "/"
  }),

  entra: Object.freeze({
    // Non-secret identifiers supplied by AHT IT.
    tenantId: "",
    clientId: "",

    // Must exactly match an Entra SPA redirect URI once Microsoft sign-in is enabled.
    // Leave blank until the hosting URL is known.
    redirectUri: "",

    // The dashboard currently calls SharePoint REST directly, not Microsoft Graph.
    // Authentication code will request the appropriate SharePoint delegated scope
    // when Entra integration is enabled.
    sharePointReadScope:
      "https://ahtglobalteam.sharepoint.com/AllSites.Read",
    sharePointWriteScope:
      "https://ahtglobalteam.sharepoint.com/AllSites.Write"
  }),

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
