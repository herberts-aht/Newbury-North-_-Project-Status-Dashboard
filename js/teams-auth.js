let msalInstance;

async function completeTeamsAuthentication(tokenResponse) {
  const account =
    tokenResponse?.account;

  if(
    !tokenResponse?.accessToken ||
    !account
  ){
    throw new Error(
      "Microsoft authentication completed without a usable account or access token."
    );
  }

  await microsoftTeams.authentication.notifySuccess(
    JSON.stringify({
      accessToken:
        tokenResponse.accessToken,

      account: {
        username:
          account.username,

        name:
          account.name
      }
    })
  );
}


async function startTeamsAuthentication() {
  await microsoftTeams.app.initialize();

  const params =
    new URLSearchParams(
      window.location.search
    );

  const teamsLoginHint =
    String(
      params.get("loginHint") || ""
    ).trim();

  msalInstance =
    new msal.PublicClientApplication({
      auth: {
        clientId:
          APP_CONFIG.entra.clientId,

        authority:
          `https://login.microsoftonline.com/${APP_CONFIG.entra.tenantId}`,

        redirectUri:
          `${window.location.origin}/teams-auth.html`
      },

      cache: {
        /*
         * Keep the production cache behavior unchanged.
         * The improvement here is the Teams identity hint,
         * not a browser-storage change.
         */
        cacheLocation:
          "sessionStorage"
      }
    });

  const redirectResult =
    await msalInstance.handleRedirectPromise();

  /*
   * Returning from an interactive redirect.
   */
  if(redirectResult?.account){
    const tokenResponse =
      await msalInstance.acquireTokenSilent({
        scopes:
          APP_CONFIG.entra.scopes,

        account:
          redirectResult.account
      });

    await completeTeamsAuthentication(
      tokenResponse
    );

    return;
  }

  /*
   * Teams already knows which user is signed in.
   * Try that identity silently before opening any
   * Microsoft account-selection experience.
   */
  if(teamsLoginHint){
    try{
      const silentResult =
        await msalInstance.ssoSilent({
          scopes:
            APP_CONFIG.entra.scopes,

          loginHint:
            teamsLoginHint
        });

      await completeTeamsAuthentication(
        silentResult
      );

      return;

    }catch(error){
      console.info(
        "Teams silent SSO requires interaction.",
        error
      );
    }
  }

  /*
   * Interactive fallback.
   *
   * When Teams supplied a loginHint, do NOT use
   * prompt=select_account because that explicitly
   * forces the account picker.
   */
  await msalInstance.loginRedirect({
    scopes:
      APP_CONFIG.entra.scopes,

    ...(teamsLoginHint
      ? {
          loginHint:
            teamsLoginHint
        }
      : {
          prompt:
            "select_account"
        }
    )
  });
}


startTeamsAuthentication().catch(error => {
  console.error(
    "Teams authentication failed:",
    error
  );

  microsoftTeams.authentication.notifyFailure(
    error?.message ||
    "Microsoft sign-in failed."
  );
});
