# Upgrade-v0.14.27-Outlook-External-Invite.ps1
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.27 - Outlook External Invite"
Write-Host ""

$files = @("index.html","js/microsoft-access.js","js/config.js")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.27-outlook-invite-$stamp"

foreach ($file in $files) {
    if (-not (Test-Path $file)) { throw "Missing required file: $file" }
    $dest = Join-Path $backupDir $file
    $destDir = Split-Path $dest -Parent
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    Copy-Item $file $dest -Force
}

function Replace-Exact {
    param([string]$Path,[string]$Old,[string]$New,[string]$Label)
    $text = Get-Content $Path -Raw
    if ($text.Contains($New)) { Write-Host "SKIP:" $Label; return }
    if (-not $text.Contains($Old)) { throw "Could not find expected code for '$Label' in $Path" }
    $text = $text.Replace($Old,$New)
    Set-Content $Path -Value $text -NoNewline
    Write-Host "PATCH:" $Label
}

$oldUi = @'
            <button class="btn primary" id="inviteExternalBtn" type="button" style="margin-top:10px">Invite & Grant Dashboard Access</button>
            <div id="inviteRedeemArea" class="invite-redeem hidden">
              <div class="small"><strong>Manual redemption link</strong> — use only if Microsoft's invitation email does not arrive.</div>
              <div class="redeem-row"><input id="inviteRedeemLink" readonly /><button class="btn" id="copyRedeemLinkBtn" type="button">Copy</button></div>
            </div>
'@
$newUi = @'
            <button class="btn primary" id="inviteExternalBtn" type="button" style="margin-top:10px">Invite & Open Outlook Draft</button>
            <div id="inviteRedeemArea" class="invite-redeem hidden">
              <div class="small"><strong>Invitation link</strong> — Outlook should open a ready-to-send draft automatically. Use Copy Link below as a fallback.</div>
              <div class="redeem-row"><input id="inviteRedeemLink" readonly /><button class="btn" id="copyRedeemLinkBtn" type="button">Copy Link</button></div>
            </div>
'@
Replace-Exact "index.html" $oldUi $newUi "Update external invite UI"

$oldHelperAnchor = @'
  async function inviteExternal() {
'@
$newHelperBlock = @'
  function openExternalInviteDraft({ email, name, projects, redeemUrl }) {
    if (!email || !redeemUrl) return;

    const projectNames = (projects || [])
      .map(projectId => state.projects.find(project => project.id === projectId)?.name || projectId)
      .filter(Boolean);

    const subject =
      `AHT Project Control Access${projectNames.length ? ` - ${projectNames.join(" & ")}` : ""}`;

    const greetingName = String(name || "").trim() || "there";

    const body = [
      `Hi ${greetingName},`,
      "",
      "You've been granted access to the AHT Project Control dashboard" +
        (projectNames.length ? ` for ${projectNames.join(" and ")}.` : "."),
      "",
      "Please use the link below to activate your access:",
      redeemUrl,
      "",
      "Once completed, you can sign in to Project Control using this email address.",
      "",
      "Thanks,",
      "Stace"
    ].join("\r\n");

    const mailto =
      `mailto:${encodeURIComponent(email)}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
  }

  async function inviteExternal() {
'@
Replace-Exact "js/microsoft-access.js" $oldHelperAnchor $newHelperBlock "Add Outlook draft helper"

$oldAutoEmail = @'
          sendInvitationMessage: true,
          invitedUserMessageInfo: {
            customizedMessageBody: "You have been invited to the AHT Newbury North Project Control dashboard."
          }
'@
$newAutoEmail = @'
          // Project Control opens the administrator's Outlook/default-mail draft
          // using the returned inviteRedeemUrl, so do not depend on Microsoft's
          // system-generated B2B invitation email.
          sendInvitationMessage: false
'@
Replace-Exact "js/microsoft-access.js" $oldAutoEmail $newAutoEmail "Disable Microsoft automatic invite email"

$oldSuccess = @'
      setStatus(`Invitation created, access configured, and ${email} was granted Project Control access.`, "success");
      const redeem = el("inviteRedeemArea");
      if (redeem) {
        redeem.classList.toggle("hidden", !lastRedeemUrl);
        const link = el("inviteRedeemLink"); if (link) link.value = lastRedeemUrl;
      }
      await refresh();
'@
$newSuccess = @'
      setStatus(`Invitation created and access configured for ${email}. Opening Outlook draft…`, "success");
      const redeem = el("inviteRedeemArea");
      if (redeem) {
        redeem.classList.toggle("hidden", !lastRedeemUrl);
        const link = el("inviteRedeemLink"); if (link) link.value = lastRedeemUrl;
      }

      await refresh();

      if (lastRedeemUrl) {
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
'@
Replace-Exact "js/microsoft-access.js" $oldSuccess $newSuccess "Open Outlook draft after invite"

$configPath = "js/config.js"
$config = Get-Content $configPath -Raw
if ($config -match 'version:\s*"0\.14\.27"') {
    Write-Host "SKIP: Version already 0.14.27"
}
elseif ($config -match 'version:\s*"0\.14\.26"') {
    $config = $config -replace 'version:\s*"0\.14\.26"', 'version: "0.14.27"'
    Set-Content $configPath -Value $config -NoNewline
    Write-Host "PATCH: Version 0.14.27"
}
else {
    Write-Warning "Current version is not 0.14.26. Check js/config.js before commit."
}

Write-Host ""
Write-Host "v0.14.27 Outlook external-invite patch complete."
Write-Host "Do NOT commit yet. Test with an external address you control."
