# AHT Project Control

Standalone project-status dashboard for AHT. The browser application remains separate from SharePoint; SharePoint Lists are the planned shared production data source.

## Current architecture

- Frontend: static HTML, CSS, and JavaScript
- Development: GitHub Codespaces
- Local test server: `python3 -m http.server 8000`
- Current authentication: temporary demo/local login
- Current data source: LocalStorage
- Production authentication: Microsoft Entra ID / Microsoft SSO (pending)
- Production data source: SharePoint Lists (provider prepared; activation pending)
- Production hosting: pending

## Local development

From the repository root:

```bash
python3 -m http.server 8000
```

Use a second terminal for Git commands. In Safari, hard-refresh with `Option + Command + R`.

## Production handoff

Start with:

- `docs/entra-hosting-handoff.md`
- `docs/deployment-checklist.md`
- `docs/sharepoint-schema.md`
- `tools/SHAREPOINT-SETUP.md`

All non-secret environment-specific application values are centralized in `js/config.js`.

Do not place client secrets, passwords, service keys, or certificates in browser JavaScript or the Git repository.
