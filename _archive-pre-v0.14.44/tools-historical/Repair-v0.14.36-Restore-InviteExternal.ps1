# Repair-v0.14.36-Restore-InviteExternal.ps1
# Restores the missing inviteExternal() function left by the partial .36 patch
# and completes the Safari-safe two-step Outlook flow.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.36 - Restore inviteExternal"
Write-Host ""

$path = "js/microsoft-access.js"
$configPath = "js/config.js"

foreach ($file in @($path,$configPath)) {
    if (-not (Test-Path $file)) { throw "Missing required file: $file" }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.36-restore-invite-$stamp"
New-Item -ItemType Directory -Path "$backupDir/js" -Force | Out-Null
Copy-Item $path "$backupDir/js/microsoft-access.js" -Force
Copy-Item $configPath "$backupDir/js/config.js" -Force
Write-Host "BACKUP: $backupDir"

$content = Get-Content $path -Raw

# ---------------------------------------------------------------
# 1. Restore inviteExternal immediately before copyRedeemLink()
# ---------------------------------------------------------------
if ($content.Contains('async function inviteExternal()')) {
    Write-Host "SKIP: inviteExternal() already exists."
} else {
    $anchor = '  async function copyRedeemLink() {'
    if (-not $content.Contains($anchor)) {
        throw "Could not find copyRedeemLink() insertion anchor."
    }

    $invite = @'
  async function inviteExternal() {
    const emailInput = el("externalInviteEmail");
    const nameInput = el("externalInviteName");
    const companyInput = el("externalInviteCompany");
    const email = normalizeEmail(emailInput?.value);
    const name = String(nameInput?.value || "").trim();
    const company = String(companyInput?.value || "").trim();
    const role = "External Viewer";
    const projects = selectedProjects("externalInviteProjects");

    if (!email) { alert("Enter the external user's email address."); return; }
    if (!projects.length) { alert("Select at least one project before creating the invitation."); return; }

    setBusy(true);
    setStatus(`Preparing external access for ${email}…`);

    try {
      await loadSharedProfiles();

      let objectId = "";
      let existingGuest = null;

      try {
        existingGuest = await findExistingExternalGuest(email);
      } catch (lookupError) {
        console.warn("Existing guest lookup failed; continuing with normal invitation flow.", lookupError);
      }

      if (existingGuest?.id) {
        objectId = existingGuest.id;
        lastRedeemUrl = "";

        setInviteReadyContext({
          email,
          name,
          projects,
          redeemUrl: ""
        });

        setStatus(`Existing Entra guest found for ${email}. Repairing dashboard access…`);
      } else {
        const invitation = await graph("/invitations", {
          method: "POST",
          body: JSON.stringify({
            invitedUserEmailAddress: email,
            invitedUserDisplayName: name || email,
            inviteRedirectUrl: APP_CONFIG.hosting.publicUrl || window.location.origin,
            sendInvitationMessage: false
          })
        });

        objectId = invitation?.invitedUser?.id || "";
        if (!objectId) {
          throw new Error("Microsoft created the invitation but did not return a guest user ID.");
        }

        lastRedeemUrl = invitation.inviteRedeemUrl || "";

        setInviteReadyContext({
          email,
          name,
          projects,
          redeemUrl: lastRedeemUrl
        });
      }

      await saveProfileForObject(objectId, {
        role,
        projects,
        company: company || "External",
        name: name || email,
        email
      });

      await addMemberObjectId(objectId);

      // Do not auto-open Outlook here. The separate button is intentionally
      // a fresh user click so Safari can hand mailto: to native Outlook.
      if (emailInput) emailInput.value = "";
      if (nameInput) nameInput.value = "";
      if (companyInput) companyInput.value = "";
      el("externalInviteProjects")
        ?.querySelectorAll('input[type="checkbox"]')
        .forEach(x => x.checked = false);

      await refresh();

      if (existingGuest) {
        setStatus(
          `Existing guest access was configured for ${email}. Paste the Microsoft redemption link above, then click Open Outlook Draft.`,
          "success"
        );
      } else if (lastRedeemUrl) {
        setStatus(
          `Invitation created and access configured for ${email}. Click Open Outlook Draft when ready.`,
          "success"
        );
      } else {
        setStatus(
          `Invitation created for ${email}, but Microsoft did not return an invitation link.`,
          "error"
        );
      }
    } catch (error) {
      console.error(error);
      setStatus(`Could not invite external user: ${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

'@

    $content = $content.Replace($anchor, $invite + $anchor)
    Set-Content $path $content -NoNewline
    Write-Host "PATCH: Restored inviteExternal()"
}

# ---------------------------------------------------------------
# 2. Replace openCurrentInviteDraft() using known current boundaries
# ---------------------------------------------------------------
$content = Get-Content $path -Raw
$startMarker = '  function openCurrentInviteDraft() {'
$endMarker = '  function onAdminView() {'
$start = $content.IndexOf($startMarker)
$end = $content.IndexOf($endMarker)

if ($start -lt 0 -or $end -lt 0 -or $end -le $start) {
    throw "Could not locate openCurrentInviteDraft() boundaries."
}

$newDraft = @'
  function openCurrentInviteDraft() {
    const area = el("inviteRedeemArea");
    const email = normalizeEmail(area?.dataset?.inviteEmail);
    const name = String(area?.dataset?.inviteName || "").trim();

    let projects = [];
    try {
      projects = JSON.parse(area?.dataset?.inviteProjects || "[]");
    } catch {
      projects = [];
    }

    const link = String(el("inviteRedeemLink")?.value || lastRedeemUrl || "").trim();

    if (!email) {
      alert("No prepared invitation is available yet. Create or configure the external invitation first.");
      return;
    }

    if (!projects.length) {
      alert("No projects are stored for this invitation.");
      return;
    }

    if (!link) {
      alert("Paste or generate a Microsoft invitation link first.");
      return;
    }

    openExternalInviteDraft({
      email,
      name,
      projects,
      redeemUrl: link
    });
  }

'@

$content = $content.Substring(0,$start) + $newDraft + $content.Substring($end)
Set-Content $path $content -NoNewline
Write-Host "PATCH: Open Outlook Draft now uses the Invitation Ready panel context."

# ---------------------------------------------------------------
# 3. Version
# ---------------------------------------------------------------
$config = Get-Content $configPath -Raw
if ($config -match 'version:\s*"0\.14\.36"') {
    Write-Host "SKIP: Version already 0.14.36"
}
elseif ($config -match 'version:\s*"0\.14\.35"') {
    $config = $config -replace 'version:\s*"0\.14\.35"', 'version: "0.14.36"'
    Set-Content $configPath $config -NoNewline
    Write-Host "PATCH: Version 0.14.36"
}
else {
    Write-Warning "Unexpected current version. Check js/config.js before commit."
}

# ---------------------------------------------------------------
# 4. Basic safety checks
# ---------------------------------------------------------------
$final = Get-Content $path -Raw

if (-not $final.Contains('async function inviteExternal()')) {
    throw "Safety check failed: inviteExternal() is still missing."
}

$inviteStart = $final.IndexOf('  async function inviteExternal() {')
$inviteEnd = $final.IndexOf('  async function copyRedeemLink() {')
if ($inviteStart -lt 0 -or $inviteEnd -le $inviteStart) {
    throw "Safety check failed: restored inviteExternal() boundaries are invalid."
}
$inviteBlock = $final.Substring($inviteStart,$inviteEnd-$inviteStart)

if ($inviteBlock.Contains('openExternalInviteDraft(')) {
    throw "Safety check failed: inviteExternal() still auto-opens Outlook."
}

Write-Host "CHECK: inviteExternal() restored."
Write-Host "CHECK: inviteExternal() does not auto-open Outlook."
Write-Host ""
Write-Host "Repair complete."
Write-Host ""
Write-Host "Now run:"
Write-Host "  node --check js/microsoft-access.js"
Write-Host "  git diff --check"
Write-Host ""
Write-Host "Do not commit yet."
