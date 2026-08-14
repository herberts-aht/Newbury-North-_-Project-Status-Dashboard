# v0.15 Azure Managed API Setup

The v0.15 architecture keeps external viewers out of SharePoint while serving live project data through the Azure Static Web Apps managed API.

## What stays where

- Microsoft Entra / MSAL: user sign-in and Entra access-group administration.
- Azure Static Web Apps managed API: verifies the signed-in Microsoft identity and enforces dashboard role/project access.
- SharePoint: project data plus the private `Dashboard Access` list.
- Browser: no client secret and no app-only SharePoint credential.

## One-time Microsoft admin requirement

Use the existing Project Control Entra app registration (`bf827b7e-aede-449e-bdfa-e6cee3dad6ca`) unless AHT IT prefers a dedicated backend registration.

1. Add Microsoft Graph **Application** permission `Sites.Selected`.
2. Grant tenant admin consent.
3. Create a client secret for server-side Azure API use.
4. Grant that application **Write** access to only the SharePoint site `https://ahtglobalteam.sharepoint.com/sites/NewburyNorth`.

The client secret must be placed only in Azure Static Web App environment variables; never put it in `js/config.js` or GitHub.

## Azure Static Web App environment variables

Under Azure Portal > Newbury-North-Project-Control > Environment variables, add:

- `TENANT_ID` = `5a5d8945-36e4-407e-89ba-5e5cc456ff3b`
- `SHAREPOINT_CLIENT_ID` = the app registration client ID used for the backend
- `SHAREPOINT_CLIENT_SECRET` = the secret value created for the backend
- `SHAREPOINT_SITE_URL` = `https://ahtglobalteam.sharepoint.com/sites/NewburyNorth`
- `DASHBOARD_ACCESS_LIST` = `Dashboard Access`
- `BOOTSTRAP_ADMIN_EMAILS` = `stace@ahtglobal.com`

## Deployment

The GitHub workflow now contains `api_location: api`. A push to `main` deploys both the static dashboard and the managed Functions API.

The API verifies each caller by using the caller's delegated `User.Read` token against Microsoft Graph `/me`. It then loads that user's dashboard profile from the private SharePoint `Dashboard Access` list and filters project data before returning it.
