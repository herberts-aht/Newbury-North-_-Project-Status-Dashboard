// Dashboard rendering.
//
// This module controls the visible project screens. Authentication,
// permissions, storage, and project data remain separate.

function render(){
 const projects=allowedProjects();if(!projects.length)return;if(!projects.some(p=>p.id===state.currentProjectId))state.currentProjectId=projects[0].id;const p=currentProject(),ds=visibleDeliverables(p),infoRecords=visibleInfo(p);
 userLabel.textContent=currentUser.name;roleLabel.textContent=currentUser.role;avatarInitials.textContent=currentUser.name.split(" ").map(x=>x[0]).join("").slice(0,2);projectSubtitle.textContent=`${p.name} · ${p.subtitle}`;welcomeTitle.textContent=`Welcome, ${currentUser.name.split(" ")[0]}`;const displayedHealth=displayedProjectHealth(p);summaryHealth.textContent=displayedHealth;summaryHealthDot.style.background=healthColor(displayedHealth);summaryHealthMode.textContent="Automatic from deliverables";summaryHealthNote.textContent="";summaryUpdated.textContent=formatLastUpdated(p);summaryAccess.textContent=currentUser.canAdmin?"Administrator":currentUser.canEdit?"Editor":"Viewer";document.querySelectorAll(".internal-activity").forEach(x=>x.classList.toggle("hidden",!currentUser.isInternal));lastActivityDate.textContent=fmtDate(p.lastActivityDate);lastActivityText.textContent=p.lastActivity||"No activity recorded.";
 permissionBanner.textContent=currentUser.projects.includes("*")?`${currentUser.name} can view all assigned Newbury projects. ${currentUser.canAdmin?"Administrator access.":currentUser.canEdit?"Internal editing access.":"Read-only executive access."}`:`${currentUser.name} can view only: ${projects.map(x=>x.name).join(", ")}. ${currentUser.canEdit?"Internal editing access.":"Read-only external access."}`;
 document.querySelectorAll(".editor-only").forEach(x=>x.classList.toggle("hidden",!currentUser.canEdit));document.querySelectorAll(".admin-only").forEach(x=>x.classList.toggle("hidden",!currentUser.canAdmin));
 projectGrid.innerHTML=projects.map(pr=>{const active=pr.deliverables.filter(x=>x.status==="In Progress").length,waiting=pr.deliverables.filter(x=>x.status.includes("Waiting")||x.status==="Awaiting Review").length,complete=pr.deliverables.filter(x=>x.status==="Complete").length;const progress=weightedProjectProgress(pr),planning=clampPercent(pr.progressPlanning||0),engineering=clampPercent(pr.progressEngineering||0),installation=clampPercent(pr.progressInstallation||0),health=displayedProjectHealth(pr);return `<div class="project-card" onclick="setProject('${pr.id}')"><h3>${esc(pr.name)}</h3><p>${esc(pr.subtitle)}</p><div class="health"><span class="pulse" style="background:${healthColor(health)}"></span><span>${esc(health)}</span></div><div class="small" style="margin-top:6px">Updated: ${esc(formatLastUpdated(pr))}</div><div class="progress-wrap"><div class="small" style="display:flex;justify-content:space-between"><span>Overall Progress</span><strong>${progress}%</strong></div><div class="progress-bar"><span style="width:${progress}%"></span></div><div class="phase-progress"><div class="phase-progress-row"><span>Planning</span><div class="progress-bar"><span style="width:${planning}%"></span></div><strong>${planning}%</strong></div><div class="phase-progress-row"><span>Engineering</span><div class="progress-bar"><span style="width:${engineering}%"></span></div><strong>${engineering}%</strong></div><div class="phase-progress-row"><span>Installation</span><div class="progress-bar"><span style="width:${installation}%"></span></div><strong>${installation}%</strong></div></div></div><div class="stats"><div class="stat-mini"><strong>${active}</strong><span>ACTIVE</span></div><div class="stat-mini"><strong>${waiting}</strong><span>WAITING</span></div><div class="stat-mini"><strong>${complete}</strong><span>COMPLETE</span></div></div></div>`}).join("");
 const opts=projects.map(pr=>`<option value="${pr.id}" ${pr.id===p.id?"selected":""}>${esc(pr.name)}</option>`).join("");projectSelect.innerHTML=opts;document.querySelectorAll(".project-select-clone").forEach(s=>s.innerHTML=opts);
 kpiTotal.textContent=ds.length;kpiActive.textContent=ds.filter(x=>x.status==="In Progress").length;kpiWaiting.textContent=ds.filter(x=>x.status.includes("Waiting")||x.status==="Awaiting Review").length;kpiComplete.textContent=ds.filter(x=>x.status==="Complete").length;
 currentWork.innerHTML=ds.filter(x=>x.status==="In Progress").map(x=>`<div class="item"><span class="dot"></span><div><strong>${esc(x.deliverable)}</strong>${visBadge(x.visibility)}<div class="small">${esc(x.current)}</div></div></div>`).join("")||"<span class='small'>No active items.</span>";
 requiredOthers.innerHTML=infoRecords.filter(x=>x.status!=="Received").map(x=>`<div class="item"><span class="dot" style="background:var(--orange)"></span><div><strong>${esc(x.item)}</strong>${currentUser.canEdit?` <button class="linkbtn agenda-edit" onclick="editInfo(${x.id})">Edit source</button>`:""}<div class="small">${esc(x.from)} · blocks ${esc(x.blocking)}</div></div></div>`).join("")||"<span class='small'>Nothing outstanding.</span>";
 nextDeliverables.innerHTML=ds.filter(x=>x.status==="In Progress").map(x=>`<div class="item"><span class="dot" style="background:var(--green)"></span><div><strong>${esc(x.deliverable)}</strong><div class="small">${esc(x.nextStep)} · ${fmtDate(x.date)}</div></div></div>`).join("")||"<span class='small'>No active deliverables.</span>";
 projectRisks.innerHTML=ds.filter(x=>x.risk).map(x=>`<div class="item"><span class="dot" style="background:var(--red)"></span><div>${esc(x.risk)}</div></div>`).join("")||"<span class='small'>No current risks.</span>";
 const q=searchDeliverables.value.toLowerCase(),fs=filterStatus.value,fd=filterDiscipline.value,filtered=ds.filter(x=>(!q||JSON.stringify(x).toLowerCase().includes(q))&&(!fs||x.status===fs)&&(!fd||x.discipline===fd));
 deliverablesBody.innerHTML=filtered.map(x=>`<tr><td>${esc(x.discipline)}</td><td><strong>${esc(x.deliverable)}</strong>${visBadge(x.visibility)}<div class="small">${esc(x.current)}</div></td><td>${badge(x.status)}</td><td>${healthBadge(x)}</td><td>${esc(x.owner)}</td><td>${esc(x.waitingOn)}</td><td>${esc(x.nextStep)}</td><td>${fmtDate(x.date)}</td><td>${currentUser.canEdit?`<button class="linkbtn" onclick="editDeliverable(${x.id})">Edit</button>`:""}</td></tr>`).join("");
 infoBody.innerHTML=infoRecords.map(x=>`<tr><td><strong>${esc(x.item)}</strong>${visBadge(x.visibility)}</td><td>${esc(x.from)}</td><td>${badge(x.status)}</td><td>${esc(x.blocking)}</td><td>${esc(x.notes)}</td><td>${currentUser.canEdit?`<button class="linkbtn" onclick="editInfo(${x.id})">Edit</button>`:""}</td></tr>`).join("");
 infoCards.innerHTML=infoRecords.map(x=>`<div class="mobile-record"><h4>${esc(x.item)} ${visBadge(x.visibility)}</h4><div class="row"><span>Status</span><span>${badge(x.status)}</span></div><div class="row"><span>Requested From</span><strong>${esc(x.from)}</strong></div><div class="row"><span>Blocking</span><span>${esc(x.blocking)}</span></div><div class="row"><span>Needed By</span><span>${fmtDate(x.neededBy)}</span></div>${currentUser.canEdit?`<div style="margin-top:9px"><button class="linkbtn" onclick="editInfo(${x.id})">Edit source</button></div>`:""}</div>`).join("");
 const statuses=[...new Set(ds.map(x=>x.status))].sort(),disciplines=[...new Set(ds.map(x=>x.discipline))].sort(),oldS=filterStatus.value,oldD=filterDiscipline.value;filterStatus.innerHTML='<option value="">All statuses</option>'+statuses.map(s=>`<option>${esc(s)}</option>`).join("");filterStatus.value=oldS;filterDiscipline.innerHTML='<option value="">All disciplines</option>'+disciplines.map(s=>`<option>${esc(s)}</option>`).join("");filterDiscipline.value=oldD;
 timelineTrack.innerHTML=renderGantt(ds);
 const events=[...ds.filter(x=>x.date).map(x=>({date:x.date,title:x.deliverable,type:x.status==="Complete"?"green":x.status.includes("Waiting")||x.status==="Awaiting Review"?"orange":"",source:"deliverable",sourceId:x.id})),...infoRecords.filter(x=>x.neededBy).map(x=>({date:x.neededBy,title:x.item+" needed",type:"orange",source:"info",sourceId:x.id}))].sort((a,b)=>a.date.localeCompare(b.date)),grouped={};events.forEach(e=>(grouped[e.date]??=[]).push(e));agendaList.innerHTML=Object.entries(grouped).slice(0,8).map(([date,items])=>`<div class="agenda-day"><div class="agenda-date">${fmtDate(date)}</div><div class="agenda-items">${items.map(i=>`<div class="agenda-pill ${i.type}"><span>${esc(i.title)}</span>${currentUser.canEdit?`<button class="linkbtn agenda-edit" onclick="${i.source==="deliverable"?`editDeliverable(${i.sourceId})`:`editInfo(${i.sourceId})`}">Edit source</button>`:""}</div>`).join("")}</div></div>`).join("");
 let cells="";["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d=>cells+=`<div class="day-head">${d}</div>`);for(let i=0;i<6;i++)cells+=`<div class="day-cell"></div>`;for(let day=1;day<=31;day++){const key=`2026-08-${String(day).padStart(2,"0")}`,ev=grouped[key]||[];cells+=`<div class="day-cell"><div class="day-num">${day}</div>${ev.slice(0,2).map(e=>`<div class="event-dot ${e.type}" ${currentUser.canEdit?`onclick="${e.source==="deliverable"?`editDeliverable(${e.sourceId})`:`editInfo(${e.sourceId})`}" style="cursor:pointer" title="Edit source record"`:""}>${esc(e.title)}</div>`).join("")}</div>`}monthGrid.innerHTML=cells;if(currentUser.canAdmin)renderAdmin();
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
     return `<tr><td>${esc(dt)}</td><td><strong>${esc(x.userName)}</strong></td><td>${esc(x.projectName)}</td><td><span class="audit-action ${cls}">${esc(x.action)}</span></td><td>${esc(x.recordType)}: <strong>${esc(x.recordName)}</strong></td><td>${esc(x.details)}</td></tr>`
   }).join("")||'<tr><td colspan="6" class="small">No changes match the current filters.</td></tr>';
 }

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
     <div><span class="small">Phase</span><br><strong>${esc(p.phase||"Planning")}</strong></div>
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
   adminRoleSelect.innerHTML='<option>Executive Viewer</option><option>Internal Editor</option>';
   adminRoleSelect.disabled=false;
 }else if(isConfiguredAdmin||selected.canAdmin){
   adminRoleSelect.innerHTML='<option>Administrator</option>';
   adminRoleSelect.disabled=true;
 }else{
   adminRoleSelect.innerHTML='<option>Administrator</option><option>Executive Viewer</option><option>Internal Editor</option><option>External Viewer</option>';
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
