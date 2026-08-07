# AHT Project Control — Entra + Hosting Handoff

## What this application is

AHT Project Control is a static browser application made from HTML, CSS, and JavaScript. SharePoint Lists are the shared data source. The application itself is intentionally hosted separately from SharePoint.

No server-side application runtime is required for the current design.

## Current status

The application is intentionally still configured for:

- `authProvider: "demo"`
- `dataProvider: "localStorage"`

This keeps the working dashboard unchanged while AHT IT completes Entra registration and hosting.

The SharePoint data provider and the SharePoint list-creation script are already in the repository, but live SharePoint mode is not enabled yet.

---

# 1. What we need from AHT IT for Microsoft Entra

## Dashboard SPA registration

Please register the dashboard as a **Single-page application (SPA)**.

Provide:

1. **Directory (tenant) ID**
2. **Application (client) ID**
3. Approved SPA redirect URI(s)
4. Confirmation of the delegated SharePoint permissions approved for the app
5. Whether user/admin consent is required in the AHT tenant

The browser application must **not** receive or store a client secret.

### Redirect URI

The production redirect URI cannot be finalized until hosting supplies the final HTTPS application URL.

For temporary testing, a Codespaces HTTPS URL can be registered if AHT policy permits it. The exact URI must match what is configured in Entra.

### SharePoint permissions

The dashboard currently calls SharePoint REST directly.

Initial read-only testing needs a SharePoint delegated permission such as:

- `AllSites.Read`

Write-back will require a SharePoint delegated permission such as:

- `AllSites.Write`

Delegated permissions do not replace the signed-in user's SharePoint permissions; the signed-in user must also be allowed to access the site.

Target SharePoint site:

`https://ahtglobalteam.sharepoint.com/sites/NewburyNorth`

## PnP setup authentication

The one-time PowerShell setup tool is:

`tools/Create-AHTDashboard.ps1`

PnP PowerShell requires an approved Entra client ID for interactive login. Because the setup script creates lists, fields, views, indexes, and lookup relationships, the PnP registration may require broader delegated SharePoint rights than the day-to-day dashboard.

It is acceptable—and cleaner—to use a separate temporary/admin PnP registration instead of giving the dashboard SPA broad administrative permission.

---

# 2. What we need from Hosting

The application only needs static HTTPS hosting.

Required:

- HTTPS
- Serve `index.html`
- Serve static `.js`, `.css`, `.svg`, and `.json` assets
- Preserve the repository folder structure
- A stable production URL
- Ability to serve an Entra/MSAL redirect page when authentication is added
- No forced authentication layer in front of the site unless coordinated with the app's Entra login

Not required by the current application:

- Node.js server
- PHP
- Python runtime
- SQL database
- File-upload storage
- Server-side session state

## Hosting information to return

Please provide:

1. Final public HTTPS URL
2. Whether the app is hosted at the hostname root or under a path
3. Any required deployment process (GitHub Actions, manual upload, Azure deployment, etc.)
4. Any security headers automatically injected by the platform
5. Any restrictions on static files or redirects

---

# 3. Values we will populate after handoff

All non-secret environment values are centralized in:

`js/config.js`

The fields waiting for production information are:

- `APP_CONFIG.hosting.publicUrl`
- `APP_CONFIG.hosting.basePath`
- `APP_CONFIG.entra.tenantId`
- `APP_CONFIG.entra.clientId`
- `APP_CONFIG.entra.redirectUri`

We will not enable Microsoft authentication or SharePoint mode until those values are supplied and tested.

---

# 4. Planned activation sequence

1. Hosting supplies the final HTTPS URL.
2. IT adds the exact SPA redirect URI to the Entra registration.
3. Tenant ID and Client ID are placed in `js/config.js`.
4. Microsoft/MSAL authentication is enabled.
5. A read-only SharePoint connection is tested.
6. The SharePoint Lists are created/verified with the PnP setup script.
7. `dataProvider` is changed from `localStorage` to `sharePoint`.
8. Read-only behavior is validated.
9. SharePoint write-back is enabled and tested.
10. Temporary demo login is removed before production release.

This sequence intentionally keeps the existing local dashboard working until the production dependencies are ready.
