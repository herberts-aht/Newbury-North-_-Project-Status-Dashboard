# Upgrade-v0.14.18-PDFDashboardStyling.ps1
# Styles the existing v0.14.16 project PDF to visually match AHT Project Control.
#
# Changes PDF appearance only:
# - Dashboard/AHT color palette
# - Colored Health treatment
# - Dashboard-colored summary section headers
# - Colored KPI accents
# - Status coloring in Deliverables and Information Required tables
#
# No SharePoint, auth, project data, calculations, or dashboard screen layout changes.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.18 - PDF Dashboard Styling"
Write-Host ""

$files = @(
  "js/dashboard.js",
  "js/config.js"
)

# ------------------------------------------------------------------
# Backup
# ------------------------------------------------------------------
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.18-$stamp"
New-Item -ItemType Directory -Path $backupDir | Out-Null

foreach ($file in $files) {
  $dest = Join-Path $backupDir $file
  $destDir = Split-Path $dest -Parent
  if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  }
  Copy-Item $file $dest
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
    throw "Could not find expected code for: $Label in $Path. Stopping."
  }

  $text = $text.Replace($Old, $New)
  Set-Content -Path $Path -Value $text -NoNewline
  Write-Host "PATCH:" $Label
}

# ------------------------------------------------------------------
# 1. Dashboard palette + helpers
# ------------------------------------------------------------------

$oldPalette = '  const navy=[12,35,56], blue=[20,95,138], muted=[97,113,130], line=[220,228,234], soft=[244,247,249];'
$newPalette = @'
  const navy=[0,78,132], blue=[0,136,199], green=[112,173,71], orange=[237,125,49], red=[192,0,0],
        muted=[97,113,130], line=[220,228,234], soft=[244,247,249],
        lightBlue=[228,242,250], lightGreen=[234,245,225], lightOrange=[253,239,222], lightRed=[250,228,228];

  const statusStyle=value=>{
    const s=String(value||"").toLowerCase();
    if(s==="complete"||s==="received"||s==="healthy")return {fill:lightGreen,text:[55,100,35],accent:green};
    if(s.includes("overdue"))return {fill:lightRed,text:[150,30,30],accent:red};
    if(s.includes("waiting")||s.includes("awaiting")||s==="pending"||s==="outstanding"||s==="at risk")
      return {fill:lightOrange,text:[145,84,15],accent:orange};
    if(s.includes("progress")||s==="active")return {fill:lightBlue,text:[20,80,125],accent:blue};
    return {fill:soft,text:navy,accent:blue};
  };
'@
Replace-Exact "js/dashboard.js" $oldPalette $newPalette "AHT dashboard PDF palette"

# ------------------------------------------------------------------
# 2. Summary panels use dashboard section colors.
# ------------------------------------------------------------------

$oldPanel = @'
  function summaryPanel(title,items,x,y,w){
    const padding=8;
    doc.setDrawColor(...line);
    doc.roundedRect(x,y,w,86,5,5,"S");
    doc.setFillColor(...soft);
    doc.rect(x,y,w,20,"F");
    doc.setFont("helvetica","bold");
    doc.setFontSize(8);
    doc.setTextColor(...navy);
    doc.text(title,x+padding,y+13);

    doc.setFont("helvetica","normal");
    doc.setFontSize(7.5);
    doc.setTextColor(23,33,42);

    let ty=y+31;
    const rows=items.slice(0,4);
    if(!rows.length){
      doc.setTextColor(...muted);
      doc.text("None currently.",x+padding,ty);
      return;
    }
    rows.forEach(item=>{
      const lines=doc.splitTextToSize(`• ${clean(item)}`,w-padding*2);
      const clipped=lines.slice(0,2);
      doc.text(clipped,x+padding,ty);
      ty+=clipped.length*9+3;
    });
  }
'@

$newPanel = @'
  function summaryPanel(title,items,x,y,w,accent,headerText=[255,255,255]){
    const padding=8;
    doc.setDrawColor(...line);
    doc.roundedRect(x,y,w,86,5,5,"S");
    doc.setFillColor(...accent);
    doc.roundedRect(x,y,w,20,5,5,"F");
    doc.rect(x,y+12,w,8,"F");
    doc.setFont("helvetica","bold");
    doc.setFontSize(8);
    doc.setTextColor(...headerText);
    doc.text(title,x+padding,y+13);

    doc.setFont("helvetica","normal");
    doc.setFontSize(7.5);
    doc.setTextColor(23,33,42);

    let ty=y+31;
    const rows=items.slice(0,4);
    if(!rows.length){
      doc.setTextColor(...muted);
      doc.text("None currently.",x+padding,ty);
      return;
    }
    rows.forEach(item=>{
      const lines=doc.splitTextToSize(`• ${clean(item)}`,w-padding*2);
      const clipped=lines.slice(0,2);
      doc.text(clipped,x+padding,ty);
      ty+=clipped.length*9+3;
    });
  }
'@
Replace-Exact "js/dashboard.js" $oldPanel $newPanel "Colored PDF summary panels"

# Update four panel calls.
Replace-Exact `
  "js/dashboard.js" `
  '  summaryPanel("CURRENT WORK",current.map(x=>`${x.deliverable}${x.current?` — ${x.current}`:""}`),margin,265,panelW);' `
  '  summaryPanel("CURRENT WORK",current.map(x=>`${x.deliverable}${x.current?` — ${x.current}`:""}`),margin,265,panelW,blue);' `
  "Current Work blue header"

Replace-Exact `
  "js/dashboard.js" `
  '  summaryPanel("REQUIRED FROM OTHERS",outstandingInfo.map(x=>`${x.item} — ${x.from||"—"}${x.blocking?`; blocks ${x.blocking}`:""}`),margin+panelW+panelGap,265,panelW);' `
  '  summaryPanel("REQUIRED FROM OTHERS",outstandingInfo.map(x=>`${x.item} — ${x.from||"—"}${x.blocking?`; blocks ${x.blocking}`:""}`),margin+panelW+panelGap,265,panelW,orange);' `
  "Required From Others orange header"

Replace-Exact `
  "js/dashboard.js" `
  '  summaryPanel("NEXT DELIVERABLES",current.map(x=>`${x.deliverable} — ${x.nextStep||"—"}${x.date?`; ${date(x.date)}`:""}`),margin,361,panelW);' `
  '  summaryPanel("NEXT DELIVERABLES",current.map(x=>`${x.deliverable} — ${x.nextStep||"—"}${x.date?`; ${date(x.date)}`:""}`),margin,361,panelW,green);' `
  "Next Deliverables green header"

Replace-Exact `
  "js/dashboard.js" `
  '  summaryPanel("PROJECT RISKS",risks.map(x=>x.risk),margin+panelW+panelGap,361,panelW);' `
  '  summaryPanel("PROJECT RISKS",risks.map(x=>x.risk),margin+panelW+panelGap,361,panelW,red);' `
  "Project Risks red header"

# ------------------------------------------------------------------
# 3. Health card gets dashboard health color.
# ------------------------------------------------------------------

$oldTeamLoop = @'
  team.forEach(([label,value],i)=>{
    const x=margin+i*teamW;
    doc.setDrawColor(...line);
    doc.rect(x,88,teamW,46,"S");
    doc.setFont("helvetica","bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...muted);
    doc.text(label.toUpperCase(),x+7,102);
    doc.setFontSize(9);
    doc.setTextColor(...navy);
    const wrapped=doc.splitTextToSize(clean(value),teamW-14);
    doc.text(wrapped.slice(0,2),x+7,118);
  });
'@

$newTeamLoop = @'
  team.forEach(([label,value],i)=>{
    const x=margin+i*teamW;
    const healthLook=i===0?statusStyle(value):null;
    doc.setDrawColor(...line);
    if(healthLook){
      doc.setFillColor(...healthLook.fill);
      doc.rect(x,88,teamW,46,"FD");
      doc.setFillColor(...healthLook.accent);
      doc.rect(x,88,4,46,"F");
    }else{
      doc.rect(x,88,teamW,46,"S");
    }
    doc.setFont("helvetica","bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...muted);
    doc.text(label.toUpperCase(),x+7,102);
    doc.setFontSize(9);
    doc.setTextColor(...(healthLook?healthLook.text:navy));
    const wrapped=doc.splitTextToSize(clean(value),teamW-14);
    doc.text(wrapped.slice(0,2),x+7,118);
  });
'@
Replace-Exact "js/dashboard.js" $oldTeamLoop $newTeamLoop "Dashboard-style Project Health card"

# ------------------------------------------------------------------
# 4. KPI count cards get dashboard accent bars.
# ------------------------------------------------------------------

$oldCounts = @'
  counts.forEach(([label,value],i)=>{
    const x=margin+i*(cardW+cardGap);
    doc.setDrawColor(...line);
    doc.roundedRect(x,210,cardW,42,5,5,"S");
    doc.setFont("helvetica","bold");
    doc.setFontSize(15);
    doc.setTextColor(...navy);
    doc.text(String(value),x+cardW/2,228,{align:"center"});
    doc.setFontSize(6.2);
    doc.setTextColor(...muted);
    doc.text(label,x+cardW/2,241,{align:"center"});
  });
'@

$newCounts = @'
  const countAccents=[blue,blue,orange,green];
  counts.forEach(([label,value],i)=>{
    const x=margin+i*(cardW+cardGap);
    doc.setDrawColor(...line);
    doc.roundedRect(x,210,cardW,42,5,5,"S");
    doc.setFillColor(...countAccents[i]);
    doc.roundedRect(x,210,cardW,4,2,2,"F");
    doc.setFont("helvetica","bold");
    doc.setFontSize(15);
    doc.setTextColor(...navy);
    doc.text(String(value),x+cardW/2,228,{align:"center"});
    doc.setFontSize(6.2);
    doc.setTextColor(...muted);
    doc.text(label,x+cardW/2,241,{align:"center"});
  });
'@
Replace-Exact "js/dashboard.js" $oldCounts $newCounts "Dashboard KPI accent bars"

# ------------------------------------------------------------------
# 5. Deliverables table status cells get status colors.
# ------------------------------------------------------------------

$oldDeliverableTableEnd = @'
    columnStyles:{
      0:{cellWidth:62},
      1:{cellWidth:150},
      2:{cellWidth:74},
      3:{cellWidth:74},
      4:{cellWidth:110},
      5:{cellWidth:146},
      6:{cellWidth:58}
    },
    didDrawPage:()=>{}
  });
'@

$newDeliverableTableEnd = @'
    columnStyles:{
      0:{cellWidth:62},
      1:{cellWidth:150},
      2:{cellWidth:74},
      3:{cellWidth:74},
      4:{cellWidth:110},
      5:{cellWidth:146},
      6:{cellWidth:58}
    },
    didParseCell:data=>{
      if(data.section==="body"&&data.column.index===2){
        const look=statusStyle(data.cell.raw);
        data.cell.styles.fillColor=look.fill;
        data.cell.styles.textColor=look.text;
        data.cell.styles.fontStyle="bold";
      }
    },
    didDrawPage:()=>{}
  });
'@
Replace-Exact "js/dashboard.js" $oldDeliverableTableEnd $newDeliverableTableEnd "Deliverables status colors"

# ------------------------------------------------------------------
# 6. Information Required table status cells get status colors.
# ------------------------------------------------------------------

$oldInfoTableEnd = @'
    columnStyles:{
      0:{cellWidth:115},
      1:{cellWidth:95},
      2:{cellWidth:74},
      3:{cellWidth:130},
      4:{cellWidth:62},
      5:{cellWidth:210}
    }
  });
'@

$newInfoTableEnd = @'
    columnStyles:{
      0:{cellWidth:115},
      1:{cellWidth:95},
      2:{cellWidth:74},
      3:{cellWidth:130},
      4:{cellWidth:62},
      5:{cellWidth:210}
    },
    didParseCell:data=>{
      if(data.section==="body"&&data.column.index===2){
        const look=statusStyle(data.cell.raw);
        data.cell.styles.fillColor=look.fill;
        data.cell.styles.textColor=look.text;
        data.cell.styles.fontStyle="bold";
      }
    }
  });
'@
Replace-Exact "js/dashboard.js" $oldInfoTableEnd $newInfoTableEnd "Information Required status colors"

# ------------------------------------------------------------------
# 7. Version bump
# ------------------------------------------------------------------

$config = Get-Content "js/config.js" -Raw

if ($config -match 'version:\s*"0\.14\.18"') {
  Write-Host "SKIP: Version already 0.14.18"
}
elseif ($config -match 'version:\s*"0\.14\.17"') {
  $config = $config -replace 'version:\s*"0\.14\.17"', 'version: "0.14.18"'
  Set-Content "js/config.js" -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.18"
}
else {
  throw "Expected current version 0.14.17 in js/config.js."
}

Write-Host ""
Write-Host "v0.14.18 PDF dashboard styling complete."
Write-Host ""
Write-Host "Test:"
Write-Host " 1. Refresh Port 8000."
Write-Host " 2. Download the 2200 project PDF again."
Write-Host " 3. Compare page 1 to the dashboard:"
Write-Host "    blue Current Work, orange Required From Others,"
Write-Host "    green Next Deliverables, red Project Risks."
Write-Host " 4. Check colored status cells on pages 2-3."
Write-Host ""
Write-Host "Do NOT commit until the new PDF looks right."
