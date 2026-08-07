# Deployment Checklist

This checklist is the production gate for AHT Project Control. See `entra-hosting-handoff.md` for the information AHT IT and the hosting owner need to provide.

## Current pre-production state

- [x] Dashboard operates independently as static HTML/CSS/JavaScript.
- [x] LocalStorage remains the active data source.
- [x] SharePoint provider exists but is not enabled.
- [x] SharePoint schema and PnP creation script are in the repository.
- [x] Environment-specific values are centralized in `js/config.js`.
- [ ] Production hosting URL supplied.
- [ ] Entra Tenant ID supplied.
- [ ] Entra Client/Application ID supplied.
- [ ] Production SPA redirect URI registered.
- [ ] SharePoint delegated permissions approved.

## Hosting

- [ ] Confirm final HTTPS URL.
- [ ] Confirm whether hosted at `/` or under a sub-path.
- [ ] Confirm static `.html`, `.js`, `.css`, `.svg`, and `.json` files are served normally.
- [ ] Confirm deployment ownership/process.
- [ ] Confirm any automatically injected security headers.
- [ ] Confirm the authentication redirect page can be served without incompatible headers.
- [ ] Record production URL in `APP_CONFIG.hosting`.

## Entra / authentication

- [ ] Application is registered as a Single-page application (SPA).
- [ ] Record Tenant ID in `APP_CONFIG.entra.tenantId`.
- [ ] Record Client ID in `APP_CONFIG.entra.clientId`.
- [ ] Register exact production redirect URI.
- [ ] Record redirect URI in `APP_CONFIG.entra.redirectUri`.
- [ ] Confirm approved delegated SharePoint read permission.
- [ ] Confirm approved delegated SharePoint write permission before write-back.
- [ ] Do not create or place a client secret in this browser application.
- [ ] Test sign-in with an authorized AHT account.
- [ ] Test sign-out and session restoration.
- [ ] Remove/disable temporary local passwords before production.

## SharePoint backend

- [ ] Run/verify `tools/Create-AHTDashboard.ps1` using the approved PnP client ID.
- [ ] Verify Projects list.
- [ ] Verify Deliverables list.
- [ ] Verify Information Required list.
- [ ] Verify Change Log list.
- [ ] Verify lookup relationships, indexes, views, and versioning.
- [ ] Seed only the agreed test data.
- [ ] Confirm the existing `Control Dashboard` list was not altered unintentionally.

## Read-only integration test

- [ ] Keep `allowLocalFallback: true`.
- [ ] Enable Microsoft authentication.
- [ ] Test SharePoint access token acquisition.
- [ ] Load Projects from SharePoint.
- [ ] Load Deliverables from SharePoint.
- [ ] Load Information Required from SharePoint.
- [ ] Compare dashboard output against known SharePoint records.
- [ ] Confirm Gantt and Calendar date behavior.
- [ ] Confirm visibility/status wording is unchanged.

## Write-back integration test

- [ ] Enable writes only after read-only testing passes.
- [ ] Edit a test deliverable and verify the SharePoint item.
- [ ] Edit a test information request and verify the SharePoint item.
- [ ] Confirm health override reason/expiration behavior.
- [ ] Confirm Change Log records.
- [ ] Confirm failures are surfaced clearly and do not silently lose changes.

## Production gate

- [ ] Change `environment` to `production`.
- [ ] Change `authProvider` to `microsoft`.
- [ ] Change `dataProvider` to `sharePoint`.
- [ ] Decide whether LocalStorage fallback remains allowed in production.
- [ ] Hard-refresh and perform complete smoke test.
- [ ] Test in Safari and at least one Chromium-based browser.
- [ ] Confirm no localhost/Codespaces URL is present in production configuration.
- [ ] Confirm no passwords, secrets, tokens, or certificates are committed.
- [ ] Tag the deployed Git commit.
- [ ] Record application version, deployment owner, and support contact.
