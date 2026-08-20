// Dashboard rendering.
//
// This module controls the visible project screens. Authentication,
// permissions, storage, and project data remain separate.

let calendarViewDate=new Date();

function setCalendarViewDate(value){
  const next=new Date(value);
  if(Number.isNaN(next.getTime()))return;
  calendarViewDate=new Date(next.getFullYear(),next.getMonth(),1);
  render();
}

window.calendarPrevMonth=()=>setCalendarViewDate(
  new Date(calendarViewDate.getFullYear(),calendarViewDate.getMonth()-1,1)
);

window.calendarNextMonth=()=>setCalendarViewDate(
  new Date(calendarViewDate.getFullYear(),calendarViewDate.getMonth()+1,1)
);

window.calendarToday=()=>{
  const today=new Date();
  setCalendarViewDate(new Date(today.getFullYear(),today.getMonth(),1));
};

window.calendarYearPicked=value=>{
  const year=Number(value);
  if(!Number.isFinite(year))return;
  setCalendarViewDate(new Date(year,calendarViewDate.getMonth(),1));
};

function render(){
 document.querySelectorAll(".editor-only").forEach(x=>x.classList.toggle("hidden",!currentUser?.canEdit));
 document.querySelectorAll(".admin-only").forEach(x=>x.classList.toggle("hidden",!currentUser?.canAdmin));
 const projects=allowedProjects();
 if(!projects.length){
   const profileSyncFailed=Boolean(currentUser?.accessProfileSyncError);
   if(permissionBanner) permissionBanner.textContent=profileSyncFailed
     ? "Project access could not be verified from Microsoft. Sign out and sign back in; if this continues, contact the Project Control administrator."
     : `${currentUser?.name||"This user"} does not currently have any Project Control projects assigned.`;
   if(projectGrid) projectGrid.innerHTML=profileSyncFailed
     ? '<div class="panel" style="padding:18px"><strong>Project access could not be verified.</strong><div class="small" style="margin-top:5px">Your Microsoft dashboard profile did not load. Sign out and sign back in before requesting a new project assignment.</div></div>'
     : '<div class="panel" style="padding:18px"><strong>No projects assigned.</strong><div class="small" style="margin-top:5px">Contact the Project Control administrator if project access is required.</div></div>';
   return;
 }
 if(!projects.some(p=>p.id===state.currentProjectId))state.currentProjectId=projects[0].id;const p=currentProject(),ds=visibleDeliverables(p),infoRecords=visibleInfo(p);
 userLabel.textContent=currentUser.name;roleLabel.textContent=currentUser.role;avatarInitials.textContent=currentUser.name.split(" ").map(x=>x[0]).join("").slice(0,2);projectSubtitle.textContent=`${p.name} · ${p.subtitle}`;welcomeTitle.textContent=`Welcome, ${currentUser.name.split(" ")[0]}`;const displayedHealth=displayedProjectHealth(p);summaryHealth.textContent=displayedHealth;summaryHealthDot.style.background=healthColor(displayedHealth);summaryHealthMode.textContent=activeProjectHealthOverride(p)?"Manual override":"Automatic from deliverables";summaryHealthNote.textContent=activeProjectHealthOverride(p)?(p.healthOverrideReason||""):"";summaryExecutiveLead.textContent=p.executiveLead||"—";summarySeniorProjectManager.textContent=p.seniorProjectManager||"—";summaryProjectManagerSiteLead.textContent=p.projectManagerSiteLead||"—";summaryUpdated.textContent=formatLastUpdated(p);summaryAccess.textContent=currentUser.canAdmin?"Administrator":currentUser.canEdit?"Editor":"Viewer";document.querySelectorAll(".internal-activity").forEach(x=>x.classList.toggle("hidden",!currentUser.isInternal));lastActivityDate.textContent=fmtDate(p.lastActivityDate);lastActivityText.textContent=p.lastActivity||"No activity recorded.";
 permissionBanner.textContent=currentUser.projects.includes("*")?`${currentUser.name} can view all assigned Newbury projects. ${currentUser.canAdmin?"Administrator access.":currentUser.canEdit?"Internal editing access.":"Read-only executive access."}`:`${currentUser.name} can view only: ${projects.map(x=>x.name).join(", ")}. ${currentUser.canEdit?"Internal editing access.":"Read-only external access."}`;
 document.querySelectorAll(".editor-only").forEach(x=>x.classList.toggle("hidden",!currentUser.canEdit));document.querySelectorAll(".admin-only").forEach(x=>x.classList.toggle("hidden",!currentUser.canAdmin));
 projectGrid.innerHTML=projects.map(pr=>{const waiting=pr.deliverables.filter(x=>x.status.includes("Waiting")||x.status==="Awaiting Review").length,complete=pr.deliverables.filter(x=>x.status==="Complete").length,active=Math.max(0,pr.deliverables.length-waiting-complete);const progress=weightedProjectProgress(pr),planning=displayedPhaseProgress(pr,"Planning"),engineering=displayedPhaseProgress(pr,"Engineering"),installation=displayedPhaseProgress(pr,"Installation"),health=displayedProjectHealth(pr);return `<div class="project-card" onclick="setProject('${pr.id}');showView('dashboard')"><h3>${esc(pr.name)}</h3><p>${esc(pr.subtitle)}</p><div class="health"><span class="pulse" style="background:${healthColor(health)}"></span><span>${esc(health)}</span></div><div class="small" style="margin-top:6px">Updated: ${esc(formatLastUpdated(pr))}</div><div class="progress-wrap"><div class="small" style="display:flex;justify-content:space-between"><span>Overall Progress</span><strong>${progress}%${progressModeMark(pr.progressOverallMode||"auto")}</strong></div><div class="progress-bar"><span style="width:${progress}%"></span></div><div class="phase-progress"><div class="phase-progress-row"><span>Planning</span><div class="progress-bar"><span style="width:${planning}%"></span></div><strong><span class="phase-progress-value">${planning}%</span>${progressModeMark(phaseProgressMode(pr,"Planning"))}</strong></div><div class="phase-progress-row"><span>Engineering</span><div class="progress-bar"><span style="width:${engineering}%"></span></div><strong><span class="phase-progress-value">${engineering}%</span>${progressModeMark(phaseProgressMode(pr,"Engineering"))}</strong></div><div class="phase-progress-row"><span>Installation</span><div class="progress-bar"><span style="width:${installation}%"></span></div><strong><span class="phase-progress-value">${installation}%</span>${progressModeMark(phaseProgressMode(pr,"Installation"))}</strong></div></div></div><div class="stats"><div class="stat-mini"><strong>${active}</strong><span>ACTIVE</span></div><div class="stat-mini"><strong>${waiting}</strong><span>WAITING</span></div><div class="stat-mini"><strong>${complete}</strong><span>COMPLETE</span></div></div></div>`}).join("");
 const opts=projects.map(pr=>`<option value="${pr.id}" ${pr.id===p.id?"selected":""}>${esc(pr.name)}</option>`).join("");projectSelect.innerHTML=opts;document.querySelectorAll(".project-select-clone").forEach(s=>s.innerHTML=opts);
 const summaryWaiting=ds.filter(x=>x.status.includes("Waiting")||x.status==="Awaiting Review").length,summaryComplete=ds.filter(x=>x.status==="Complete").length,summaryActive=Math.max(0,ds.length-summaryWaiting-summaryComplete);kpiTotal.textContent=ds.length;kpiActive.textContent=summaryActive;kpiWaiting.textContent=summaryWaiting;kpiComplete.textContent=summaryComplete;
 currentWork.innerHTML=ds.filter(x=>x.status==="In Progress").map(x=>`<div class="item"><span class="dot"></span><div><strong>${esc(x.deliverable)}</strong>${visBadge(x.visibility)}<div class="small">${esc(x.current)}</div></div></div>`).join("")||"<span class='small'>No active items.</span>";
 requiredOthers.innerHTML=infoRecords.filter(x=>x.status!=="Received").map(x=>`<div class="item"><span class="dot" style="background:var(--orange)"></span><div><strong>${esc(x.item)}</strong>${currentUser.canEdit?` <button class="linkbtn agenda-edit" onclick="editInfo(${x.id})">Edit source</button>`:""}<div class="small">${esc(x.from)} · blocks ${esc(x.blocking)}</div></div></div>`).join("")||"<span class='small'>Nothing outstanding.</span>";
 nextDeliverables.innerHTML=ds.filter(x=>x.status==="In Progress").map(x=>`<div class="item"><span class="dot" style="background:var(--green)"></span><div><strong>${esc(x.deliverable)}</strong><div class="small">${esc(x.nextStep)} · ${fmtDate(x.date)}</div></div></div>`).join("")||"<span class='small'>No active deliverables.</span>";
 projectRisks.innerHTML=ds.filter(x=>x.risk).map(x=>`<div class="item"><span class="dot" style="background:var(--red)"></span><div>${esc(x.risk)}</div></div>`).join("")||"<span class='small'>No current risks.</span>";
 const q=searchDeliverables.value.toLowerCase(),fs=filterStatus.value,fd=filterDiscipline.value,filtered=ds.filter(x=>(!q||JSON.stringify(x).toLowerCase().includes(q))&&(!fs||x.status===fs)&&(!fd||x.discipline===fd));
 deliverablesBody.innerHTML=filtered.map(x=>`<tr><td>${esc(x.discipline)}</td><td><strong>${esc(x.deliverable)}</strong>${visBadge(x.visibility)}<div class="small">${esc(x.current)}</div></td><td>${badge(x.status)}</td><td>${healthBadge(x)}</td><td>${esc(x.owner)}</td><td>${esc(x.waitingOn)}</td><td>${esc(x.nextStep)}</td><td>${fmtDate(x.date)}</td><td>${currentUser.canEdit?`<button class="linkbtn" onclick="editDeliverable(${x.id})">Edit</button>`:""}</td></tr>`).join("");
 deliverableCards.innerHTML=filtered.map(x=>`<div class="mobile-record mobile-deliverable"><div class="mobile-record-heading"><div><div class="mobile-record-kicker">${esc(x.discipline)}</div><h4>${esc(x.deliverable)} ${visBadge(x.visibility)}</h4></div><span>${badge(x.status)}</span></div>${x.current?`<div class="mobile-record-current">${esc(x.current)}</div>`:""}<div class="row"><span>Schedule Health</span><span>${healthBadge(x)}</span></div><div class="row"><span>Owner</span><strong>${esc(x.owner)||"—"}</strong></div><div class="row"><span>Waiting On</span><span>${esc(x.waitingOn)||"—"}</span></div><div class="row"><span>Next Step</span><span>${esc(x.nextStep)||"—"}</span></div><div class="row"><span>Target</span><span>${fmtDate(x.date)}</span></div>${currentUser.canEdit?`<div class="mobile-record-actions"><button class="btn" onclick="editDeliverable(${x.id})">Edit Deliverable</button></div>`:""}</div>`).join("")||'<div class="mobile-empty">No deliverables match the current filters.</div>';
 infoBody.innerHTML=infoRecords.map(x=>`<tr><td><strong>${esc(x.item)}</strong>${visBadge(x.visibility)}</td><td>${esc(x.from)}</td><td>${badge(x.status)}</td><td>${esc(x.blocking)}</td><td>${esc(x.notes)}</td><td>${currentUser.canEdit?`<button class="linkbtn" onclick="editInfo(${x.id})">Edit</button>`:""}</td></tr>`).join("");
 infoCards.innerHTML=infoRecords.map(x=>`<div class="mobile-record mobile-info"><div class="mobile-record-heading"><h4>${esc(x.item)} ${visBadge(x.visibility)}</h4><span>${badge(x.status)}</span></div><div class="row"><span>Requested From</span><strong>${esc(x.from)||"—"}</strong></div><div class="row"><span>Blocking</span><span>${esc(x.blocking)||"—"}</span></div><div class="row"><span>Needed By</span><span>${fmtDate(x.neededBy)}</span></div>${x.notes?`<div class="mobile-record-current">${esc(x.notes)}</div>`:""}${currentUser.canEdit?`<div class="mobile-record-actions"><button class="btn" onclick="editInfo(${x.id})">Edit Request</button></div>`:""}</div>`).join("")||'<div class="mobile-empty">No information requests for this project.</div>';
 const statuses=[...new Set(ds.map(x=>x.status))].sort(),disciplines=[...new Set(ds.map(x=>x.discipline))].sort(),oldS=filterStatus.value,oldD=filterDiscipline.value;filterStatus.innerHTML='<option value="">All statuses</option>'+statuses.map(s=>`<option>${esc(s)}</option>`).join("");filterStatus.value=oldS;filterDiscipline.innerHTML='<option value="">All disciplines</option>'+disciplines.map(s=>`<option>${esc(s)}</option>`).join("");filterDiscipline.value=oldD;
 timelineTrack.innerHTML=renderGantt(ds);
 const events=[...ds.filter(x=>x.date).map(x=>({date:x.date,title:x.deliverable,type:x.status==="Complete"?"green":x.status.includes("Waiting")||x.status==="Awaiting Review"?"orange":"",source:"deliverable",sourceId:x.id})),...infoRecords.filter(x=>x.neededBy).map(x=>({date:x.neededBy,title:x.item+" needed",type:"orange",source:"info",sourceId:x.id}))].sort((a,b)=>a.date.localeCompare(b.date)),grouped={};events.forEach(e=>(grouped[e.date]??=[]).push(e));agendaList.innerHTML=Object.entries(grouped).slice(0,8).map(([date,items])=>`<div class="agenda-day"><div class="agenda-date">${fmtDate(date)}</div><div class="agenda-items">${items.map(i=>`<div class="agenda-pill ${i.type}"><span>${esc(i.title)}</span>${currentUser.canEdit?`<button class="linkbtn agenda-edit" onclick="${i.source==="deliverable"?`editDeliverable(${i.sourceId})`:`editInfo(${i.sourceId})`}">Edit source</button>`:""}</div>`).join("")}</div></div>`).join("");
 const now=new Date(),
calendarYear=calendarViewDate.getFullYear(),
calendarMonth=calendarViewDate.getMonth(),
firstDay=new Date(calendarYear,calendarMonth,1).getDay(),
daysInMonth=new Date(calendarYear,calendarMonth+1,0).getDate();

const calendarTodayLabel=document.getElementById("calendarTodayLabel");
if(calendarTodayLabel)calendarTodayLabel.textContent=new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric"}).format(now);

const calendarMonthName=document.getElementById("calendarMonthName");
if(calendarMonthName){
  calendarMonthName.textContent=new Intl.DateTimeFormat("en-US",{month:"long"}).format(new Date(calendarYear,calendarMonth,1));
}

const calendarYearPicker=document.getElementById("calendarYearPicker");
if(calendarYearPicker){
  if(!calendarYearPicker.options.length){
    const currentYear=now.getFullYear();
    const startYear=Math.min(currentYear-2,calendarYear-2);
    const endYear=Math.max(currentYear+8,calendarYear+8);
    let options="";
    for(let y=startYear;y<=endYear;y++)options+=`<option value="${y}">${y}</option>`;
    calendarYearPicker.innerHTML=options;
  }
  calendarYearPicker.value=String(calendarYear);
}

let cells="";
["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
  .forEach(d=>cells+=`<div class="day-head">${d}</div>`);

for(let i=0;i<firstDay;i++)cells+=`<div class="day-cell"></div>`;

for(let day=1;day<=daysInMonth;day++){
  const key=`${calendarYear}-${String(calendarMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`,
        ev=grouped[key]||[],
        todayClass=
          day===now.getDate() &&
          calendarMonth===now.getMonth() &&
          calendarYear===now.getFullYear()
            ?" today":"";

  cells+=`<div class="day-cell${todayClass}">
    <div class="day-num">${day}</div>
    ${ev.slice(0,2).map(e=>`<div class="event-dot ${e.type}" ${
      currentUser.canEdit
        ?`onclick="${e.source==="deliverable"
            ?`editDeliverable(${e.sourceId})`
            :`editInfo(${e.sourceId})`
          }" style="cursor:pointer" title="Edit source record"`
        :""
    }>${esc(e.title)}</div>`).join("")}
  </div>`;
}

monthGrid.innerHTML=cells;
if(currentUser.canAdmin)renderAdmin();
 if(currentUser.canAdmin){
   const uq=[...new Set(state.auditLog.map(x=>x.userName))].sort();
   const pq=[...new Set(state.auditLog.map(x=>x.projectName))].sort();
   const oldU=auditUserFilter.value,oldP=auditProjectFilter.value,oldA=auditActionFilter.value;
   auditUserFilter.innerHTML='<option value="">All users</option>'+uq.map(x=>`<option>${esc(x)}</option>`).join("");
   auditProjectFilter.innerHTML='<option value="">All projects</option>'+pq.map(x=>`<option>${esc(x)}</option>`).join("");
   auditUserFilter.value=oldU;auditProjectFilter.value=oldP;auditActionFilter.value=oldA;
   const aq=auditSearch.value.toLowerCase();
   const filteredAudit=state.auditLog.filter(x=>
     (!aq||JSON.stringify(x).toLowerCase().includes(aq))&&
     (!auditUserFilter.value||x.userName===auditUserFilter.value)&&
     (!auditProjectFilter.value||x.projectName===auditProjectFilter.value)&&
     (!auditActionFilter.value||x.action===auditActionFilter.value)
   ).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
   auditCount.textContent=`Showing ${filteredAudit.length} of ${state.auditLog.length} entries.`;
   auditBody.innerHTML=filteredAudit.map(x=>{
     const cls=x.action==="Create"?"audit-create":x.action==="Delete"?"audit-delete":x.action==="Access Change"?"audit-access":"audit-update";
     const parsedDate=new Date(x.timestamp);
     const dt=Number.isNaN(parsedDate.getTime())?"Unknown date":parsedDate.toLocaleString("en-US");
     return `<tr><td>${esc(dt)}</td><td><strong>${esc(x.userName)}</strong></td><td>${esc(x.projectName)}</td><td><span class="audit-action ${cls}">${esc(x.action)}</span></td><td>${esc(x.recordType)}: <strong>${esc(x.recordName)}</strong></td><td>${esc(formatAuditDetails(x.details))}</td></tr>`
   }).join("")||'<tr><td colspan="6" class="small">No changes match the current filters.</td></tr>';
 }

}



function formatAuditDetails(details){
  const text=String(details||"");
  const labels={startDate:"Start Date",date:"Target Date",targetDate:"Target Date",neededBy:"Needed By",current:"Current Activity",waitingOn:"Waiting On",nextStep:"Next Step",status:"Status"};
  const dateKeys=new Set(["startDate","date","targetDate","neededBy"]);
  const parts=text.split(/;\s*/);
  const formatted=parts.map(part=>{
    const m=part.match(/^([A-Za-z][A-Za-z0-9]*):\s*"(.*?)"\s*→\s*"(.*?)"$/);
    if(!m)return part;
    const [,key,a,b]=m;
    const pretty=v=>{
      if(!v)return "Not set";
      if(dateKeys.has(key)&&/^\d{4}-\d{2}-\d{2}/.test(v)){
        const d=new Date(`${v.slice(0,10)}T12:00:00`);
        if(!Number.isNaN(d.getTime()))return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
      }
      return v;
    };
    return `${labels[key]||key}: ${pretty(a)} → ${pretty(b)}`;
  });
  return formatted.join("; ");
}

function ganttDate(value){
 if(!value)return null;
 const date=new Date(`${value}T12:00:00`);
 return Number.isNaN(date.getTime())?null:date;
}
function ganttIso(date){
 const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,"0"),day=String(date.getDate()).padStart(2,"0");
 return `${year}-${month}-${day}`;
}
function ganttShort(iso){
 const date=ganttDate(iso);
 if(!date)return "";
 const day=String(date.getDate()).padStart(2,"0");
 const month=date.toLocaleString("en-US",{month:"short"});
 return `${day} ${month} ${date.getFullYear()}`;
}
function ganttAddDays(date,days){const next=new Date(date);next.setDate(next.getDate()+days);return next}
function ganttStartFor(record){
 const explicit=ganttDate(record.startDate);if(explicit)return explicit;
 const target=ganttDate(record.date);if(!target)return null;
 return ganttAddDays(target,record.status==="Complete"?-7:-14);
}
function ganttStatusClass(record){
 if(record.status==="Complete")return "complete";
 if(record.status==="Blocked")return "blocked";
 if(record.status.includes("Waiting")||record.status==="Awaiting Review")return "waiting";
 if(record.status==="In Progress")return "active";
 return "pending";
}
let ganttCollapsedGroups=new Set();

function resetGanttGroups(){
 ganttCollapsedGroups.clear();
}

function toggleGanttGroup(encodedDiscipline){
 const discipline=decodeURIComponent(encodedDiscipline);
 if(ganttCollapsedGroups.has(discipline)){
   ganttCollapsedGroups.delete(discipline);
 }else{
   ganttCollapsedGroups.add(discipline);
 }
 render();
}

function renderGantt(records){
 const scheduled=records
   .map(record=>({record,start:ganttStartFor(record),end:ganttDate(record.date)}))
   .filter(item=>item.start&&item.end);
 const unscheduled=records.filter(record=>!ganttDate(record.date));

 if(!scheduled.length){
   return `<div class="gantt-empty">No deliverables currently have target dates.${currentUser.canEdit?" Add dates from the Deliverables view to build the schedule.":""}</div>`;
 }

 const earliest=new Date(Math.min(...scheduled.map(item=>item.start)));
 const latest=new Date(Math.max(...scheduled.map(item=>item.end)));
 const rangeStart=ganttAddDays(earliest,-3);
 const rangeEnd=ganttAddDays(latest,5);
 const totalDays=Math.max(1,Math.round((rangeEnd-rangeStart)/86400000));
 const weekGridWidth=(7/totalDays)*100;
 const today=ganttDate(new Date());
 const todayOffset=((today-rangeStart)/86400000/totalDays)*100;

 const weeks=[];
 for(let cursor=new Date(rangeStart);cursor<=rangeEnd;cursor=ganttAddDays(cursor,7)){
   const offset=((cursor-rangeStart)/86400000/totalDays)*100;
   weeks.push(`<span style="left:${offset}%">${fmtDate(ganttIso(cursor))}</span>`);
 }

 const disciplineOrder=[];
 const grouped=new Map();
 scheduled.forEach(item=>{
   const discipline=(item.record.discipline||"Other").trim()||"Other";
   if(!grouped.has(discipline)){
     grouped.set(discipline,[]);
     disciplineOrder.push(discipline);
   }
   grouped.get(discipline).push(item);
 });

 const groupedRows=disciplineOrder.map(discipline=>{
   const items=grouped.get(discipline)
     .slice()
     .sort((a,b)=>a.start-b.start||a.end-b.end||a.record.deliverable.localeCompare(b.record.deliverable));
   const collapsed=ganttCollapsedGroups.has(discipline);
   const encoded=encodeURIComponent(discipline);

   const rows=collapsed?"":items.map(({record,start,end})=>{
     if(start>end){
       const swap=start;
       start=end;
       end=swap;
     }

     const left=Math.max(0,((start-rangeStart)/86400000/totalDays)*100);
     const width=Math.max(1.5,(((end-start)/86400000+1)/totalDays)*100);
     const blocked=/blocked|waiting/i.test(record.status||"")||Boolean(record.waitingOn);
     const inferred=!ganttDate(record.startDate);

     return `<div class="gantt-row">
       <div class="gantt-label" ${currentUser.canEdit?`onclick="editDeliverable(${record.id})"`:""}>
         <strong title="${esc(record.deliverable)}">${esc(record.deliverable)}</strong>
         <span>${badge(record.status)}</span>
       </div>
       <div class="gantt-lane" style="--gantt-week:${weekGridWidth}%">
         ${todayOffset>=0&&todayOffset<=100?`<i class="gantt-today" style="left:${todayOffset}%" title="Today"></i>`:""}
         <button class="gantt-bar ${ganttStatusClass(record)}"
           style="left:${left}%;width:${width}%"
           ${currentUser.canEdit?`onclick="editDeliverable(${record.id})"`:""}
           title="${esc(record.deliverable)}: ${fmtDate(ganttIso(start))} – ${fmtDate(ganttIso(end))}${inferred?" (start estimated)":""}">
           
           <span>${ganttShort(ganttIso(start))} → ${ganttShort(record.date)}</span>
         </button>
       </div>
     </div>`;
   }).join("");

   return `<section class="gantt-group">
     <button class="gantt-group-header" type="button" onclick="toggleGanttGroup('${encoded}')" aria-expanded="${collapsed?"false":"true"}">
       <span class="gantt-group-arrow">${collapsed?"▶":"▼"}</span>
       <strong>${esc(discipline)}</strong>
       <span class="gantt-group-count">${items.length}</span>
     </button>
     ${rows}
   </section>`;
 }).join("");

 return `<div class="gantt-shell">
   <div class="gantt-legend">
     <span><i class="active"></i>In progress</span>
     <span><i class="waiting"></i>Waiting</span>
     <span><i class="blocked"></i>Blocked</span>
     <span><i class="complete"></i>Complete</span>
     <span class="gantt-note">Missing start dates use a temporary 14-day estimate until manually entered.</span>
   </div>
   <div class="gantt-scroll">
     <div class="gantt-head">
       <div>Deliverable</div>
       <div class="gantt-scale" style="--gantt-week:${weekGridWidth}%">
         ${weeks.join("")}
         ${todayOffset>=0&&todayOffset<=100?`<i class="gantt-today head" style="left:${todayOffset}%"></i>`:""}
       </div>
     </div>
     ${groupedRows}
   </div>
   ${unscheduled.length?`<div class="gantt-unscheduled"><strong>Unscheduled:</strong> ${unscheduled.map(record=>esc(record.deliverable)).join(", ")}</div>`:""}
 </div>`;
}

function renderAdmin(){
 if(!currentUser?.canAdmin)return;
 projectAdminList.innerHTML=state.projects.map(p=>`
   <div class="project-admin-row ${p.archived?"archived":""}">
     <div><strong>${esc(p.name)}</strong><div class="small">${esc(p.subtitle||"Naples, FL")}</div></div>
     <div><span class="small">Phase</span><br><strong>${esc(p.phase||"Planning")}</strong><div class="small">${esc(p.executiveLead||"No Executive Lead")} · ${esc(p.seniorProjectManager||"No SPM")}</div></div>
     <div><span class="small">Schedule Health</span><br><strong>${esc(displayedProjectHealth(p))}</strong><div class="small">Automatic from deliverables</div></div>
     <div class="project-admin-actions">
       <button class="btn" onclick="editProject('${p.id}')">Edit</button>
       <button class="btn" onclick="toggleArchive('${p.id}')">${p.archived?"Restore":"Archive"}</button>
     </div>
   </div>`).join("");

 const previousSelection=adminUserSelect.value;
 const includeArchived=showArchivedUsers.checked;
 const visibleUsers=USERS
   .filter(user=>includeArchived||user.active!==false)
   .slice()
   .sort((a,b)=>a.name.localeCompare(b.name));

 adminUserSelect.innerHTML='<option value="">Select user…</option>'+visibleUsers
   .map(u=>`<option value="${u.id}">${esc(u.name)}${u.active===false?" (Archived)":""}</option>`)
   .join("");

 if(creatingUser){
   adminUserSelect.value="";
   return;
 }

 const selected=visibleUsers.find(u=>u.id===previousSelection)||visibleUsers.find(u=>u.id===currentUser?.id)||visibleUsers[0];
 if(!selected)return;

 adminUserSelect.value=selected.id;
 adminUserName.value=selected.name||"";
 adminUserEmail.value=selected.email||"";
 adminUserCompany.value=selected.company||"";
 const isConfiguredAdmin=(APP_CONFIG.entra.adminEmails||[]).map(x=>String(x).toLowerCase()).includes(String(selected.email||"").toLowerCase());
 if(selected.entraUserType==="Guest"){
   adminRoleSelect.innerHTML='<option>External Viewer</option>';
   adminRoleSelect.disabled=true;
 }else if(selected.entraUserType==="Member"&&!isConfiguredAdmin){
   adminRoleSelect.innerHTML='<option>Administrator</option><option>Viewer</option><option>Editor</option>';
   adminRoleSelect.disabled=false;
 }else if(isConfiguredAdmin){
   adminRoleSelect.innerHTML='<option>Administrator</option>';
   adminRoleSelect.disabled=true;
 }else{
   adminRoleSelect.innerHTML='<option>Administrator</option><option>Viewer</option><option>Editor</option><option>External Viewer</option>';
   adminRoleSelect.disabled=false;
 }
 adminRoleSelect.value=selected.role;
 adminPasswordProfile.value=selected.id==="stacy"?"stacy":selected.passwordProfile||(selected.isInternal?"aht":"external");
 adminPasswordProfile.disabled=selected.id==="stacy";
 adminUserActive.checked=selected.active!==false;
 archiveUserBtn.textContent=selected.active===false?"Archived":"Archive User";
 archiveUserBtn.disabled=selected.active===false||selected.id===currentUser?.id||(selected.role==="Administrator"&&activeAdministratorCount()<=1);

 projectAssignmentList.innerHTML=state.projects.map(p=>{
   const checked=selected.projects.includes("*")||selected.projects.includes(p.id);
   return `<label style="display:block;margin:7px 0;font-size:13px"><input type="checkbox" value="${p.id}" ${checked?"checked":""}> ${esc(p.name)}</label>`;
 }).join("");
}

function printCurrentProjectReport(){
 const p=currentProject();
 if(!p)return;

 const ds=visibleDeliverables(p);
 const infoRecords=visibleInfo(p);
 const waiting=ds.filter(x=>x.status.includes("Waiting")||x.status==="Awaiting Review").length;
 const complete=ds.filter(x=>x.status==="Complete").length;
 const active=Math.max(0,ds.length-waiting-complete);
 const current=ds.filter(x=>x.status==="In Progress");
 const next=current;
 const risks=ds.filter(x=>x.risk);
 const outstandingInfo=infoRecords.filter(x=>x.status!=="Received"&&x.status!=="No Longer Needed");
 const progress=weightedProjectProgress(p);
 const planning=displayedPhaseProgress(p,"Planning");
 const engineering=displayedPhaseProgress(p,"Engineering");
 const installation=displayedPhaseProgress(p,"Installation");
 const health=displayedProjectHealth(p);
 const generated=new Date().toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"});

 const reportEsc=value=>esc(String(value??""));
 const reportDate=value=>value?fmtDate(value):"—";

 const bulletList=(items,emptyText,renderer)=>items.length
   ? `<ul class="clean-list">${items.map(renderer).join("")}</ul>`
   : `<div class="empty">${reportEsc(emptyText)}</div>`;

 const deliverableRows=ds.map(x=>`
   <tr>
     <td>${reportEsc(x.discipline)}</td>
     <td><strong>${reportEsc(x.deliverable)}</strong>${x.current?`<div class="sub">${reportEsc(x.current)}</div>`:""}</td>
     <td>${reportEsc(x.status)}</td>
     <td>${reportEsc(x.owner||"—")}</td>
     <td>${reportEsc(x.waitingOn||"—")}</td>
     <td>${reportEsc(x.nextStep||"—")}</td>
     <td class="nowrap">${reportDate(x.date)}</td>
   </tr>`).join("");

 const infoRows=infoRecords.map(x=>`
   <tr>
     <td><strong>${reportEsc(x.item)}</strong></td>
     <td>${reportEsc(x.from||"—")}</td>
     <td>${reportEsc(x.status||"—")}</td>
     <td>${reportEsc(x.blocking||"—")}</td>
     <td class="nowrap">${reportDate(x.neededBy)}</td>
     <td>${reportEsc(x.notes||"—")}</td>
   </tr>`).join("");

 const html=`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${reportEsc(p.name)} - Project Control Report</title>
<style>
  :root{--navy:#0c2338;--blue:#145f8a;--muted:#617182;--line:#dce4ea;--soft:#f4f7f9;--red:#9c3434;--orange:#a96518;--green:#277149}
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;margin:0;color:#17212a;background:#fff;font-size:11px;line-height:1.4}
  .page{max-width:1080px;margin:0 auto;padding:28px}
  .report-header{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid var(--navy);padding-bottom:14px;margin-bottom:16px}
  h1{font-size:25px;line-height:1.1;margin:0;color:var(--navy)}
  .subtitle{font-size:12px;color:var(--muted);margin-top:5px}
  .report-meta{text-align:right;color:var(--muted);font-size:10px}
  .brand{font-weight:800;color:var(--navy);font-size:13px;margin-bottom:4px}
  .ribbon{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:14px}
  .cell{padding:10px;border-right:1px solid var(--line);min-height:60px}
  .cell:last-child{border-right:0}
  .label{text-transform:uppercase;font-size:8px;letter-spacing:.06em;color:var(--muted);font-weight:800}
  .value{font-size:12px;font-weight:750;color:var(--navy);margin-top:4px}
  .health{display:inline-block;padding:3px 7px;border:1px solid var(--line);border-radius:999px}
  .progress-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 14px}
  .progress-card{border:1px solid var(--line);border-radius:7px;padding:9px}
  .pct{font-size:20px;font-weight:800;color:var(--navy)}
  .bar{height:5px;background:#e8edf1;border-radius:999px;margin-top:6px;overflow:hidden}
  .bar span{display:block;height:100%;background:var(--blue)}
  .count-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
  .count{border:1px solid var(--line);border-radius:7px;padding:8px;text-align:center}
  .count strong{font-size:18px;color:var(--navy);display:block}
  .count span{font-size:8px;color:var(--muted);font-weight:800;letter-spacing:.05em}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
  .panel{border:1px solid var(--line);border-radius:7px;overflow:hidden;break-inside:avoid}
  .panel h2{font-size:10px;letter-spacing:.06em;margin:0;padding:8px 10px;background:var(--soft);color:var(--navy)}
  .panel-body{padding:8px 10px}
  .clean-list{padding-left:17px;margin:0}
  .clean-list li{margin:0 0 6px}
  .sub{color:var(--muted);font-size:9px;margin-top:2px}
  .empty{color:var(--muted);font-style:italic}
  .section-title{font-size:14px;color:var(--navy);border-bottom:1px solid var(--line);padding-bottom:5px;margin:18px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:9px}
  th{text-align:left;background:var(--soft);color:var(--navy);font-size:8px;text-transform:uppercase;letter-spacing:.04em;padding:6px;border:1px solid var(--line)}
  td{vertical-align:top;padding:6px;border:1px solid var(--line)}
  .nowrap{white-space:nowrap}
  .footer{margin-top:16px;padding-top:8px;border-top:1px solid var(--line);font-size:8px;color:var(--muted);display:flex;justify-content:space-between}
  @media print{
    @page{size:landscape;margin:.38in}
    .page{max-width:none;padding:0}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    thead{display:table-header-group}
    tr{break-inside:avoid}
    .panel,.progress-card,.count{break-inside:avoid}
  }
</style>
</head>
<body>
<div class="page">
  <div class="report-header">
    <div>
      <div class="brand">AHT GLOBAL · PROJECT CONTROL</div>
      <h1>${reportEsc(p.name)}</h1>
      <div class="subtitle">${reportEsc(p.subtitle||"")}</div>
    </div>
    <div class="report-meta">
      <strong>Project Report</strong><br>
      Generated ${reportEsc(generated)}<br>
      Last Updated ${reportEsc(formatLastUpdated(p))}
    </div>
  </div>

  <div class="ribbon">
    <div class="cell"><div class="label">Project Health</div><div class="value"><span class="health">${reportEsc(health)}</span></div></div>
    <div class="cell"><div class="label">Executive Lead</div><div class="value">${reportEsc(p.executiveLead||"—")}</div></div>
    <div class="cell"><div class="label">Senior Project Manager</div><div class="value">${reportEsc(p.seniorProjectManager||"—")}</div></div>
    <div class="cell"><div class="label">Project Manager / Site Lead</div><div class="value">${reportEsc(p.projectManagerSiteLead||"—")}</div></div>
    <div class="cell"><div class="label">Project Phase</div><div class="value">${reportEsc(p.phase||"—")}</div></div>
  </div>

  <div class="progress-grid">
    ${[
      ["Overall",progress],
      ["Planning",planning],
      ["Engineering",engineering],
      ["Installation",installation]
    ].map(([label,value])=>`<div class="progress-card"><div class="label">${label} Progress</div><div class="pct">${value}%</div><div class="bar"><span style="width:${value}%"></span></div></div>`).join("")}
  </div>

  <div class="count-grid">
    <div class="count"><strong>${ds.length}</strong><span>DELIVERABLES</span></div>
    <div class="count"><strong>${active}</strong><span>ACTIVE</span></div>
    <div class="count"><strong>${waiting}</strong><span>WAITING / REVIEW</span></div>
    <div class="count"><strong>${complete}</strong><span>COMPLETE</span></div>
  </div>

  <div class="grid-2">
    <div class="panel">
      <h2>CURRENT WORK</h2>
      <div class="panel-body">${bulletList(current,"No active work.",x=>`<li><strong>${reportEsc(x.deliverable)}</strong>${x.current?`<div class="sub">${reportEsc(x.current)}</div>`:""}</li>`)}</div>
    </div>
    <div class="panel">
      <h2>REQUIRED FROM OTHERS</h2>
      <div class="panel-body">${bulletList(outstandingInfo,"Nothing outstanding.",x=>`<li><strong>${reportEsc(x.item)}</strong><div class="sub">${reportEsc(x.from||"—")} · blocks ${reportEsc(x.blocking||"—")}</div></li>`)}</div>
    </div>
    <div class="panel">
      <h2>NEXT DELIVERABLES</h2>
      <div class="panel-body">${bulletList(next,"No active deliverables.",x=>`<li><strong>${reportEsc(x.deliverable)}</strong><div class="sub">${reportEsc(x.nextStep||"—")} · ${reportDate(x.date)}</div></li>`)}</div>
    </div>
    <div class="panel">
      <h2>PROJECT RISKS</h2>
      <div class="panel-body">${bulletList(risks,"No current risks.",x=>`<li>${reportEsc(x.risk)}</li>`)}</div>
    </div>
  </div>

  <div class="section-title">Deliverables</div>
  <table>
    <thead><tr><th>Discipline</th><th>Deliverable / Current Activity</th><th>Status</th><th>Owner</th><th>Waiting On</th><th>Next Step</th><th>Target</th></tr></thead>
    <tbody>${deliverableRows||'<tr><td colspan="7">No deliverables.</td></tr>'}</tbody>
  </table>

  <div class="section-title">Information Required</div>
  <table>
    <thead><tr><th>Item Needed</th><th>Requested From</th><th>Status</th><th>Blocking</th><th>Needed By</th><th>Notes</th></tr></thead>
    <tbody>${infoRows||'<tr><td colspan="6">No information requests.</td></tr>'}</tbody>
  </table>

  <div class="footer">
    <span>AHT Global · Project Control</span>
    <span>${reportEsc(p.name)} · v${reportEsc(APP_CONFIG.version)}</span>
  </div>
</div>
<script>
  window.addEventListener("load",()=>setTimeout(()=>window.print(),250));
</script>
</body>
</html>`;

 const reportWindow=window.open("","_blank");
 if(!reportWindow){
   alert("The browser blocked the Project Report window. Allow pop-ups for Project Control and try again.");
   return;
 }
 reportWindow.document.open();
 reportWindow.document.write(html);
 reportWindow.document.close();
}

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

  const panelGap=10;
  const panelW=(contentWidth-panelGap)/2;
  summaryPanel("CURRENT WORK",current.map(x=>`${x.deliverable}${x.current?` — ${x.current}`:""}`),margin,265,panelW,blue);
  summaryPanel("REQUIRED FROM OTHERS",outstandingInfo.map(x=>`${x.item} — ${x.from||"—"}${x.blocking?`; blocks ${x.blocking}`:""}`),margin+panelW+panelGap,265,panelW,orange);
  summaryPanel("NEXT DELIVERABLES",current.map(x=>`${x.deliverable} — ${x.nextStep||"—"}${x.date?`; ${date(x.date)}`:""}`),margin,361,panelW,green);
  summaryPanel("PROJECT RISKS",risks.map(x=>x.risk),margin+panelW+panelGap,361,panelW,red);

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

  pageFooter();

  const filename=`${projectReportSafeFileName(p.name)}-Project-Report-${dateStamp}.pdf`;
  const blob=doc.output("blob");
  await saveProjectPdfBlob(blob,filename);
}

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
  const year=calendarViewDate.getFullYear();
  const month=calendarViewDate.getMonth();
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
async function downloadCurrentGanttPDF(){
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
