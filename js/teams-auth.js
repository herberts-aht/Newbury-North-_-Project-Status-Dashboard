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
      cacheLocation: "localStorage"
    }
  });

  const redirectResult =
    await msalInstance.handleRedirectPromise();

  const params =
    new URLSearchParams(
      window.location.search
    );

  const teamsLoginHint =
    String(
      params.get("loginHint") || ""
    ).trim();

  let account =
    redirectResult?.account ||
    msalInstance.getAllAccounts()[0] ||
    null;

  if (account) {
    msalInstance.setActiveAccount(account);

    try {
      const tokenResponse =
        await msalInstance.acquireTokenSilent({
          scopes: APP_CONFIG.entra.scopes,
          account
        });

      await microsoftTeams.authentication.notifySuccess(
        JSON.stringify({
          accessToken: tokenResponse.accessToken,
          account: {
            username: account.username,
            name: account.name
          }
        })
      );

      return;
    } catch (error) {
      console.warn(
        "Cached Teams account could not acquire a token silently.",
        error
      );
    }
  }

  /*
   * Teams already knows the signed-in user.
   * Use that identity hint before asking for any interaction.
   */
  if (teamsLoginHint) {
    try {
      const silentResult =
        await msalInstance.ssoSilent({
          scopes: APP_CONFIG.entra.scopes,
          loginHint: teamsLoginHint
        });

      account = silentResult.account;

      if (account) {
        msalInstance.setActiveAccount(account);
      }

      await microsoftTeams.authentication.notifySuccess(
        JSON.stringify({
          accessToken: silentResult.accessToken,
          account: {
            username:
              account?.username ||
              teamsLoginHint,
            name:
              account?.name || ""
          }
        })
      );

      return;

    } catch (error) {
      console.warn(
        "Teams silent SSO was not available; interactive authentication required.",
        error
      );
    }
  }

  /*
   * Interactive fallback.
   * Supply loginHint so Microsoft does NOT need to ask
   * the user which account they are using.
   */
  await msalInstance.loginRedirect({
    scopes: APP_CONFIG.entra.scopes,
    ...(teamsLoginHint
      ? { loginHint: teamsLoginHint }
      : {}
    )
  });
}

startTeamsAuthentication().catch(error => {
  console.error("Teams authentication failed:", error);

  microsoftTeams.authentication.notifyFailure(
    error?.message || "Microsoft sign-in failed."
  );
});
