let msalInstance;

async function startTeamsAuthentication() {
  await microsoftTeams.app.initialize();

  msalInstance = new msal.PublicClientApplication({
    auth: {
      clientId: APP_CONFIG.entra.clientId,
      authority: `https://login.microsoftonline.com/${APP_CONFIG.entra.tenantId}`,
      redirectUri: `${window.location.origin}/teams-auth.html`
    },
    cache: {
      cacheLocation: "sessionStorage"
    }
  });

  const redirectResult = await msalInstance.handleRedirectPromise();

  if (redirectResult?.account) {
    const tokenResponse = await msalInstance.acquireTokenSilent({
      scopes: APP_CONFIG.entra.scopes,
      account: redirectResult.account
    });

    await microsoftTeams.authentication.notifySuccess(
      JSON.stringify({
        accessToken: tokenResponse.accessToken,
        account: {
          username: redirectResult.account.username,
          name: redirectResult.account.name
        }
      })
    );
    return;
  }

  await msalInstance.loginRedirect({
    scopes: APP_CONFIG.entra.scopes,
    prompt: "select_account"
  });
}

startTeamsAuthentication().catch(error => {
  console.error("Teams authentication failed:", error);

  microsoftTeams.authentication.notifyFailure(
    error?.message || "Microsoft sign-in failed."
  );
});
