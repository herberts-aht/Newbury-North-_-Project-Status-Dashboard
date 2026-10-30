/* AHT Operations v3 local review: read-only operational lookahead and site progress.
 * No project edits, ordering, inventory, task writes, or messages sent.
 * IMPORTANT: client-side navigation gates DO NOT replace SharePoint authorization.
 */
(function(){
 'use strict';
 const root=document.getElementById('operations');
 const nav=document.querySelector('.sidebar-nav [data-view="operations"]');
 const label=document.querySelector('[data-aht-ops-navlabel]');
 if(!root||!nav)return;
 const $=q=>root.querySelector(q);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
 const ms=86400000;
 const spProvider=()=>{try{return typeof SharePointDataProvider==='undefined'?window.SharePointDataProvider:SharePointDataProvider;}catch(_){return null;}};
 const appCfg=()=>{try{return typeof APP_CONFIG==='undefined'?window.APP_CONFIG:APP_CONFIG;}catch(_){return null;}};
 const today=()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();};
 const parseDay=v=>{const m=String(v||'').match(/^(\d{4})-(\d\d)-(\d\d)/);if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3]);return d.getFullYear()===+m[1]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]?d.getTime():null;};
 const dateText=v=>parseDay(v)===null?'Not confirmed':new Date(parseDay(v)).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
 const clamp=n=>Math.max(0,Math.min(100,Math.round(Number(n)||0)));
 const validPct=n=>n!==''&&n!==null&&n!==undefined&&Number.isFinite(Number(n));
 const user=()=>{try{return typeof currentUser==='undefined'?null:currentUser;}catch(_){return null;}};
 function isAdmin(u){return !!u&&(u.isSystemOwner===true||u.canAdmin===true||['admin','administrator','system owner'].includes(norm(u.role)));}
 function isOps(u){return !!u&&['operations','operations manager','warehouse manager'].includes(norm(u.role));}
 function office(u){return String(u?.homeOffice||u?.office||u?.officeName||u?.assignedOffice||u?.division||'').trim();}
 function canAccess(){const u=user();return !!u&&u.active!==false&&u.isInternal!==false&&norm(u.entraUserType)!=='guest'&&(isAdmin(u)||isOps(u));}
 function allProjects(){try{return typeof state!=='undefined'&&Array.isArray(state.projects)?state.projects:[];}catch(_){return [];}}
 function visibleProjects(){if(!canAccess())return [];const u=user(),list=allProjects().filter(p=>p&&!p.archived);if(isAdmin(u))return list;const o=norm(office(u));return o?list.filter(p=>norm(p.division||p.office||p.homeOffice)===o):[];}
 function selectedDashboardProject(){try{return typeof state!=='undefined'?String(state.currentProjectId||''):'';}catch(_){return '';}}
 const local={project:'all',window:30,search:'',tab:'overview',display:'card',bucket:'current',expanded:new Set(),monthOffset:0,site:{loading:false,loaded:false,projectId:'',locations:[],operations:[],error:''},siteOffice:{loading:false,loaded:false,signature:'',byProject:new Map(),error:''},currentTreeProject:''};
 function updateNav(){const allowed=canAccess();nav.hidden=!allowed;if(label)label.hidden=!allowed;root.hidden=!allowed;if(!allowed&&root.classList.contains('active')){root.classList.remove('active');nav.classList.remove('active');document.getElementById('projects')?.classList.add('active');document.querySelector('.sidebar-nav [data-view="projects"]')?.classList.add('active');}}
 function projectOf(item,byId,bySP){return byId.get(String(item.projectId))||bySP.get(String(item.projectSharePointId));}
 function ancestry(item,lookup){const stack=[],seen=new Set([String(item.id)]);let x=item;for(let i=0;i<14;i++){const key=x?.parentWorkItemId;if(!key||seen.has(String(key)))break;seen.add(String(key));x=lookup.get(String(key));if(!x)break;if(x.title)stack.unshift(String(x.title));}return stack;}
 function progressComplete(item){const status=norm(item.status);return status==='complete'||status==='completed'||status==='cancelled'||status==='canceled'||(validPct(item.percentComplete)&&Number(item.percentComplete)>=100);}
 function getRecords(){
  const projects=visibleProjects(),byId=new Map(projects.map(p=>[String(p.id),p])),bySP=new Map(projects.filter(p=>p.sharePointId).map(p=>[String(p.sharePointId),p]));
  const repo=window.ProjectWorkItems;
  if(!repo||typeof repo.getItems!=='function')return {items:[],reason:'Project Plan has not loaded yet. Refresh this view after the dashboard finishes loading.'};
  const raw=(repo.getItems()||[]).filter(x=>x&&!x.archived&&norm(x.visibility)!=='admin only'&&!!projectOf(x,byId,bySP));
  const lookup=new Map(raw.map(x=>[String(x.id),x]));const children=new Map();
  raw.forEach(x=>{if(x.parentWorkItemId){const k=String(x.parentWorkItemId);if(!children.has(k))children.set(k,[]);children.get(k).push(x);}});
  const descendantDated=(id,seen=new Set())=>{const k=String(id);if(seen.has(k))return false;seen.add(k);return (children.get(k)||[]).some(c=>parseDay(c.startDate)!==null||parseDay(c.targetDate)!==null||descendantDated(c.id,new Set(seen)));};
  const rows=[];const base=today();
  for(const x of raw){
    if(progressComplete(x))continue;
    // Parent containers with dated child work are context, not extra alert rows.
    if(descendantDated(x.id))continue;
    if(/^(building|work area|room|group)$/i.test(String(x.itemType||''))&&!x.startDate&&!x.targetDate)continue;
    const project=projectOf(x,byId,bySP);if(!project)continue;
    const status=String(x.status||'Not Started');const st=norm(status);const start=parseDay(x.startDate),due=parseDay(x.targetDate),days=start===null?null:Math.round((start-base)/ms);
    const overdue=due!==null&&due<base;
    const blocked=/blocked/.test(st);
    const waiting=/waiting|awaiting|review/.test(st);
    const declaredRisk=/at risk/.test(st)||norm(x.riskMode)==='force at risk'||Boolean(x.risk&&String(x.risk).trim());
    const inProgress=/in progress|active|underway/.test(st);
    const dueSoon=due!==null&&due>=base&&due<=base+7*ms;
    const atRisk=declaredRisk||Boolean(x.blockerDependency&&String(x.blockerDependency).trim());
    let bucket='other';
    if(inProgress)bucket='current';
    else if(start!==null&&start>=base)bucket='upcoming';
    else if(start===null)bucket='undated';
    else if(overdue)bucket='overdue';
    // Planned/Waiting/Review are not counted as "actively under way" simply because their dates began.
    const path=ancestry(x,lookup);
    rows.push({key:String(x.id),project,projectName:String(project.name||project.address||project.id),title:String(x.title||'Untitled work item'),phase:String(x.phase||''),workstream:String(x.workstream||''),path:path.join(' / '),status,startDate:x.startDate||'',targetDate:x.targetDate||'',start,days,bucket,overdue,blocked,waiting,atRisk,dueSoon,owner:String(x.owner||''),blocker:String(x.blockerDependency||''),waitingOn:String(x.waitingOn||'')});
  }
  return {items:rows,reason:''};
 }
 function filtered(){const projects=visibleProjects(),all=getRecords();const items=all.items.filter(x=>(local.project==='all'||String(x.project.id)===local.project)&&(!local.search||norm([x.phase,x.title,x.workstream,x.path,x.projectName].join(' ')).includes(norm(local.search))));return {items,projects,reason:all.reason};}
 function stateBadge(x){let color='neutral';const s=norm(x.status);if(s.includes('blocked'))color='red';else if(s.includes('at risk'))color='amber';else if(s.includes('waiting'))color='gold';else if(s.includes('review'))color='purple';else if(s.includes('in progress')||s==='active')color='blue';else if(s.includes('complete'))color='green';return `<span class="ops-pill ops-${color}">${esc(x.status)}</span>`;}
 function healthBadge(x){if(x.overdue)return '<span class="ops-pill ops-red">Overdue</span>';if(x.atRisk)return '<span class="ops-pill ops-amber">At Risk</span>';if(x.dueSoon)return '<span class="ops-pill ops-gold">Due soon</span>';if(x.start===null)return '<span class="ops-pill ops-neutral">Date TBD</span>';return '';}
 function detail(x){return `<div class="ops-detail"><div><b>Location</b><span>${esc(x.path||'Not specified in Project Plan')}</span></div><div><b>Phase</b><span>${esc(x.phase||'Not specified')}</span></div><div><b>Start</b><span>${esc(dateText(x.startDate))}</span></div><div><b>Target</b><span>${esc(dateText(x.targetDate))}</span></div><div><b>Responsible</b><span>${esc(x.owner||'Not specified')}</span></div>${x.waitingOn?`<div><b>Waiting on</b><span>${esc(x.waitingOn)}</span></div>`:''}${x.blocker?`<div><b>Dependency</b><span>${esc(x.blocker)}</span></div>`:''}<div class="ops-detail-actions"><button type="button" class="ops-link" data-alert="${esc(x.key)}">Ask PM / Site Lead</button></div></div>`;}
 function itemCard(x){const open=local.expanded.has('item:'+x.key);return `<article data-expand="item:${esc(x.key)}" tabindex="0" aria-expanded="${open}" class="ops-item ${x.overdue?'ops-mark-overdue':x.atRisk?'ops-mark-risk':''}"><div class="ops-item-top"><span class="ops-project">${esc(x.projectName)}</span><span class="ops-pill-pair">${stateBadge(x)}${healthBadge(x)}</span></div><button class="ops-item-expand" type="button" data-expand="item:${esc(x.key)}" aria-expanded="${open}"><span class="ops-item-title">${esc(x.title)}</span><span class="ops-chevron">${open?'▾':'▸'}</span></button><div class="ops-location">${esc(x.path||x.workstream||'Work area not specified')}</div><div class="ops-item-tags">${x.phase?`<span>${esc(x.phase)}</span>`:''}${x.workstream?`<span>${esc(x.workstream)}</span>`:''}</div><p class="ops-dates">${esc(dateText(x.startDate))}${x.targetDate?' · Target '+esc(dateText(x.targetDate)):''}</p>${open?detail(x):''}</article>`;}
 function itemTable(items){return `<div class="ops-list-wrap"><table class="ops-list"><thead><tr><th>Project / area</th><th>Activity / phase</th><th>Start</th><th>Target</th><th>Status</th><th>Schedule</th></tr></thead><tbody>${items.map(x=>{const open=local.expanded.has('item:'+x.key);return `<tr class="ops-list-row" data-expand="item:${esc(x.key)}" tabindex="0" aria-expanded="${open}"><td>${esc(x.projectName)}<small>${esc(x.path)}</small></td><td><button class="ops-list-expand" data-expand="item:${esc(x.key)}" aria-expanded="${open}">${open?'▾':'▸'} ${esc(x.title)}</button><small>${esc(x.phase||x.workstream)}</small></td><td>${esc(dateText(x.startDate))}</td><td>${esc(dateText(x.targetDate))}</td><td>${stateBadge(x)}</td><td>${healthBadge(x)}</td></tr>${open?`<tr><td colspan="6">${detail(x)}</td></tr>`:''}`;}).join('')}</tbody></table></div>`;}
 function group(title,list,empty){return `<section class="ops-section"><div class="ops-section-title"><h3>${esc(title)}</h3><span>${list.length}</span></div>${list.length?(local.display==='list'?itemTable(list):`<div class="ops-grid">${list.map(itemCard).join('')}</div>`):`<div class="ops-empty">${esc(empty)}</div>`}</section>`;}
 // AHT-OPS-LOOKAHEAD-CATEGORIES-V1: one visible category, all four selectors always in view.
 function renderLookahead(items){
  const underway=items.filter(x=>x.bucket==='current');
  const upcoming=items.filter(x=>x.days!==null&&x.days>=0&&x.days<=local.window);
  const later=items.filter(x=>x.days!==null&&x.days>local.window&&x.days<=60);
  const attention=items.filter(x=>x.overdue||x.blocked||x.waiting||x.atRisk||x.start===null);
  const sort=(a,b)=>(a.days??999)-(b.days??999)||a.projectName.localeCompare(b.projectName);
  const categories=[
   {key:'current',title:'In progress',label:'In progress',rows:underway,empty:'No work marked In Progress.'},
   {key:'upcoming',title:`Starting within ${local.window} days`,label:`Starting within ${local.window} days`,rows:upcoming.sort(sort),empty:'No confirmed future starts in this window.'},
   {key:'later',title:'Further out · 60 days',label:'Further out to 60 days',rows:later.sort(sort),empty:'No scheduled starts in this range.'},
   {key:'attention',title:'Attention / clarification',label:'Attention / clarification',rows:attention,empty:'No waiting, blocked, overdue, or floating items.'}
  ];
  if(!categories.some(c=>c.key===local.bucket))local.bucket='current';
  const summary=$('#ops-summary');
  summary.setAttribute('role','group');
  summary.setAttribute('aria-label','Lookahead categories; choose one to view its activities');
  summary.innerHTML=categories.map(c=>`<button type="button" class="ops-stat ops-stat-select${local.bucket===c.key?' is-active':''}" data-ops-bucket="${c.key}" aria-pressed="${local.bucket===c.key}" aria-controls="ops-main"><strong>${c.rows.length}</strong><span>${esc(c.label)}</span></button>`).join('');
  const selected=categories.find(c=>c.key===local.bucket);
  $('#ops-main').innerHTML=group(selected.title,selected.rows,selected.empty);
 }
 function renderCalendar(items){$('#ops-summary').innerHTML='';const anchor=new Date(today());anchor.setDate(1);anchor.setMonth(anchor.getMonth()+local.monthOffset);const y=anchor.getFullYear(),m=anchor.getMonth(),padding=new Date(y,m,1).getDay(),max=new Date(y,m+1,0).getDate();let html=`<div class="ops-month-nav"><button type="button" data-ops-month="-1" aria-label="Previous month">‹</button><strong>${esc(anchor.toLocaleDateString('en-US',{month:'long',year:'numeric'}))}</strong><button type="button" data-ops-month="1" aria-label="Next month">›</button></div><div class="ops-calendar"><div class="ops-weekdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(s=>`<span>${s}</span>`).join('')}</div><div class="ops-calendar-grid">`;for(let i=0;i<padding;i++)html+='<div class="ops-calendar-cell ops-calendar-blank"></div>';for(let d=1;d<=max;d++){const at=new Date(y,m,d).getTime(),hits=items.filter(x=>x.start===at);html+=`<div class="ops-calendar-cell"><strong>${d}</strong>${hits.slice(0,3).map(x=>`<div class="ops-calendar-event" title="${esc(x.projectName+' / '+x.title)}">${esc(x.projectName)} · ${esc(x.phase||x.title)}</div>`).join('')}${hits.length>3?`<small>+${hits.length-3} more</small>`:''}</div>`;}$('#ops-main').innerHTML=html+'</div></div><p class="ops-explainer">Confirmed start dates only. This calendar does not change the Project Plan.</p>';}
 function renderTimeline(items){$('#ops-summary').innerHTML='';const base=today(),end=base+60*ms;const rows=items.filter(x=>x.start!==null&&x.start<=end&&(parseDay(x.targetDate)??x.start)>=base).sort((a,b)=>a.projectName.localeCompare(b.projectName)||(a.start||0)-(b.start||0));if(!rows.length){$('#ops-main').innerHTML='<p class="ops-empty">No dated activities intersect the next 60 days.</p>';return;}let html='<div class="ops-timeline"><div class="ops-timeline-head"><span>Project / area</span><span>Today</span><span>30 days</span><span>60 days</span></div>';for(const x of rows.slice(0,100)){const st=Math.max(base,x.start),e=Math.min(end,(parseDay(x.targetDate)??x.start)+ms);const left=Math.max(0,(st-base)/(60*ms)*100),width=Math.max(1,(e-st)/(60*ms)*100);html+=`<div class="ops-time-row"><div class="ops-time-label"><b>${esc(x.projectName)}</b><span>${esc(x.phase||x.title)}${x.path?' · '+esc(x.path):''}</span></div><div class="ops-time-track"><span class="ops-time-bar${x.overdue?' ops-time-alert':''}" style="left:${left.toFixed(2)}%;width:${Math.min(100-left,width).toFixed(2)}%" title="${esc(x.title+' · '+dateText(x.startDate))}"></span></div></div>`;}$('#ops-main').innerHTML=html+'</div><p class="ops-explainer">Read-only high-level timeline; Project Plan is the source of scheduling dates.</p>';}
 // Site Operations location roll-up mirrors its existing rules: direct tracked activity
 // is one component; child locations are individually weighted components.
 function rollupSite(data){
  const locations=data.locations.filter(l=>l&&!l.archived&&l.active!==false),ops=data.operations.filter(o=>o&&!o.archived);
  const byId=new Map(locations.map(l=>[String(l.id),l])),kids=new Map(),direct=new Map();
  for(const l of locations){const key=String(l.parentLocationId||'');if(!kids.has(key))kids.set(key,[]);kids.get(key).push(l);}
  for(const o of ops){const key=String(o.locationId||'');if(!direct.has(key))direct.set(key,[]);direct.get(key).push(o);}
  const roots=locations.filter(l=>!l.parentLocationId||!byId.has(String(l.parentLocationId))).sort((a,b)=>Number(a.sortOrder||0)-Number(b.sortOrder||0));
  function manual(loc,phase){const base=phase==='Rough-In'?'roughIn':phase==='Trim'?'trim':phase==='Final'?'final':'overall';const value=loc[base+'ProgressOverride'],reason=String(loc[base+'OverrideReason']||'').trim();return validPct(value)&&!(Number(value)===0&&!reason)?clamp(value):null;}
  function weighted(arr){let total=0,sum=0;for(const a of arr){const w=Number(a.weight)>0?Number(a.weight):1;sum+=a.pct*w;total+=w;}return total?clamp(sum/total):null;}
  function calc(l,phase='',seen=new Set()){const key=String(l.id);if(seen.has(key))return null;const seenNext=new Set([...seen,key]);const override=manual(l,phase);if(override!==null)return override;
   const own=(direct.get(key)||[]).filter(o=>o.trackProgress===true&&validPct(o.percentComplete)&&(!phase||o.sitePhase===phase));
   const comps=[];if(own.length){const directPct=weighted(own.map(o=>({pct:clamp(o.percentComplete),weight:o.progressWeight})));if(directPct!==null)comps.push({pct:directPct,weight:1});}
   for(const child of kids.get(key)||[]){const pct=calc(child,phase,seenNext);if(pct!==null)comps.push({pct,weight:child.progressWeight});}
   return weighted(comps);
  }
  function phases(l){const found=new Set();(direct.get(String(l.id))||[]).filter(o=>o.trackProgress===true).forEach(o=>{if(o.sitePhase)found.add(String(o.sitePhase));});for(const p of ['Rough-In','Trim','Final'])if(manual(l,p)!==null)found.add(p);return [...found].sort((a,b)=>['Rough-In','Trim','Final'].indexOf(a)-['Rough-In','Trim','Final'].indexOf(b));}
  return {roots,kids,calc,phases};
 }
 function bar(pct){return pct===null?'<span class="ops-progress-unreported">Not reported</span>':`<div class="ops-progress-pair"><div class="ops-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div><b>${pct}%</b></div>`;}
 function locationRow(loc,calc,level=0,seen=new Set()){
  const key=String(loc.id);if(seen.has(key))return '';const next=new Set([...seen,key]);const opened=local.expanded.has('loc:'+String(local.currentTreeProject)+':'+key);const children=(calc.kids.get(key)||[]).slice().sort((a,b)=>Number(a.sortOrder||0)-Number(b.sortOrder||0));const progress=calc.calc(loc);
  const phaseList=calc.phases(loc);const hasChildren=children.length||phaseList.length;let html=`<div class="ops-progress-node"><div class="ops-progress-line ${hasChildren?'ops-clickable':''}" style="--indent:${Math.min(level,7)}" ${hasChildren?`data-expand="loc:${esc(String(local.currentTreeProject))}:${esc(key)}" tabindex="0" aria-expanded="${opened}"`: ''}><button type="button" class="ops-tree-toggle" ${!hasChildren?'disabled':''} data-expand="loc:${esc(String(local.currentTreeProject))}:${esc(key)}" aria-expanded="${opened}">${hasChildren?(opened?'▾':'▸'):'·'}</button><div class="ops-progress-name"><strong>${esc(loc.locationNumber?loc.locationNumber+' · '+loc.name:loc.name||'Unnamed area')}</strong><small>${esc(loc.locationType||loc.planLevel||'')}</small></div>${bar(progress)}</div>`;
  if(opened){for(const child of children)html+=locationRow(child,calc,level+1,next);if(phaseList.length)html+=`<div class="ops-phase-stack" style="--indent:${Math.min(level+1,8)}">${phaseList.map(ph=>`<div class="ops-phase-line"><span>${esc(ph)}</span>${bar(calc.calc(loc,ph))}</div>`).join('')}</div>`;}
  return html+'</div>';
 }
 // Read-only, office-scoped Site Operations data. Uses the exact SharePoint lists already used
 // by Site Operations; never modifies currentProjectId or writes schedules.
 function lookupId(fields,key){
   for(const raw of [fields[key+'LookupId'],fields[key+'Id'],fields[key]]){
     const n=Number(typeof raw==='object'&&raw?raw.LookupId??raw.lookupId??raw.Id??raw.id:raw);
     if(Number.isFinite(n)&&n>0)return n;
   }
   return 0;
 }
 function projectLookup(fields){return typeof spProvider()?.projectLookupId==='function'?
   Number(spProvider().projectLookupId(fields)||0):lookupId(fields,'Project');}
 function locationFromRow(row){const f=row.fields||{};return {id:Number(row.id),name:String(f.Title||f.LocationName||''),locationNumber:String(f.LocationNumber||''),parentLocationId:lookupId(f,'ParentLocation'),locationType:String(f.LocationType||''),planLevel:String(f.PlanLevel||''),progressWeight:Number(f.LocationProgressWeight)>0?Number(f.LocationProgressWeight):1,sortOrder:Number(f.SortOrder||0),active:f.Active!==false,overallProgressOverride:f.OverallProgressOverride,overallOverrideReason:f.OverallOverrideReason,roughInProgressOverride:f.RoughInProgressOverride,roughInOverrideReason:f.RoughInOverrideReason,trimProgressOverride:f.TrimProgressOverride,trimOverrideReason:f.TrimOverrideReason,finalProgressOverride:f.FinalProgressOverride,finalOverrideReason:f.FinalOverrideReason};}
 function operationFromRow(row){const f=row.fields||{};return {id:Number(row.id),locationId:lookupId(f,'Location'),sitePhase:String(f.SitePhase||f.DeliveryPhase||''),trackProgress:f.TrackProgress===true,percentComplete:f.PercentComplete,progressWeight:Number(f.ProgressWeight)>0?Number(f.ProgressWeight):1,archived:f.Archived===true};}
 function siteScopeSignature(projects){return projects.map(p=>String(p.sharePointId||'')+':'+String(p.id)).sort().join('|');}
 async function loadOfficeSite(projects){
  const signature=siteScopeSignature(projects);
  if(local.siteOffice.loading||(local.siteOffice.loaded&&local.siteOffice.signature===signature))return;
  const provider=spProvider(),lists=appCfg()?.sharePoint?.lists;
  if(!provider||typeof provider.getListRows!=='function'||!lists?.projectLocations||!lists?.siteOperations){
   local.siteOffice={loaded:true,loading:false,signature,byProject:new Map(),error:'Site Operations SharePoint list access is not available.'};refresh();return;
  }
  local.siteOffice={loaded:false,loading:true,signature,byProject:new Map(),error:''};
  try{
   const [locs,ops]=await Promise.all([provider.getListRows(lists.projectLocations),provider.getListRows(lists.siteOperations)]);
   // The underlying SharePoint library permissions must independently authorize each read.
   // The UI only uses rows belonging to authorized project IDs, never another office's rows.
   if(!canAccess()||siteScopeSignature(visibleProjects())!==signature)return;
   const authorized=new Set(projects.map(p=>Number(p.sharePointId||0)).filter(Boolean));
   const byProject=new Map();for(const id of authorized)byProject.set(id,{locations:[],operations:[]});
   const allowedLocations=new Map();
   for(const row of locs||[]){const f=row.fields||{},pid=projectLookup(f),loc=locationFromRow(row);
     if(!authorized.has(pid)||f.Active===false||f.Archived===true||!loc.id)continue;
     byProject.get(pid).locations.push(loc);allowedLocations.set(loc.id,pid);
   }
   for(const row of ops||[]){const f=row.fields||{},pid=projectLookup(f),op=operationFromRow(row);
     if(!authorized.has(pid)||f.Archived===true||!op.id)continue;
     if(op.locationId&&allowedLocations.get(op.locationId)!==pid)continue;
     byProject.get(pid).operations.push(op);
   }
   local.siteOffice={loaded:true,loading:false,signature,byProject,error:''};
  }catch(e){console.warn('Operations office-wide site progress read failed',e);
   local.siteOffice={loaded:true,loading:false,signature,byProject:new Map(),error:'Could not read Site Operations data for office projects. Verify SharePoint access and try refreshing.'};
  }
  refresh();
 }
 function projectPct(project){const mode=norm(project.progressInstallationMode),value=project.progressInstallation;if(!validPct(value))return null;
  // A default untouched 0% is not evidence that field activity has started.
  if(Number(value)===0&&mode!=='manual')return null;
  if(Number(value)===0&&mode==='manual'&&!project.lastActivityDate&&!project.lastActivity)return null;
  return clamp(value);
 }
 function renderProgress(projects){
  $('#ops-summary').innerHTML='';const officeData=local.siteOffice;
  const visible=projects.filter(p=>local.project==='all'||String(p.id)===local.project)
   .filter(p=>!local.search||norm(p.name+' '+p.description).includes(norm(local.search))||
    (officeData.byProject.get(Number(p.sharePointId||0))?.locations||[]).some(l=>norm(l.name).includes(norm(local.search))));
  let html='<div class="ops-progress-intro"><h3>Site Progress</h3><p>Expand projects, buildings, and rooms to review reported installation progress across the office. The project team maintains the underlying records.</p></div>';
  if(!visible.length){$('#ops-main').innerHTML='<div class="ops-empty">No matching projects.</div>';return;}
  for(const p of visible){
   const key='proj:'+String(p.id),expanded=local.expanded.has(key);let pct=projectPct(p),detail='';
   const site=officeData.byProject.get(Number(p.sharePointId||0));
   if(site){const calc=rollupSite(site);if(pct===null&&calc.roots.length){const vals=calc.roots.map(l=>({pct:calc.calc(l),weight:l.progressWeight})).filter(v=>v.pct!==null);let tot=0,sum=0;for(const v of vals){const w=Number(v.weight)>0?Number(v.weight):1;tot+=w;sum+=w*v.pct;}pct=tot?clamp(sum/tot):null;}
    if(expanded){local.currentTreeProject=p.id;detail=calc.roots.length?`<div class="ops-progress-tree">${calc.roots.map(l=>locationRow(l,calc)).join('')}</div>`:'<p class="ops-progress-message">No Site Operations areas have been configured for this project yet.</p>';}
   }else if(expanded&&officeData.loading)detail='<p class="ops-progress-message">Loading site progress for this office…</p>';
   else if(expanded&&officeData.error)detail=`<p class="ops-progress-message">${esc(officeData.error)}</p>`;
   else if(expanded)detail='<p class="ops-progress-message">No reported building or room information is available.</p>';
   html+=`<article class="ops-progress-project"><div class="ops-progress-line ops-project-line ops-clickable" data-expand="${esc(key)}" tabindex="0" aria-expanded="${expanded}"><button type="button" class="ops-tree-toggle" data-expand="${esc(key)}" aria-expanded="${expanded}">${expanded?'▾':'▸'}</button><div class="ops-progress-name"><strong>${esc(p.name||p.id)}</strong><small>${esc(p.division||'Office not assigned')}</small></div>${bar(pct)}</div>${expanded?detail:''}</article>`;
  }
  $('#ops-main').innerHTML=html+(officeData.error?`<p class="ops-progress-message">${esc(officeData.error)}</p>`:'<p class="ops-explainer">Building and room percentages are reported values or weighted rollups. Unreported work is not treated as completed.</p>');
 }

 // Results are a deliberately bounded scroll region, not another giant page.
 function ensureOpsScroll(){
  const panel=$('#ops-main');if(!panel)return;
  panel.tabIndex=0;
  panel.setAttribute('aria-label','Operations results; scroll inside this panel to view more');
  let hint=$('#ops-scroll-guide');
  if(!hint){hint=document.createElement('div');hint.id='ops-scroll-guide';hint.className='ops-scroll-guide';
   hint.setAttribute('role','status');panel.parentNode.insertBefore(hint,panel);}
  if(!panel.dataset.scrollCueBound){panel.dataset.scrollCueBound='1';panel.addEventListener('scroll',updateOpsScrollGuide,{passive:true});}
 }
 function updateOpsScrollGuide(){
  const panel=$('#ops-main'),hint=$('#ops-scroll-guide');if(!panel||!hint)return;
  const extra=panel.scrollHeight-panel.clientHeight;
  hint.hidden=extra<=10;
  if(extra>10){
   hint.textContent=panel.scrollTop>=extra-12?'End of results':'More below — scroll inside this panel ↓';
   hint.classList.toggle('ops-scroll-finished',panel.scrollTop>=extra-12);
  }
 }
 function settleOpsScroll(previous){
  requestAnimationFrame(()=>{const panel=$('#ops-main');if(panel){panel.scrollTop=Math.min(previous,Math.max(0,panel.scrollHeight-panel.clientHeight));updateOpsScrollGuide();}});
 }
 function refresh(){updateNav();if(!canAccess())return;ensureOpsScroll();const previousScroll=$('#ops-main')?.scrollTop||0;const u=user(),data=filtered(),projects=data.projects;const sel=$('#ops-project');if(!sel)return;if(local.project!=='all'&&!projects.some(p=>String(p.id)===local.project))local.project='all';const opts=[['all','All visible projects'],...projects.map(p=>[String(p.id),String(p.name||p.address||p.id)])];sel.replaceChildren(...opts.map(([value,name])=>{const o=document.createElement('option');o.value=value;o.textContent=name;o.selected=local.project===value;return o;}));
  $('#ops-office').textContent=isAdmin(u)?'All offices':(office(u)||'Office unassigned');$('#ops-empty-access').hidden=projects.length>0;$('#ops-content').hidden=projects.length===0;
  if(!projects.length){$('#ops-empty-access').textContent=isOps(u)&&!office(u)?'Your Operations profile has no home office. Ask an administrator to assign one.':'No projects were found within your office permissions.';return;}
  root.querySelectorAll('[data-ops-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.opsTab===local.tab)));
  const switcher=$('#ops-display');switcher.hidden=local.tab!=='overview';switcher.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.opsDisplay===local.display)));
  if(local.tab==='progress'){renderProgress(projects);settleOpsScroll(previousScroll);if(!local.siteOffice.loading&&(!local.siteOffice.loaded||local.siteOffice.signature!==siteScopeSignature(projects)))void loadOfficeSite(projects);return;}
  if(data.reason){$('#ops-summary').innerHTML='';$('#ops-main').textContent=data.reason;settleOpsScroll(previousScroll);return;}
  if(local.tab==='calendar')renderCalendar(data.items);else if(local.tab==='timeline')renderTimeline(data.items);else renderLookahead(data.items);
  settleOpsScroll(previousScroll);
 }
 function assignedContact(project,prefix){
   const name=String(project[prefix]||'').trim();
   const possible=[project[prefix+'Email'],project[prefix+'Mail'],project[(prefix==='projectManagerSiteLead'?'pm':'seniorProjectManager')+'Email']].filter(Boolean);
   const contacts=Array.isArray(project.contacts)?project.contacts:[];
   const c=contacts.find(x=>norm(x.name||x.contactPerson||x.person)===norm(name));
   const email=String(possible.find(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)))||c?.email||'').trim();
   const users=(()=>{try{return typeof USERS!=='undefined'&&Array.isArray(USERS)?USERS:[];}catch(_){return [];}})();
   const matches=users.filter(u=>u.active!==false&&u.isInternal!==false&&norm(u.entraUserType)!=='guest'&&(
      (email&&norm(u.email)===norm(email))||(name&&norm(u.name)===norm(name))));
   const person=matches.length===1?matches[0]:null;
   return {name:name||String(person?.name||''),email:email||String(person?.email||''),objectId:String(person?.entraObjectId||'').trim()};
 }
 const opsQuestion={item:null,recipients:[]};
 function questionModal(){
  let node=document.getElementById('ops-question-modal');if(node)return node;
  node=document.createElement('div');node.id='ops-question-modal';node.hidden=true;
  node.innerHTML=`<div class="ops-question-scrim" data-ops-cancel></div><div class="ops-question-dialog" role="dialog" aria-modal="true" aria-labelledby="ops-question-title"><h3 id="ops-question-title">Operations coordination question</h3><p id="ops-question-context"></p><p id="ops-question-to"></p><label for="ops-question-text">Question for the project team</label><textarea id="ops-question-text" rows="4" maxlength="1800" placeholder="What would you like confirmed before the next stage?" required></textarea><p class="ops-question-status" id="ops-question-status" aria-live="polite"></p><div class="ops-question-actions"><button type="button" class="ops-link" data-ops-cancel>Cancel</button><button type="button" class="ops-link" id="ops-question-teams-draft">Open Teams draft</button><button type="button" class="ops-link ops-primary" id="ops-question-send">Send Teams alert</button></div></div>`;
  document.body.appendChild(node);
  node.addEventListener('click',e=>{if(e.target.closest('[data-ops-cancel]')){if(opsTeamsSending){opsSendStatus('Sending… keep this window open until a result is reported.','sending');return;}node.hidden=true;}});
  node.querySelector('#ops-question-teams-draft').addEventListener('click',teamsDraft);
  node.querySelector('#ops-question-send').addEventListener('click',sendTeams);
  return node;
 }
 // AHT-OPS-TEAMS-SCROLL-LEAD-1: PM / Site Lead is the project's day-to-day owner.
 function siteDayToDayContact(project){
  const assigned=assignedContact(project,'projectManagerSiteLead');
  if(assigned.name||assigned.email)return {...assigned,role:'PM / Site Lead'};
  // Use explicit lead fields only when the shared PM/Site Lead field is empty.
  // Do not guess a recipient based on task ownership.
  for(const field of ['siteLead','leadTechnician','fieldLead','installationLead']){
   const lead=assignedContact(project,field);
   if(lead.name||lead.email)return {...lead,role:'Site Lead'};
  }
  return {...assigned,role:'PM / Site Lead'};
 }
 function getRecipients(project){
  const pm=siteDayToDayContact(project),senior=assignedContact(project,'seniorProjectManager');
  if(!pm.name&&!pm.email&&!senior.name&&!senior.email){window.alert('No PM / Site Lead or Senior PM is assigned. Set the day-to-day PM / Site Lead on the project, or assign a Senior PM.');return null;}
  let recipients=[];
  if(pm.name||pm.email)recipients.push(pm);
  else if(senior.name||senior.email){if(!window.confirm(`No PM / Site Lead is assigned. Send the question to Senior PM ${senior.name||senior.email} instead?`))return null;recipients.push({...senior,role:'Senior PM'});}
  if(recipients.length&&(pm.name||pm.email)&&(senior.name||senior.email)&&!(norm(senior.email)===norm(pm.email)&&senior.email)&&!(norm(senior.name)===norm(pm.name)&&senior.name))recipients.push({...senior,role:'Senior PM'});
  return recipients;
 }
 function openQuestion(key){if(!canAccess())return;const x=filtered().items.find(a=>a.key===key);if(!x)return;
  const recipients=getRecipients(x.project);if(!recipients?.length)return;
  opsQuestion.item=x;opsQuestion.recipients=recipients;
  const modal=questionModal();modal.hidden=false;
  modal.querySelector('#ops-question-context').textContent=`${x.projectName} · ${x.path||'Location unspecified'} · ${x.phase||x.title} · ${dateText(x.startDate)} – ${dateText(x.targetDate)}`;
  modal.querySelector('#ops-question-to').textContent='Notify: '+recipients.map(r=>(r.name||r.email||'Unresolved')+' ('+r.role+')').join('; ');
  modal.querySelector('#ops-question-text').value='';modal.querySelector('#ops-question-status').textContent='';
  modal.querySelector('#ops-question-text').focus();
  modal.querySelector('#ops-question-send').disabled=false;
  modal.querySelector('#ops-question-send').textContent='Send Teams alert';
  modal.querySelector('#ops-question-status').dataset.state='info';
 }
 function teamsMessage(){const x=opsQuestion.item,note=document.getElementById('ops-question-text').value.trim();return `Operations question from ${user()?.name||'AHT Operations'}\nProject: ${x.projectName}\nArea: ${x.path||'Not specified'}\nPhase: ${x.phase||'Not specified'}\nActivity: ${x.title}\nStart: ${dateText(x.startDate)}\nTarget: ${dateText(x.targetDate)}\n\n${note}\n\nSchedule changes must be made in Project Plan / Site Operations.`;}
 function teamsDraft(){const note=document.getElementById('ops-question-text').value.trim(),status=document.getElementById('ops-question-status');
  if(!note){status.textContent='Enter your question first.';return;}
  if(opsQuestion.recipients.some(r=>!r.email)){status.textContent='One or more recipients have no verified email address; ask an administrator to update the project contacts.';return;}
  const url='https://teams.microsoft.com/l/chat/0/0?users='+encodeURIComponent(opsQuestion.recipients.map(r=>r.email).join(','))+'&message='+encodeURIComponent(teamsMessage());
  const opened=window.open(url,'_blank','noopener,noreferrer');status.textContent=opened?'Teams draft opened. Review recipients and press Send in Teams; nothing has been sent automatically.':'Requested Teams draft. If a tab did not open, allow popups and retry. Nothing has been sent automatically.';
 }
 let opsTeamsSending=false;
 function opsSendStatus(message,state='info'){
  const el=document.getElementById('ops-question-status');
  if(!el)return;
  el.dataset.state=state;
  el.textContent=message;
 }
 async function sendTeams(){
  if(opsTeamsSending)return;
  const btn=document.getElementById('ops-question-send');
  const note=document.getElementById('ops-question-text')?.value.trim()||'';
  if(!note){opsSendStatus('Enter your question first.','error');return;}
  if(!canAccess()){opsSendStatus('Operations access is no longer available.','error');return;}
  // EXISTING-TEAMS-SYSTEMDEFAULT-FIX: use current dashboard Teams sender and the Microsoft reserved type.
  const type=String(appCfg()?.operations?.teamsActivityType||'').trim()||'systemDefault';
  if(typeof spProvider()?.sendTeamsActivityNotification!=='function'){
   opsSendStatus('Existing Teams sender is unavailable. Verify Microsoft sign-in, or use Open Teams draft.','error');return;
  }
  if(opsQuestion.recipients.some(r=>!r.objectId)){
   opsSendStatus('A recipient has no verified Entra Object ID. Direct Teams send is blocked; use a Teams draft or update the assigned contacts.','error');return;
  }
  const u=user()||{};
  const myId=String(u.entraObjectId||'').trim().toLowerCase();
  const myEmail=String(u.email||'').trim().toLowerCase();
  const unique=new Map();
  for(const r of opsQuestion.recipients){
   const id=String(r.objectId||'').trim();
   if(id)unique.set(id.toLowerCase(),r);
  }
  const recipients=[...unique.values()];
  const self=recipients.filter(r=>(myId&&String(r.objectId).toLowerCase()===myId)||
    (myEmail&&String(r.email||'').trim().toLowerCase()===myEmail));
  const others=recipients.filter(r=>!self.includes(r));
  if(!others.length){
   opsSendStatus('This question is addressed to your own account. Microsoft Teams does not support sending yourself activity alerts with this sign-in method. Nothing was sent. Choose a different AHT recipient for testing.','error');
   return;
  }
  const x=opsQuestion.item;
  const message=teamsMessage();
  let accepted=0,failures=[],unknown=false;
  opsTeamsSending=true;
  btn.disabled=true;
  btn.textContent='Sending…';
  const draft=document.getElementById('ops-question-teams-draft');
  if(draft)draft.disabled=true;
  opsSendStatus(`Sending Teams notification 1 of ${others.length}…`,'sending');
  try{
   for(let i=0;i<others.length;i++){
    const r=others[i];
    opsSendStatus(`Sending to ${r.name||r.email||'assigned manager'} (${i+1} of ${others.length})…`,'sending');
    // An unanswered token/Graph request must not leave the composer spinning indefinitely.
    // Timeout does NOT establish failure, so never auto-retry or say nothing was sent.
    let timer;
    try{
     await Promise.race([
      spProvider().sendTeamsActivityNotification({
       recipientObjectId:r.objectId,activityType:type,
       topic:`Operations: ${x.projectName} · ${x.title}`.slice(0,240),
       previewText:('Question: '+note+' | '+x.projectName+' / '+x.title).slice(0,450),
       templateParameters:type==='systemDefault'?
        [{name:'systemDefaultText',value:(String(u.name||'AHT Operations')+' asks: '+note).slice(0,220)}]:
        [{name:'actor',value:String(u.name||'Operations')},{name:'project',value:x.projectName},{name:'activity',value:x.title}]
      }),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Teams response timeout — request outcome unknown')),20000);})
     ]);
     accepted++;
    }catch(err){
     if(String(err?.message||err).includes('request outcome unknown')){
      unknown=true;failures.push(`${r.name||r.email||'Recipient'}: no response within 20 seconds`);break;
     }
     failures.push(`${r.name||r.email||'Recipient'}: ${String(err?.message||err)}`);
    }finally{clearTimeout(timer);}
   }
   const skipped=self.length?` Skipped ${self.length} self-recipient(s); Teams does not permit delegated self-notifications.`:'';
   if(unknown){
    opsSendStatus(`Delivery unconfirmed: ${accepted} of ${others.length} accepted before a request timed out.${skipped} Check Teams before submitting again; a timed-out request may still have been processed. ${failures.join('; ').slice(0,250)}`,'error');
    btn.textContent='Status unknown — close to review';
    // Keep disabled to prevent an accidental duplicate send from this composer.
   }else if(failures.length){
    opsSendStatus(`Microsoft Graph accepted ${accepted} of ${others.length} notification request(s).${skipped} Errors: ${failures.join('; ').slice(0,350)}. Check Teams before retrying.`,'error');
    btn.textContent='Send Teams alert';
    // No blind repeat, since some recipients may already have received it.
   }else{
    opsSendStatus(`Microsoft Graph accepted ${accepted} Teams notification request(s).${skipped} Verify receipt in Teams; Graph acceptance is not proof of delivery.`,'success');
    btn.textContent='Sent to Microsoft Graph';
   }
  }finally{
   opsTeamsSending=false;
   if(draft)draft.disabled=false;
   // Do not permit a second click on this completed/partially completed send.
   btn.disabled=true;
  }
 }
 $('#ops-project').addEventListener('change',e=>{local.project=e.target.value;$('#ops-main').scrollTop=0;refresh();});
 $('#ops-window').addEventListener('change',e=>{local.window=Number(e.target.value)||30;$('#ops-main').scrollTop=0;refresh();});
 $('#ops-search').addEventListener('input',e=>{local.search=e.target.value;$('#ops-main').scrollTop=0;refresh();});
 root.addEventListener('click',e=>{
  const bucket=e.target.closest('[data-ops-bucket]');
  if(bucket){
   local.bucket=bucket.dataset.opsBucket;
   $('#ops-main').scrollTop=0;
   refresh();
   const active=root.querySelector('[data-ops-bucket="'+local.bucket+'"]');
   if(active)active.focus({preventScroll:true});
   return;
  }
  const t=e.target.closest('[data-ops-tab]');if(t){local.tab=t.dataset.opsTab;$('#ops-main').scrollTop=0;refresh();return;}
  const display=e.target.closest('[data-ops-display]');if(display){local.display=display.dataset.opsDisplay;$('#ops-main').scrollTop=0;refresh();return;}
  const alert=e.target.closest('[data-alert]');if(alert){e.preventDefault();openQuestion(alert.dataset.alert);return;}
  if(e.target.closest('a,button,input,select,textarea,[role=link]')&&!e.target.closest('[data-expand]'))return;
  const expand=e.target.closest('[data-expand]');if(expand){e.preventDefault();const k=expand.dataset.expand;if(local.expanded.has(k))local.expanded.delete(k);else local.expanded.add(k);refresh();return;}
  const month=e.target.closest('[data-ops-month]');if(month){local.monthOffset+=Number(month.dataset.opsMonth);refresh();}
 });
 root.addEventListener('keydown',e=>{
  if(e.key!=='Enter'&&e.key!==' ')return;
  if(e.target.matches('a,button,input,select,textarea'))return;
  const row=e.target.closest('[data-expand]');
  if(!row||e.target!==row)return;
  e.preventDefault();row.click();
 });
 nav.addEventListener('click',()=>{if(canAccess())refresh();});
 const roleNode=document.getElementById('roleLabel');if(roleNode)new MutationObserver(updateNav).observe(roleNode,{childList:true,characterData:true,subtree:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateNav();});
 window.AHTOperations={canAccess,visibleProjects,refreshAccess:updateNav,onView:refresh,getRecords,rollupSite,siteScopeSignature,locationFromRow,operationFromRow};
 updateNav();
})();
