# Upgrade-v0.14.36-Two-Step-Outlook-Invite.ps1
# Safari-safe external invitation workflow:
# 1. Complete Entra/dashboard provisioning first.
# 2. Show a persistent Invitation Ready panel.
# 3. Open Outlook only from a separate direct user click.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.36 - Two-Step Outlook Invite"
Write-Host ""

$files = @("index.html","js/microsoft-access.js","js/config.js")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.36-two-step-outlook-$stamp"

foreach ($file in $files) {
    if (-not (Test-Path $file)) { throw "Missing required file: $file" }
    $dest = Join-Path $backupDir $file
    $destDir = Split-Path $dest -Parent
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    Copy-Item $file $dest -Force
}
Write-Host "BACKUP: $backupDir"

function Replace-Exact {
    param(
        [string]$Path,
        [string]$Old,
        [string]$New,
        [string]$Label
    )
    $text = Get-Content $Path -Raw
    if ($text.Contains($New)) {
        Write-Host "SKIP:" $Label
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
# 1. Make invitation panel clearly represent the completed handoff
# ------------------------------------------------------------------
$oldUi = @'
            <div id="inviteRedeemArea" class="invite-redeem hidden">
              <div class="small"><strong>Invitation link</strong> — new invitations populate this automatically. For an existing pending guest, paste a Microsoft redemption link here if needed.</div>
              <div class="redeem-row">
                <input id="inviteRedeemLink" placeholder="Microsoft invitation / redemption link" />
                <button class="btn" id="copyRedeemLinkBtn" type="button">Copy Link</button>
                <button class="btn" id="openInviteDraftBtn" type="button">Open Outlook Draft</button>
              </div>
            </div>
'@

$newUi = @'
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

Replace-Exact "index.html" $oldUi $newUi "Upgrade invitation-ready panel"

# ------------------------------------------------------------------
# 2. Add a helper that stores the completed invite context in the DOM
# ------------------------------------------------------------------
$oldAnchor = @'
  function openExternalInviteDraft({ email, name, projects, redeemUrl }) {
'@

$newAnchor = @'
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

  function openExternalInviteDraft({ email, name, projects, redeemUrl }) {
'@

Replace-Exact "js/microsoft-access.js" $oldAnchor $newAnchor "Add persistent invite-ready context"

# ------------------------------------------------------------------
# 3. Remove automatic Outlook launch from inviteExternal
#    and instead populate the ready panel after provisioning.
# ------------------------------------------------------------------
$content = Get-Content "js/microsoft-access.js" -Raw

$oldNewGuestSuccess = @'
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
'@

$newNewGuestSuccess = @'
      } else if (lastRedeemUrl) {
        setInviteReadyContext({
          email,
          name,
          projects,
          redeemUrl: lastRedeemUrl
        });

        setStatus(
          `Invitation created and access configured for ${email}. Click Open Outlook Draft when ready.`,
          "success"
        );
      } else {
'@

if ($content.Contains($newNewGuestSuccess)) {
    Write-Host "SKIP: New-guest two-step handoff already applied."
}
elseif ($content.Contains($oldNewGuestSuccess)) {
    $content = $content.Replace($oldNewGuestSuccess,$newNewGuestSuccess)
    Set-Content "js/microsoft-access.js" $content -NoNewline
    Write-Host "PATCH: New guests now use two-step Outlook handoff."
}
else {
    throw "Could not find the new-guest success block in inviteExternal()."
}

# Existing guest success currently asks for a pasted link. Make sure the
# panel remembers who/projects even after the form fields are cleared.
$content = Get-Content "js/microsoft-access.js" -Raw

$oldExisting = @'
      if (existingGuest) {
        setStatus(
          `Existing guest access was configured for ${email}. Paste a Microsoft redemption link above, then click Open Outlook Draft.`,
          "success"
        );
'@

$newExisting = @'
      if (existingGuest) {
        setInviteReadyContext({
          email,
          name,
          projects,
          redeemUrl: ""
        });

        setStatus(
          `Existing guest access was configured for ${email}. Paste a Microsoft redemption link above, then click Open Outlook Draft.`,
          "success"
        );
'@

if ($content.Contains($newExisting)) {
    Write-Host "SKIP: Existing-guest ready context already applied."
}
elseif ($content.Contains($oldExisting)) {
    $content = $content.Replace($oldExisting,$newExisting)
    Set-Content "js/microsoft-access.js" $content -NoNewline
    Write-Host "PATCH: Existing guests now retain invite context after provisioning."
}
else {
    throw "Could not find the existing-guest success block."
}

# ------------------------------------------------------------------
# 4. Make Open Outlook Draft prefer the stored ready-panel context,
#    with visible form fields as fallback.
# ------------------------------------------------------------------
$content = Get-Content "js/microsoft-access.js" -Raw

$startMarker = '  function openCurrentInviteDraft() {'
$endMarker = '  function onAdminView() {'
$start = $content.IndexOf($startMarker)
$end = $content.IndexOf($endMarker)

if ($start -lt 0 -or $end -lt 0 -or $end -le $start) {
    throw "Could not locate openCurrentInviteDraft() function boundaries."
}

$oldBlock = $content.Substring($start, $end - $start)

$newBlock = @'
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

    // This function is called directly by the separate Open Outlook Draft
    // button, keeping the external-app launch inside a fresh user gesture.
    openExternalInviteDraft({
      email,
      name,
      projects,
      redeemUrl: link
    });
  }

'@

$content = $content.Substring(0,$start) + $newBlock + $content.Substring($end)
Set-Content "js/microsoft-access.js" $content -NoNewline
Write-Host "PATCH: Open Outlook Draft now uses persistent ready-panel context."

# ------------------------------------------------------------------
# 5. Ensure inviteExternal itself no longer auto-opens Outlook anywhere
# ------------------------------------------------------------------
$content = Get-Content "js/microsoft-access.js" -Raw
$inviteStart = $content.IndexOf('  async function inviteExternal() {')
$inviteEnd = $content.IndexOf('  async function removeAccess(objectId) {')

if ($inviteStart -ge 0 -and $inviteEnd -gt $inviteStart) {
    $inviteBlock = $content.Substring($inviteStart,$inviteEnd-$inviteStart)
    $autoCount = ([regex]::Matches($inviteBlock,'openExternalInviteDraft\(')).Count
    if ($autoCount -gt 0) {
        throw "Safety check failed: inviteExternal() still contains an automatic Outlook launch."
    }
    Write-Host "CHECK: inviteExternal() contains no automatic Outlook launch."
}

# ------------------------------------------------------------------
# 6. Version bump
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
    Write-Warning "Current version is not 0.14.35. Check js/config.js before commit."
}

Write-Host ""
Write-Host "v0.14.36 two-step Outlook patch complete."
Write-Host ""
Write-Host "EXPECTED FLOW:"
Write-Host "  1. Invite & Open Outlook Draft provisions Microsoft access only."
Write-Host "  2. Invitation Ready panel appears."
Write-Host "  3. Admin clicks Open Outlook Draft as a separate direct action."
Write-Host "  4. macOS mailto handler opens native Microsoft Outlook."
Write-Host ""
Write-Host "DO NOT COMMIT YET."
Write-Host "Run:"
Write-Host "  node --check js/microsoft-access.js"
Write-Host "  git diff --check"
