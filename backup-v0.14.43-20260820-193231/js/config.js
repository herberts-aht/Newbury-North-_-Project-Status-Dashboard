

// Non-secret application configuration.
//
// This file is intentionally the single place for environment-specific values.
// Never place passwords, client secrets, service keys, certificates, or other
// private credentials in browser-delivered JavaScript.

const APP_CONFIG = Object.freeze({
  appName: "AHT Project Control",
  version: "0.14.43",
  buildDate: "2026-08-14",

  // Development stays fully local until Entra and hosting are approved.
  environment: "production",

  // Supported values today:
  //   "demo"      = temporary local login
  //   "microsoft" = reserved for Entra/MSAL integration
  authProvider: "microsoft",

  // "localStorage" preserves the current dashboard behavior.
  // Change to "sharePoint" only after Microsoft authentication is configured
  // and the SharePoint read-only connection test passes.
  dataProvider: "sharePoint",

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
    tenantId: "5a5d8945-36e4-407e-89ba-5e5cc456ff3b",
    clientId: "bf827b7e-aede-449e-bdfa-e6cee3dad6ca",

    // Must exactly match an Entra SPA redirect URI once Microsoft sign-in is enabled.
    // Leave blank until the hosting URL is known.
    redirectUri: "", // blank = use the current browser origin (localhost or Codespaces)

    // Microsoft Graph delegated scopes configured on the Entra app.
    // No client secret is used by this browser application.
    scopes: Object.freeze(["User.Read", "Sites.ReadWrite.All", "Group.Read.All"]),

    // Accounts listed here receive the existing dashboard Administrator profile.
    // Other AHT accounts are matched to a configured dashboard user by email/name,
    // Entra Members otherwise receive a safe AHT Internal profile. Entra Guests are External and receive no project access until assigned.
    adminEmails: Object.freeze(["stace@ahtglobal.com"]),

    // Dedicated Entra Security Group assigned to the Enterprise Application.
    // Membership in this group is the gate for dashboard access.
    accessGroupId: "cb2b8e45-9b5b-4cb3-a24d-4ca2f3c63d69",

    // Existing Entra group already nested in "Newbury North Members" in SharePoint.
    // Editor / Administrator roles are synchronized into this group for Edit rights.
    editAccessGroupId: "52c62197-dae3-4b48-be7f-11c3c875cffc",

    // Requested only by the Admin > Microsoft Access tools.
    accessManagementScopes: Object.freeze([
      "User.ReadBasic.All",
      "User.Invite.All",
      "GroupMember.ReadWrite.All",
      "Group.ReadWrite.All"
    ]),

    // Shared dashboard-specific role/project assignments are stored on the
    // dedicated access group as a Microsoft Graph open extension. This keeps
    // external users out of SharePoint while making assignments available on
    // every browser/device.
    accessProfileExtensionName: "com.ahtglobal.projectcontrol.profiles",
    accessProfileReadScopes: Object.freeze(["Group.Read.All"])
  }),

  sharePoint: Object.freeze({
    siteUrl: "https://ahtglobalteam.sharepoint.com/sites/NewburyNorth",
    lists: Object.freeze({
      projects: "Projects",
      deliverables: "Deliverables",
      informationRequired: "Information Required",
      dashboardAccess: "Dashboard Access",
      changeLog: "Change Log"
    })
  }),

  backupFormatVersion: 2
});

