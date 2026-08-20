# Upgrade-v0.14.26-Calendar-Pill-Centering.ps1
# Final cosmetic patch for Calendar PDF:
# - increases event pill height slightly
# - vertically centers one-line and two-line text inside each pill
# - leaves footer/branding unchanged

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.26 - Calendar Pill Centering"
Write-Host ""

$path = "js/dashboard.js"
if (-not (Test-Path $path)) {
    throw "Could not find $path"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.26-calendar-pill-centering-$stamp"
New-Item -ItemType Directory -Path "$backupDir/js" -Force | Out-Null
Copy-Item $path "$backupDir/js/dashboard.js" -Force

$content = Get-Content $path -Raw

$old = @'
      const pillH=15;

      if(textY+pillH > y+cellH-4)return;

      doc.setFillColor(...fill);
      doc.setDrawColor(...accent);
      doc.roundedRect(x+4,textY-8,cellW-8,pillH,3,3,"FD");

      doc.setTextColor(...accent);
      doc.setFont("helvetica","bold");
      doc.setFontSize(5.7);

      const lines=doc.splitTextToSize(clean(event.title),cellW-14).slice(0,2);
      doc.text(lines,x+7,textY);
      textY+=pillH+3;
'@

$new = @'
      const pillH=18;

      if(textY+pillH > y+cellH-4)return;

      const pillTop=textY-8;

      doc.setFillColor(...fill);
      doc.setDrawColor(...accent);
      doc.roundedRect(x+4,pillTop,cellW-8,pillH,3,3,"FD");

      doc.setTextColor(...accent);
      doc.setFont("helvetica","bold");
      doc.setFontSize(5.7);

      const lines=doc.splitTextToSize(clean(event.title),cellW-14).slice(0,2);
      const lineHeight=6.2;
      const textBlockH=lines.length*lineHeight;
      const centeredY=pillTop+((pillH-textBlockH)/2)+lineHeight-1;

      doc.text(lines,x+7,centeredY,{lineHeightFactor:1.08});
      textY+=pillH+3;
'@

if ($content.Contains($new)) {
    Write-Host "SKIP: Calendar pill-centering patch already applied."
}
elseif (-not $content.Contains($old)) {
    throw "Could not find the expected Calendar pill block. No changes made."
}
else {
    $content = $content.Replace($old,$new)
    Set-Content $path $content -NoNewline
    Write-Host "PATCH: Calendar PDF pill text is now vertically centered."
}

Write-Host ""
Write-Host "Backup:" $backupDir
Write-Host ""
Write-Host "Do NOT commit yet."
Write-Host "Next: node --check js/dashboard.js; git diff --check; test Calendar PDF on Port 8000."
