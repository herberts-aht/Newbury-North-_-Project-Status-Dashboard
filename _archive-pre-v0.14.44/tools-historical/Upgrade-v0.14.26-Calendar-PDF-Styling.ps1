# Upgrade-v0.14.26-Calendar-PDF-Styling.ps1
# Restyles the Calendar & Agenda PDF to match the Project Control dashboard / Gantt PDF
# while preserving the existing calendar data and export behavior.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.26 - Calendar PDF Styling"
Write-Host ""

$path = "js/dashboard.js"
if (-not (Test-Path $path)) { throw "Could not find $path" }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "backup-v0.14.26-calendar-style-$stamp"
New-Item -ItemType Directory -Path "$backupDir/js" -Force | Out-Null
Copy-Item $path "$backupDir/js/dashboard.js" -Force
Write-Host "BACKUP:" $backupDir

$content = Get-Content $path -Raw

$startMarker = 'async function downloadCurrentCalendarPDF(){'
$endMarker   = 'async function downloadCurrentGanttPDF(){'

$start = $content.IndexOf($startMarker)
$end   = $content.IndexOf($endMarker)

if ($start -lt 0 -or $end -lt 0 -or $end -le $start) {
    throw "Could not locate the Calendar PDF function boundaries."
}

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

  const navy=[0,78,132], blue=[0,136,199], green=[112,173,71], orange=[237,125,49], red=[192,0,0],
        muted=[97,113,130], line=[220,228,234], soft=[244,247,249], lightBlue=[228,242,250],
        lightGreen=[232,244,224], lightOrange=[252,238,226], lightRed=[248,230,230], white=[255,255,255];

  const clean=value=>String(value??"").replace(/\s+/g," ").trim();

  function eventColor(event){
    const status=String(event.status||"");
    if(status==="Complete")return green;
    if(status==="Blocked")return red;
    if(status.includes("Waiting")||status==="Awaiting Review"||event.source==="info")return orange;
    if(status==="In Progress")return blue;
    return navy;
  }

  function eventFill(event){
    const status=String(event.status||"");
    if(status==="Complete")return lightGreen;
    if(status==="Blocked")return lightRed;
    if(status.includes("Waiting")||status==="Awaiting Review"||event.source==="info")return lightOrange;
    if(status==="In Progress")return lightBlue;
    return soft;
  }

  const events=[
    ...ds.filter(x=>x.date).map(x=>({
      date:x.date,
      title:x.deliverable,
      status:x.status||"",
      source:"deliverable",
      detail:x.status||""
    })),
    ...infoRecords.filter(x=>x.neededBy).map(x=>({
      date:x.neededBy,
      title:`${x.item} needed`,
      status:x.status||"Outstanding",
      source:"info",
      detail:x.from?`Requested from ${x.from}`:""
    }))
  ].sort((a,b)=>String(a.date).localeCompare(String(b.date)));

  const grouped={};
  events.forEach(event=>(grouped[event.date]??=[]).push(event));

  const now=new Date();
  const year=now.getFullYear();
  const month=now.getMonth();
  const monthName=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"}).format(new Date(year,month,1));

  const pageWidth=doc.internal.pageSize.getWidth();
  const pageHeight=doc.internal.pageSize.getHeight();
  const margin=28;
  const footerY=pageHeight-20;
  const contentWidth=pageWidth-(margin*2);

  function footer(){
    doc.setDrawColor(...line);
    doc.line(margin,footerY-8,pageWidth-margin,footerY-8);
    doc.setFont("helvetica","normal");
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text("AHT Global · Project Control",margin,footerY);
    doc.text(`${clean(p.name)} · Calendar · v${APP_CONFIG.version}`,pageWidth-margin,footerY,{align:"right"});
  }

  function header(){
    doc.setFont("helvetica","bold");
    doc.setTextColor(...navy);
    doc.setFontSize(9);
    doc.text("AHT GLOBAL · PROJECT CONTROL",margin,28);

    doc.setFontSize(20);
    doc.text(`${clean(p.name)} — Calendar & Agenda`,margin,51);

    doc.setFont("helvetica","normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(clean(p.subtitle||""),margin,64);

    doc.text(
      `Generated ${new Date().toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"})}`,
      pageWidth-margin,28,{align:"right"}
    );
    doc.text(`Last Updated ${formatLastUpdated(p)}`,pageWidth-margin,42,{align:"right"});

    doc.setDrawColor(...navy);
    doc.setLineWidth(2);
    doc.line(margin,76,pageWidth-margin,76);
    doc.setLineWidth(.5);
  }

  header();

  const calendarTop=100;
  const gridLeft=margin;
  const gridWidth=contentWidth*0.66;
  const agendaLeft=gridLeft+gridWidth+16;
  const agendaWidth=pageWidth-margin-agendaLeft;

  // ---- Calendar title ribbon ----
  doc.setFillColor(...navy);
  doc.roundedRect(gridLeft,calendarTop-15,gridWidth,24,5,5,"F");
  doc.setTextColor(...white);
  doc.setFont("helvetica","bold");
  doc.setFontSize(11);
  doc.text(monthName.toUpperCase(),gridLeft+10,calendarTop+1);

  const dayNames=["SUN","MON","TUE","WED","THU","FRI","SAT"];
  const headerY=calendarTop+22;
  const cellW=gridWidth/7;
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const rows=Math.ceil((firstDay+daysInMonth)/7);
  const gridBottom=footerY-20;
  const cellH=(gridBottom-(headerY+14))/rows;

  // Day-name header
  dayNames.forEach((day,index)=>{
    const x=gridLeft+(index*cellW);
    doc.setFillColor(...lightBlue);
    doc.setDrawColor(...line);
    doc.rect(x,headerY-10,cellW,18,"FD");
    doc.setTextColor(...navy);
    doc.setFont("helvetica","bold");
    doc.setFontSize(7.5);
    doc.text(day,x+(cellW/2),headerY+2,{align:"center"});
  });

  // Calendar cells
  doc.setLineWidth(.4);
  for(let row=0;row<rows;row++){
    for(let col=0;col<7;col++){
      const x=gridLeft+(col*cellW);
      const y=headerY+8+(row*cellH);
      doc.setFillColor(...white);
      doc.setDrawColor(...line);
      doc.rect(x,y,cellW,cellH,"FD");
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

    const isToday=
      day===now.getDate() &&
      month===now.getMonth() &&
      year===now.getFullYear();

    if(isToday){
      doc.setFillColor(...lightBlue);
      doc.rect(x+1,y+1,cellW-2,cellH-2,"F");
    }

    doc.setTextColor(...navy);
    doc.setFont("helvetica","bold");
    doc.setFontSize(8);
    doc.text(String(day),x+5,y+11);

    let textY=y+20;
    dayEvents.slice(0,3).forEach(event=>{
      const fill=eventFill(event);
      const accent=eventColor(event);
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
    });

    if(dayEvents.length>3 && textY<y+cellH-4){
      doc.setTextColor(...muted);
      doc.setFont("helvetica","bold");
      doc.setFontSize(5.7);
      doc.text(`+${dayEvents.length-3} more`,x+6,textY);
    }
  }

  // ---- Agenda panel ----
  doc.setFillColor(...navy);
  doc.roundedRect(agendaLeft,calendarTop-15,agendaWidth,24,5,5,"F");
  doc.setTextColor(...white);
  doc.setFont("helvetica","bold");
  doc.setFontSize(11);
  doc.text("UPCOMING AGENDA",agendaLeft+10,calendarTop+1);

  const todayKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const upcoming=events.filter(event=>event.date>=todayKey).slice(0,12);

  let agendaY=calendarTop+24;

  if(!upcoming.length){
    doc.setTextColor(...muted);
    doc.setFont("helvetica","normal");
    doc.setFontSize(8);
    doc.text("No upcoming scheduled items.",agendaLeft+4,agendaY);
  }else{
    upcoming.forEach(event=>{
      if(agendaY>footerY-34)return;

      const accent=eventColor(event);
      const fill=eventFill(event);

      doc.setFillColor(...fill);
      doc.setDrawColor(...line);
      doc.roundedRect(agendaLeft,agendaY-8,agendaWidth,32,4,4,"FD");

      doc.setFillColor(...accent);
      doc.rect(agendaLeft,agendaY-8,4,32,"F");

      doc.setTextColor(...navy);
      doc.setFont("helvetica","bold");
      doc.setFontSize(7);
      doc.text(fmtDate(event.date),agendaLeft+10,agendaY);

      doc.setTextColor(...accent);
      doc.setFontSize(7.2);
      const titleLines=doc.splitTextToSize(clean(event.title),agendaWidth-18).slice(0,1);
      doc.text(titleLines,agendaLeft+10,agendaY+10);

      doc.setTextColor(...muted);
      doc.setFont("helvetica","normal");
      doc.setFontSize(6.4);
      const detail=clean(event.detail || event.status || "");
      if(detail)doc.text(doc.splitTextToSize(detail,agendaWidth-18).slice(0,1),agendaLeft+10,agendaY+19);

      agendaY+=38;
    });
  }

  // ---- Legend ----
  const legendY=footerY-7;
  const legendItems=[
    ["In Progress",blue],
    ["Waiting",orange],
    ["Blocked",red],
    ["Complete",green]
  ];
  let legendX=gridLeft;
  legendItems.forEach(([label,color])=>{
    doc.setFillColor(...color);
    doc.roundedRect(legendX,legendY-5,7,7,2,2,"F");
    doc.setTextColor(...muted);
    doc.setFont("helvetica","normal");
    doc.setFontSize(6.5);
    doc.text(label,legendX+11,legendY+1);
    legendX+=doc.getTextWidth(label)+32;
  });

  footer();

  const dateStamp=new Date().toISOString().slice(0,10);
  const filename=`${projectReportSafeFileName(p.name)}-Calendar-${dateStamp}.pdf`;
  await saveProjectPdfBlob(doc.output("blob"),filename);
}

'@

$newContent = $content.Substring(0,$start) + $newFunction + $content.Substring($end)
Set-Content $path $newContent -NoNewline

Write-Host ""
Write-Host "PATCH: Calendar PDF now matches Project Control / Gantt styling."
Write-Host "Do NOT commit yet. Test the Calendar PDF on Port 8000 first."
