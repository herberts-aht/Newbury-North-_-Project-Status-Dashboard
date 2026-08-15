# Upgrade-v0.14.16-DownloadProjectPDF.ps1
# Replaces the v0.14.15 Print / PDF action with a true project-specific Download PDF.
#
# Behavior:
# - Generates a real PDF in the browser for the currently selected project.
# - If the browser exposes a native file-save picker, the user chooses folder/name.
# - Otherwise it falls back to the browser's normal PDF download behavior.
# - Same button/flow for all browsers; capability detection is automatic.
#
# No SharePoint schema/data changes.
# No authentication changes.
# No project-management calculations changed.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.16 - Download Project PDF"
Write-Host ""

$files = @(
  "index.html",
  "js/dashboard.js",
  "js/config.js"
)

# ------------------------------------------------------------------
# Backup
# ------------------------------------------------------------------
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.16-$stamp"
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
# 1. Add pinned browser PDF libraries.
# ------------------------------------------------------------------

$oldScripts = '<script src="js/app.js"></script>'
$newScripts = @'
<script src="https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
<script src="https://unpkg.com/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js"></script>
<script src="js/app.js"></script>
'@

Replace-Exact "index.html" $oldScripts $newScripts "Client-side PDF libraries"

# ------------------------------------------------------------------
# 2. Replace the Executive Summary button.
# ------------------------------------------------------------------

Replace-Exact `
  "index.html" `
  '<button class="btn" type="button" onclick="printCurrentProjectReport()">Print / PDF</button>' `
  '<button class="btn" type="button" onclick="downloadCurrentProjectPDF()">Download PDF</button>' `
  "Download PDF button"

# ------------------------------------------------------------------
# 3. Add true PDF generator.
#    The old print function is intentionally left in place but is no longer called.
# ------------------------------------------------------------------

$dashboard = Get-Content "js/dashboard.js" -Raw

if ($dashboard.Contains("async function downloadCurrentProjectPDF()")) {
  Write-Host "SKIP: Download PDF generator already present"
}
else {

$pdfFunction = @'

function projectReportSafeFileName(value){
  return String(value||"Project")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g," ")
    .replace(/\s+/g," ")
    .trim()
    .replace(/\s/g,"-");
}

async function saveProjectPdfBlob(blob, filename){
  if(typeof window.showSaveFilePicker==="function" && window.isSecureContext){
    try{
      const handle=await window.showSaveFilePicker({
        suggestedName:filename,
        types:[{
          description:"PDF Document",
          accept:{"application/pdf":[".pdf"]}
        }]
      });
      const writable=await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    }catch(error){
      if(error?.name==="AbortError")return "cancelled";
      console.warn("Native Save As was unavailable; using browser download instead.",error);
    }
  }

  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download=filename;
  anchor.style.display="none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  return "downloaded";
}

async function downloadCurrentProjectPDF(){
  const p=currentProject();
  if(!p)return;

  if(!window.jspdf?.jsPDF){
    alert("The PDF library did not load. Check your internet connection and try again.");
    return;
  }

  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:"landscape",unit:"pt",format:"letter",compress:true});

  if(typeof doc.autoTable!=="function"){
    alert("The PDF table library did not load. Refresh Project Control and try again.");
    return;
  }

  const ds=visibleDeliverables(p);
  const infoRecords=visibleInfo(p);
  const waiting=ds.filter(x=>x.status.includes("Waiting")||x.status==="Awaiting Review").length;
  const complete=ds.filter(x=>x.status==="Complete").length;
  const active=Math.max(0,ds.length-waiting-complete);
  const current=ds.filter(x=>x.status==="In Progress");
  const outstandingInfo=infoRecords.filter(x=>x.status!=="Received"&&x.status!=="No Longer Needed");
  const risks=ds.filter(x=>x.risk);
  const progress=weightedProjectProgress(p);
  const planning=displayedPhaseProgress(p,"Planning");
  const engineering=displayedPhaseProgress(p,"Engineering");
  const installation=displayedPhaseProgress(p,"Installation");
  const health=displayedProjectHealth(p);

  const navy=[12,35,56], blue=[20,95,138], muted=[97,113,130], line=[220,228,234], soft=[244,247,249];
  const pageWidth=doc.internal.pageSize.getWidth();
  const pageHeight=doc.internal.pageSize.getHeight();
  const margin=28;
  const contentWidth=pageWidth-margin*2;
  const generated=new Date();
  const dateStamp=[
    generated.getFullYear(),
    String(generated.getMonth()+1).padStart(2,"0"),
    String(generated.getDate()).padStart(2,"0")
  ].join("-");

  const clean=value=>String(value??"").replace(/\s+/g," ").trim();
  const val=value=>clean(value)||"—";
  const date=value=>value?fmtDate(value):"—";

  function pageFooter(){
    const total=doc.getNumberOfPages();
    for(let page=1;page<=total;page++){
      doc.setPage(page);
      doc.setDrawColor(...line);
      doc.line(margin,pageHeight-22,pageWidth-margin,pageHeight-22);
      doc.setFont("helvetica","normal");
      doc.setFontSize(7);
      doc.setTextColor(...muted);
      doc.text("AHT Global · Project Control",margin,pageHeight-10);
      doc.text(`${clean(p.name)} · v${APP_CONFIG.version}`,pageWidth-margin,pageHeight-10,{align:"right"});
      doc.text(`Page ${page} of ${total}`,pageWidth/2,pageHeight-10,{align:"center"});
    }
  }

  function ensureSpace(y,needed=80){
    if(y+needed<=pageHeight-32)return y;
    doc.addPage("letter","landscape");
    return 30;
  }

  function sectionTitle(title,y){
    y=ensureSpace(y,28);
    doc.setFont("helvetica","bold");
    doc.setFontSize(12);
    doc.setTextColor(...navy);
    doc.text(title,margin,y);
    doc.setDrawColor(...line);
    doc.line(margin,y+5,pageWidth-margin,y+5);
    return y+16;
  }

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

  // ----------------------------------------------------------------
  // PAGE 1 — Executive project report
  // ----------------------------------------------------------------
  doc.setFont("helvetica","bold");
  doc.setFontSize(9);
  doc.setTextColor(...navy);
  doc.text("AHT GLOBAL · PROJECT CONTROL",margin,30);

  doc.setFontSize(23);
  doc.text(clean(p.name),margin,53);

  doc.setFont("helvetica","normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(clean(p.subtitle||""),margin,67);

  doc.setFontSize(7.5);
  doc.text("PROJECT REPORT",pageWidth-margin,29,{align:"right"});
  doc.text(`Generated ${generated.toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"})}`,pageWidth-margin,42,{align:"right"});
  doc.text(`Last Updated ${formatLastUpdated(p)}`,pageWidth-margin,54,{align:"right"});

  doc.setDrawColor(...navy);
  doc.setLineWidth(2);
  doc.line(margin,76,pageWidth-margin,76);
  doc.setLineWidth(.5);

  const team=[
    ["Project Health",health],
    ["Executive Lead",p.executiveLead||"—"],
    ["Senior Project Manager",p.seniorProjectManager||"—"],
    ["Project Manager / Site Lead",p.projectManagerSiteLead||"—"],
    ["Project Phase",p.phase||"—"]
  ];
  const teamW=contentWidth/team.length;
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

  const progressData=[
    ["Overall",progress],
    ["Planning",planning],
    ["Engineering",engineering],
    ["Installation",installation]
  ];
  const cardGap=8;
  const cardW=(contentWidth-cardGap*3)/4;
  progressData.forEach(([label,value],i)=>{
    const x=margin+i*(cardW+cardGap);
    doc.setDrawColor(...line);
    doc.roundedRect(x,145,cardW,54,5,5,"S");
    doc.setFont("helvetica","bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...muted);
    doc.text(`${label.toUpperCase()} PROGRESS`,x+8,158);
    doc.setFontSize(17);
    doc.setTextColor(...navy);
    doc.text(`${value}%`,x+8,179);
    doc.setFillColor(232,237,241);
    doc.roundedRect(x+8,188,cardW-16,4,2,2,"F");
    doc.setFillColor(...blue);
    doc.roundedRect(x+8,188,Math.max(0,(cardW-16)*(Math.min(100,value)/100)),4,2,2,"F");
  });

  const counts=[
    ["DELIVERABLES",ds.length],
    ["ACTIVE",active],
    ["WAITING / REVIEW",waiting],
    ["COMPLETE",complete]
  ];
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

  const panelGap=10;
  const panelW=(contentWidth-panelGap)/2;
  summaryPanel("CURRENT WORK",current.map(x=>`${x.deliverable}${x.current?` — ${x.current}`:""}`),margin,265,panelW);
  summaryPanel("REQUIRED FROM OTHERS",outstandingInfo.map(x=>`${x.item} — ${x.from||"—"}${x.blocking?`; blocks ${x.blocking}`:""}`),margin+panelW+panelGap,265,panelW);
  summaryPanel("NEXT DELIVERABLES",current.map(x=>`${x.deliverable} — ${x.nextStep||"—"}${x.date?`; ${date(x.date)}`:""}`),margin,361,panelW);
  summaryPanel("PROJECT RISKS",risks.map(x=>x.risk),margin+panelW+panelGap,361,panelW);

  // ----------------------------------------------------------------
  // PAGE 2+ — Deliverables
  // ----------------------------------------------------------------
  doc.addPage("letter","landscape");
  let y=34;
  y=sectionTitle("Deliverables",y);

  doc.autoTable({
    startY:y,
    margin:{left:margin,right:margin,bottom:32},
    head:[["Discipline","Deliverable / Current Activity","Status","Owner","Waiting On","Next Step","Target"]],
    body:ds.map(x=>[
      val(x.discipline),
      `${val(x.deliverable)}${x.current?`\n${clean(x.current)}`:""}`,
      val(x.status),
      val(x.owner),
      val(x.waitingOn),
      val(x.nextStep),
      date(x.date)
    ]),
    theme:"grid",
    styles:{font:"helvetica",fontSize:7,cellPadding:4,lineColor:line,lineWidth:.4,valign:"top",overflow:"linebreak"},
    headStyles:{fillColor:soft,textColor:navy,fontStyle:"bold",fontSize:6.5},
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

  // ----------------------------------------------------------------
  // Information Required
  // ----------------------------------------------------------------
  let infoStart=doc.lastAutoTable.finalY+22;
  if(infoStart>pageHeight-110){
    doc.addPage("letter","landscape");
    infoStart=34;
  }
  infoStart=sectionTitle("Information Required",infoStart);

  doc.autoTable({
    startY:infoStart,
    margin:{left:margin,right:margin,bottom:32},
    head:[["Item Needed","Requested From","Status","Blocking","Needed By","Notes"]],
    body:infoRecords.map(x=>[
      val(x.item),
      val(x.from),
      val(x.status),
      val(x.blocking),
      date(x.neededBy),
      val(x.notes)
    ]),
    theme:"grid",
    styles:{font:"helvetica",fontSize:7,cellPadding:4,lineColor:line,lineWidth:.4,valign:"top",overflow:"linebreak"},
    headStyles:{fillColor:soft,textColor:navy,fontStyle:"bold",fontSize:6.5},
    columnStyles:{
      0:{cellWidth:115},
      1:{cellWidth:95},
      2:{cellWidth:74},
      3:{cellWidth:130},
      4:{cellWidth:62},
      5:{cellWidth:210}
    }
  });

  pageFooter();

  const filename=`${projectReportSafeFileName(p.name)}-Project-Report-${dateStamp}.pdf`;
  const blob=doc.output("blob");
  await saveProjectPdfBlob(blob,filename);
}
'@

  Add-Content "js/dashboard.js" -Value $pdfFunction
  Write-Host "PATCH: True project PDF generation + adaptive save"
}

# ------------------------------------------------------------------
# 4. Version bump
# ------------------------------------------------------------------

$config = Get-Content "js/config.js" -Raw

if ($config -match 'version:\s*"0\.14\.16"') {
  Write-Host "SKIP: Version already 0.14.16"
}
elseif ($config -match 'version:\s*"0\.14\.15"') {
  $config = $config -replace 'version:\s*"0\.14\.15"', 'version: "0.14.16"'
  Set-Content "js/config.js" -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.16"
}
else {
  throw "Expected current version 0.14.15 in js/config.js."
}

Write-Host ""
Write-Host "v0.14.16 Download Project PDF complete."
Write-Host ""
Write-Host "Test on Port 8000:"
Write-Host " 1. Executive Summary -> select 2200."
Write-Host " 2. Click Download PDF."
Write-Host " 3. Confirm a PDF is generated for 2200 only."
Write-Host " 4. Repeat for 2340 and confirm the project/data changes."
Write-Host " 5. Check the PDF layout before committing."
Write-Host ""
Write-Host "Do NOT commit until the downloaded PDF looks right."
