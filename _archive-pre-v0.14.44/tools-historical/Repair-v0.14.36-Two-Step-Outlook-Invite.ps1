# Repair-v0.14.36-Two-Step-Outlook-Invite.ps1
# Repairs the partially-applied v0.14.36 patch by replacing inviteExternal()
# and openCurrentInviteDraft() by function boundaries instead of exact text matching.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.36 - Two-Step Outlook Invite REPAIR"
Write-Host ""

$files = @("index.html","js/microsoft-access.js","js/config.js")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.36-repair-$stamp"

foreach ($file in $files) {
    if (-not (Test-Path $file)) { throw "Missing required file: $file" }
    $dest = Join-Path $backupDir $file
    $destDir = Split-Path $dest -Parent
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    Copy-Item $file $dest -Force
}
Write-Host "BACKUP: $backupDir"

function Replace-FunctionBlock {
    param(
        [string]$Path,
        [string]$StartMarker,
        [string]$EndMarker,
        [string]$Replacement,
        [string]$Label
    )

    $text = Get-Content $Path -Raw
    $start = $text.IndexOf($StartMarker)
    $end = $text.IndexOf($EndMarker)

    if ($start -lt 0 -or $end -lt 0 -or $end -le $start) {
        throw "Could not locate function boundaries for '$Label'."
    }

    $text = $text.Substring(0,$start) + $Replacement + $text.Substring($end)
    Set-Content $Path $text -NoNewline
    Write-Host "PATCH: $Label"
}

# ------------------------------------------------------------------
# 1. Ensure ready-panel helper exists (the failed .36 already added it,
#    but this keeps repair safe if rerun from a slightly different state)
# ------------------------------------------------------------------
$content = Get-Content "js/microsoft-access.js" -Raw

if (-not $content.Contains('function setInviteReadyContext(')) {
    $anchor = '  function openExternalInviteDraft({ email, name, projects, redeemUrl }) {'
    if (-not $content.Contains($anchor)) {
        throw "Could not find openExternalInviteDraft() anchor."
    }

    $helper = @'
  function setInviteReadyContext({ email, name, projects, redeemUrl = "" }) {
    const area = el("inviteRedeemArea");
    if (!area) return;

    const projectNames = (projects || [])
      .map(projectId => state.projects.find(project => project.id === projectId)?.name || projectId)
      .filter(Boolean);

    area.dataset.inviteEmail = normalizeEmail(email);
    area.dataset.inviteName = String(name || "").trim();
    area.dataset.inviteProjects = JSON.stringify(projects || []);

    const summary = el("inviteReadySummary");
    if (summary) {
      const who = String(name || "").trim() || email;
      const projectText = projectNames.length ? projectNames.join(", ") : "assigned project(s)";
      summary.innerHTML = `<strong>Invitation ready for ${escText(who)}.</strong> ${escText(projectText)}`;
    }

    const link = el("inviteRedeemLink");
    if (link && redeemUrl) link.value = redeemUrl;

    area.classList.remove("hidden");
  }

'@

    $content = $content.Replace($anchor, $helper + $anchor)
    Set-Content "js/microsoft-access.js" $content -NoNewline
    Write-Host "PATCH: Added invite-ready context helper"
} else {
    Write-Host "SKIP: Invite-ready context helper already present"
}

# ------------------------------------------------------------------
# 2. Replace inviteExternal() completely with the two-step flow
# ------------------------------------------------------------------
$newInvite = @'
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
        name,
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

Replace-FunctionBlock `
    -Path "js/microsoft-access.js" `
    -StartMarker '  async function inviteExternal() {' `
    -EndMarker '  async function removeAccess(objectId) {' `
    -Replacement $newInvite `
    -Label "Replace inviteExternal with two-step flow"

# ------------------------------------------------------------------
# 3. Replace Open Outlook button handler with persistent panel context
# ------------------------------------------------------------------
$newOpenDraft = @'
  function openCurrentInviteDraft() {
    const area = el("inviteRedeemArea");

    const storedEmail = normalizeEmail(area?.dataset?.inviteEmail);
    const storedName = String(area?.dataset?.inviteName || "").trim();

    let storedProjects = [];
    try {
      storedProjects = JSON.parse(area?.dataset?.inviteProjects || "[]");
    } catch {
      storedProjects = [];
    }

    const email = storedEmail || normalizeEmail(el("externalInviteEmail")?.value);
    const name = storedName || String(el("externalInviteName")?.value || "").trim();
    const projects = storedProjects.length
      ? storedProjects
      : selectedProjects("externalInviteProjects");

    const link = String(el("inviteRedeemLink")?.value || lastRedeemUrl || "").trim();

    if (!email) {
      alert("Project Control does not have an external email for this invitation.");
      return;
    }

    if (!projects.length) {
      alert("Project Control does not have any projects assigned to this invitation.");
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

Replace-FunctionBlock `
    -Path "js/microsoft-access.js" `
    -StartMarker '  function openCurrentInviteDraft() {' `
    -EndMarker '  function onAdminView() {' `
    -Replacement $newOpenDraft `
    -Label "Replace Open Outlook Draft handler"

# ------------------------------------------------------------------
# 4. Ensure ready-panel markup exists
# ------------------------------------------------------------------
$index = Get-Content "index.html" -Raw

if (-not $index.Contains('id="inviteReadySummary"')) {
    $oldPanelStart = '<div id="inviteRedeemArea" class="invite-redeem hidden">'
    if (-not $index.Contains($oldPanelStart)) {
        throw "Could not find invitation panel in index.html."
    }

    # Minimal safe replacement of the existing invitation panel.
    $pattern = '(?s)<div id="inviteRedeemArea" class="invite-redeem hidden">.*?</div>\s*</div>'
    $replacement = @'
<div id="inviteRedeemArea" class="invite-redeem hidden">
              <div class="small" id="inviteReadySummary"><strong>Invitation ready.</strong></div>
              <div class="small" style="margin-top:4px">Use the Microsoft activation link below. For an existing pending guest, paste a redemption link here if needed.</div>
              <div class="redeem-row">
                <input id="inviteRedeemLink" placeholder="Microsoft invitation / redemption link" />
                <button class="btn" id="copyRedeemLinkBtn" type="button">Copy Link</button>
                <button class="btn primary" id="openInviteDraftBtn" type="button">Open Outlook Draft</button>
              </div>
            </div>
'@
    $index = [regex]::Replace($index,$pattern,$replacement,1)
    Set-Content "index.html" $index -NoNewline
    Write-Host "PATCH: Rebuilt Invitation Ready panel"
} else {
    Write-Host "SKIP: Invitation Ready panel already present"
}

# ------------------------------------------------------------------
# 5. Version bump
# ------------------------------------------------------------------
$config = Get-Content "js/config.js" -Raw

if ($config -match 'version:\s*"0\.14\.36"') {
    Write-Host "SKIP: Version already 0.14.36"
}
elseif ($config -match 'version:\s*"0\.14\.35"') {
    $config = $config -replace 'version:\s*"0\.14\.35"', 'version: "0.14.36"'
    Set-Content "js/config.js" $config -NoNewline
    Write-Host "PATCH: Version 0.14.36"
}
else {
    Write-Warning "Current version is neither 0.14.35 nor 0.14.36. Check js/config.js before commit."
}

# ------------------------------------------------------------------
# 6. Safety checks
# ------------------------------------------------------------------
$final = Get-Content "js/microsoft-access.js" -Raw
$inviteStart = $final.IndexOf('  async function inviteExternal() {')
$inviteEnd = $final.IndexOf('  async function removeAccess(objectId) {')
$inviteBlock = $final.Substring($inviteStart,$inviteEnd-$inviteStart)

if ($inviteBlock.Contains('openExternalInviteDraft(')) {
    throw "Safety check failed: inviteExternal() still auto-launches Outlook."
}

Write-Host "CHECK: inviteExternal does not auto-launch Outlook."
Write-Host ""
Write-Host "v0.14.36 repair complete."
Write-Host ""
Write-Host "Run:"
Write-Host "  node --check js/microsoft-access.js"
Write-Host "  git diff --check"
Write-Host ""
Write-Host "Then refresh Port 8000 and test the two-step flow."
