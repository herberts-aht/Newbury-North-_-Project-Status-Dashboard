# Upgrade-v0.14.26-Gantt-Calendar-Exports.ps1
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.26 - Gantt + Calendar PDF Exports"
Write-Host ""

$files = @("index.html","js/dashboard.js","js/config.js")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.26-calendar-export-$stamp"

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

$oldTimeline = '<section id="timeline" class="view"><div class="page-header"><div><div class="eyebrow">Schedule Overview</div><h2>Gantt</h2><p>Simple visual schedule generated from Deliverable start and target dates.</p></div><div class="actions"><div class="project-switcher"><span class="small">Project</span><select class="project-select-clone"></select></div><button class="btn primary admin-only" type="button" onclick="downloadCurrentGanttPDF()">Download Gantt PDF</button></div></div><div class="timeline"><div id="timelineTrack"></div></div></section>'
$newTimeline = '<section id="timeline" class="view"><div class="page-header"><div><div class="eyebrow">Schedule Overview</div><h2>Gantt</h2><p>Simple visual schedule generated from Deliverable start and target dates.</p></div><div class="actions"><div class="project-switcher"><span class="small">Project</span><select class="project-select-clone"></select></div><button class="btn primary" type="button" onclick="downloadCurrentGanttPDF()">Download Gantt PDF</button></div></div><div class="timeline"><div id="timelineTrack"></div></div></section>'
Replace-Exact "index.html" $oldTimeline $newTimeline "Open Gantt PDF to all viewers"

$oldCalendar = '<section id="calendar" class="view"><div class="page-header"><div><div class="eyebrow">Schedule</div><h2>Calendar & Agenda</h2><p>Generated from editable Deliverables and Information Required records.</p></div><div class="project-switcher"><span class="small">Project</span><select class="project-select-clone"></select></div></div><div class="agenda-grid"><div class="calendar-card"><h3>UPCOMING AGENDA</h3><div id="agendaList"></div></div><div class="calendar-card"><h3 id="calendarMonthTitle">MONTH</h3><div class="month-grid" id="monthGrid"></div></div></div></section>'
$newCalendar = '<section id="calendar" class="view"><div class="page-header"><div><div class="eyebrow">Schedule</div><h2>Calendar & Agenda</h2><p>Generated from editable Deliverables and Information Required records.</p></div><div class="actions"><div class="project-switcher"><span class="small">Project</span><select class="project-select-clone"></select></div><button class="btn primary" type="button" onclick="downloadCurrentCalendarPDF()">Download Calendar PDF</button></div></div><div class="agenda-grid"><div class="calendar-card"><h3>UPCOMING AGENDA</h3><div id="agendaList"></div></div><div class="calendar-card"><h3 id="calendarMonthTitle">MONTH</h3><div class="month-grid" id="monthGrid"></div></div></div></section>'
Replace-Exact "index.html" $oldCalendar $newCalendar "Add Calendar PDF button"

$oldGuard = @'
async function downloadCurrentGanttPDF(){
  if(!currentUser?.canAdmin){
    alert("Gantt PDF export is available to Administrators only.");
    return;
  }

  const p=currentProject();
'@
$newGuard = @'
async function downloadCurrentGanttPDF(){
  const p=currentProject();
'@
Replace-Exact "js/dashboard.js" $oldGuard $newGuard "Remove Gantt role restriction"

$oldStart = 'async function downloadCurrentGanttPDF(){'
$newFunction = @'
async function downloadCurrentCalendarPDF(){
  const p=currentProject();
  if(!p)return;

  if(!window.jspdf?.jsPDF){
    alert("The PDF library did not load. Refresh Project Control and try again.");
    return;
  }

  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:"landscape",unit:"pt",format:"letter",compress:true});
  const ds=visibleDeliverables(p);
  const infoRecords=visibleInfo(p);

  const events=[
    ...ds.filter(x=>x.date).map(x=>({date:x.date,title:x.deliverable,detail:x.status||"",type:"Deliverable"})),
    ...infoRecords.filter(x=>x.neededBy).map(x=>({date:x.neededBy,title:`${x.item} needed`,detail:x.from?`Requested from ${x.from}`:"",type:"Information Required"}))
  ].sort((a,b)=>String(a.date).localeCompare(String(b.date)));

  const grouped={};
  events.forEach(event=>(grouped[event.date]??=[]).push(event));

  const now=new Date();
  const year=now.getFullYear();
  const month=now.getMonth();
  const monthName=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"}).format(new Date(year,month,1));

  const pageWidth=doc.internal.pageSize.getWidth();
  const pageHeight=doc.internal.pageSize.getHeight();
  const margin=30;
  const contentWidth=pageWidth-(margin*2);

  doc.setFont("helvetica","bold");
  doc.setFontSize(20);
  doc.text(p.name||"Project",margin,38);

  doc.setFont("helvetica","normal");
  doc.setFontSize(9);
  doc.text("CALENDAR & AGENDA",margin,55);
  doc.text(`Generated ${new Date().toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"})}`,pageWidth-margin,38,{align:"right"});
  doc.text(`Last Updated ${formatLastUpdated(p)}`,pageWidth-margin,55,{align:"right"});
  doc.setDrawColor(190);
  doc.line(margin,68,pageWidth-margin,68);

  const calendarTop=88;
  const gridLeft=margin;
  const gridWidth=contentWidth*0.64;
  const agendaLeft=gridLeft+gridWidth+18;
  const agendaWidth=pageWidth-margin-agendaLeft;

  doc.setFont("helvetica","bold");
  doc.setFontSize(13);
  doc.text(monthName.toUpperCase(),gridLeft,calendarTop);

  const dayNames=["SUN","MON","TUE","WED","THU","FRI","SAT"];
  const headerY=calendarTop+18;
  const cellW=gridWidth/7;
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const rows=Math.ceil((firstDay+daysInMonth)/7);
  const gridBottom=pageHeight-42;
  const cellH=(gridBottom-(headerY+16))/rows;

  doc.setFontSize(7.5);
  dayNames.forEach((day,index)=>doc.text(day,gridLeft+(index*cellW)+(cellW/2),headerY,{align:"center"}));

  doc.setLineWidth(.4);
  doc.setDrawColor(205);
  for(let row=0;row<rows;row++){
    for(let col=0;col<7;col++){
      const x=gridLeft+(col*cellW);
      const y=headerY+8+(row*cellH);
      doc.rect(x,y,cellW,cellH);
    }
  }

  for(let day=1;day<=daysInMonth;day++){
    const position=firstDay+day-1;
    const row=Math.floor(position/7);
    const col=position%7;
    const x=gridLeft+(col*cellW);
    const y=headerY+8+(row*cellH);
    const key=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const dayEvents=grouped[key]||[];

    doc.setFont("helvetica","bold");
    doc.setFontSize(8);
    doc.text(String(day),x+4,y+11);

    doc.setFont("helvetica","normal");
    doc.setFontSize(6.5);
    let textY=y+22;
    dayEvents.slice(0,3).forEach(event=>{
      const lines=doc.splitTextToSize(event.title,cellW-8).slice(0,2);
      if(textY+(lines.length*7)<y+cellH-3){
        doc.text(lines,x+4,textY);
        textY+=lines.length*7+2;
      }
    });
    if(dayEvents.length>3 && textY<y+cellH-4)doc.text(`+${dayEvents.length-3} more`,x+4,textY);
  }

  doc.setFont("helvetica","bold");
  doc.setFontSize(13);
  doc.text("UPCOMING AGENDA",agendaLeft,calendarTop);

  const todayKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const upcoming=events.filter(event=>event.date>=todayKey).slice(0,14);
  let agendaY=calendarTop+20;

  if(!upcoming.length){
    doc.setFont("helvetica","normal");
    doc.setFontSize(8);
    doc.text("No upcoming scheduled items.",agendaLeft,agendaY);
  }else{
    upcoming.forEach(event=>{
      if(agendaY>pageHeight-45)return;
      doc.setFont("helvetica","bold");
      doc.setFontSize(8);
      doc.text(fmtDate(event.date),agendaLeft,agendaY);
      doc.setFont("helvetica","normal");
      const titleLines=doc.splitTextToSize(event.title,agendaWidth-8).slice(0,2);
      doc.text(titleLines,agendaLeft,agendaY+10);
      agendaY+=10+(titleLines.length*8);
      if(event.detail && agendaY<pageHeight-45){
        doc.setFontSize(6.8);
        doc.text(doc.splitTextToSize(event.detail,agendaWidth-8).slice(0,1),agendaLeft,agendaY);
        agendaY+=9;
      }
      doc.setDrawColor(225);
      doc.line(agendaLeft,agendaY,agendaLeft+agendaWidth,agendaY);
      agendaY+=11;
    });
  }

  doc.setFont("helvetica","normal");
  doc.setFontSize(6.8);
  doc.text("AHT Project Control",margin,pageHeight-16);
  doc.text(`Authorized project view · ${currentUser?.name||"User"}`,pageWidth-margin,pageHeight-16,{align:"right"});

  const dateStamp=new Date().toISOString().slice(0,10);
  const filename=`${projectReportSafeFileName(p.name)}-Calendar-${dateStamp}.pdf`;
  await saveProjectPdfBlob(doc.output("blob"),filename);
}

async function downloadCurrentGanttPDF(){
'@
Replace-Exact "js/dashboard.js" $oldStart $newFunction "Add Calendar PDF exporter"

$configPath="js/config.js"
$config=Get-Content $configPath -Raw
if($config -match 'version:\s*"0\.14\.25"'){
  $config=$config -replace 'version:\s*"0\.14\.25"','version: "0.14.26"'
  Set-Content $configPath -Value $config -NoNewline
  Write-Host "PATCH: Version 0.14.26"
}elseif($config -match 'version:\s*"0\.14\.26"'){
  Write-Host "SKIP: Version already 0.14.26"
}else{
  Write-Warning "Current version is not 0.14.25. Check js/config.js before commit."
}

Write-Host ""
Write-Host "v0.14.26 patch complete."
Write-Host "Do NOT commit yet. Test both PDFs on Port 8000."
