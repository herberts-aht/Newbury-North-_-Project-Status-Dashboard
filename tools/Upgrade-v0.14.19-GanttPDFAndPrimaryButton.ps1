# Upgrade-v0.14.19-GanttPDFAndPrimaryButton.ps1
# Adds an Administrator-only Gantt PDF download and makes the Summary
# Download PDF button use the same primary blue style as Add Deliverable /
# Add Information Required.
#
# No SharePoint schema/data changes.
# No auth changes.
# No project calculations changed.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.19 - Gantt PDF + Primary PDF Button"
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
$backupDir = "backup-v0.14.19-$stamp"
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
# 1. Summary Download PDF -> primary blue button
# ------------------------------------------------------------------
Replace-Exact `
  "index.html" `
  '<button class="btn" type="button" onclick="downloadCurrentProjectPDF()">Download PDF</button>' `
  '<button class="btn primary" type="button" onclick="downloadCurrentProjectPDF()">Download PDF</button>' `
  "Summary Download PDF primary styling"

# ------------------------------------------------------------------
# 2. Gantt page gets Admin-only Download Gantt PDF button
# ------------------------------------------------------------------

$oldTimeline = @'
    <section id="timeline" class="view"><div class="page-header"><div><div class="eyebrow">Schedule Overview</div><h2>Gantt</h2><p>Simple visual schedule generated from Deliverable start and target dates.</p></div><div class="project-switcher"><span class="small">Project</span><select class="project-select-clone"></select></div></div><div class="timeline"><div id="timelineTrack"></div></div></section>
'@

$newTimeline = @'
    <section id="timeline" class="view"><div class="page-header"><div><div class="eyebrow">Schedule Overview</div><h2>Gantt</h2><p>Simple visual schedule generated from Deliverable start and target dates.</p></div><div class="actions"><div class="project-switcher"><span class="small">Project</span><select class="project-select-clone"></select></div><button class="btn primary admin-only" type="button" onclick="downloadCurrentGanttPDF()">Download Gantt PDF</button></div></div><div class="timeline"><div id="timelineTrack"></div></div></section>
'@

Replace-Exact "index.html" $oldTimeline $newTimeline "Admin-only Gantt PDF button"

# ------------------------------------------------------------------
# 3. Gantt PDF generator
# ------------------------------------------------------------------

$dashboard = Get-Content "js/dashboard.js" -Raw

if ($dashboard.Contains("async function downloadCurrentGanttPDF()")) {
  Write-Host "SKIP: Gantt PDF generator already present"
}
else {

$ganttFunction = @'

async function downloadCurrentGanttPDF(){
  if(!currentUser?.canAdmin){
    alert("Gantt PDF export is available to Administrators only.");
    return;
  }

  const p=currentProject();
  if(!p)return;

  if(!window.jspdf?.jsPDF){
    alert("The PDF library did not load. Refresh Project Control and try again.");
    return;
  }

  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:"landscape",unit:"pt",format:"letter",compress:true});
  const records=visibleDeliverables(p);

  const scheduled=records
    .map(record=>({record,start:ganttStartFor(record),end:ganttDate(record.date)}))
    .filter(item=>item.start&&item.end)
    .sort((a,b)=>a.end-b.end);

  const unscheduled=records.filter(record=>!ganttDate(record.date));

  const pageWidth=doc.internal.pageSize.getWidth();
  const pageHeight=doc.internal.pageSize.getHeight();
  const margin=28;
  const leftCol=190;
  const chartX=margin+leftCol;
  const chartW=pageWidth-margin-chartX;
  const rowH=24;
  const headerY=92;
  const footerY=pageHeight-20;

  const navy=[0,78,132], blue=[0,136,199], green=[112,173,71], orange=[237,125,49], red=[192,0,0],
        muted=[97,113,130], line=[220,228,234], soft=[244,247,249], lightBlue=[228,242,250];

  const clean=value=>String(value??"").replace(/\s+/g," ").trim();
  const dateStamp=(()=>{
    const d=new Date();
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  })();

  function statusColor(record){
    const status=String(record.status||"");
    if(status==="Complete")return green;
    if(status==="Blocked")return red;
    if(status.includes("Waiting")||status==="Awaiting Review")return orange;
    if(status==="In Progress")return blue;
    return navy;
  }

  function footer(){
    doc.setDrawColor(...line);
    doc.line(margin,footerY-8,pageWidth-margin,footerY-8);
    doc.setFont("helvetica","normal");
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text("AHT Global · Project Control",margin,footerY);
    doc.text(`${clean(p.name)} · Gantt · v${APP_CONFIG.version}`,pageWidth-margin,footerY,{align:"right"});
  }

  function header(pageNo,totalPages){
    doc.setFont("helvetica","bold");
    doc.setTextColor(...navy);
    doc.setFontSize(9);
    doc.text("AHT GLOBAL · PROJECT CONTROL",margin,28);

    doc.setFontSize(20);
    doc.text(`${clean(p.name)} — Gantt Schedule`,margin,51);

    doc.setFont("helvetica","normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(clean(p.subtitle||""),margin,64);

    doc.text(`Generated ${new Date().toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"})}`,pageWidth-margin,28,{align:"right"});
    doc.text(`Page ${pageNo} of ${totalPages}`,pageWidth-margin,42,{align:"right"});

    doc.setDrawColor(...navy);
    doc.setLineWidth(2);
    doc.line(margin,74,pageWidth-margin,74);
    doc.setLineWidth(.5);
  }

  if(!scheduled.length){
    header(1,1);
    doc.setFont("helvetica","bold");
    doc.setFontSize(13);
    doc.setTextColor(...navy);
    doc.text("No deliverables currently have target dates.",margin,112);
    doc.setFont("helvetica","normal");
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text("Add target dates in Deliverables to populate the Gantt schedule.",margin,130);
    footer();

    const filename=`${projectReportSafeFileName(p.name)}-Gantt-${dateStamp}.pdf`;
    await saveProjectPdfBlob(doc.output("blob"),filename);
    return;
  }

  const earliest=new Date(Math.min(...scheduled.map(item=>item.start)));
  const latest=new Date(Math.max(...scheduled.map(item=>item.end)));
  const rangeStart=ganttAddDays(earliest,-3);
  const rangeEnd=ganttAddDays(latest,5);
  const totalMs=Math.max(86400000,rangeEnd-rangeStart);

  const rowsPerPage=Math.max(1,Math.floor((pageHeight-headerY-58)/rowH));
  const scheduledPages=Math.ceil(scheduled.length/rowsPerPage);
  const unscheduledPages=unscheduled.length?1:0;
  const totalPages=scheduledPages+unscheduledPages;

  const dayToX=date=>chartX+((date-rangeStart)/totalMs)*chartW;

  for(let pageIndex=0;pageIndex<scheduledPages;pageIndex++){
    if(pageIndex>0)doc.addPage("letter","landscape");
    header(pageIndex+1,totalPages);

    // Timeline header
    doc.setFillColor(...soft);
    doc.rect(margin,82,leftCol,24,"F");
    doc.rect(chartX,82,chartW,24,"F");
    doc.setFont("helvetica","bold");
    doc.setFontSize(7);
    doc.setTextColor(...navy);
    doc.text("DELIVERABLE",margin+6,97);

    // Week markers
    for(let cursor=new Date(rangeStart);cursor<=rangeEnd;cursor=ganttAddDays(cursor,7)){
      const x=dayToX(cursor);
      doc.setDrawColor(...line);
      doc.line(x,82,x,pageHeight-42);
      doc.setFont("helvetica","normal");
      doc.setFontSize(6.2);
      doc.setTextColor(...muted);
      doc.text(fmtDate(ganttIso(cursor)),Math.min(x+2,pageWidth-margin-50),97);
    }

    const today=ganttDate(new Date());
    if(today>=rangeStart&&today<=rangeEnd){
      const todayX=dayToX(today);
      doc.setDrawColor(...red);
      doc.setLineWidth(1);
      doc.line(todayX,106,todayX,pageHeight-42);
      doc.setLineWidth(.5);
      doc.setFontSize(6);
      doc.setTextColor(...red);
      doc.text("TODAY",todayX+2,114);
    }

    const pageRows=scheduled.slice(pageIndex*rowsPerPage,(pageIndex+1)*rowsPerPage);

    pageRows.forEach((item,i)=>{
      const y=106+i*rowH;
      const r=item.record;
      const x1=Math.max(chartX,dayToX(item.start));
      const x2=Math.min(chartX+chartW,dayToX(item.end));
      const barW=Math.max(5,x2-x1);

      if(i%2===0){
        doc.setFillColor(250,252,253);
        doc.rect(margin,y,leftCol+chartW,rowH,"F");
      }

      doc.setDrawColor(...line);
      doc.line(margin,y+rowH,chartX+chartW,y+rowH);

      doc.setFont("helvetica","bold");
      doc.setFontSize(7.2);
      doc.setTextColor(...navy);
      const titleLines=doc.splitTextToSize(clean(r.deliverable),leftCol-12).slice(0,2);
      doc.text(titleLines,margin+6,y+9);

      doc.setFillColor(...statusColor(r));
      doc.roundedRect(x1,y+7,barW,9,4,4,"F");

      doc.setFont("helvetica","normal");
      doc.setFontSize(5.7);
      doc.setTextColor(...muted);
      doc.text(fmtDate(ganttIso(item.start)),x1,y+21);
      doc.text(fmtDate(ganttIso(item.end)),x2,y+21,{align:"right"});
    });

    footer();
  }

  if(unscheduled.length){
    doc.addPage("letter","landscape");
    header(totalPages,totalPages);

    doc.setFont("helvetica","bold");
    doc.setFontSize(13);
    doc.setTextColor(...navy);
    doc.text("Not Yet Tracked on Timeline",margin,102);

    doc.setFont("helvetica","normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text("These deliverables are valid project work but do not yet have target dates, so they are not positioned on the timeline.",margin,118);

    const rows=unscheduled.map(r=>[
      clean(r.discipline||"—"),
      clean(r.deliverable||"—"),
      clean(r.status||"—"),
      clean(r.owner||"—"),
      clean(r.nextStep||"—")
    ]);

    doc.autoTable({
      startY:132,
      margin:{left:margin,right:margin,bottom:34},
      head:[["Discipline","Deliverable","Status","Owner","Next Step"]],
      body:rows,
      theme:"grid",
      styles:{font:"helvetica",fontSize:7,cellPadding:4,lineColor:line,lineWidth:.4,valign:"top"},
      headStyles:{fillColor:lightBlue,textColor:navy,fontStyle:"bold",fontSize:6.5},
      columnStyles:{
        0:{cellWidth:85},
        1:{cellWidth:175},
        2:{cellWidth:85},
        3:{cellWidth:95},
        4:{cellWidth:270}
      }
    });

    footer();
  }

  const filename=`${projectReportSafeFileName(p.name)}-Gantt-${dateStamp}.pdf`;
  await saveProjectPdfBlob(doc.output("blob"),filename);
}
'@

  Add-Content "js/dashboard.js" -Value $ganttFunction
  Write-Host "PATCH: Administrator-only Gantt PDF generator"
}

# ------------------------------------------------------------------
# 4. Version bump
# ------------------------------------------------------------------

$config = Get-Content "js/config.js" -Raw

if ($config -match 'version:\s*"0\.14\.19"') {
  Write-Host "SKIP: Version already 0.14.19"
}
elseif ($config -match 'version:\s*"0\.14\.18"') {
  $config = $config -replace 'version:\s*"0\.14\.18"', 'version: "0.14.19"'
  Set-Content "js/config.js" -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.19"
}
else {
  throw "Expected current version 0.14.18 in js/config.js."
}

Write-Host ""
Write-Host "v0.14.19 complete."
Write-Host ""
Write-Host "Test on Port 8000:"
Write-Host " 1. Executive Summary: Download PDF button should now be solid blue."
Write-Host " 2. Gantt: Administrator should see Download Gantt PDF."
Write-Host " 3. Download the 2200 Gantt PDF."
Write-Host " 4. Confirm scheduled items are on the timeline."
Write-Host " 5. Confirm undated deliverables appear on the final"
Write-Host "    'Not Yet Tracked on Timeline' page."
Write-Host ""
Write-Host "Do NOT commit until both PDF actions look right."
