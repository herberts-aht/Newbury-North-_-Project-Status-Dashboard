// Dashboard rendering.
//
// This module controls the visible project screens. Authentication,
// permissions, storage, and project data remain separate.

function render(){
 const projects=allowedProjects();if(!projects.length)return;if(!projects.some(p=>p.id===state.currentProjectId))state.currentProjectId=projects[0].id;const p=currentProject(),ds=visibleDeliverables(p),infoRecords=visibleInfo(p);
 userLabel.textContent=currentUser.name;roleLabel.textContent=currentUser.role;avatarInitials.textContent=currentUser.name.split(" ").map(x=>x[0]).join("").slice(0,2);projectSubtitle.textContent=`${p.name} · ${p.subtitle}`;welcomeTitle.textContent=`Welcome, ${currentUser.name.split(" ")[0]}`;const displayedHealth=displayedProjectHealth(p),calculatedHealth=calculateProjectHealth(p),manualHealth=(p.healthMode||"auto")==="manual"&&p.healthOverride;summaryHealth.textContent=displayedHealth;summaryHealthDot.style.background=healthColor(displayedHealth);summaryHealthMode.textContent=manualHealth?`Manual override · Automatic: ${calculatedHealth}`:"Automatic";summaryHealthNote.textContent=manualHealth?(p.healthOverrideNote||""):"";summaryUpdated.textContent=formatLastUpdated(p);summaryAccess.textContent=currentUser.canAdmin?"Administrator":currentUser.canEdit?"Editor":"Viewer";document.querySelectorAll(".internal-activity").forEach(x=>x.classList.toggle("hidden",!currentUser.isInternal));lastActivityDate.textContent=fmtDate(p.lastActivityDate);lastActivityText.textContent=p.lastActivity||"No activity recorded.";
 permissionBanner.textContent=currentUser.projects.includes("*")?`${currentUser.name} can view all assigned Newbury projects. ${currentUser.canAdmin?"Administrator access.":currentUser.canEdit?"Internal editing access.":"Read-only executive access."}`:`${currentUser.name} can view only: ${projects.map(x=>x.name).join(", ")}. ${currentUser.canEdit?"Internal editing access.":"Read-only external access."}`;
 document.querySelectorAll(".editor-only").forEach(x=>x.classList.toggle("hidden",!currentUser.canEdit));document.querySelectorAll(".admin-only").forEach(x=>x.classList.toggle("hidden",!currentUser.canAdmin));
 projectGrid.innerHTML=projects.map(pr=>{const active=pr.deliverables.filter(x=>x.status==="In Progress").length,waiting=pr.deliverables.filter(x=>x.status.includes("Waiting")||x.status==="Awaiting Review").length,complete=pr.deliverables.filter(x=>x.status==="Complete").length;const progress=weightedProjectProgress(pr),planning=clampPercent(pr.progressPlanning||0),engineering=clampPercent(pr.progressEngineering||0),installation=clampPercent(pr.progressInstallation||0),health=displayedProjectHealth(pr),manual=(pr.healthMode||"auto")==="manual"&&pr.healthOverride;return `<div class="project-card" onclick="setProject('${pr.id}')"><h3>${esc(pr.name)}</h3><p>${esc(pr.subtitle)}</p><div class="health"><span class="pulse" style="background:${healthColor(health)}"></span><span>${esc(health)}${manual?`<span class="health-mode">Manual override</span>`:""}</span></div><div class="small" style="margin-top:6px">Updated: ${esc(formatLastUpdated(pr))}</div><div class="progress-wrap"><div class="small" style="display:flex;justify-content:space-between"><span>Overall Progress</span><strong>${progress}%</strong></div><div class="progress-bar"><span style="width:${progress}%"></span></div><div class="phase-progress"><div class="phase-progress-row"><span>Planning</span><div class="progress-bar"><span style="width:${planning}%"></span></div><strong>${planning}%</strong></div><div class="phase-progress-row"><span>Engineering</span><div class="progress-bar"><span style="width:${engineering}%"></span></div><strong>${engineering}%</strong></div><div class="phase-progress-row"><span>Installation</span><div class="progress-bar"><span style="width:${installation}%"></span></div><strong>${installation}%</strong></div></div></div><div class="stats"><div class="stat-mini"><strong>${active}</strong><span>ACTIVE</span></div><div class="stat-mini"><strong>${waiting}</strong><span>WAITING</span></div><div class="stat-mini"><strong>${complete}</strong><span>COMPLETE</span></div></div></div>`}).join("");
 const opts=projects.map(pr=>`<option value="${pr.id}" ${pr.id===p.id?"selected":""}>${esc(pr.name)}</option>`).join("");projectSelect.innerHTML=opts;document.querySelectorAll(".project-select-clone").forEach(s=>s.innerHTML=opts);
 kpiTotal.textContent=ds.length;kpiActive.textContent=ds.filter(x=>x.status==="In Progress").length;kpiWaiting.textContent=ds.filter(x=>x.status.includes("Waiting")||x.status==="Awaiting Review").length;kpiComplete.textContent=ds.filter(x=>x.status==="Complete").length;
 currentWork.innerHTML=ds.filter(x=>x.status==="In Progress").map(x=>`<div class="item"><span class="dot"></span><div><strong>${esc(x.deliverable)}</strong>${visBadge(x.visibility)}<div class="small">${esc(x.current)}</div></div></div>`).join("")||"<span class='small'>No active items.</span>";
 requiredOthers.innerHTML=infoRecords.filter(x=>x.status!=="Received").map(x=>`<div class="item"><span class="dot" style="background:var(--orange)"></span><div><strong>${esc(x.item)}</strong>${currentUser.canEdit?` <button class="linkbtn agenda-edit" onclick="editInfo(${x.id})">Edit source</button>`:""}<div class="small">${esc(x.from)} · blocks ${esc(x.blocking)}</div></div></div>`).join("")||"<span class='small'>Nothing outstanding.</span>";
 nextDeliverables.innerHTML=ds.filter(x=>x.status==="In Progress").map(x=>`<div class="item"><span class="dot" style="background:var(--green)"></span><div><strong>${esc(x.deliverable)}</strong><div class="small">${esc(x.nextStep)} · ${fmtDate(x.date)}</div></div></div>`).join("")||"<span class='small'>No active deliverables.</span>";
 projectRisks.innerHTML=ds.filter(x=>x.risk).map(x=>`<div class="item"><span class="dot" style="background:var(--red)"></span><div>${esc(x.risk)}</div></div>`).join("")||"<span class='small'>No current risks.</span>";
 const q=searchDeliverables.value.toLowerCase(),fs=filterStatus.value,fd=filterDiscipline.value,filtered=ds.filter(x=>(!q||JSON.stringify(x).toLowerCase().includes(q))&&(!fs||x.status===fs)&&(!fd||x.discipline===fd));
 deliverablesBody.innerHTML=filtered.map(x=>`<tr><td>${esc(x.discipline)}</td><td><strong>${esc(x.deliverable)}</strong>${visBadge(x.visibility)}<div class="small">${esc(x.current)}</div></td><td>${badge(x.status)}</td><td>${esc(x.owner)}</td><td>${esc(x.waitingOn)}</td><td>${esc(x.nextStep)}</td><td>${fmtDate(x.date)}</td><td>${currentUser.canEdit?`<button class="linkbtn" onclick="editDeliverable(${x.id})">Edit</button>`:""}</td></tr>`).join("");
 infoBody.innerHTML=infoRecords.map(x=>`<tr><td><strong>${esc(x.item)}</strong>${visBadge(x.visibility)}</td><td>${esc(x.from)}</td><td>${badge(x.status)}</td><td>${esc(x.blocking)}</td><td>${esc(x.notes)}</td><td>${currentUser.canEdit?`<button class="linkbtn" onclick="editInfo(${x.id})">Edit</button>`:""}</td></tr>`).join("");
 infoCards.innerHTML=infoRecords.map(x=>`<div class="mobile-record"><h4>${esc(x.item)} ${visBadge(x.visibility)}</h4><div class="row"><span>Status</span><span>${badge(x.status)}</span></div><div class="row"><span>Requested From</span><strong>${esc(x.from)}</strong></div><div class="row"><span>Blocking</span><span>${esc(x.blocking)}</span></div><div class="row"><span>Needed By</span><span>${fmtDate(x.neededBy)}</span></div>${currentUser.canEdit?`<div style="margin-top:9px"><button class="linkbtn" onclick="editInfo(${x.id})">Edit source</button></div>`:""}</div>`).join("");
 const statuses=[...new Set(ds.map(x=>x.status))].sort(),disciplines=[...new Set(ds.map(x=>x.discipline))].sort(),oldS=filterStatus.value,oldD=filterDiscipline.value;filterStatus.innerHTML='<option value="">All statuses</option>'+statuses.map(s=>`<option>${esc(s)}</option>`).join("");filterStatus.value=oldS;filterDiscipline.innerHTML='<option value="">All disciplines</option>'+disciplines.map(s=>`<option>${esc(s)}</option>`).join("");filterDiscipline.value=oldD;
 timelineTrack.innerHTML=[...ds].sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999")).map(x=>`<div class="timeline-entry ${x.status==="Complete"?"complete":x.status.includes("Waiting")||x.status==="Awaiting Review"?"waiting":""}"><h4>${esc(x.deliverable)} ${badge(x.status)} ${currentUser.canEdit?`<button class="linkbtn timeline-edit" onclick="editDeliverable(${x.id})">Edit source</button>`:""}</h4><p>${fmtDate(x.date)} · ${esc(x.nextStep)}</p></div>`).join("");
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
   );
   auditBody.innerHTML=filteredAudit.map(x=>{
     const cls=x.action==="Create"?"audit-create":x.action==="Delete"?"audit-delete":"audit-update";
     const dt=new Date(x.timestamp).toLocaleString("en-US");
     return `<tr><td>${esc(dt)}</td><td><strong>${esc(x.userName)}</strong></td><td>${esc(x.projectName)}</td><td><span class="audit-action ${cls}">${esc(x.action)}</span></td><td>${esc(x.recordType)}: <strong>${esc(x.recordName)}</strong></td><td>${esc(x.details)}</td></tr>`
   }).join("")||'<tr><td colspan="6" class="small">No changes recorded yet.</td></tr>';
 }

}

function renderAdmin(){
 if(!currentUser?.canAdmin)return;
 projectAdminList.innerHTML=state.projects.map(p=>`
   <div class="project-admin-row ${p.archived?"archived":""}">
     <div><strong>${esc(p.name)}</strong><div class="small">${esc(p.subtitle||"Naples, FL")}</div></div>
     <div><span class="small">Phase</span><br><strong>${esc(p.phase||"Planning")}</strong></div>
     <div><span class="small">Health</span><br><strong>${esc(displayedProjectHealth(p))}</strong><div class="small">${(p.healthMode||"auto")==="manual"?"Manual override":"Automatic"}</div></div>
     <div class="project-admin-actions">
       <button class="btn" onclick="editProject('${p.id}')">Edit</button>
       <button class="btn" onclick="toggleArchive('${p.id}')">${p.archived?"Restore":"Archive"}</button>
     </div>
   </div>`).join("");

 adminUserSelect.innerHTML=USERS.map(u=>`<option value="${u.id}">${u.name}</option>`).join("");
 const selected=USERS.find(u=>u.id===adminUserSelect.value)||USERS[0];
 adminRoleSelect.value=selected.role;
 projectAssignmentList.innerHTML=state.projects.map(p=>{
   const checked=selected.projects.includes("*")||selected.projects.includes(p.id);
   return `<label style="display:block;margin:7px 0;font-size:13px"><input type="checkbox" value="${p.id}" ${checked?"checked":""}> ${esc(p.name)}</label>`;
 }).join("");
}
