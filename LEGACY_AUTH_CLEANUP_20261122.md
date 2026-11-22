# AHT Project Control — legacy authentication cleanup

Date: 2026-11-22. This change accompanies the Wi-Fi Heat Map review branch.

## What was retired

- Browser-delivered shared-password demo authentication and its local session path.
- The legacy User/Password form on the sign-in screen.
- The temporary password selection in the administration form.
- Writes of unused `passwordProfile` fields for new or updated user records.
- 82 tracked dashboard/auth backup snapshots that still contained the old temporary
  credentials. These snapshots were **deleted from this branch's current tree**;
  they remain recoverable from the Git commit history.

## What was preserved

- The production Microsoft Entra/MSAL authentication provider, Teams NAA fallback,
  Microsoft access tokens, and SharePoint data workflow.
- Existing user roles, membership, project assignments, and access-management UI.
- The ability to recover any deleted historical snapshot using Git history.
- `authProvider: "microsoft"` is now the sole supported sign-in mode. Other values
  intentionally fail closed during authentication startup.

## Security follow-up

The GitHub repository is public. Removing credentials from the current tree does
**not** erase copies already present in old Git commits, forks, or deployments.
If any retired temporary credential was reused in another service, rotate it.
Permanent history rewriting requires a separate coordinated approval because it
changes commit IDs and can disrupt existing Codespaces checkouts and pull requests.

## Review checklist before merge

1. Start a preview on a separate checkout; open the dashboard and confirm the
   **Sign in with Microsoft** button is displayed without a password form.
2. Sign in with an authorized Entra user and confirm the project data loads.
3. Open **Administration** and verify existing user role, active state, and
   project-assignment editing still work.
4. Confirm the Wi-Fi Heat Map pilot works with a PDF and that CCTV pole handoff
   preserves locations on the same drawing.
5. Run: `node --test tools/tests/aht-microsoft-auth-only.test.cjs tools/tests/aht-wifi-coverage.test.cjs`.

The review branch does not deploy to the live website until merged into `main`.
