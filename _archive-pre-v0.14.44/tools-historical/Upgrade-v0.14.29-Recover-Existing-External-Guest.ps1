# Upgrade-v0.14.29-Recover-Existing-External-Guest.ps1
# Makes external invitations resilient:
# - detects an existing Entra guest by email instead of blindly inviting again
# - repairs/configures dashboard access for that existing guest
# - captures/displays a new guest's redemption URL immediately, before group assignment
# - adds an "Open Outlook Draft" button so a manually obtained/pasted redemption link can be used
# - preserves the v0.14.28 retry/backoff group-assignment behavior

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.29 - Recover Existing External Guest"
Write-Host ""

$files = @("index.html","js/microsoft-access.js","js/config.js")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.29-existing-guest-$stamp"

foreach ($file in $files) {
    if (-not (Test-Path $file)) { throw "Missing required file: $file" }
    $dest = Join-Path $backupDir $file
    $destDir = Split-Path $dest -Parent
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    Copy-Item $file $dest -Force
}

Write-Host "BACKUP:" $backupDir

function Replace-Exact {
    param(
        [string]$Path,
        [string]$Old,
        [string]$New,
        [string]$Label
    )

    $text = Get-Content $Path -Raw

    if ($text.Contains($New)) {
        Write-Host "SKIP:" $Label "(already applied)"
        return
    }

    if (-not $text.Contains($Old)) {
        throw "Could not find expected code for '$Label' in $Path"
    }

    $text = $text.Replace($Old,$New)
    Set-Content $Path $text -NoNewline
    Write-Host "PATCH:" $Label
}

# ------------------------------------------------------------------
# 1. Keep an invite context in browser memory for Outlook handoff
# ------------------------------------------------------------------
$oldState = @'
  let directoryMembers = [];
  let sharedProfiles = {};
  let profileExtensionExists = false;
  let lastRedeemUrl = "";
'@

$newState = @'
  let directoryMembers = [];
  let sharedProfiles = {};
  let profileExtensionExists = false;
  let lastRedeemUrl = "";
  let lastInviteContext = null;
'@

Replace-Exact "js/microsoft-access.js" $oldState $newState "Add invite context state"

# ------------------------------------------------------------------
# 2. Make invitation link editable and add explicit Outlook button
# ------------------------------------------------------------------
$oldUi = @'
            <div id="inviteRedeemArea" class="invite-redeem hidden">
              <div class="small"><strong>Invitation link</strong> — Outlook should open a ready-to-send draft automatically. Use Copy Link below as a fallback.</div>
              <div class="redeem-row"><input id="inviteRedeemLink" readonly /><button class="btn" id="copyRedeemLinkBtn" type="button">Copy Link</button></div>
            </div>
'@

$newUi = @'
            <div id="inviteRedeemArea" class="invite-redeem hidden">
              <div class="small"><strong>Invitation link</strong> — new invitations populate this automatically. For an existing pending guest, paste a Microsoft redemption link here if needed.</div>
              <div class="redeem-row">
                <input id="inviteRedeemLink" placeholder="Microsoft invitation / redemption link" />
                <button class="btn" id="copyRedeemLinkBtn" type="button">Copy Link</button>
                <button class="btn" id="openInviteDraftBtn" type="button">Open Outlook Draft</button>
              </div>
            </div>
'@

Replace-Exact "index.html" $oldUi $newUi "Add manual Outlook draft action"

# ------------------------------------------------------------------
# 3. Add exact guest lookup helper before Outlook helper
# ------------------------------------------------------------------
$oldHelper = @'
  function openExternalInviteDraft({ email, name, projects, redeemUrl }) {
'@

$newHelper = @'
  async function findExistingExternalGuest(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;

    const safe = normalized.replace(/'/g, "''");
    const filter = encodeURIComponent(`mail eq '${safe}'`);
    const data = await graph(
      `/users?$filter=${filter}&$select=id,displayName,mail,userPrincipalName,userType,accountEnabled`
    );

    return (data?.value || []).find(user =>
      String(user.userType || "").toLowerCase() === "guest" &&
      normalizeEmail(user.mail) === normalized
    ) || null;
  }

  function openExternalInviteDraft({ email, name, projects, redeemUrl }) {
'@

Replace-Exact "js/microsoft-access.js" $oldHelper $newHelper "Add existing guest lookup"

# ------------------------------------------------------------------
# 4. Replace inviteExternal with resilient existing/new guest flow
# ------------------------------------------------------------------
$content = Get-Content "js/microsoft-access.js" -Raw
$startMarker = '  async function inviteExternal() {'
$endMarker = '  async function removeAccess(objectId) {'

$start = $content.IndexOf($startMarker)
$end = $content.IndexOf($endMarker)

if ($start -lt 0 -or $end -lt 0 -or $end -le $start) {
    throw "Could not locate inviteExternal() function boundaries."
}

$oldInviteBlock = $content.Substring($start, $end - $start)

$newInviteBlock = @'
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
    if (!projects.length) { alert("Select at least one project before sending the invitation."); return; }

    setBusy(true);
    setStatus(`Preparing external access for ${email}…`);

    try {
      await loadSharedProfiles();

      lastInviteContext = {
        email,
        name: name || email,
        projects: [...projects]
      };

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

        const redeem = el("inviteRedeemArea");
        if (redeem) {
          redeem.classList.remove("hidden");
          const link = el("inviteRedeemLink");
          if (link) link.value = "";
        }

        setStatus(`Existing Entra guest found for ${email}. Repairing dashboard access…`);
      } else {
        const invitation = await graph("/invitations", {
          method: "POST",
          body: JSON.stringify({
            invitedUserEmailAddress: email,
            invitedUserDisplayName: name || email,
            inviteRedirectUrl: APP_CONFIG.hosting.publicUrl || window.location.origin,

            // Project Control hands the returned redemption URL to Outlook.
            // Do not rely on Microsoft's system-generated invitation email.
            sendInvitationMessage: false
          })
        });

        objectId = invitation?.invitedUser?.id || "";
        if (!objectId) {
          throw new Error("Microsoft created the invitation but did not return a guest user ID.");
        }

        // Capture/show the redemption link immediately. If a later provisioning
        // step fails, the administrator still has the activation link.
        lastRedeemUrl = invitation.inviteRedeemUrl || "";

        const redeem = el("inviteRedeemArea");
        if (redeem) {
          redeem.classList.toggle("hidden", !lastRedeemUrl);
          const link = el("inviteRedeemLink");
          if (link) link.value = lastRedeemUrl;
        }
      }

      // Save role/projects before group membership is granted.
      await saveProfileForObject(objectId, {
        role,
        projects,
        company: company || "External",
        name: name || email,
        email
      });

      // v0.14.28 addMemberObjectId() includes propagation retry/backoff.
      await addMemberObjectId(objectId);

      if (emailInput) emailInput.value = "";
      if (nameInput) nameInput.value = "";
      if (companyInput) companyInput.value = "";
      el("externalInviteProjects")
        ?.querySelectorAll('input[type="checkbox"]')
        .forEach(x => x.checked = false);

      await refresh();

      if (existingGuest) {
        setStatus(
          `Existing guest access was configured for ${email}. Paste a Microsoft redemption link above, then click Open Outlook Draft.`,
          "success"
        );
      } else if (lastRedeemUrl) {
        setStatus(
          `Invitation created and access configured for ${email}. Opening Outlook draft…`,
          "success"
        );

        openExternalInviteDraft({
          email,
          name: name || email,
          projects,
          redeemUrl: lastRedeemUrl
        });
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

if ($oldInviteBlock.Contains("findExistingExternalGuest(email)")) {
    Write-Host "SKIP: Resilient external invite flow already applied."
} else {
    $content = $content.Substring(0,$start) + $newInviteBlock + $content.Substring($end)
    Set-Content "js/microsoft-access.js" $content -NoNewline
    Write-Host "PATCH: Existing/new guest recovery flow"
}

# ------------------------------------------------------------------
# 5. Add explicit Open Outlook Draft button handler
# ------------------------------------------------------------------
$oldCopyFunction = @'
  async function copyRedeemLink() {
    const link = el("inviteRedeemLink")?.value || lastRedeemUrl;
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setStatus("Invitation redemption link copied.", "success"); }
    catch { prompt("Copy this redemption link:", link); }
  }

'@

$newCopyFunction = @'
  async function copyRedeemLink() {
    const link = el("inviteRedeemLink")?.value || lastRedeemUrl;
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setStatus("Invitation redemption link copied.", "success"); }
    catch { prompt("Copy this redemption link:", link); }
  }

  function openCurrentInviteDraft() {
    const link = String(el("inviteRedeemLink")?.value || lastRedeemUrl || "").trim();

    if (!lastInviteContext?.email) {
      alert("Invite or select an external user first so Project Control knows who the draft is for.");
      return;
    }

    if (!link) {
      alert("Paste or generate a Microsoft invitation link first.");
      return;
    }

    openExternalInviteDraft({
      ...lastInviteContext,
      redeemUrl: link
    });
  }

'@

Replace-Exact "js/microsoft-access.js" $oldCopyFunction $newCopyFunction "Add manual Outlook opener"

# ------------------------------------------------------------------
# 6. Wire the new button
# ------------------------------------------------------------------
$oldInit = @'
    el("copyRedeemLinkBtn")?.addEventListener("click", copyRedeemLink);
'@

$newInit = @'
    el("copyRedeemLinkBtn")?.addEventListener("click", copyRedeemLink);
    el("openInviteDraftBtn")?.addEventListener("click", openCurrentInviteDraft);
'@

Replace-Exact "js/microsoft-access.js" $oldInit $newInit "Wire Open Outlook Draft button"

# ------------------------------------------------------------------
# 7. Version bump
# ------------------------------------------------------------------
$config = Get-Content "js/config.js" -Raw

if ($config -match 'version:\s*"0\.14\.29"') {
    Write-Host "SKIP: Version already 0.14.29"
}
elseif ($config -match 'version:\s*"0\.14\.28"') {
    $config = $config -replace 'version:\s*"0\.14\.28"', 'version: "0.14.29"'
    Set-Content "js/config.js" $config -NoNewline
    Write-Host "PATCH: Version 0.14.29"
}
else {
    Write-Warning "Current version is not 0.14.28. Check js/config.js before commit."
}

Write-Host ""
Write-Host "v0.14.29 existing-guest recovery patch complete."
Write-Host ""
Write-Host "IMPORTANT:"
Write-Host "  - New guests: invitation link is captured immediately and Outlook opens automatically."
Write-Host "  - Existing guests: dashboard access is repaired/configured without creating a duplicate guest."
Write-Host "  - Existing guests cannot get a fresh redemption URL from this app without User.ReadWrite.All."
Write-Host "    Paste a Microsoft-provided redemption link into the Invitation Link field, then click Open Outlook Draft."
Write-Host ""
Write-Host "DO NOT COMMIT YET."
Write-Host "Run:"
Write-Host "  node --check js/microsoft-access.js"
Write-Host "  git diff --check"
