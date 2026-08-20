AHT Project Control - Entra Sign-In Test Release v0.12.0

WHAT THIS RELEASE DOES
- Replaces the temporary dashboard password screen with Microsoft Entra sign-in.
- Uses the AHT tenant/client IDs configured for the Project Control app.
- Requests delegated User.Read + Sites.ReadWrite.All scopes.
- Uses authorization code + PKCE through MSAL Browser; no client secret is used.
- Keeps project data in LocalStorage for this first authentication test.
- Keeps the existing SharePoint provider scaffold untouched for the next phase.

REGISTERED DEVELOPMENT ORIGINS
- http://localhost:8000
- https://fantastic-tribble-pgqxqgp67g27x4r-8000.app.github.dev/

TEST
1. Replace the files from this ZIP in the project.
2. Start: python3 -m http.server 8000
3. Open the Codespaces forwarded port 8000 URL.
4. Hard refresh.
5. Click Sign in with Microsoft.
6. Use your AHT Global account.
7. If Microsoft requests consent for Sites.ReadWrite.All, review and accept if allowed by AHT policy.

EXPECTED
- Microsoft popup completes.
- Dashboard opens using the existing local project data.
- Stacy's configured AHT account maps to the existing Administrator dashboard profile.

NOT YET ENABLED
- SharePoint list reads/writes. That is the next controlled test after authentication succeeds.
