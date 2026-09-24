// Dashboard rendering.
//
// This module controls the visible project screens. Authentication,
// permissions, storage, and project data remain separate.

let calendarViewDate=new Date();
let calendarScheduleMode="project";

/*
 * Calendar Agenda hierarchy expansion is separate from Gantt expansion.
 * Only same-date descendants are hidden beneath their Higher-Level Task.
 */
let calendarExpandedAgendaTasks=new Set();
let calendarExpandedDays=new Set();

function toggleCalendarDay(key){
  const id=String(key||"");

  if(calendarExpandedDays.has(id)){
    calendarExpandedDays.delete(id);
  }else{
    calendarExpandedDays.add(id);
  }

  render();
}
window.toggleCalendarDay=toggleCalendarDay;

function toggleCalendarAgendaTask(encodedId){
  const id=decodeURIComponent(encodedId);

  if(calendarExpandedAgendaTasks.has(id)){
    calendarExpandedAgendaTasks.delete(id);
  }else{
    calendarExpandedAgendaTasks.add(id);
  }

  render();
}

window.toggleCalendarAgendaTask=toggleCalendarAgendaTask;
let ganttScheduleMode="project";
let siteScheduleSnapshot={locations:[],operations:[],loaded:false,loading:false,projectSharePointId:0};

const projectControlViewModes={
  deliverables:(()=>{try{return localStorage.getItem("aht-project-control-deliverables-view")||"cards";}catch{return "cards";}})(),
  info:(()=>{try{return localStorage.getItem("aht-project-control-info-view")||"cards";}catch{return "cards";}})()
};
function applyProjectControlViewModes(){
  ["deliverables","info"].forEach(sectionId=>{
    const section=document.getElementById(sectionId);
    if(!section)return;
    const mode=projectControlViewModes[sectionId]==="list"?"list":"cards";
    section.dataset.controlView=mode;
    document.querySelectorAll(`[data-control-view-button="${sectionId}"]`).forEach(button=>{
      const active=button.dataset.mode===mode;
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",active?"true":"false");
    });
  });
}
window.setProjectControlView=(sectionId,mode)=>{
  if(!["deliverables","info"].includes(sectionId)||!["cards","list"].includes(mode))return;
  projectControlViewModes[sectionId]=mode;
  try{localStorage.setItem(`aht-project-control-${sectionId}-view`,mode);}catch{}
  applyProjectControlViewModes();
};

function scheduleModeLabel(mode){return mode==="site"?"Site":mode==="combined"?"Combined":"Project";}
function updateScheduleModeButtons(){
  document.querySelectorAll("[data-schedule-view]").forEach(button=>{
    const active=(button.dataset.scheduleView==="calendar"?calendarScheduleMode:ganttScheduleMode)===button.dataset.mode;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",active?"true":"false");
  });
  const cd=document.getElementById("calendarModeDescription");
  if(cd)cd.textContent=calendarScheduleMode==="project"?"Project dates from Project Plan.":calendarScheduleMode==="site"?"Site Operations dates only. Details stay in Site Operations.":"Project and Site dates shown together without linking the underlying records.";
  const gd=document.getElementById("ganttModeDescription");
  if(gd)gd.textContent=ganttScheduleMode==="project"?"Project Plan schedule.":ganttScheduleMode==="site"?"Site Operations schedule only. Details stay in Site Operations.":"Project and Site schedules shown together while remaining independent.";
}
async function ensureSiteSchedule(force=false){
  const projectSharePointId=Number(currentProject()?.sharePointId||0);

  if(
    siteScheduleSnapshot.loading &&
    Number(siteScheduleSnapshot.projectSharePointId||0)===projectSharePointId
  ) return;

  if(
    siteScheduleSnapshot.loaded &&
    !force &&
    Number(siteScheduleSnapshot.projectSharePointId||0)===projectSharePointId
  ) return;

  if(!window.SiteOperations?.getScheduleData){
    console.error("Site schedule bridge is unavailable.");
    siteScheduleSnapshot={
      locations:[],
      operations:[],
      loaded:true,
      loading:false,
      projectSharePointId
    };
    return;
  }

  siteScheduleSnapshot={
    ...siteScheduleSnapshot,
    loading:true,
    loaded:false,
    projectSharePointId
  };

  try{
    const data=await window.SiteOperations.getScheduleData(
      force || Number(siteScheduleSnapshot.projectSharePointId||0)!==projectSharePointId
    );

    siteScheduleSnapshot={
      locations:data?.locations||[],
      operations:data?.operations||[],
      loaded:true,
      loading:false,
      projectSharePointId
    };
  }
  catch(error){
    console.error("Site schedule load failed",error);
    siteScheduleSnapshot={
      locations:[],
      operations:[],
      loaded:true,
      loading:false,
      projectSharePointId
    };
  }
}
window.setScheduleMode=async(view,mode)=>{
  if(!["project","site","combined"].includes(mode))return;
  if(view==="calendar"){
    calendarScheduleMode=mode;
  }else{
    ganttScheduleMode=mode;
    resetGanttGroups();
    resetGanttTimelineWindow();
  }
  updateScheduleModeButtons();
  if(mode!=="project")await ensureSiteSchedule(false);
  render();
};
function siteLocationName(id){return siteScheduleSnapshot.locations.find(x=>Number(x.id)===Number(id))?.name||"Site";}
function siteScheduleRecords(){
  return siteScheduleSnapshot.operations.map(op=>({
    ...op,
    scheduleKind:"site",
    deliverable:op.title,
    discipline:siteLocationName(op.locationId),
    startDate:op.activityDate||op.targetDate,
    date:op.targetDate||op.activityDate,
    waitingOn:op.blockerDependency||""
  }));
}
function projectScheduleRecords(fallbackRecords=[]){
  /*
   * Project Plan is now the Project-side schedule source.
   * Keep the old Deliverables records only as a temporary fallback
   * if Project Plan has not loaded yet.
   */
  const project=currentProject();
  const projectKey=String(
    project?.id ||
    project?.sharePointId ||
    ""
  );

  if(
    projectKey &&
    window.ProjectWorkItems?.getScheduleData
  ){
    return window.ProjectWorkItems
      .getScheduleData(projectKey,{includeParents:true})
      .map(record=>({
        ...record,
        scheduleKind:"projectPlan",
        discipline:
          record.discipline ||
          record.workstream ||
          record.phase ||
          "Project Plan"
      }));
  }

  return (fallbackRecords||[]).map(record=>({
    ...record,
    scheduleKind:"project"
  }));
}

function executiveProjectPlanItems(){
  /*
   * Project Plan is currently an administrator-only prototype.
   * Keep its Executive Summary intelligence behind the same
   * access boundary until Project Plan visibility rules are
   * intentionally opened to other roles.
   */
  if(
    !currentUser?.canAdmin ||
    !window.ProjectWorkItems?.getItems
  ){
    return [];
  }

  const project=currentProject();

  if(!project){
    return [];
  }

  const projectId=String(project.id??"");
  const sharePointId=Number(project.sharePointId||0);

  return window.ProjectWorkItems
    .getItems()
    .filter(item=>{
      if(item.archived)return false;

      return (
        String(item.projectId??"")===projectId ||
        (
          sharePointId>0 &&
          Number(item.projectSharePointId||0)===sharePointId
        )
      );
    });
}

function executiveTaskComplete(item){
  if(!item)return false;

  return (
    String(item.status||"")==="Complete" ||
    (
      window.ProjectWorkItems?.displayedProgress &&
      Number(
        window.ProjectWorkItems.displayedProgress(item.id)
      )>=100
    )
  );
}

function executiveTaskPredecessors(item){
  if(!item || !window.ProjectWorkItems?.getItem){
    return [];
  }

  const ids=
    (
      Array.isArray(item.predecessorIds) &&
      item.predecessorIds.length
    )
      ? item.predecessorIds
      : item.predecessorId
        ? [item.predecessorId]
        : [];

  return [
    ...new Set(
      ids
        .map(id=>String(id))
        .filter(Boolean)
    )
  ]
    .map(id=>window.ProjectWorkItems.getItem(id))
    .filter(Boolean);
}

function executiveIncompletePredecessors(item){
  return executiveTaskPredecessors(item)
    .filter(predecessor=>
      !executiveTaskComplete(predecessor)
    );
}

function executiveTaskPath(item){
  if(!item || !window.ProjectWorkItems?.pathFor){
    return item?.title||"";
  }

  return window.ProjectWorkItems
    .pathFor(item.id)
    .map(node=>node.title)
    .join(" › ");
}

function executiveTaskDate(item){
  return (
    item?.requiredBy ||
    item?.targetDate ||
    item?.startDate ||
    ""
  );
}

function executiveDependencyScheduleConflicts(item){
  if(
    !item ||
    !item.startDate ||
    executiveTaskComplete(item)
  ){
    return [];
  }

  const dependentStart=
    new Date(`${String(item.startDate).slice(0,10)}T12:00:00`);

  if(Number.isNaN(dependentStart.getTime())){
    return [];
  }

  return executiveIncompletePredecessors(item)
    .map(predecessor=>{
      const predecessorFinishValue=
        predecessor.targetDate ||
        "";

      if(!predecessorFinishValue){
        return null;
      }

      const predecessorFinish=
        new Date(
          `${String(predecessorFinishValue).slice(0,10)}T12:00:00`
        );

      if(Number.isNaN(predecessorFinish.getTime())){
        return null;
      }

      if(predecessorFinish <= dependentStart){
        return null;
      }

      const days=
        Math.ceil(
          (
            predecessorFinish.getTime() -
            dependentStart.getTime()
          ) /
          86400000
        );

      return {
        predecessor,
        dependentStart:
          String(item.startDate).slice(0,10),
        predecessorFinish:
          String(predecessorFinishValue).slice(0,10),
        days
      };
    })
    .filter(Boolean);
}

function executiveUpstreamScheduleConflicts(item){
  if(!item){
    return [];
  }

  const conflicts=[];
  const seenConflicts=new Set();
  const visited=new Set();

  const walk=current=>{
    if(!current?.id){
      return;
    }

    const currentId=
      String(current.id);

    if(visited.has(currentId)){
      return;
    }

    visited.add(currentId);

    executiveDependencyScheduleConflicts(current)
      .forEach(conflict=>{
        const key=
          `${currentId}::${String(conflict.predecessor?.id??"")}`;

        if(seenConflicts.has(key)){
          return;
        }

        seenConflicts.add(key);

        conflicts.push({
          item:current,
          ...conflict
        });
      });

    executiveTaskPredecessors(current)
      .forEach(predecessor=>
        walk(predecessor)
      );
  };

  walk(item);

  return conflicts;
}

function executiveProjectPlanSnapshot(){
  const items=executiveProjectPlanItems();

  const active=items
    .filter(item=>
      !executiveTaskComplete(item) &&
      String(item.status||"")!=="Waiting" &&
      String(item.status||"")!=="Awaiting Review" &&
      String(item.status||"")!=="Blocked" &&
      (
        String(item.status||"")==="In Progress" ||
        Number(
          window.ProjectWorkItems?.displayedProgress?.(item.id)||0
        )>0
      )
    );

  const waiting=items
    .filter(item=>
      !executiveTaskComplete(item) &&
      (
        item.waitingOn ||
        item.informationRequired ||
        String(item.status||"")==="Waiting" ||
        String(item.status||"")==="Awaiting Review" ||
        String(item.status||"")==="Blocked"
      )
    );

  const blocked=items
    .map(item=>({
      item,
      predecessors:
        executiveIncompletePredecessors(item),
      scheduleConflicts:
        executiveDependencyScheduleConflicts(item)
    }))
    .filter(record=>
      !executiveTaskComplete(record.item) &&
      record.predecessors.length
    );

  const milestoneRisks=items
    .filter(item=>
      !executiveTaskComplete(item) &&
      String(item.itemType||"")==="Milestone"
    )
    .map(item=>({
      item,
      conflicts:
        executiveUpstreamScheduleConflicts(item)
    }))
    .filter(record=>
      record.conflicts.length
    );

  const upcoming=items
    .filter(item=>
      !executiveTaskComplete(item) &&
      item.targetDate
    )
    .slice()
    .sort((a,b)=>
      String(a.targetDate||"9999-12-31")
        .localeCompare(
          String(b.targetDate||"9999-12-31")
        )
    );

  return {
    items,
    active,
    waiting,
    blocked,
    milestoneRisks,
    upcoming
  };
}

function executiveSiteComplete(item){
  return (
    String(item?.status||"")==="Complete" ||
    Number(item?.percentComplete||0)>=100
  );
}

function executiveSitePredecessorIds(item){
  return [
    ...new Set(
      (
        Array.isArray(item?.predecessorIds)
          ? item.predecessorIds
          : []
      )
        .map(id=>String(id))
        .filter(Boolean)
    )
  ];
}

function executiveSiteClickableAttrs(item){
  if(!item?.id)return "";

  const id=String(item.id)
    .replaceAll("\\","\\\\")
    .replaceAll("'","\\'");

  return ` role="button" tabindex="0" onclick="openScheduleSource('site','${id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openScheduleSource('site','${id}');}"`;
}

function executiveSiteScheduleSnapshot(){
  const items=siteScheduleRecords();

  const byId=new Map(
    items.map(item=>[
      String(item.id),
      item
    ])
  );

  const predecessorsFor=item=>
    executiveSitePredecessorIds(item)
      .map(id=>byId.get(id))
      .filter(Boolean);

  const scheduleConflictsFor=item=>{
    if(
      executiveSiteComplete(item) ||
      !item?.startDate
    ){
      return [];
    }

    const dependentStart=new Date(
      `${String(item.startDate).slice(0,10)}T12:00:00`
    );

    if(Number.isNaN(dependentStart.getTime())){
      return [];
    }

    return predecessorsFor(item)
      .filter(predecessor=>
        !executiveSiteComplete(predecessor)
      )
      .map(predecessor=>{
        const finishValue=
          predecessor.date ||
          predecessor.targetDate ||
          "";

        if(!finishValue)return null;

        const predecessorFinish=new Date(
          `${String(finishValue).slice(0,10)}T12:00:00`
        );

        if(
          Number.isNaN(predecessorFinish.getTime()) ||
          predecessorFinish<=dependentStart
        ){
          return null;
        }

        return {
          predecessor,
          dependentStart:
            String(item.startDate).slice(0,10),
          predecessorFinish:
            String(finishValue).slice(0,10),
          days:
            Math.ceil(
              (
                predecessorFinish.getTime() -
                dependentStart.getTime()
              ) /
              86400000
            )
        };
      })
      .filter(Boolean);
  };

  const upstreamConflictsFor=item=>{
    const conflicts=[];
    const visited=new Set();
    const seenConflicts=new Set();

    const walk=current=>{
      const currentId=String(current?.id??"");

      if(
        !currentId ||
        visited.has(currentId)
      ){
        return;
      }

      visited.add(currentId);

      scheduleConflictsFor(current)
        .forEach(conflict=>{
          const key=
            `${currentId}:${String(conflict.predecessor?.id??"")}`;

          if(seenConflicts.has(key)){
            return;
          }

          seenConflicts.add(key);

          conflicts.push({
            item:current,
            ...conflict
          });
        });

      predecessorsFor(current)
        .forEach(predecessor=>
          walk(predecessor)
        );
    };

    walk(item);

    return conflicts;
  };

  const blocked=items
    .map(item=>({
      item,
      predecessors:
        predecessorsFor(item)
          .filter(predecessor=>
            !executiveSiteComplete(predecessor)
          ),
      scheduleConflicts:
        scheduleConflictsFor(item)
    }))
    .filter(record=>
      !executiveSiteComplete(record.item) &&
      record.predecessors.length
    );

  const milestoneRisks=items
    .filter(item=>
      !executiveSiteComplete(item) &&
      String(item.itemType||"")==="Milestone"
    )
    .map(item=>({
      item,
      conflicts:
        upstreamConflictsFor(item)
    }))
    .filter(record=>
      record.conflicts.length
    );

  return {
    items,
    blocked,
    milestoneRisks
  };
}

function openExecutiveProjectTask(id){
  if(!id)return;

  showView("projectWork");

  window.ProjectWorkView
    ?.openItem?.(id);
}

function executiveTaskClickableAttrs(item){
  if(!item?.id)return "";

  const id=String(item.id)
    .replaceAll("\\","\\\\")
    .replaceAll("'","\\'");

  return ` role="button" tabindex="0" onclick="openExecutiveProjectTask('${id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openExecutiveProjectTask('${id}');}"`;
}

const executiveSummaryExpanded = {
  currentWork:false,
  requiredOthers:false,
  nextDeliverables:false,
  projectRisks:false
};

const EXECUTIVE_SUMMARY_LIMIT = 6;

function executiveDateSortValue(value){
  if(!value)return Number.POSITIVE_INFINITY;

  const date=new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(String(value))
      ? `${value}T12:00:00`
      : value
  );

  return Number.isNaN(date.getTime())
    ? Number.POSITIVE_INFINITY
    : date.getTime();
}

function executiveSortByDate(a,b){
  const dateDiff=
    executiveDateSortValue(a.date) -
    executiveDateSortValue(b.date);

  if(dateDiff!==0)return dateDiff;

  return String(a.title||"")
    .localeCompare(String(b.title||""));
}

function executiveDaysFromToday(value){
  const time=executiveDateSortValue(value);

  if(!Number.isFinite(time)){
    return null;
  }

  const today=new Date();
  today.setHours(0,0,0,0);

  const date=new Date(time);
  date.setHours(0,0,0,0);

  return Math.round(
    (date.getTime()-today.getTime()) /
    86400000
  );
}

function executiveUrgencyRank(value){
  const days=executiveDaysFromToday(value);

  // Undated work falls behind dated work.
  if(days===null)return 4;

  // Most urgent first.
  if(days<0)return 0;
  if(days===0)return 1;
  if(days<=7)return 2;

  return 3;
}

function executiveSortUrgentFirst(a,b){
  const urgencyDiff=
    executiveUrgencyRank(a.date) -
    executiveUrgencyRank(b.date);

  if(urgencyDiff!==0){
    return urgencyDiff;
  }

  return executiveSortByDate(a,b);
}

function executivePanelHtml(key,rows,emptyText){
  if(!rows.length){
    return `<span class="small">${esc(emptyText)}</span>`;
  }

  const expanded=
    Boolean(executiveSummaryExpanded[key]);

  const visible=
    expanded
      ? rows
      : rows.slice(0,EXECUTIVE_SUMMARY_LIMIT);

  const remaining=
    Math.max(
      0,
      rows.length-EXECUTIVE_SUMMARY_LIMIT
    );

  const footer=
    rows.length>EXECUTIVE_SUMMARY_LIMIT
      ? `
        <div class="exec-summary-more-wrap">
          <button
            type="button"
            class="exec-summary-more"
            onclick="toggleExecutiveSummaryPanel('${key}')"
          >
            ${
              expanded
                ? `Show top ${EXECUTIVE_SUMMARY_LIMIT}`
                : `View all ${rows.length}`
            }
          </button>
          ${
            !expanded && remaining
              ? `<span>${remaining} more</span>`
              : ""
          }
        </div>
      `
      : "";

  return visible.map(record=>record.html).join("")+footer;
}

function toggleExecutiveSummaryPanel(key){
  if(!(key in executiveSummaryExpanded))return;

  executiveSummaryExpanded[key]=
    !executiveSummaryExpanded[key];

  render();
}

function executiveBlockedRiskDate(record){
  const dates=
    (record?.predecessors||[])
      .map(predecessor=>
        predecessor.targetDate ||
        predecessor.requiredBy ||
        ""
      )
      .filter(Boolean)
      .sort();

  return dates[0] ||
    executiveTaskDate(record?.item) ||
    "";
}

function executiveRiskPriority(record){
  return executiveUrgencyRank(record?.date);
}

function executiveSortRisks(a,b){
  const priorityDiff=
    executiveRiskPriority(a) -
    executiveRiskPriority(b);

  if(priorityDiff!==0){
    return priorityDiff;
  }

  /*
   * When urgency is equal, an active dependency/blocker
   * takes precedence over a general Deliverable risk.
   */
  const kindA=
    a.kind==="dependency" ? 0 : 1;

  const kindB=
    b.kind==="dependency" ? 0 : 1;

  if(kindA!==kindB){
    return kindA-kindB;
  }

  return executiveSortByDate(a,b);
}

function scheduleRecordsForGantt(projectRecords){
  const project=projectScheduleRecords(projectRecords);
  const site=siteScheduleRecords();

  return ganttScheduleMode==="site"
    ? site
    : ganttScheduleMode==="combined"
      ? [...project,...site]
      : project;
}

function openScheduleSource(kind,id){
  if(kind==="site"){
    window.SiteOperations?.openScheduleItem(id);
    return;
  }

  if(kind==="projectPlan"){
    showView("projectWork");

    setTimeout(()=>{
      window.ProjectWorkView?.openItem?.(id);
    },0);

    return;
  }

  /*
   * Temporary fallback for legacy Deliverable schedule records.
   */
  if(currentUser?.canEdit){
    editDeliverable(id);
  }else{
    showView("deliverables");
  }
}
window.openScheduleSource=openScheduleSource;
window.resetSiteScheduleSnapshot=()=>{
  siteScheduleSnapshot={locations:[],operations:[],loaded:false,loading:false,projectSharePointId:0};
};

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

function recordComments(project,recordType,record,includeResolved=false){
  const recordId=Number(record?.sharePointId||record?.id||0);
  return (project?.comments||[]).filter(comment=>
    comment.recordType===recordType &&
    Number(comment.recordSharePointId)===recordId &&
    (includeResolved||comment.status!=="Resolved")
  );
}


function projectGeneralComments(project,includeResolved=false){
  const projectRecordId=Number(project?.sharePointId||0);
  return (project?.comments||[]).filter(comment=>
    comment.recordType==="Project" &&
    Number(comment.recordSharePointId)===projectRecordId &&
    (includeResolved||comment.status!=="Resolved")
  );
}
function commentControl(project,recordType,record,{card=false}={}){
  if(!currentUser?.isInternal)return "";
  const openCount=recordComments(project,recordType,record,false).length;
  const iconLabel=card?`💬 <span class="project-control-comment-count">${openCount}</span>`:(openCount?`💬 ${openCount}`:"💬");
  const cls=openCount?"comment-link has-comments":"comment-link";
  const visibleLabel=card?`<span class="project-control-comment-label">Comment:</span>`:"";
  return `<button class="linkbtn ${cls}${card?" project-control-card-comment":""}" type="button" onclick="event.stopPropagation();openComments('${recordType}',${Number(record.id)})" title="Comments" aria-label="Comments (${openCount} open)">${visibleLabel}<span class="project-control-comment-icon" aria-hidden="true">${iconLabel}</span></button>`;
}


function projectControlDetailRow(label,value,raw=false){
  const content=raw?(value||"—"):esc(value||"—");
  return `<div class="project-control-detail-row"><span>${esc(label)}</span><div>${content}</div></div>`;
}

function closeProjectControlDetail(){
  document.getElementById("projectControlDetailBackdrop")?.remove();
}

function projectControlMetaItem(label,value,raw=false){
  const content=raw?(value||"—"):esc(value||"—");
  return `<div class="project-control-detail-meta-item"><span>${esc(label)}</span><div>${content}</div></div>`;
}

function openProjectControlDetail(recordType,id){
  const project=currentProject();
  if(!project)return;
  const numericId=Number(id);
  const deliverable=recordType==="Deliverable"?visibleDeliverables(project).find(x=>Number(x.id)===numericId):null;
  const info=recordType==="Information Required"?visibleInfo(project).find(x=>Number(x.id)===numericId):null;
  const record=deliverable||info;
  if(!record)return;

  closeProjectControlDetail();

  let title="";
  let kicker="";
  let rows="";
  let metaHtml="";
  let editAction="";

  if(deliverable){
    title=deliverable.deliverable||"Deliverable";
    kicker=deliverable.discipline||"Deliverable";
    metaHtml=[
      projectControlMetaItem("Status",badge(deliverable.status),true),
      projectControlMetaItem("Health",healthBadge(deliverable),true),
      projectControlMetaItem("Viewable By",visBadge(deliverable.visibility),true)
    ].join("");
    rows=[
      projectControlDetailRow("Current Activity",deliverable.current),
      projectControlDetailRow("Owner",deliverable.owner),
      projectControlDetailRow("Waiting On",deliverable.waitingOn),
      projectControlDetailRow("Next Step",deliverable.nextStep),
      projectControlDetailRow("Target",fmtDate(deliverable.date)),
      projectControlDetailRow("Risk",deliverable.risk)
    ].join("");
    editAction=currentUser.canEdit?`<button class="btn primary" type="button" onclick="closeProjectControlDetail();editDeliverable(${deliverable.id})">Edit Deliverable</button>`:"";
  }else{
    title=info.item||"Information Required";
    kicker="Information Required";
    metaHtml=[
      projectControlMetaItem("Status",badge(info.status),true),
      projectControlMetaItem("Viewable By",visBadge(info.visibility),true)
    ].join("");
    rows=[
      projectControlDetailRow("Requested From",info.from),
      projectControlDetailRow("Blocking",info.blocking),
      projectControlDetailRow("Needed By",fmtDate(info.neededBy)),
      projectControlDetailRow("Notes",info.notes)
    ].join("");
    editAction=currentUser.canEdit?`<button class="btn primary" type="button" onclick="closeProjectControlDetail();editInfo(${info.id})">Edit Request</button>`:"";
  }

  const backdrop=document.createElement("div");
  backdrop.id="projectControlDetailBackdrop";
  backdrop.className="modal-backdrop project-control-detail-backdrop";
  backdrop.innerHTML=`<div class="modal project-control-detail-modal" role="dialog" aria-modal="true" aria-label="${esc(title)} details">
    <div class="project-control-detail-head">
      <div>
        <div class="eyebrow">${esc(kicker)}</div>
        <h3>${esc(title)}</h3>
      </div>
      <button class="project-control-detail-close" type="button" onclick="closeProjectControlDetail()" aria-label="Close">×</button>
    </div>
    <div class="project-control-detail-meta">${metaHtml}</div>
    <div class="project-control-detail-body">${rows}</div>
    <div class="modal-actions project-control-detail-actions"><span style="flex:1"></span><button class="btn" type="button" onclick="closeProjectControlDetail()">Close</button>${editAction}</div>
  </div>`;
  backdrop.addEventListener("click",event=>{if(event.target===backdrop)closeProjectControlDetail();});
  document.body.appendChild(backdrop);
}

window.openProjectControlDetail=openProjectControlDetail;
window.closeProjectControlDetail=closeProjectControlDetail;

let summaryDeliverableMode = "";

function summaryRecordDestination(recordType,id){
  const project=currentProject();
  if(!project)return null;

  const numericId=Number(id);

  if(recordType==="Deliverable"){
    const record=visibleDeliverables(project).find(x=>Number(x.id)===numericId);
    return record ? {view:"deliverables",record} : null;
  }

  if(recordType==="Information Required"){
    const record=visibleInfo(project).find(x=>Number(x.id)===numericId);
    return record ? {view:"info",record} : null;
  }

  return null;
}

function summaryClickableAttrs(recordType,id){
  if(!summaryRecordDestination(recordType,id)){
    return ' class="item"';
  }

  const safeType=String(recordType)
    .replaceAll("\\","\\\\")
    .replaceAll("'","\\'");

  const numericId=Number(id);

  return ` class="item summary-drilldown" role="button" tabindex="0" data-summary-type="${safeType}" data-summary-id="${numericId}" onclick="openSummaryRecord('${safeType}',${numericId})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openSummaryRecord('${safeType}',${numericId});}"`;
}

function openSummaryRecord(recordType,id){
  const destination=summaryRecordDestination(recordType,id);
  if(!destination)return;

  summaryDeliverableMode="";

  if(destination.view==="deliverables"){
    openProjectControlDetail(
      "Deliverable",
      destination.record.id
    );
    return;
  }

  if(destination.view==="info"){
    openProjectControlDetail(
      "Information Required",
      destination.record.id
    );
  }
}

function openSummaryDeliverables(mode="all"){
  summaryDeliverableMode=mode;

  if(searchDeliverables) searchDeliverables.value="";
  if(filterStatus) filterStatus.value="";
  if(filterDiscipline) filterDiscipline.value="";

  showView("deliverables");
  render();
}

function bindSummaryDrilldowns(){
  document.querySelectorAll(".summary-drilldown").forEach(el=>{
    const activate=()=>{
      openSummaryRecord(el.dataset.summaryType,Number(el.dataset.summaryId));
    };

    el.onclick=activate;
    el.onkeydown=event=>{
      if(event.key==="Enter"||event.key===" "){
        event.preventDefault();
        activate();
      }
    };
  });
}
function currentProjectAccessCapability(capability){
 const user=currentUser;
 if(!user)return false;

 // Internal AHT users automatically receive both detailed work areas.
 if(user.isInternal!==false)return true;

 const project=currentProject();
 if(!project)return false;

 const projectKey=String(
   project.id||
   project.projectKey||
   ""
 ).trim();

 const access=
   user.projectAccess&&projectKey
     ? user.projectAccess[projectKey]
     : null;

 if(access&&typeof access[capability]==="boolean"){
   return access[capability];
 }

 // Temporary compatibility fallback during migration.
 return Boolean(user[capability]);
}

function render(){
 document.querySelectorAll(".editor-only").forEach(x=>x.classList.toggle("hidden",!currentUser?.canEdit));
 document.querySelectorAll(".admin-only").forEach(x=>x.classList.toggle("hidden",!currentUser?.canAdmin));

 const canOpenAdministration=
   Boolean(
     currentUser?.canManageProjects ||
     currentUser?.canManageInternalUsers ||
     currentUser?.canAssignProjectAccess ||
     currentUser?.canViewExternalUsers ||
     currentUser?.canManageExternalUsers ||
     currentUser?.canManageSystem ||
     currentUser?.canManageBackups
   );

 document.querySelectorAll(".management-only")
   .forEach(x=>x.classList.toggle("hidden",!canOpenAdministration));

 document.querySelectorAll(".manage-projects-only")
   .forEach(x=>x.classList.toggle("hidden",!currentUser?.canManageProjects));

 document.querySelectorAll(".manage-access-only")
   .forEach(x=>x.classList.toggle(
     "hidden",
     !(
       currentUser?.canManageInternalUsers ||
       currentUser?.canAssignProjectAccess ||
       currentUser?.canViewExternalUsers
     )
   ));

 document.querySelectorAll(".system-owner-only")
   .forEach(x=>x.classList.toggle("hidden",!currentUser?.isSystemOwner));
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
 userLabel.textContent=currentUser.name;roleLabel.textContent=currentUser.role;avatarInitials.textContent=currentUser.name.split(" ").map(x=>x[0]).join("").slice(0,2);projectSubtitle.textContent=`${p.name} · ${p.subtitle}`;welcomeTitle.textContent=`Welcome, ${currentUser.name.split(" ")[0]}`;const displayedHealth=displayedProjectHealth(p);summaryHealth.textContent=displayedHealth;summaryHealthDot.style.background=healthColor(displayedHealth);const projectHealthIsManual=activeProjectHealthOverride(p);summaryHealthMode.textContent=projectHealthIsManual?"Manual override":"";summaryHealthMode.classList.toggle("hidden",!projectHealthIsManual);summaryHealthNote.innerHTML=projectHealthIsManual
  ? `<span class="project-health-driver project-health-driver-manual">${esc(p.healthOverrideReason||"Manual project health override")}</span>`
  : (
      projectHealthSummaryParts(p).length
        ? projectHealthSummaryParts(p)
            .map(item=>{
              let cls="project-health-driver";

              if(/blocked Project Plan Task/i.test(item)){
                cls+=" project-health-driver-project";
              }else if(/overdue information request/i.test(item)){
                cls+=" project-health-driver-overdue";
              }else if(/due within 7 days/i.test(item)){
                cls+=" project-health-driver-soon";
              }else if(/Site Operation/i.test(item)){
                cls+=" project-health-driver-site";
              }else if(/overdue Deliverable/i.test(item)){
                cls+=" project-health-driver-overdue";
              }else if(/overdue Project Plan Task/i.test(item)){
                cls+=" project-health-driver-overdue";
              }

              return `<span class="${cls}">${esc(item)}</span>`;
            })
            .join("")
        : '<span class="project-health-driver project-health-driver-clear">No significant schedule or dependency issues</span>'
    );summaryExecutiveLead.textContent=p.executiveLead||"—";summarySeniorProjectManager.textContent=p.seniorProjectManager||"—";summaryProjectManagerSiteLead.textContent=p.projectManagerSiteLead||"—";summaryUpdated.textContent=formatLastUpdated(p);

 const executiveOverall=weightedProjectProgress(p);
 const executivePlanning=displayedPhaseProgress(p,"Planning");
 const executiveEngineering=displayedPhaseProgress(p,"Engineering");
 const executiveInstallation=displayedPhaseProgress(p,"Installation");

 const summaryProgressOverall=document.getElementById("summaryProgressOverall");
 const summaryProgressPlanning=document.getElementById("summaryProgressPlanning");
 const summaryProgressEngineering=document.getElementById("summaryProgressEngineering");
 const summaryProgressInstallation=document.getElementById("summaryProgressInstallation");

 const summaryProgressOverallBar=document.getElementById("summaryProgressOverallBar");
 const summaryProgressPlanningBar=document.getElementById("summaryProgressPlanningBar");
 const summaryProgressEngineeringBar=document.getElementById("summaryProgressEngineeringBar");
 const summaryProgressInstallationBar=document.getElementById("summaryProgressInstallationBar");

 if(summaryProgressOverall)summaryProgressOverall.textContent=`${executiveOverall}%`;
 if(summaryProgressPlanning)summaryProgressPlanning.textContent=`${executivePlanning}%`;
 if(summaryProgressEngineering)summaryProgressEngineering.textContent=`${executiveEngineering}%`;
 if(summaryProgressInstallation)summaryProgressInstallation.textContent=`${executiveInstallation}%`;

 if(summaryProgressOverallBar)summaryProgressOverallBar.style.width=`${Math.max(0,Math.min(100,executiveOverall))}%`;
 if(summaryProgressPlanningBar)summaryProgressPlanningBar.style.width=`${Math.max(0,Math.min(100,executivePlanning))}%`;
 if(summaryProgressEngineeringBar)summaryProgressEngineeringBar.style.width=`${Math.max(0,Math.min(100,executiveEngineering))}%`;
 if(summaryProgressInstallationBar)summaryProgressInstallationBar.style.width=`${Math.max(0,Math.min(100,executiveInstallation))}%`;document.querySelectorAll(".internal-activity").forEach(x=>x.classList.toggle("hidden",!currentUser.isInternal));lastActivityDate.textContent=fmtDate(p.lastActivityDate);lastActivityText.textContent=p.lastActivity||"No activity recorded.";const activityPhase=document.getElementById("lastActivityPhase");if(activityPhase){activityPhase.textContent=p.lastActivityPhase||"";activityPhase.classList.toggle("hidden",!p.lastActivityPhase);}const projectCommentBtn=document.getElementById("addProjectCommentBtn");if(projectCommentBtn){const openProjectComments=projectGeneralComments(p,false).length;projectCommentBtn.classList.toggle("hidden",!currentUser?.isInternal);if(window.innerWidth<=700){
  projectCommentBtn.innerHTML=`
    <span class="mobile-project-comment">
      <span class="comment-text-line">Project</span>
      <span class="comment-text-line">Comment${openProjectComments===1?"":"s"}</span>
      <span class="comment-icon-wrap">
        <span class="comment-icon">💬</span>
        ${openProjectComments ? `<span class="comment-count">${openProjectComments}</span>` : ""}
      </span>
    </span>`;
}else{
  projectCommentBtn.textContent=openProjectComments
    ? `💬 ${openProjectComments} Project Comment${openProjectComments===1?"":"s"}`
    : "💬 Project Comment";
}}
 permissionBanner.textContent=currentUser.projects.includes("*")?`${currentUser.name} can view all assigned Newbury projects. ${currentUser.canAdmin?"Administrator access.":currentUser.canEdit?"Internal editing access.":"Read-only executive access."}`:`${currentUser.name} can view only: ${projects.map(x=>x.name).join(", ")}. ${currentUser.canEdit?"Internal editing access.":"Read-only external access."}`;
 document.querySelectorAll(".editor-only").forEach(x=>x.classList.toggle("hidden",!currentUser.canEdit));
 document.querySelectorAll(".admin-only").forEach(x=>x.classList.toggle("hidden",!currentUser.canAdmin));

 document.querySelectorAll(".management-only")
   .forEach(x=>x.classList.toggle("hidden",!canOpenAdministration));

 document.querySelectorAll(".manage-projects-only")
   .forEach(x=>x.classList.toggle("hidden",!currentUser?.canManageProjects));

 document.querySelectorAll(".manage-access-only")
   .forEach(x=>x.classList.toggle(
     "hidden",
     !(
       currentUser?.canManageInternalUsers ||
       currentUser?.canAssignProjectAccess ||
       currentUser?.canViewExternalUsers
     )
   ));

 document.querySelectorAll(".system-owner-only")
   .forEach(x=>x.classList.toggle("hidden",!currentUser?.isSystemOwner));

 document.querySelectorAll(".project-plan-access").forEach(
   x=>x.classList.toggle(
     "hidden",
     !currentProjectAccessCapability("canViewProjectPlan")
   )
 );

 document.querySelectorAll(".site-operations-access").forEach(
   x=>x.classList.toggle(
     "hidden",
     !currentProjectAccessCapability("canViewSiteOperations")
   )
 );
 projectGrid.innerHTML=projects.map(pr=>{const waiting=pr.deliverables.filter(x=>x.status.includes("Waiting")||x.status==="Awaiting Review").length,complete=pr.deliverables.filter(x=>x.status==="Complete").length,active=Math.max(0,pr.deliverables.length-waiting-complete);const progress=weightedProjectProgress(pr),planning=displayedPhaseProgress(pr,"Planning"),engineering=displayedPhaseProgress(pr,"Engineering"),installation=displayedPhaseProgress(pr,"Installation"),health=displayedProjectHealth(pr);return `<div class="project-card" onclick="setProject('${pr.id}');showView('dashboard')"><h3>${esc(pr.name)}</h3><p>${esc(pr.subtitle)}</p><div class="health"><span class="pulse" style="background:${healthColor(health)}"></span><span>${esc(health)}</span></div><div class="small" style="margin-top:6px">Updated: ${esc(formatLastUpdated(pr))}</div><div class="progress-wrap"><div class="small" style="display:flex;justify-content:space-between"><span>Overall Progress</span><strong>${progress}%${progressModeMark(pr.progressOverallMode||"auto")}</strong></div><div class="progress-bar"><span style="width:${progress}%"></span></div><div class="phase-progress"><div class="phase-progress-row"><span>Planning</span><div class="progress-bar"><span style="width:${planning}%"></span></div><strong><span class="phase-progress-value">${planning}%</span>${progressModeMark(phaseProgressMode(pr,"Planning"))}</strong></div><div class="phase-progress-row"><span>Engineering</span><div class="progress-bar"><span style="width:${engineering}%"></span></div><strong><span class="phase-progress-value">${engineering}%</span>${progressModeMark(phaseProgressMode(pr,"Engineering"))}</strong></div><div class="phase-progress-row"><span>Installation</span><div class="progress-bar"><span style="width:${installation}%"></span></div><strong><span class="phase-progress-value">${installation}%</span>${progressModeMark(phaseProgressMode(pr,"Installation"))}</strong></div></div></div><div class="stats"><div class="stat-mini"><strong>${active}</strong><span>ACTIVE</span></div><div class="stat-mini"><strong>${waiting}</strong><span>WAITING</span></div><div class="stat-mini"><strong>${complete}</strong><span>COMPLETE</span></div></div></div>`}).join("");
 const opts=projects.map(pr=>`<option value="${pr.id}" ${pr.id===p.id?"selected":""}>${esc(pr.name)}</option>`).join("");projectSelect.innerHTML=opts;document.querySelectorAll(".project-select-clone").forEach(s=>s.innerHTML=opts);
 const summaryWaiting=ds.filter(x=>x.status.includes("Waiting")||x.status==="Awaiting Review").length,summaryComplete=ds.filter(x=>x.status==="Complete").length,summaryActive=Math.max(0,ds.length-summaryWaiting-summaryComplete);kpiTotal.textContent=ds.length;kpiActive.textContent=summaryActive;kpiWaiting.textContent=summaryWaiting;kpiComplete.textContent=summaryComplete;

[
  [kpiTotal,"all"],
  [kpiActive,"active"],
  [kpiWaiting,"waiting"],
  [kpiComplete,"complete"]
].forEach(([el,mode])=>{
  const card=el?.closest(".kpi");
  if(!card)return;

  card.classList.add("summary-kpi-drilldown");
  card.setAttribute("role","button");
  card.tabIndex=0;
  card.onclick=()=>openSummaryDeliverables(mode);
  card.onkeydown=event=>{
    if(event.key==="Enter"||event.key===" "){
      event.preventDefault();
      openSummaryDeliverables(mode);
    }
  };
});
 const executivePlan=executiveProjectPlanSnapshot();
 const executiveSite=executiveSiteScheduleSnapshot();

 // ==========================================================
 // CURRENT WORK
 // Earliest target first. Undated work falls to the bottom.
 // ==========================================================

 const currentWorkRows=[
   ...ds
     .filter(x=>x.status==="In Progress")
     .map(x=>({
       date:x.date||"",
       title:x.deliverable||"",
       html:`
         <div class="item exec-summary-item exec-source-deliverable"${summaryClickableAttrs("Deliverable",x.id)}>
           <span class="dot"></span>
           <div class="exec-summary-content">
             <div class="exec-summary-title-line">
               <strong>${esc(x.deliverable)}</strong>
               <span class="exec-source-tag">Deliverable</span>
               ${visBadge(x.visibility)}
             </div>
             <div class="small">${esc(x.current)}</div>
           </div>
         </div>
       `
     })),

   ...executivePlan.active
     .map(item=>({
       date:
         item.targetDate ||
         item.requiredBy ||
         "",
       title:item.title||"",
       html:`
         <div class="item exec-summary-item exec-source-project"${executiveTaskClickableAttrs(item)}>
           <span class="dot"></span>
           <div class="exec-summary-content">
             <div class="exec-summary-title-line">
               <strong>${esc(item.title)}</strong>
               <span class="exec-source-tag">Project Plan</span>
             </div>
             <div class="small">
               ${esc(item.owner||"Unassigned")}
               ${
                 executiveTaskDate(item)
                   ? ` · ${fmtDate(executiveTaskDate(item))}`
                   : ""
               }
             </div>
           </div>
         </div>
       `
     }))
 ].sort(executiveSortUrgentFirst);

 currentWork.innerHTML=
   executivePanelHtml(
     "currentWork",
     currentWorkRows,
     "No active items."
   );


 // ==========================================================
 // REQUIRED FROM OTHERS
 // Oldest overdue / nearest required date first.
 // ==========================================================

 const requiredOtherRows=[
   ...infoRecords
     .filter(x=>
       x.status!=="Received" &&
       x.status!=="No Longer Needed"
     )
     .map(x=>({
       date:x.neededBy||"",
       title:x.item||"",
       html:`
         <div class="item exec-summary-item exec-source-info"${summaryClickableAttrs("Information Required",x.id)}>
           <span class="dot" style="background:var(--orange)"></span>
           <div class="exec-summary-content">
             <div class="exec-summary-title-line">
               <strong>${esc(x.item)}</strong>
               <span class="exec-source-tag">Info Required</span>
               ${
                 currentUser.canEdit
                   ? ` <button class="linkbtn agenda-edit" onclick="editInfo(${x.id})">Edit source</button>`
                   : ""
               }
             </div>
             <div class="small">
               ${esc(x.from)}
               ${x.blocking?` · blocks ${esc(x.blocking)}`:""}
               ${x.neededBy?` · needed ${fmtDate(x.neededBy)}`:""}
             </div>
           </div>
         </div>
       `
     })),

   ...executivePlan.waiting
     .map(item=>({
       date:
         item.requiredBy ||
         item.targetDate ||
         "",
       title:
         item.informationRequired ||
         item.title ||
         "",
       html:`
         <div class="item exec-summary-item exec-source-project"${executiveTaskClickableAttrs(item)}>
           <span class="dot" style="background:var(--orange)"></span>
           <div class="exec-summary-content">
             <div class="exec-summary-title-line">
               <strong>${esc(item.informationRequired||item.title)}</strong>
               <span class="exec-source-tag">Project Plan</span>
             </div>
             <div class="small">
               ${esc(item.waitingOn||item.owner||"Unassigned")}
               · ${esc(item.title)}
               ${
                 item.requiredBy
                   ? ` · needed ${fmtDate(item.requiredBy)}`
                   : item.targetDate
                     ? ` · ${fmtDate(item.targetDate)}`
                     : ""
               }
             </div>
           </div>
         </div>
       `
     }))
 ].sort(executiveSortUrgentFirst);

 requiredOthers.innerHTML=
   executivePanelHtml(
     "requiredOthers",
     requiredOtherRows,
     "Nothing outstanding."
   );


 // ==========================================================
 // NEXT DELIVERABLES
 // Pure chronological order.
 // ==========================================================

 const nextDeliverableRows=[
   ...ds
     .filter(x=>
       x.status==="In Progress" &&
       x.date
     )
     .map(x=>({
       date:x.date,
       title:x.deliverable||"",
       html:`
         <div class="item exec-summary-item exec-source-deliverable"${summaryClickableAttrs("Deliverable",x.id)}>
           <span class="dot" style="background:var(--green)"></span>
           <div class="exec-summary-content">
             <div class="exec-summary-title-line">
               <strong>${esc(x.deliverable)}</strong>
               <span class="exec-source-tag">Deliverable</span>
             </div>
             <div class="small">
               ${esc(x.nextStep)} · ${fmtDate(x.date)}
             </div>
           </div>
         </div>
       `
     })),

   ...executivePlan.upcoming
     .filter(item=>item.targetDate)
     .map(item=>({
       date:item.targetDate,
       title:item.title||"",
       html:`
         <div class="item exec-summary-item exec-source-project"${executiveTaskClickableAttrs(item)}>
           <span class="dot" style="background:var(--green)"></span>
           <div class="exec-summary-content">
             <div class="exec-summary-title-line">
               <strong>${esc(item.title)}</strong>
               <span class="exec-source-tag">Project Plan</span>
             </div>
             <div class="small">
               ${esc(executiveTaskPath(item))}
               · ${fmtDate(item.targetDate)}
             </div>
           </div>
         </div>
       `
     }))
 ].sort(executiveSortByDate);

 nextDeliverables.innerHTML=
   executivePanelHtml(
     "nextDeliverables",
     nextDeliverableRows,
     "No active deliverables or upcoming Tasks."
   );


 // ==========================================================
 // PROJECT RISKS
 // 1. blocked by overdue predecessor
 // 2. blocked by predecessor due today
 // 3. other dependency blockers
 // 4. entered Deliverable risks
 // ==========================================================

 const projectRiskRows=[
   ...ds
     .filter(x=>x.risk)
     .map(x=>({
       kind:"deliverable",
       date:x.date||"",
       title:x.deliverable||x.risk||"",
       html:`
         <div class="item exec-summary-item exec-source-deliverable"${summaryClickableAttrs("Deliverable",x.id)}>
           <span class="dot" style="background:var(--red)"></span>
           <div class="exec-summary-content">
             <div class="exec-summary-title-line">
               <strong>${esc(x.deliverable||"Deliverable Risk")}</strong>
               <span class="exec-source-tag">Deliverable</span>
             </div>
             <div class="small">
               ${esc(x.risk)}
               ${x.date?` · ${fmtDate(x.date)}`:""}
             </div>
           </div>
         </div>
       `
     })),

   ...executiveSite.milestoneRisks
     .map(record=>{
       const item=record.item;

       const conflictCount=
         record.conflicts.length;

       const affectedTasks=[
         ...new Set(
           record.conflicts
             .map(conflict=>
               conflict.item?.title ||
               conflict.predecessor?.title ||
               ""
             )
             .filter(Boolean)
         )
       ];

       return {
         kind:"dependency",
         date:
           item.date ||
           item.targetDate ||
           "",
         title:
           item.title ||
           item.deliverable ||
           "",
         html:`
           <div class="item exec-summary-item exec-source-site exec-milestone-risk"${executiveSiteClickableAttrs(item)}>
             <span class="dot" style="background:var(--red)"></span>

             <div class="exec-summary-content">
               <div class="exec-summary-title-line">
                 <strong>${esc(item.title||item.deliverable)}</strong>
                 <span class="exec-milestone-risk-badge">
                   Milestone at Risk
                 </span>
                 <span class="exec-source-tag">Site Operations</span>
               </div>

               <div class="small">
                 ${conflictCount}
                 upstream schedule conflict${conflictCount===1?"":"s"}
                 ${
                   affectedTasks.length
                     ? ` · ${esc(affectedTasks.join(", "))}`
                     : ""
                 }
                 ${
                   item.date
                     ? ` · milestone ${fmtDate(item.date)}`
                     : ""
                 }
               </div>
             </div>
           </div>
         `
       };
     }),

   ...executiveSite.blocked
     .filter(record=>{
       const item=record.item;

       if(
         String(item?.itemType||"")!=="Milestone"
       ){
         return true;
       }

       const milestoneRisk=
         executiveSite.milestoneRisks
           .some(risk=>
             String(risk.item?.id??"")===
             String(item?.id??"")
           );

       return !milestoneRisk;
     })
     .map(record=>{
       const item=record.item;

       const names=
         record.predecessors
           .map(predecessor=>
             predecessor.title ||
             predecessor.deliverable
           )
           .join(", ");

       const conflicts=
         Array.isArray(record.scheduleConflicts)
           ? record.scheduleConflicts
           : [];

       const hasScheduleConflict=
         conflicts.length>0;

       const riskDate=
         hasScheduleConflict
           ? (
               item.startDate ||
               item.date ||
               ""
             )
           : (
               item.date ||
               item.targetDate ||
               ""
             );

       const conflictDetail=
         conflicts
           .map(conflict=>
             `${conflict.predecessor.title||conflict.predecessor.deliverable} finishes ${fmtDate(conflict.predecessorFinish)}; ${item.title||item.deliverable} starts ${fmtDate(conflict.dependentStart)}`
           )
           .join(" · ");

       return {
         kind:"dependency",
         date:riskDate,
         title:
           item.title ||
           item.deliverable ||
           "",
         html:`
           <div class="item exec-summary-item exec-source-site"${executiveSiteClickableAttrs(item)}>
             <span class="dot" style="background:var(--red)"></span>

             <div class="exec-summary-content">
               <div class="exec-summary-title-line">
                 <strong>${esc(item.title||item.deliverable)}</strong>

                 ${
                   hasScheduleConflict
                     ? `<span class="exec-dependency-conflict-badge">Dependency Conflict</span>`
                     : `<span class="exec-blocked-label">blocked by ${record.predecessors.length} ${record.predecessors.length===1?"Task":"Tasks"}</span>`
                 }

                 <span class="exec-source-tag">Site Operations</span>
               </div>

               <div class="small">
                 ${
                   hasScheduleConflict
                     ? esc(conflictDetail)
                     : `
                         ${esc(names)}
                         ${
                           riskDate
                             ? ` · ${fmtDate(riskDate)}`
                             : ""
                         }
                       `
                 }
               </div>
             </div>
           </div>
         `
       };
     }),

   ...executivePlan.milestoneRisks
     .map(record=>{
       const item=
         record.item;

       const conflictCount=
         record.conflicts.length;

       const affectedTasks=
         [
           ...new Set(
             record.conflicts
               .map(conflict=>
                 conflict.item?.title ||
                 conflict.predecessor?.title ||
                 ""
               )
               .filter(Boolean)
           )
         ];

       return {
         kind:"dependency",
         date:
           item.targetDate ||
           item.requiredBy ||
           "",
         title:item.title||"",
         html:`
           <div class="item exec-summary-item exec-source-project exec-milestone-risk"${executiveTaskClickableAttrs(item)}>
             <span class="dot" style="background:var(--red)"></span>

             <div class="exec-summary-content">
               <div class="exec-summary-title-line">
                 <strong>${esc(item.title)}</strong>
                 <span class="exec-milestone-risk-badge">
                   Milestone at Risk
                 </span>
                 <span class="exec-source-tag">Project Plan</span>
               </div>

               <div class="small">
                 ${conflictCount}
                 upstream schedule conflict${conflictCount===1?"":"s"}
                 ${
                   affectedTasks.length
                     ? ` · ${esc(affectedTasks.join(", "))}`
                     : ""
                 }
                 ${
                   item.targetDate
                     ? ` · milestone ${fmtDate(item.targetDate)}`
                     : ""
                 }
               </div>
             </div>
           </div>
         `
       };
     }),

   ...executivePlan.blocked
     .filter(record=>{
       const item=record.item;

       if(
         String(item?.itemType||"")!=="Milestone"
       ){
         return true;
       }

       const milestoneRisk=
         executivePlan.milestoneRisks
           .some(risk=>
             String(risk.item?.id??"")===
             String(item?.id??"")
           );

       return !milestoneRisk;
     })
     .map(record=>{
       const item=record.item;

       const names=
         record.predecessors
           .map(predecessor=>predecessor.title)
           .join(", ");

       const conflicts=
         Array.isArray(record.scheduleConflicts)
           ? record.scheduleConflicts
           : [];

       const hasScheduleConflict=
         conflicts.length>0;

       const riskDate=
         hasScheduleConflict
           ? (
               item.startDate ||
               executiveBlockedRiskDate(record)
             )
           : executiveBlockedRiskDate(record);

       const conflictDetail=
         conflicts
           .map(conflict=>
             `${conflict.predecessor.title} finishes ${fmtDate(conflict.predecessorFinish)}; ${item.title} starts ${fmtDate(conflict.dependentStart)}`
           )
           .join(" · ");

       return {
         kind:"dependency",
         date:riskDate,
         title:item.title||"",
         html:`
           <div class="item exec-summary-item exec-source-project"${executiveTaskClickableAttrs(item)}>
             <span class="dot" style="background:var(--red)"></span>
             <div class="exec-summary-content">
               <div class="exec-summary-title-line">
                 <strong>${esc(item.title)}</strong>
                 ${
                   hasScheduleConflict
                     ? `<span class="exec-dependency-conflict-badge">Dependency Conflict</span>`
                     : `<span class="exec-blocked-label">blocked by ${record.predecessors.length} ${record.predecessors.length===1?"Task":"Tasks"}</span>`
                 }
                 <span class="exec-source-tag">Project Plan</span>
               </div>
               <div class="small">
                 ${
                   hasScheduleConflict
                     ? esc(conflictDetail)
                     : `
                         ${esc(names)}
                         ${
                           riskDate
                             ? ` · ${fmtDate(riskDate)}`
                             : ""
                         }
                       `
                 }
               </div>
             </div>
           </div>
         `
       };
     })
 ].sort(executiveSortRisks);

 projectRisks.innerHTML=
   executivePanelHtml(
     "projectRisks",
     projectRiskRows,
     "No current risks."
   );

 bindSummaryDrilldowns();  const q=searchDeliverables.value.toLowerCase(),fs=filterStatus.value,fd=filterDiscipline.value,
filtered=ds.filter(x=>{
  const normalMatch=
    (!q||JSON.stringify(x).toLowerCase().includes(q)) &&
    (!fs||x.status===fs) &&
    (!fd||x.discipline===fd);

  if(!normalMatch)return false;

  if(summaryDeliverableMode==="active")return x.status==="In Progress";
  if(summaryDeliverableMode==="waiting")return String(x.status||"").includes("Waiting")||x.status==="Awaiting Review";
  if(summaryDeliverableMode==="complete")return x.status==="Complete";

  return true;
});
 deliverablesBody.innerHTML=filtered.map(x=>`<tr class="project-control-clickable-row" onclick="openProjectControlDetail('Deliverable',${x.id})"><td>${esc(x.discipline)}</td><td><strong>${esc(x.deliverable)}</strong>${visBadge(x.visibility)}<div class="small">${esc(x.current)}</div></td><td>${badge(x.status)}</td><td>${healthBadge(x)}</td><td>${esc(x.owner)}</td><td>${esc(x.waitingOn)}</td><td>${esc(x.nextStep)}</td><td>${fmtDate(x.date)}</td><td><div class="record-actions" onclick="event.stopPropagation()">${commentControl(p,"Deliverable",x)}${currentUser.canEdit?`<button class="linkbtn" onclick="editDeliverable(${x.id})">Edit</button>`:""}</div></td></tr>`).join("");
 deliverableCards.innerHTML=filtered.map(x=>`<article class="project-control-card deliverable-summary-card" role="button" tabindex="0" onclick="openProjectControlDetail('Deliverable',${x.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openProjectControlDetail('Deliverable',${x.id});}"><div class="project-control-card-top"><div><div class="mobile-record-kicker">${esc(x.discipline)}</div><h3>${esc(x.deliverable)}</h3></div><div class="project-control-badges">${badge(x.status)}</div></div><div class="project-control-card-meta"><span><small>Owner</small><strong>${esc(x.owner)||"—"}</strong></span><span><small>Target</small><strong>${fmtDate(x.date)}</strong></span></div><div class="project-control-card-footer"><span class="project-control-card-comment-wrap">${commentControl(p,"Deliverable",x,{card:true})}</span><span class="project-control-view-details"><span>View details</span><span aria-hidden="true">›</span></span></div></article>`).join("")||'<div class="mobile-empty">No deliverables match the current filters.</div>';
 infoBody.innerHTML=infoRecords.map(x=>`<tr class="project-control-clickable-row" onclick="openProjectControlDetail('Information Required',${x.id})"><td><strong>${esc(x.item)}</strong>${visBadge(x.visibility)}</td><td>${esc(x.from)}</td><td>${badge(x.status)}</td><td>${esc(x.blocking)}</td><td>${esc(x.notes)}</td><td><div class="record-actions" onclick="event.stopPropagation()">${commentControl(p,"Information Required",x)}${currentUser.canEdit?`<button class="linkbtn" onclick="editInfo(${x.id})">Edit</button>`:""}</div></td></tr>`).join("");
 infoCards.innerHTML=infoRecords.map(x=>`<article class="project-control-card info-summary-card" role="button" tabindex="0" onclick="openProjectControlDetail('Information Required',${x.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openProjectControlDetail('Information Required',${x.id});}"><div class="project-control-card-top"><div><div class="mobile-record-kicker">Dependency</div><h3>${esc(x.item)}</h3></div><div class="project-control-badges">${badge(x.status)}</div></div><div class="project-control-card-meta"><span><small>Requested From</small><strong>${esc(x.from)||"—"}</strong></span><span><small>Needed By</small><strong>${fmtDate(x.neededBy)}</strong></span></div>${x.blocking?`<div class="project-control-card-block"><small>Blocking</small><span>${esc(x.blocking)}</span></div>`:""}<div class="project-control-card-footer"><span class="project-control-card-comment-wrap">${commentControl(p,"Information Required",x,{card:true})}</span><span class="project-control-view-details"><span>View details</span><span aria-hidden="true">›</span></span></div></article>`).join("")||'<div class="mobile-empty">No information requests for this project.</div>';
 applyProjectControlViewModes();
 const statuses=[...new Set(ds.map(x=>x.status))].sort(),disciplines=[...new Set(ds.map(x=>x.discipline))].sort(),oldS=filterStatus.value,oldD=filterDiscipline.value;filterStatus.innerHTML='<option value="">All statuses</option>'+statuses.map(s=>`<option>${esc(s)}</option>`).join("");filterStatus.value=oldS;filterDiscipline.innerHTML='<option value="">All disciplines</option>'+disciplines.map(s=>`<option>${esc(s)}</option>`).join("");filterDiscipline.value=oldD;
 updateScheduleModeButtons();
 if(!siteScheduleSnapshot.loaded&&!siteScheduleSnapshot.loading){
   ensureSiteSchedule(false).then(()=>render());
 }
 timelineTrack.innerHTML=renderGantt(scheduleRecordsForGantt(ds));
 requestAnimationFrame(bindGanttBottomScroll);
  const projectCalendarRecords=projectScheduleRecords(ds);
  const projectEvents=projectCalendarRecords
    .filter(record=>record.date)
    .map(record=>({
      date:record.date,
      title:record.deliverable,
      type:
        record.status==="Complete"
          ?"green"
          :String(record.status||"").includes("Waiting")||
           record.status==="Awaiting Review"
            ?"orange"
            :"",
      source:"projectPlan",
      sourceId:record.id,
      scheduleKind:"project",
      itemType:record.itemType||"Task",
      level:Number(record.level||0),
      path:Array.isArray(record.path)?record.path:[]
    }));
 const siteEvents=siteScheduleSnapshot.operations.flatMap(x=>{const dates=[];if(x.activityDate)dates.push({date:x.activityDate,title:x.title,type:x.status==="Complete"?"green":/risk|blocked/i.test(x.status||"")?"orange":"",source:"site",sourceId:x.id,scheduleKind:"site"});if(x.targetDate&&x.targetDate!==x.activityDate)dates.push({date:x.targetDate,title:x.title,type:x.status==="Complete"?"green":/risk|blocked/i.test(x.status||"")?"orange":"",source:"site",sourceId:x.id,scheduleKind:"site"});return dates;});
 const events=(
   calendarScheduleMode==="site"
     ?siteEvents
     :calendarScheduleMode==="combined"
       ?[...projectEvents,...siteEvents]
       :projectEvents
 ).sort((a,b)=>
   a.date.localeCompare(b.date) ||
   Number(a.level||0)-Number(b.level||0) ||
   String(a.title||"").localeCompare(String(b.title||""))
 );

 const grouped={};

 events.forEach(event=>{
   (grouped[event.date]??=[]).push(event);
 });

 
  /*
   * Calendar month grid:
   * - Always show top-level Tasks.
   * - Show Subtasks only while their Task is expanded in the Agenda.
   * - Agenda continues to receive the complete hierarchy.
   */
  const projectRecordById=new Map(
    projectCalendarRecords.map(record=>[
      String(record.id),
      record
    ])
  );

  const calendarVisibilityMemo=new Map();

  const projectRecordVisibleOnCalendar=record=>{
    const id=String(record?.id??"");

    if(calendarVisibilityMemo.has(id)){
      return calendarVisibilityMemo.get(id);
    }

    const parentId=String(
      record?.parentWorkItemId??""
    );

    if(!parentId){
      calendarVisibilityMemo.set(id,true);
      return true;
    }

    const parentRecord=projectRecordById.get(parentId);

    /*
     * Calendar Task / Subtask rule:
     *
     * - No dated higher Task:
     *     show this record as a normal Calendar Task.
     *
     * - Due BEFORE its dated higher Task:
     *     also show as a normal Calendar Task.
     *
     * - Due ON or AFTER its dated higher Task:
     *     treat it as a Subtask and show it only while that
     *     higher Task is expanded in the Agenda.
     */
    if(!parentRecord){
      calendarVisibilityMemo.set(id,true);
      return true;
    }

    const recordDate=String(record?.date||"");
    const parentDate=String(parentRecord?.date||"");

    if(
      recordDate &&
      parentDate &&
      recordDate < parentDate
    ){
      calendarVisibilityMemo.set(id,true);
      return true;
    }

    const visible=
      calendarExpandedAgendaTasks.has(parentId) &&
      projectRecordVisibleOnCalendar(parentRecord);

    calendarVisibilityMemo.set(id,visible);
    return visible;
  };

  const calendarGridEvents=events.filter(event=>{
    if(event.source!=="projectPlan")return true;

    const record=projectRecordById.get(
      String(event.sourceId)
    );

    return !record || projectRecordVisibleOnCalendar(record);
  });

  const calendarGridGrouped={};

  calendarGridEvents.forEach(event=>{
    (calendarGridGrouped[event.date]??=[]).push(event);
  });

agendaList.innerHTML=Object.entries(grouped)
   .map(([date,items])=>{
     const projectItems=items.filter(
       item=>item.source==="projectPlan"
     );

     const projectById=new Map(
       projectItems.map(item=>[
         String(item.sourceId),
         item
       ])
     );

     /*
      * Only treat a child as nested when its Higher-Level Task
      * is also present on this same agenda date.
      *
      * If the dates differ, the child remains visible on its
      * own actual scheduled date.
      */
     const sameDateChildren=new Map();

     projectItems.forEach(item=>{
       const scheduleRecord=
         projectCalendarRecords.find(
           record=>
             String(record.id)===
             String(item.sourceId)
         );

       const parentId=String(
         scheduleRecord?.parentWorkItemId??""
       );

       if(
         parentId &&
         projectById.has(parentId)
       ){
         if(!sameDateChildren.has(parentId)){
           sameDateChildren.set(parentId,[]);
         }

         sameDateChildren
           .get(parentId)
           .push(item);
       }
     });

     const nestedIds=new Set();

     sameDateChildren.forEach(children=>{
       children.forEach(child=>
         nestedIds.add(
           String(child.sourceId)
         )
       );
     });

     const rootItems=items.filter(item=>
       item.source!=="projectPlan" ||
       !nestedIds.has(String(item.sourceId))
     );

     const renderAgendaItem=(item,depth=0)=>{
       if(item.source==="projectPlan"){
         const safeId=ganttJsString(item.sourceId);
         const children=
           sameDateChildren.get(
             String(item.sourceId)
           )||[];

         const hasChildren=
           children.length>0;

         const expanded=
           hasChildren &&
           calendarExpandedAgendaTasks.has(
             String(item.sourceId)
           );

         const childLabel=
           hasChildren
             ? `<span class="calendar-agenda-child-count">
                  ${children.length} subtask${children.length===1?"":"s"}
                </span>`
             : "";

         let html=`
           <div
             class="agenda-pill ${item.type} calendar-project-event"
             style="--calendar-task-depth:${depth}"
             title="${esc((item.path||[]).join(" › "))}"
           >
             <span
               class="calendar-event-title ${hasChildren?"calendar-agenda-expandable":""}"
               ${
                 hasChildren
                   ? `role="button"
                      tabindex="0"
                      onclick="toggleCalendarAgendaTask('${encodeURIComponent(String(item.sourceId))}')"
                      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleCalendarAgendaTask('${encodeURIComponent(String(item.sourceId))}')}" `
                   : ""
               }
             >
               ${
                 hasChildren
                   ? `<span class="calendar-agenda-toggle">${expanded?"▼":"▶"}</span>`
                   : `<span class="calendar-agenda-toggle-spacer"></span>`
               }

               <span class="calendar-agenda-title-text">
                ${
                  String(item.itemType||"")==="Milestone"
                    ? `<span class="calendar-milestone-label">Milestone</span>`
                    : ""
                }
                ${
                  String(item.itemType||"")==="Milestone" &&
                  String(item.title||"").trim().toLowerCase()==="milestone"
                    ? ""
                    : esc(item.title)
                }
              </span>

               ${childLabel}
             </span>

             <button
               class="linkbtn agenda-edit"
               type="button"
               onclick="event.stopPropagation();openScheduleSource('projectPlan','${safeId}')"
             >
               View task
             </button>
           </div>
         `;

         if(expanded){
           html+=children
             .map(child=>
               renderAgendaItem(
                 child,
                 depth+1
               )
             )
             .join("");
         }

         return html;
       }

       return `
         <div class="agenda-pill ${item.type}">
           <span>${esc(item.title)}</span>

           ${
             item.source==="site"
               ? `<button
                    class="linkbtn agenda-edit"
                    type="button"
                    onclick="openScheduleSource('site',${item.sourceId})"
                  >View</button>`
               : ""
           }
         </div>
       `;
     };

     return `
       <div class="agenda-day">
         <div class="agenda-date">${fmtDate(date)}</div>

         <div class="agenda-items">
           ${rootItems
             .map(item=>
               renderAgendaItem(item,0)
             )
             .join("")}
         </div>
       </div>
     `;
   })
   .join("");
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
        ev=calendarGridGrouped[key]||[],
        dayExpanded=calendarExpandedDays.has(key),
        visibleEvents=dayExpanded?ev:ev.slice(0,2),
        hiddenCount=Math.max(0,ev.length-2),
        todayClass=
          day===now.getDate() &&
          calendarMonth===now.getMonth() &&
          calendarYear===now.getFullYear()
            ?" today":"";

  cells+=`<div class="day-cell${todayClass}">
    <div class="day-num">${day}</div>
    ${todayClass?`<div class="calendar-today-marker">Today</div>`:""}
    ${visibleEvents.map(e=>`<div class="event-dot ${e.type}" ${
      true
        ?`onclick="${
            e.source==="projectPlan"
              ? `openScheduleSource('projectPlan','${ganttJsString(e.sourceId)}')`
              : e.source==="deliverable"
                ? `openProjectControlDetail('Deliverable',${e.sourceId})`
                : e.source==="site"
                  ? `openScheduleSource('site',${e.sourceId})`
                  : `openProjectControlDetail('Information Required',${e.sourceId})`
          }" style="cursor:pointer" title="Open source record"`
        :""
    }>${
      e.source==="projectPlan" &&
      String(e.itemType||"")==="Milestone"
        ? "◆ "
        : ""
    }${esc(e.title)}</div>`).join("")}
    ${
      ev.length>2
        ? `<button
             type="button"
             class="calendar-more-btn"
             onclick="toggleCalendarDay('${key}')"
           >${
             dayExpanded
               ?"Show less"
               :`<span class="calendar-more-label">View more</span><span class="calendar-more-sep">·</span><span class="calendar-more-count">+${hiddenCount}</span>`
           }</button>`
        : ""
    }
  </div>`;
}

monthGrid.innerHTML=cells;
if(
  currentUser?.canManageProjects ||
  currentUser?.canManageInternalUsers ||
  currentUser?.canAssignProjectAccess ||
  currentUser?.canViewExternalUsers ||
  currentUser?.canManageExternalUsers ||
  currentUser?.canManageSystem ||
  currentUser?.canManageBackups
)renderAdmin();
 if(currentUser?.isSystemOwner){
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

 // Accept actual Date objects, plain YYYY-MM-DD values, and full
 // SharePoint / ISO timestamps without corrupting them.
 let date;

 if(value instanceof Date){
   date=new Date(value.getTime());
 }else{
   const text=String(value).trim();
   date=/^\d{4}-\d{2}-\d{2}$/.test(text)
     ? new Date(`${text}T12:00:00`)
     : new Date(text);
 }

 if(Number.isNaN(date.getTime()))return null;

 // Gantt is date-based rather than time-of-day based.
 // Normalize to local noon to avoid DST / midnight boundary issues.
 date.setHours(12,0,0,0);
 return date;
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

function ganttAxisLabel(iso,includeYear=false){
 const date=ganttDate(iso);
 if(!date)return "";
 const label=date.toLocaleDateString("en-US",{month:"short",day:"numeric"});
 return includeYear?`${label} '${String(date.getFullYear()).slice(-2)}`:label;
}
function ganttAddDays(date,days){const next=new Date(date);next.setDate(next.getDate()+days);return next}
function ganttMonday(date){
 const d=new Date(date);
 d.setHours(0,0,0,0);
 const day=d.getDay();
 d.setDate(d.getDate()+(day===0?-6:1-day));
 return d;
}
function ganttStartFor(record){
 const target=ganttDate(record.date);if(!target)return null;

 if(
   ["projectPlan","site"].includes(record.scheduleKind) &&
   String(record.itemType||"")==="Milestone"
 ){
   return target;
 }

 const explicit=ganttDate(record.startDate);if(explicit)return explicit;
 return ganttAddDays(target,record.status==="Complete"?-7:-14);
}
function ganttStatusClass(record){
 if(record.status==="Complete")return "complete";
 if(record.status==="Blocked")return "blocked";
 if(record.status.includes("Waiting")||record.status==="Awaiting Review")return "waiting";
 if(record.status==="In Progress")return "active";
 return "pending";
}

function ganttGroupStatusClass(items){
 const records=items.map(item=>item.record);
 if(records.some(record=>record.status==="Blocked"))return "blocked";
 if(records.some(record=>String(record.status||"").includes("Waiting")||record.status==="Awaiting Review"))return "waiting";
 if(records.some(record=>record.status==="In Progress"))return "active";
 if(records.length&&records.every(record=>record.status==="Complete"))return "complete";
 return "pending";
}
let ganttExpandedGroups=new Set();

/*
 * Separate expansion state for structured Task/Subtask hierarchy
 * inside Project Plan and Site Operations Gantt groups.
 *
 * Keys include the source so identical SharePoint item IDs from
 * different schedule sources cannot collide in Combined mode.
 */
let ganttExpandedProjectTasks=new Set();

function ganttHierarchyKey(record){
  return `${String(record?.scheduleKind||"projectPlan")}:${String(record?.id??"")}`;
}

function toggleGanttProjectTask(encodedKey){
  const key=decodeURIComponent(encodedKey);

  if(ganttExpandedProjectTasks.has(key)){
    ganttExpandedProjectTasks.delete(key);
  }else{
    ganttExpandedProjectTasks.add(key);
  }

  rememberGanttScrollAnchor();
  render();
}

window.toggleGanttProjectTask=toggleGanttProjectTask;

let ganttScrollAnchorDate="";

function resetGanttTimelineWindow(){
 ganttScrollAnchorDate="";
}

function rememberGanttScrollAnchor(){
 const shell=document.querySelector("#timelineTrack .gantt-shell");
 const scroller=shell?.querySelector(".gantt-scroll");
 if(!shell||!scroller)return;

 const rangeStart=ganttDate(shell.dataset.rangeStart);
 const rangeEnd=ganttDate(shell.dataset.rangeEnd);
 if(!rangeStart||!rangeEnd)return;

 const leftColumn=window.innerWidth<=900?240:300;
 const chartWidth=Math.max(1,scroller.scrollWidth-leftColumn);
 const totalDays=Math.max(1,(rangeEnd-rangeStart)/86400000);
 const dayOffset=(scroller.scrollLeft/chartWidth)*totalDays;
 ganttScrollAnchorDate=ganttIso(ganttAddDays(rangeStart,dayOffset));
}

function resetGanttGroups(){
 ganttExpandedGroups.clear();
}

function toggleGanttGroup(encodedDiscipline){
 rememberGanttScrollAnchor();
 const discipline=decodeURIComponent(encodedDiscipline);
 if(ganttExpandedGroups.has(discipline)){
   ganttExpandedGroups.delete(discipline);
 }else{
   ganttExpandedGroups.add(discipline);
 }
 render();
}

function expandAllGanttGroups(){
 rememberGanttScrollAnchor();
 document.querySelectorAll(".gantt-group-header[data-group], .gantt-group-summary[data-group]").forEach(header=>{
   ganttExpandedGroups.add(decodeURIComponent(header.dataset.group));
 });
 render();
}

function collapseAllGanttGroups(){
 rememberGanttScrollAnchor();
 ganttExpandedGroups.clear();
 render();
}

window.expandAllGanttGroups=expandAllGanttGroups;
window.collapseAllGanttGroups=collapseAllGanttGroups;


function ganttJsString(value){
 return String(value??"")
   .replaceAll("\\","\\\\")
   .replaceAll("'","\\'");
}

function renderGantt(records){
 const scheduled=records
   .map(record=>({record,start:ganttStartFor(record),end:ganttDate(record.date)}))
   .filter(item=>item.start&&item.end);
 const unscheduled=records.filter(record=>!ganttDate(record.date));

 const ganttRecordKey=(record,id=record?.id)=>
   `${String(record?.scheduleKind||"project")}:${String(id??"")}`;

 const ganttRecordById=new Map(
   scheduled
     .filter(item=>item.record?.id!=null)
     .map(item=>[
       ganttRecordKey(item.record),
       item
     ])
 );

 const ganttPredecessorIds=record=>
   [
     ...new Set(
       (
         (
           Array.isArray(record?.predecessorIds) &&
           record.predecessorIds.length
         )
           ? record.predecessorIds
           : record?.predecessorId
             ? [record.predecessorId]
             : []
       )
         .map(id=>String(id))
         .filter(Boolean)
     )
   ];

 const ganttEntryComplete=entry=>
   String(entry?.record?.status||"")==="Complete" ||
   Number(entry?.record?.calculatedProgress||0)>=100;

 /*
  * A hard schedule conflict requires an explicit dependent
  * Start Date. Inferred Gantt starts are intentionally ignored.
  */
 const ganttScheduleConflicts=record=>{
   if(
     !["projectPlan","site"].includes(record?.scheduleKind) ||
     !record?.startDate
   ){
     return [];
   }

   const dependentStart=
     ganttDate(record.startDate);

   if(!dependentStart){
     return [];
   }

   return ganttPredecessorIds(record)
     .map(id=>
       ganttRecordById.get(
         ganttRecordKey(record,id)
       )
     )
     .filter(Boolean)
     .filter(entry=>!ganttEntryComplete(entry))
     .map(entry=>{
       const predecessorFinish=
         ganttDate(entry.record.date);

       if(
         !predecessorFinish ||
         predecessorFinish<=dependentStart
       ){
         return null;
       }

       return {
         entry,
         days:
           Math.ceil(
             (
               predecessorFinish.getTime() -
               dependentStart.getTime()
             ) /
             86400000
           )
       };
     })
     .filter(Boolean);
 };

 /*
  * Walk predecessor chains so Milestones can report how many
  * upstream tasks contain actual date conflicts.
  */
 const ganttUpstreamConflictIds=record=>{
   const conflicts=new Set();
   const visited=new Set();

   const walk=current=>{
     const currentId=
       String(current?.id??"");

     if(
       !currentId ||
       visited.has(currentId)
     ){
       return;
     }

     visited.add(currentId);

     ganttScheduleConflicts(current)
       .forEach(conflict=>
         conflicts.add(
           String(conflict.entry.record.id)
         )
       );

     ganttPredecessorIds(current)
       .forEach(id=>{
         const predecessor=
           ganttRecordById.get(
             ganttRecordKey(current,id)
           )?.record;

         if(predecessor){
           walk(predecessor);
         }
       });
   };

   walk(record);

   return conflicts;
 };

 if(!scheduled.length){
   return `<div class="gantt-empty">No Project Plan tasks currently have schedule dates.${currentUser.canEdit?" Add Start and Target dates in Project Plan to build the schedule.":""}</div>`;
 }

 const earliest=new Date(Math.min(...scheduled.map(item=>item.start)));
 const latest=new Date(Math.max(...scheduled.map(item=>item.end)));
 const today=ganttDate(new Date());
 const currentWeekStart=ganttMonday(today);

 const projectCreated=ganttDate(currentProject()?.createdAt);

 // Gantt calendar weeks always run Monday through Sunday.
 // Anchor the entire timeline to the Monday of the first visible week
 // so weekly headers and grid columns follow normal project workweeks.
 const rangeStart=ganttMonday(projectCreated || earliest);

 // Fixed interactive range:
 // left edge = Project record creation date
 // right edge = one display week beyond latest actual scheduled due date.
 // The extra week is visual padding only; it does not alter any task due date.
 // It ensures the final partial week receives a full header/grid column.
 const latestScheduledEnd=new Date(Math.max(latest,rangeStart));

 // Extend the visible Gantt through one complete calendar week
 // after the week containing the latest scheduled due date.
 // Task bars still end on their actual Target Dates.
 const latestWeekStart=ganttMonday(latestScheduledEnd);
 const rangeEnd=ganttAddDays(latestWeekStart,13);

 const totalDays=Math.max(1,Math.ceil((rangeEnd-rangeStart)/86400000));
 const weekGridWidth=(7/totalDays)*100;
 const weekCount=Math.max(1,Math.ceil(totalDays/7));

 // Do not squeeze long projects. A typical desktop shows roughly 5–7 weeks,
 // with the rest available through the bottom scrollbar.
 const ganttChartMinWidth=Math.max(960,weekCount*185);

 const todayOffset=((today-rangeStart)/86400000/totalDays)*100;
 const requestedInitialDate=
   ganttScrollAnchorDate
     ? ganttDate(ganttScrollAnchorDate)
     : ganttAddDays(today,-7);
 const initialDate=requestedInitialDate
   ? new Date(Math.max(rangeStart,Math.min(requestedInitialDate,rangeEnd)))
   : rangeStart;
 const initialScrollDays=Math.max(0,(initialDate-rangeStart)/86400000);
 const initialScrollRatio=Math.max(0,Math.min(1,initialScrollDays/totalDays));

 const weeks=[];
 let previousYear=null;
 for(let cursor=new Date(rangeStart);cursor<=rangeEnd;cursor=ganttAddDays(cursor,7)){
   const offset=((cursor-rangeStart)/86400000/totalDays)*100;
   const year=cursor.getFullYear();
   const showYear=previousYear===null||year!==previousYear;
   weeks.push(`<span class="gantt-week-label" data-week-date="${ganttIso(cursor)}" style="left:${offset}%;width:${weekGridWidth}%">${ganttAxisLabel(ganttIso(cursor),showYear)}</span>`);
   previousYear=year;
 }

 const disciplineOrder=[];
 const grouped=new Map();
 scheduled.forEach(item=>{
   const baseDiscipline=(item.record.discipline||"Other").trim()||"Other";
   const discipline=ganttScheduleMode==="combined"?`${item.record.scheduleKind==="site"?"SITE":"PROJECT"} · ${baseDiscipline}`:baseDiscipline;
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
   const collapsed=!ganttExpandedGroups.has(discipline);
   const encoded=encodeURIComponent(discipline);

   const renderScheduleRow=(entry,depth=0)=>{
     let {record,start,end}=entry;

     if(start>end){
       const swap=start;
       start=end;
       end=swap;
     }

     const visibleStart=new Date(Math.max(start,rangeStart));
     const visibleEnd=new Date(Math.min(end,rangeEnd));

     const left=Math.max(0,Math.min(100,
       ((visibleStart-rangeStart)/86400000/totalDays)*100
     ));

     const right=Math.max(left,Math.min(100,
       (((visibleEnd-rangeStart)/86400000+1)/totalDays)*100
     ));

     const width=Math.max(1.5,Math.min(100-left,right-left));
     const inferred=!ganttDate(record.startDate);

     const kind=record.scheduleKind||"project";
     const safeKind=ganttJsString(kind);
     const safeId=ganttJsString(record.id);

     const isProjectPlan=kind==="projectPlan";
     const isSite=kind==="site";
     const hasStructuredDependencies=
       isProjectPlan || isSite;

     const predecessorIds=
       hasStructuredDependencies
         ? ganttPredecessorIds(record)
         : [];

     const predecessorEntries=
       predecessorIds
         .map(id=>
           ganttRecordById.get(
             ganttRecordKey(record,id)
           )
         )
         .filter(Boolean);

     const predecessorComplete=entry=>
       String(entry?.record?.status||"")==="Complete" ||
       Number(entry?.record?.calculatedProgress||0)>=100;

     const incompletePredecessors=
       predecessorEntries.filter(
         entry=>!predecessorComplete(entry)
       );

     const hasIncompletePredecessor=
       incompletePredecessors.length>0;

     const scheduleConflicts=
       hasStructuredDependencies
         ? ganttScheduleConflicts(record)
         : [];

     const hasScheduleConflict=
       scheduleConflicts.length>0;

     const upstreamConflictCount=
       hasStructuredDependencies &&
       String(record.itemType||"")==="Milestone"
         ? ganttUpstreamConflictIds(record).size
         : 0;

     const predecessorLabelEntries=
       hasIncompletePredecessor
         ? incompletePredecessors
         : predecessorEntries;

     const dependencyTitle=
       predecessorLabelEntries.length
         ? `${hasIncompletePredecessor?"Blocked by":"Predecessor"}: ${
             predecessorLabelEntries
               .map(entry=>entry.record.deliverable)
               .join(", ")
           }`
         : "";

    const isMilestone=
      hasStructuredDependencies &&
      String(record.itemType||"")==="Milestone";
     const hierarchyParentField=
       isSite
         ? "parentOperationId"
         : "parentWorkItemId";

     const hasHierarchyChildren=Boolean(
       hasStructuredDependencies &&
       items.some(
         candidate =>
           String(candidate.record?.[hierarchyParentField]??"")===
           String(record.id??"")
       )
     );

     const hierarchyKey=
       ganttHierarchyKey(record);

     const taskExpanded=
       hasHierarchyChildren &&
       ganttExpandedProjectTasks.has(hierarchyKey);

     const childCount=
       hasStructuredDependencies
         ? items.filter(
             candidate =>
               String(candidate.record?.[hierarchyParentField]??"")===
               String(record.id??"")
           ).length
         : 0;

     const hierarchyToggle=
       hasHierarchyChildren
         ? `<button
              class="gantt-task-toggle"
              type="button"
              aria-label="${taskExpanded?"Collapse":"Expand"} ${esc(record.deliverable)}"
              aria-expanded="${taskExpanded?"true":"false"}"
              onclick="event.stopPropagation();toggleGanttProjectTask('${encodeURIComponent(hierarchyKey)}')"
            >${taskExpanded?"▼":"▶"}</button>`
         : `<span class="gantt-task-toggle-spacer"></span>`;

     const hierarchyLabelAction=
       hasHierarchyChildren
         ? `toggleGanttProjectTask('${encodeURIComponent(hierarchyKey)}')`
         : `openScheduleSource('${safeKind}','${safeId}')`;

     return `<div class="gantt-row ${isProjectPlan?"gantt-project-plan-row":""} ${isSite?"gantt-site-row":""}">
       <div
         class="gantt-label"
         style="${hasStructuredDependencies?`--gantt-task-depth:${depth}`:""}"
         onclick="${hasStructuredDependencies?hierarchyLabelAction:`openScheduleSource('${safeKind}','${safeId}')`}"
       >
         <span class="gantt-task-label-main">
           ${hasStructuredDependencies?hierarchyToggle:""}
           <strong title="${esc(record.deliverable)}">${esc(record.deliverable)}</strong>
           ${
             hasHierarchyChildren
               ? `<span class="gantt-task-child-count">${childCount} subtask${childCount===1?"":"s"}</span>`
               : ""
           }
         </span>

         ${
           predecessorLabelEntries.length
             ? `<div class="gantt-dependency-meta ${hasIncompletePredecessor?"blocked":""}">
                  <span class="gantt-dependency-caption">
                    ${hasIncompletePredecessor?"Blocked by":"Predecessor"}:
                  </span>

                  <span class="gantt-dependency-links">
                    ${
                      predecessorLabelEntries
                        .map(entry=>{
                          const predecessorKind=
                            ganttJsString(
                              entry.record.scheduleKind||
                              "projectPlan"
                            );

                          const predecessorId=
                            ganttJsString(
                              entry.record.id
                            );

                          return `<button
                            type="button"
                            class="gantt-dependency-link"
                            onclick="event.stopPropagation();openScheduleSource('${predecessorKind}','${predecessorId}')"
                            title="Open ${esc(entry.record.deliverable)}"
                          >${esc(entry.record.deliverable)}</button>`;
                        })
                        .join('<span class="gantt-dependency-separator">·</span>')
                    }
                  </span>
                </div>`
             : ""
         }

         ${
           hasScheduleConflict
             ? `<div class="gantt-schedule-conflict">
                  <strong>Dependency Conflict</strong>
                  <span>
                    ${
                      scheduleConflicts
                        .map(conflict=>
                          `${esc(conflict.entry.record.deliverable)} finishes ${fmtDate(conflict.entry.record.date)}, ${conflict.days} day${conflict.days===1?"":"s"} after this task starts`
                        )
                        .join(" · ")
                    }
                  </span>
                </div>`
             : ""
         }

         ${
           upstreamConflictCount
             ? `<div class="gantt-milestone-risk">
                  ${upstreamConflictCount} upstream schedule conflict${upstreamConflictCount===1?"":"s"}
                </div>`
             : ""
         }

         <span>${badge(record.status)}</span>
       </div>

       <div class="gantt-lane ${hasIncompletePredecessor?"gantt-lane-dependency-blocked":""} ${hasScheduleConflict?"gantt-lane-schedule-conflict":""}" style="--gantt-week:${weekGridWidth}%">
         ${todayOffset>=0&&todayOffset<=100?`<i class="gantt-today" style="left:${todayOffset}%" title="Today"></i>`:""}

         ${
           predecessorEntries.length
             ? `<i
                  class="gantt-dependency-anchor ${hasIncompletePredecessor?"blocked":""}"
                  style="left:${left}%"
                  title="${esc(dependencyTitle)}"
                ></i>`
             : ""
         }

         <button
           class="${isMilestone?"gantt-milestone":"gantt-bar"} ${ganttStatusClass(record)} ${hasIncompletePredecessor?"gantt-has-incomplete-predecessor":""} ${hasScheduleConflict?"gantt-has-schedule-conflict":""}"
           style="left:${left}%;width:${isMilestone?0:width}%"
           onclick="openScheduleSource('${safeKind}','${safeId}')"
           title="${esc(record.deliverable)}: ${fmtDate(ganttIso(start))} – ${fmtDate(ganttIso(end))}${inferred?" (start estimated)":""}${dependencyTitle?` | ${esc(dependencyTitle)}`:""}"
         >
           ${width>=9?`<span>${ganttShort(ganttIso(start))} → ${ganttShort(record.date)}</span>`:""}
         </button>
       </div>
     </div>`;
   };

   let rows="";

   if(!collapsed){
     const structuredGroup=
       items.length>0 &&
       (
         items.every(
           item => item.record.scheduleKind==="projectPlan"
         ) ||
         items.every(
           item => item.record.scheduleKind==="site"
         )
       );

     if(structuredGroup){
       const scheduleKind=
         items[0].record.scheduleKind;

       const parentField=
         scheduleKind==="site"
           ? "parentOperationId"
           : "parentWorkItemId";

       const byId=new Map(
         items.map(item=>[
           String(item.record.id),
           item
         ])
       );

       const childrenByParent=new Map();

       items.forEach(item=>{
         const parentId=
           String(
             item.record?.[parentField]??""
           );

         if(
           parentId &&
           byId.has(parentId)
         ){
           if(!childrenByParent.has(parentId)){
             childrenByParent.set(parentId,[]);
           }

           childrenByParent
             .get(parentId)
             .push(item);
         }
       });

       const sortHierarchy=(a,b)=>
         Number(a.record.sortOrder||0)-
         Number(b.record.sortOrder||0) ||
         a.start-b.start ||
         a.end-b.end ||
         String(a.record.deliverable||"")
           .localeCompare(
             String(b.record.deliverable||"")
           );

       const roots=items
         .filter(item=>{
           const parentId=
             String(
               item.record?.[parentField]??""
             );

           return !parentId || !byId.has(parentId);
         })
         .sort(sortHierarchy);

       const renderBranch=(entry,depth=0)=>{
         const hierarchyKey=
           ganttHierarchyKey(entry.record);

         const id=
           String(entry.record.id);

         let html=
           renderScheduleRow(
             entry,
             depth
           );

         if(
           ganttExpandedProjectTasks.has(hierarchyKey)
         ){
           const children=
             (childrenByParent.get(id)||[])
               .slice()
               .sort(sortHierarchy);

           html+=children
             .map(child=>
               renderBranch(
                 child,
                 depth+1
               )
             )
             .join("");
         }

         return html;
       };

       rows=roots
         .map(root=>
           renderBranch(
             root,
             0
           )
         )
         .join("");
     }else{
       rows=items
         .map(item=>renderScheduleRow(item,0))
         .join("");
     }
   }

   const groupStart=new Date(Math.min(...items.map(item=>item.start)));
   const groupEnd=new Date(Math.max(...items.map(item=>item.end)));
   // Clamp collapsed group summaries to the visible Gantt date range.
   // Some inferred task starts can precede rangeStart, which previously
   // allowed summary bars to exceed 100% and create a large white scroll tail.
   const visibleGroupStart=new Date(Math.max(groupStart,rangeStart));
   const visibleGroupEnd=new Date(Math.min(groupEnd,rangeEnd));
   const groupLeft=Math.max(0,Math.min(100,
     ((visibleGroupStart-rangeStart)/86400000/totalDays)*100
   ));
   const groupRight=Math.max(groupLeft,Math.min(100,
     (((visibleGroupEnd-rangeStart)/86400000+1)/totalDays)*100
   ));
   const groupWidth=Math.max(1.5,Math.min(100-groupLeft,groupRight-groupLeft));
   const groupStatus=ganttGroupStatusClass(items);

   if(collapsed){
     return `<section class="gantt-group">
       <button class="gantt-group-summary" type="button" data-group="${encoded}"
         onclick="toggleGanttGroup('${encoded}')" aria-expanded="false"
         title="${esc(discipline)}: ${fmtDate(ganttIso(groupStart))} – ${fmtDate(ganttIso(groupEnd))}">
         <span class="gantt-group-summary-label">
           <span class="gantt-group-arrow">▶</span>
           <strong>${esc(discipline)}</strong>
           <span class="gantt-group-count">${items.length}</span>
         </span>
         <span class="gantt-group-summary-lane" style="--gantt-week:${weekGridWidth}%">
           ${todayOffset>=0&&todayOffset<=100?`<i class="gantt-today" style="left:${todayOffset}%" title="Today"></i>`:""}
           <i class="gantt-group-summary-bar ${groupStatus}" style="left:${groupLeft}%;width:${groupWidth}%"></i>
         </span>
       </button>
     </section>`;
   }

   return `<section class="gantt-group">
     <button class="gantt-group-header" type="button" data-group="${encoded}" onclick="toggleGanttGroup('${encoded}')" aria-expanded="true">
       <span class="gantt-group-arrow">▼</span>
       <strong>${esc(discipline)}</strong>
       <span class="gantt-group-count">${items.length}</span>
     </button>
     ${rows}
   </section>`;
 }).join("");

 return `<div class="gantt-shell"
   style="--gantt-chart-min:${ganttChartMinWidth}px"
   data-initial-scroll-ratio="${initialScrollRatio}"
   data-range-start="${ganttIso(rangeStart)}"
   data-range-end="${ganttIso(rangeEnd)}"
   data-current-week="${ganttIso(currentWeekStart)}">
   <div class="gantt-legend">
     <span><i class="active"></i>In progress</span>
     <span><i class="waiting"></i>Waiting</span>
     <span><i class="blocked"></i>Blocked</span>
     <span><i class="complete"></i>Complete</span>
     <span class="gantt-group-controls">
       <button class="linkbtn" type="button" onclick="expandAllGanttGroups()">Expand All</button>
       <span aria-hidden="true">·</span>
       <button class="linkbtn" type="button" onclick="collapseAllGanttGroups()">Collapse All</button>
     </span>
     <span class="gantt-note">Missing start dates use a temporary 14-day estimate until manually entered.</span>
   </div>
   <div class="gantt-scroll">
     <div class="gantt-head">
       <div>Task</div>
       <div class="gantt-scale" style="--gantt-week:${weekGridWidth}%">
         ${weeks.join("")}
         ${todayOffset>=0&&todayOffset<=100?`<i class="gantt-today head" style="left:${todayOffset}%"></i>`:""}
       </div>
     </div>
     ${groupedRows}
   </div>
   <div class="gantt-bottom-scroll" aria-label="Scroll Gantt timeline left or right">
     <div class="gantt-bottom-scroll-track">
       <div class="gantt-bottom-scroll-thumb"></div>
     </div>
   </div>
   ${unscheduled.length?`<div class="gantt-unscheduled"><strong>Unscheduled:</strong> ${unscheduled.map(record=>esc(record.deliverable)).join(", ")}</div>`:""}
 </div>`;
}

function positionGanttAtDate(targetDate){
 const shell=document.querySelector("#timelineTrack .gantt-shell");
 const scroller=shell?.querySelector(".gantt-scroll");
 if(!shell||!scroller)return false;

 const rangeStart=ganttDate(shell.dataset.rangeStart);
 const rangeEnd=ganttDate(shell.dataset.rangeEnd);
 const target=ganttDate(targetDate);
 if(!rangeStart||!rangeEnd||!target)return false;

 const leftColumn=window.innerWidth<=900?240:300;
 const chartWidth=Math.max(1,scroller.scrollWidth-leftColumn);
 const viewportChartWidth=Math.max(0,scroller.clientWidth-leftColumn);
 const scrollableChartWidth=Math.max(0,chartWidth-viewportChartWidth);
 const totalDays=Math.max(1,(rangeEnd-rangeStart)/86400000);

 const clamped=new Date(
   Math.max(rangeStart.getTime(),Math.min(target.getTime(),rangeEnd.getTime()))
 );
 const dayOffset=Math.max(0,(clamped-rangeStart)/86400000);
 const ratio=Math.max(0,Math.min(1,dayOffset/totalDays));

 /*
  * Position the requested date at the left edge of the visible
  * timeline area. Use the full chart width for date geometry,
  * then clamp to the actual scrollable range.
  *
  * With the default target set to Today - 7 days, this leaves
  * about one week of context before the Today marker.
  */
 const desired=ratio*chartWidth;

 scroller.scrollLeft=Math.max(
   0,
   Math.min(
     scrollableChartWidth,
     desired
   )
 );
 scroller.dispatchEvent(new Event("scroll"));
 return true;
}

function positionGanttAtCurrentWeek(){
 const today=ganttDate(new Date());
 if(!today)return false;
 return positionGanttAtDate(ganttMonday(today));
}

window.positionGanttAtCurrentWeek=positionGanttAtCurrentWeek;

function bindGanttBottomScroll(){
 const shell=document.querySelector("#timelineTrack .gantt-shell");
 const scroller=shell?.querySelector(".gantt-scroll");
 const track=shell?.querySelector(".gantt-bottom-scroll-track");
 const thumb=shell?.querySelector(".gantt-bottom-scroll-thumb");
 if(!shell||!scroller||!track||!thumb)return;

 const leftColumn=window.innerWidth<=900?240:300;
 let extending=false;

 const metrics=()=>{
   const maxScroll=Math.max(0,scroller.scrollWidth-scroller.clientWidth);
   const trackWidth=Math.max(1,track.clientWidth);
   const visibleRatio=scroller.scrollWidth?Math.min(1,scroller.clientWidth/scroller.scrollWidth):1;
   const thumbWidth=Math.max(72,Math.round(trackWidth*visibleRatio));
   const maxThumb=Math.max(0,trackWidth-thumbWidth);
   return {maxScroll,trackWidth,thumbWidth,maxThumb};
 };

 const visibleLeftDate=()=>{
   const rangeStart=ganttDate(shell.dataset.rangeStart);
   const rangeEnd=ganttDate(shell.dataset.rangeEnd);
   if(!rangeStart||!rangeEnd)return null;

   const chartWidth=Math.max(1,scroller.scrollWidth-leftColumn);
   const viewportChartWidth=Math.max(0,scroller.clientWidth-leftColumn);
   const scrollableChartWidth=Math.max(1,chartWidth-viewportChartWidth);
   const totalDays=Math.max(1,(rangeEnd-rangeStart)/86400000);

   const ratio=Math.max(0,Math.min(1,scroller.scrollLeft/scrollableChartWidth));
   const dayOffset=ratio*totalDays;
   return ganttAddDays(rangeStart,dayOffset);
 };

 const sync=()=>{
   const {maxScroll,thumbWidth,maxThumb}=metrics();
   const left=maxScroll?Math.round((scroller.scrollLeft/maxScroll)*maxThumb):0;
   thumb.style.width=`${thumbWidth}px`;
   thumb.style.transform=`translateX(${left}px)`;
   track.classList.toggle("disabled",maxScroll<=0);
 };


 let dragging=false;
 let pointerStart=0;
 let scrollStart=0;

 const move=event=>{
   if(!dragging)return;
   const {maxScroll,maxThumb}=metrics();
   const delta=event.clientX-pointerStart;
   scroller.scrollLeft=scrollStart+(delta/Math.max(1,maxThumb))*maxScroll;
 };

 const stop=()=>{
   dragging=false;
   document.removeEventListener("pointermove",move);
   document.removeEventListener("pointerup",stop);
 };

 thumb.addEventListener("pointerdown",event=>{
   dragging=true;
   pointerStart=event.clientX;
   scrollStart=scroller.scrollLeft;
   document.addEventListener("pointermove",move);
   document.addEventListener("pointerup",stop);
   event.preventDefault();
 });

 track.addEventListener("pointerdown",event=>{
   if(event.target===thumb||track.classList.contains("disabled"))return;
   const rect=track.getBoundingClientRect();
   const {maxScroll}=metrics();
   const ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width)));
   scroller.scrollLeft=Math.round(maxScroll*ratio);
   requestAnimationFrame(sync);
 });

 scroller.addEventListener("scroll",()=>{
   sync();
 },{passive:true});

 requestAnimationFrame(()=>{
   requestAnimationFrame(()=>{
     const today=ganttDate(new Date());

     const requested=ganttScrollAnchorDate
       ? ganttDate(ganttScrollAnchorDate)
       : ganttAddDays(today,-7);

     if(!positionGanttAtDate(requested)){
       const ratio=Number(shell.dataset.initialScrollRatio||0);
       const chartWidth=Math.max(0,scroller.scrollWidth-leftColumn);
       const {maxScroll}=metrics();
       scroller.scrollLeft=Math.min(maxScroll,Math.max(0,ratio*chartWidth));
       sync();
     }else{
       sync();
     }

     const anchor=visibleLeftDate();
     if(anchor)ganttScrollAnchorDate=ganttIso(anchor);
   });
 });
}

function effectiveManagementDivisions(user=currentUser){
 const divisions=[];

 const add=value=>{
   const clean=String(value||"").trim();
   if(!clean)return;

   if(
     !divisions.some(
       item=>item.toLowerCase()===clean.toLowerCase()
     )
   ){
     divisions.push(clean);
   }
 };

 // AHT Employee List remains authoritative for Home Division.
 // External role-testing users intentionally have no Home Division.
 if(user?.isInternal!==false){
   add(user?.division);
 }

 (user?.managementDivisions||[])
   .forEach(add);

 return divisions;
}

function managementDivisionKeys(user=currentUser){
 return new Set(
   effectiveManagementDivisions(user)
     .map(value=>value.toLowerCase())
 );
}

function renderAdmin(){
 const canOpenAdministration=
   Boolean(
     currentUser?.canManageProjects ||
     currentUser?.canManageInternalUsers ||
     currentUser?.canAssignProjectAccess ||
     currentUser?.canViewExternalUsers ||
     currentUser?.canManageExternalUsers ||
     currentUser?.canManageSystem ||
     currentUser?.canManageBackups
   );

 if(!canOpenAdministration)return;

 const hasOrganizationWideAdminScope =
   Boolean(
     currentUser?.canAdmin ||
     currentUser?.isSystemOwner ||
     currentUser?.projects?.includes("*")
   );

 const operatorManagementDivisions =
   effectiveManagementDivisions(currentUser);

 const operatorManagementDivisionKeys =
   new Set(
     operatorManagementDivisions.map(
       value=>value.toLowerCase()
     )
   );

 const useExplicitProjectManagementScope =
   !operatorManagementDivisionKeys.size;

 const managementProjectIds =
   hasOrganizationWideAdminScope
     ? new Set(
         state.projects.map(project=>project.id)
       )
     : useExplicitProjectManagementScope
       ? new Set(
           (currentUser?.projects||[])
             .filter(projectId=>projectId!=="*")
         )
       : new Set(
           state.projects
             .filter(project=>
               operatorManagementDivisionKeys.has(
                 String(project.division||"")
                   .trim()
                   .toLowerCase()
               )
             )
             .map(project=>project.id)
         );

 const manageableProjects =
   state.projects.filter(project=>
     managementProjectIds.has(project.id)
   );

 const addAhtProjectSearch=
   document.getElementById("addAhtProjectSearch");

 const addAhtProjectCount=
   document.getElementById("addAhtProjectCount");

 const adminProjectSearch=
   document.getElementById("adminProjectSearch");

 const adminProjectCount=
   document.getElementById("adminProjectCount");

 const adminUserSearch=
   document.getElementById("adminUserSearch");

 const addProjectFilterText=
   String(addAhtProjectSearch?.value||"")
     .trim()
     .toLowerCase();

 const manageProjectFilterText=
   String(adminProjectSearch?.value||"")
     .trim()
     .toLowerCase();

 const userFilterText=
   String(adminUserSearch?.value||"")
     .trim()
     .toLowerCase();

 const addAhtUserCard=
   document.getElementById("addAhtUserCard");

 const addAhtUserProjects=
   document.getElementById("addAhtUserProjects");

 const addAhtUserRole=
   document.getElementById("addAhtUserRole");

 const addAhtUserEmployee=
   document.getElementById("addAhtUserEmployee");

 if(addAhtUserCard){
   addAhtUserCard.classList.toggle(
     "hidden",
     !currentUser?.canManageInternalUsers
   );
 }

 if(addAhtUserRole){
   const operatorCanAssignAdmin=
     Boolean(
       currentUser?.canAdmin ||
       currentUser?.isSystemOwner
     );

   addAhtUserRole.innerHTML=
     operatorCanAssignAdmin
       ? '<option>Editor</option>'+
         '<option>Viewer</option>'+
         '<option>Project Admin</option>'+
         '<option>Admin</option>'
       : '<option>Editor</option>'+
         '<option>Viewer</option>'+
         '<option>Project Admin</option>';
 }

 if(addAhtUserEmployee){
   const addAhtEmployeeSearch=
     document.getElementById("addAhtEmployeeSearch");

   const addAhtEmployeeList=
     document.getElementById("addAhtEmployeeList");

   const addAhtEmployeeCount=
     document.getElementById("addAhtEmployeeCount");

   const employeeDirectory=
     typeof DataProvider?.getCachedEmployeeDirectory==="function"
       ? DataProvider.getCachedEmployeeDirectory()
       : [];

   const existingEmails=
     new Set(
       USERS
         .map(user=>
           String(user.email||"")
             .trim()
             .toLowerCase()
         )
         .filter(Boolean)
     );

   const operatorCanSeeAllEmployees=
     Boolean(
       currentUser?.canAdmin ||
       currentUser?.isSystemOwner
     );

   const employeeDivisionKeys=
     new Set(
       effectiveManagementDivisions(currentUser)
         .map(value=>value.toLowerCase())
     );

   const employeeSearchText=
     String(addAhtEmployeeSearch?.value||"")
       .trim()
       .toLowerCase();

   const previousEmployee=
     addAhtUserEmployee.value;

   const availableEmployees=
     employeeDirectory
       .filter(employee=>
         employee.email &&
         !existingEmails.has(
           String(employee.email)
             .trim()
             .toLowerCase()
         )
       )
       .filter(employee=>{
         const name=
           String(employee.name||"").trim();

         const email=
           String(employee.email||"")
             .trim()
             .toLowerCase();

         /*
          * Exclude obvious division/office mailbox records such as
          * "AHT Naples / naples.office@ahtglobal.com".
          * Do not broadly exclude Office-department employees.
          */
         const obviousOfficeAlias=
           /^AHT\s+/i.test(name) &&
           (
             email.includes(".office@") ||
             email.includes("office@")
           );

         return !obviousOfficeAlias;
       })
       .filter(employee=>
         operatorCanSeeAllEmployees ||
         employeeDivisionKeys.has(
           String(employee.division||"")
             .trim()
             .toLowerCase()
         )
       )
       .filter(employee=>
         !employeeSearchText ||
         [
           employee.name,
           employee.email,
           employee.jobTitle,
           employee.department,
           employee.division
         ].some(value=>
           String(value||"")
             .toLowerCase()
             .includes(employeeSearchText)
         )
       )
       .slice()
       .sort((a,b)=>{
         const divisionCompare=
           String(a.division||"")
             .localeCompare(
               String(b.division||"")
             );

         if(divisionCompare)return divisionCompare;

         return String(a.name||a.email)
           .localeCompare(
             String(b.name||b.email)
           );
       });

   /*
    * Keep the hidden native select populated so the existing
    * Add AHT User save/validation path continues to work unchanged.
    */
   addAhtUserEmployee.innerHTML=
     '<option value="">Select AHT employee…</option>'+
     availableEmployees
       .map(employee=>`
         <option
           value="${esc(employee.email)}"
           data-name="${esc(employee.name||"")}"
           data-division="${esc(employee.division||"")}"
           data-job-title="${esc(employee.jobTitle||"")}"
           data-department="${esc(employee.department||"")}"
         >
           ${esc(employee.name||employee.email)}
         </option>
       `)
       .join("");

   if(
     previousEmployee &&
     availableEmployees.some(employee=>
       String(employee.email||"")
         .toLowerCase()===
       String(previousEmployee)
         .toLowerCase()
     )
   ){
     addAhtUserEmployee.value=
       previousEmployee;
   }

   if(addAhtEmployeeCount){
     addAhtEmployeeCount.textContent=
       `${availableEmployees.length} available`;
   }

   if(addAhtEmployeeList){
     const byDivision=
       new Map();

     availableEmployees.forEach(employee=>{
       const division=
         String(employee.division||"Unassigned").trim() ||
         "Unassigned";

       if(!byDivision.has(division)){
         byDivision.set(division,[]);
       }

       byDivision.get(division).push(employee);
     });

     if(!availableEmployees.length){
       addAhtEmployeeList.innerHTML=
         '<div class="employee-directory-empty">No matching employees.</div>';

     }else{
       addAhtEmployeeList.innerHTML=
         [...byDivision.entries()]
           .map(([division,employees])=>`
             <section class="employee-directory-group">
               <div class="employee-directory-division">
                 <span>${esc(division)}</span>
                 <span>${employees.length}</span>
               </div>

               <div class="employee-directory-header">
                 <span>Name</span>
                 <span>Job Title</span>
               </div>

               ${employees.map(employee=>{
                 const selected=
                   String(addAhtUserEmployee.value||"")
                     .toLowerCase()===
                   String(employee.email||"")
                     .toLowerCase();

                 return `
                   <button
                     type="button"
                     class="employee-directory-row ${selected?"selected":""}"
                     data-employee-email="${esc(employee.email)}"
                   >
                     <span class="employee-directory-name">
                       <strong>${esc(employee.name||employee.email)}</strong>
                       <small>${esc(employee.department||"")}</small>
                     </span>

                     <span class="employee-directory-title">
                       ${esc(employee.jobTitle||"—")}
                     </span>
                   </button>
                 `;
               }).join("")}
             </section>
           `)
           .join("");
     }

     addAhtEmployeeList
       .querySelectorAll(".employee-directory-row")
       .forEach(row=>{
         row.onclick=()=>{
           const email=
             String(
               row.dataset.employeeEmail||""
             ).trim();

           const employee=
             availableEmployees.find(item=>
               String(item.email||"")
                 .toLowerCase()===
               email.toLowerCase()
             );

           if(!employee)return;

           addAhtUserEmployee.value=
             employee.email;

           const nameInput=
             document.getElementById(
               "addAhtUserName"
             );

           const emailInput=
             document.getElementById(
               "addAhtUserEmail"
             );

           if(nameInput){
             nameInput.value=
               employee.name||"";
           }

           if(emailInput){
             emailInput.value=
               employee.email||"";
           }

           addAhtEmployeeList
             .querySelectorAll(
               ".employee-directory-row"
             )
             .forEach(button=>
               button.classList.toggle(
                 "selected",
                 button===row
               )
             );
         };
       });
   }

   if(
     addAhtEmployeeSearch &&
     !addAhtEmployeeSearch.dataset.bound
   ){
     addAhtEmployeeSearch.dataset.bound="true";
     addAhtEmployeeSearch.addEventListener(
       "input",
       renderAdmin
     );
   }
 }

 if(addAhtUserProjects){
   const visibleAddProjects=
     manageableProjects.filter(project=>
       !addProjectFilterText ||
       String(project.name||"").toLowerCase().includes(addProjectFilterText) ||
       String(project.subtitle||"").toLowerCase().includes(addProjectFilterText) ||
       String(project.id||"").toLowerCase().includes(addProjectFilterText)
     );

   addAhtUserProjects.innerHTML=
     visibleAddProjects.length
       ? visibleAddProjects.map(project=>`
           <label class="admin-project-assignment-option">
             <input
               type="checkbox"
               value="${esc(project.id)}"
               class="add-aht-user-project"
             />
             <span>${esc(project.name)}</span>
           </label>
         `).join("")
       : '<div class="small" style="padding:9px">No matching projects.</div>';

   if(addAhtProjectCount){
     addAhtProjectCount.textContent=
       `${visibleAddProjects.length} of ${manageableProjects.length}`;
   }

   if(addAhtProjectSearch && !addAhtProjectSearch.dataset.bound){
     addAhtProjectSearch.dataset.bound="true";
     addAhtProjectSearch.addEventListener("input",renderAdmin);
   }
 }

 projectAdminList.innerHTML=manageableProjects.map(p=>`
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

 const includeArchived=
   hasOrganizationWideAdminScope &&
   showArchivedUsers.checked;

 document
   .querySelectorAll(".organization-wide-user-control")
   .forEach(element=>
     element.classList.toggle(
       "hidden",
       !hasOrganizationWideAdminScope
     )
   );

 const visibleUsers=USERS
   .filter(user=>includeArchived||user.active!==false)
   .filter(user=>{
     if(hasOrganizationWideAdminScope)return true;

     if(user.id===currentUser?.id)return true;

     // Keep the user currently being edited visible until Save completes.
     // This prevents a Project Admin from being bounced to another user
     // when an unsaved change removes the last in-scope project.
     if(window.adminEditingUserId===user.id)return true;

     if(
       user.canAdmin ||
       user.isSystemOwner ||
       user.projects?.includes("*")
     ){
       return false;
     }

     if(!useExplicitProjectManagementScope){
       const userDivision=
         String(user.division||"")
           .trim()
           .toLowerCase();

       if(
         user.isInternal!==false &&
         userDivision
       ){
         return operatorManagementDivisionKeys.has(
           userDivision
         );
       }

       // External users have no AHT Home Division.
       // Their scope follows their assigned projects.
       return (user.projects||[]).some(projectId=>
         managementProjectIds.has(projectId)
       );
     }

     return (user.projects||[]).some(projectId=>
       managementProjectIds.has(projectId)
     );
   })
   .filter(user=>
     window.adminEditingUserId===user.id ||
     !userFilterText ||
     [
       user.name,
       user.email,
       user.company,
       user.role
     ].some(value=>
       String(value||"").toLowerCase().includes(userFilterText)
     )
   )
   .slice()
   .sort((a,b)=>a.name.localeCompare(b.name));

 adminUserSelect.innerHTML='<option value="">Select user…</option>'+visibleUsers
   .map(u=>`<option value="${u.id}">${esc(u.name)}${u.active===false?" (Archived)":""}</option>`)
   .join("");

 if(adminUserSearch && !adminUserSearch.dataset.bound){
   adminUserSearch.dataset.bound="true";
   adminUserSearch.addEventListener("input",renderAdmin);
 }

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

 const operatorCanAssignAdmin =
   Boolean(
     currentUser?.canAdmin ||
     currentUser?.isSystemOwner
   );

 if(
   selected.entraUserType==="Guest" &&
   selected.roleTestingEnabled===true
 ){
   adminRoleSelect.innerHTML=
     operatorCanAssignAdmin
       ? '<option>External Viewer</option>'+
         '<option>Viewer</option>'+
         '<option>Editor</option>'+
         '<option>Project Admin</option>'+
         '<option>Admin</option>'
       : '<option>External Viewer</option>'+
         '<option>Viewer</option>'+
         '<option>Editor</option>'+
         '<option>Project Admin</option>';

   adminRoleSelect.disabled=false;

 }else if(selected.entraUserType==="Guest"){
   adminRoleSelect.innerHTML=
     '<option>External Viewer</option>';

   adminRoleSelect.disabled=true;

 }else if(isConfiguredAdmin){
   adminRoleSelect.innerHTML=
     '<option>Admin</option>';

   adminRoleSelect.disabled=true;

 }else if(operatorCanAssignAdmin){
   adminRoleSelect.innerHTML=
     '<option>Admin</option>'+
     '<option>Project Admin</option>'+
     '<option>Viewer</option>'+
     '<option>Editor</option>';

   adminRoleSelect.disabled=false;

 }else{
   adminRoleSelect.innerHTML=
     '<option>Project Admin</option>'+
     '<option>Viewer</option>'+
     '<option>Editor</option>';

   adminRoleSelect.disabled=false;
 }

 adminRoleSelect.value=
   selected.role || "Viewer";

 const adminHomeDivision=
   document.getElementById("adminHomeDivision");

 const adminManagementDivisions=
   document.getElementById("adminManagementDivisions");

 if(adminHomeDivision){
   adminHomeDivision.textContent=
     selected.isInternal===false
       ? "— External / role-testing account"
       : (selected.division||"—");
 }

 if(adminManagementDivisions){
   const selectedManagementDivisions=
     new Set(
       (selected.managementDivisions||[])
         .map(value=>
           String(value||"")
             .trim()
             .toLowerCase()
         )
     );

   adminManagementDivisions.innerHTML=
     AHT_DIVISIONS
       .map(division=>`
         <label class="admin-project-assignment-option">
           <input
             type="checkbox"
             class="admin-management-division"
             value="${esc(division)}"
             ${
               selectedManagementDivisions.has(
                 division.toLowerCase()
               )
                 ? "checked"
                 : ""
             }
           >
           <span>${esc(division)}</span>
         </label>
       `)
       .join("");
 }

 adminPasswordProfile.value=selected.id==="stacy"?"stacy":selected.passwordProfile||(selected.isInternal?"aht":"external");
 adminPasswordProfile.disabled=selected.id==="stacy";
 adminUserActive.checked=selected.active!==false;
 archiveUserBtn.textContent=selected.active===false?"Archived":"Archive User";
 archiveUserBtn.disabled=selected.active===false||selected.id===currentUser?.id||(selected.role==="Admin"&&activeAdministratorCount()<=1);

 const visibleManageProjects=
   manageableProjects.filter(project=>
     !manageProjectFilterText ||
     String(project.name||"").toLowerCase().includes(manageProjectFilterText) ||
     String(project.subtitle||"").toLowerCase().includes(manageProjectFilterText) ||
     String(project.id||"").toLowerCase().includes(manageProjectFilterText)
   );

 projectAssignmentList.innerHTML=
   visibleManageProjects.length
     ? visibleManageProjects.map(p=>{
         const checked=
           selected.projects.includes("*")||
           selected.projects.includes(p.id);

         return `<label class="admin-project-assignment-option"><input type="checkbox" value="${p.id}" ${checked?"checked":""}><span>${esc(p.name)}</span></label>`;
       }).join("")
     : '<div class="small" style="padding:9px">No matching projects.</div>';

 if(adminProjectCount){
   const selectedInScope=
     manageableProjects.filter(project=>
       selected.projects.includes("*") ||
       selected.projects.includes(project.id)
     ).length;

   adminProjectCount.textContent=
     `${selectedInScope} selected · ${visibleManageProjects.length} shown`;
 }

 if(adminProjectSearch && !adminProjectSearch.dataset.bound){
   adminProjectSearch.dataset.bound="true";
   adminProjectSearch.addEventListener("input",renderAdmin);
 }

 projectAssignmentList
   .querySelectorAll('input[type="checkbox"]')
   .forEach(input=>{
     input.onchange=()=>{
       const projectId=input.value;

       selected.projects=
         Array.isArray(selected.projects)
           ? selected.projects.filter(id=>id!=="*")
           : [];

       if(input.checked){
         if(!selected.projects.includes(projectId)){
           selected.projects.push(projectId);
         }

         selected.projectAccess ||= {};

         selected.projectAccess[projectId] ||= {
           canViewProjectPlan:false,
           canViewSiteOperations:false,
           active:true
         };
       }else{
         selected.projects=
           selected.projects.filter(id=>id!==projectId);
       }

       renderAdmin();
     };
   });

 const capabilityList=
   document.getElementById("adminProjectCapabilityList");

 const capabilityNote=
   document.getElementById("adminProjectCapabilityNote");

 if(capabilityList){
   const isExternal=
     String(selected.entraUserType||"")
       .toLowerCase()==="guest" ||
     selected.isInternal===false ||
     selected.role==="External Viewer";

   const assignedProjects=
     manageableProjects.filter(p=>
       selected.projects.includes("*") ||
       selected.projects.includes(p.id)
     );

   if(!isExternal){
     if(capabilityNote){
       capabilityNote.textContent=
         "Internal users automatically receive Project Plan and Site Operations access on assigned projects.";
     }

     capabilityList.innerHTML="";
   }else{
     if(capabilityNote){
       capabilityNote.textContent=
         "Detailed access is controlled separately for each assigned project.";
     }

     if(!assignedProjects.length){
       capabilityList.innerHTML=
         '<div class="small">Assign at least one project to manage detailed access.</div>';
     }else{
       capabilityList.innerHTML=`
         <div class="admin-project-access-table-wrap">
           <table class="admin-project-access-table">
             <thead>
               <tr>
                 <th>Project</th>
                 <th>Project Plan</th>
                 <th>Site Operations</th>
               </tr>
             </thead>
             <tbody>
               ${assignedProjects.map(p=>{
                 const access=
                   selected.projectAccess?.[p.id] || {};

                 const planChecked=
                   access.canViewProjectPlan===true;

                 const siteChecked=
                   access.canViewSiteOperations===true;

                 return `
                   <tr>
                     <td>
                       <strong>${esc(p.name)}</strong>
                     </td>

                     <td>
                       <input
                         type="checkbox"
                         class="admin-project-plan-capability"
                         data-project-id="${esc(p.id)}"
                         ${planChecked?"checked":""}
                       />
                     </td>

                     <td>
                       <input
                         type="checkbox"
                         class="admin-site-ops-capability"
                         data-project-id="${esc(p.id)}"
                         ${siteChecked?"checked":""}
                       />
                     </td>
                   </tr>
                 `;
               }).join("")}
             </tbody>
           </table>
         </div>
       `;

       selected.projectAccess ||= {};

       capabilityList
         .querySelectorAll(".admin-project-plan-capability")
         .forEach(input=>{
           input.onchange=()=>{
             const projectId=input.dataset.projectId;
             selected.projectAccess[projectId] ||= {};
             selected.projectAccess[projectId].canViewProjectPlan=
               input.checked;
           };
         });

       capabilityList
         .querySelectorAll(".admin-site-ops-capability")
         .forEach(input=>{
           input.onchange=()=>{
             const projectId=input.dataset.projectId;
             selected.projectAccess[projectId] ||= {};
             selected.projectAccess[projectId].canViewSiteOperations=
               input.checked;
           };
         });
     }
   }
 }
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
  const executivePlan=executiveProjectPlanSnapshot();
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
    doc.roundedRect(x,y,w,92,5,5,"S");
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
      ty+=clipped.length*8+2;
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

  /*
   * Executive Summary page layout:
   * 1. Project Health strip
   * 2. Leadership row
   * 3. Phase progress
   */

  const healthLook=statusStyle(health);
  const healthDrivers=
    activeProjectHealthOverride(p)
      ? [
          p.healthOverrideReason ||
          "Manual project health override"
        ]
      : projectHealthSummaryParts(p);

  // ----------------------------------------------------------
  // PROJECT HEALTH STRIP
  // ----------------------------------------------------------

  const healthY=88;
  const healthH=42;

  doc.setDrawColor(...line);
  doc.setFillColor(...healthLook.fill);
  doc.roundedRect(
    margin,
    healthY,
    contentWidth,
    healthH,
    5,
    5,
    "FD"
  );

  doc.setFillColor(...healthLook.accent);
  doc.roundedRect(
    margin,
    healthY,
    4,
    healthH,
    2,
    2,
    "F"
  );

  doc.setFont("helvetica","bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...muted);
  doc.text(
    "PROJECT HEALTH",
    margin+10,
    healthY+12
  );

  doc.setFontSize(10);
  doc.setTextColor(...healthLook.text);
  doc.text(
    clean(health),
    margin+10,
    healthY+27
  );

  let driverX=margin+105;

  healthDrivers
    .slice(0,4)
    .forEach(driver=>{
      const label=clean(driver);
      const textWidth=
        doc.getTextWidth(label);

      const chipW=
        Math.min(
          176,
          Math.max(
            74,
            textWidth+16
          )
        );

      if(
        driverX+chipW >
        pageWidth-margin
      ){
        return;
      }

      let chipFill=soft;
      let chipText=muted;

      if(/blocked Project Plan Task/i.test(label)){
        chipFill=lightBlue;
        chipText=[53,95,125];
      }else if(/overdue/i.test(label)){
        chipFill=lightRed;
        chipText=[154,75,75];
      }else if(/due within 7 days/i.test(label)){
        chipFill=lightOrange;
        chipText=[149,98,31];
      }else if(/Site Operation/i.test(label)){
        chipFill=lightGreen;
        chipText=[76,117,93];
      }

      doc.setFillColor(...chipFill);
      doc.roundedRect(
        driverX,
        healthY+10,
        chipW,
        21,
        10,
        10,
        "F"
      );

      doc.setFont(
        "helvetica",
        "bold"
      );
      doc.setFontSize(6.4);
      doc.setTextColor(...chipText);

      const clipped=
        doc.splitTextToSize(
          label,
          chipW-12
        )[0];

      doc.text(
        clipped,
        driverX+8,
        healthY+23
      );

      driverX+=chipW+7;
    });

  // ----------------------------------------------------------
  // LEADERSHIP ROW
  // ----------------------------------------------------------

  const leaders=[
    [
      "Executive Lead",
      p.executiveLead||"—"
    ],
    [
      "Senior Project Manager",
      p.seniorProjectManager||"—"
    ],
    [
      "Project Manager / Site Lead",
      p.projectManagerSiteLead||"—"
    ]
  ];

  const leaderGap=8;
  const leaderW=
    (
      contentWidth-
      leaderGap*2
    )/3;

  leaders.forEach(
    ([label,value],i)=>{
      const x=
        margin+
        i*(leaderW+leaderGap);

      doc.setDrawColor(...line);
      doc.roundedRect(
        x,
        139,
        leaderW,
        42,
        5,
        5,
        "S"
      );

      doc.setFont(
        "helvetica",
        "bold"
      );
      doc.setFontSize(6.3);
      doc.setTextColor(...muted);
      doc.text(
        label.toUpperCase(),
        x+8,
        152
      );

      doc.setFontSize(9);
      doc.setTextColor(...navy);

      const wrapped=
        doc.splitTextToSize(
          clean(value),
          leaderW-16
        );

      doc.text(
        wrapped.slice(0,2),
        x+8,
        168
      );
    }
  );

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
    doc.roundedRect(x,191,cardW,54,5,5,"S");
    doc.setFont("helvetica","bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...muted);
    doc.text(`${label.toUpperCase()} PROGRESS`,x+8,204);
    doc.setFontSize(17);
    doc.setTextColor(...navy);
    doc.text(`${value}%`,x+8,225);
    doc.setFillColor(232,237,241);
    doc.roundedRect(x+8,234,cardW-16,4,2,2,"F");
    doc.setFillColor(...blue);
    doc.roundedRect(x+8,234,Math.max(0,(cardW-16)*(Math.min(100,value)/100)),4,2,2,"F");
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
    doc.roundedRect(x,256,cardW,42,5,5,"S");
    doc.setFillColor(...countAccents[i]);
    doc.roundedRect(x,256,cardW,4,2,2,"F");
    doc.setFont("helvetica","bold");
    doc.setFontSize(15);
    doc.setTextColor(...navy);
    doc.text(String(value),x+cardW/2,274,{align:"center"});
    doc.setFontSize(6.2);
    doc.setTextColor(...muted);
    doc.text(label,x+cardW/2,287,{align:"center"});
  });

  const pdfCurrent=[
    ...current.map(x=>({
      category:"Current Work",
      source:"Deliverable",
      title:x.deliverable||"",
      detail:x.current||"",
      date:x.date||""
    })),
    ...executivePlan.active.map(item=>({
      category:"Current Work",
      source:"Project Plan",
      title:item.title||"",
      detail:item.owner||"Unassigned",
      date:executiveTaskDate(item)
    }))
  ].sort(executiveSortUrgentFirst);

  const pdfRequired=[
    ...outstandingInfo.map(x=>({
      category:"Required From Others",
      source:"Info Required",
      title:x.item||"",
      detail:
        `${x.from||"—"}${x.blocking?`; blocks ${x.blocking}`:""}`,
      date:x.neededBy||""
    })),
    ...executivePlan.waiting.map(item=>({
      category:"Required From Others",
      source:"Project Plan",
      title:item.informationRequired||item.title||"",
      detail:
        `${item.waitingOn||item.owner||"Unassigned"} · ${item.title||""}`,
      date:item.requiredBy||item.targetDate||""
    }))
  ].sort(executiveSortUrgentFirst);

  const pdfNext=[
    ...current
      .filter(x=>x.date)
      .map(x=>({
        category:"Next Deliverables",
        source:"Deliverable",
        title:x.deliverable||"",
        detail:x.nextStep||"",
        date:x.date||""
      })),
    ...executivePlan.upcoming
      .filter(item=>item.targetDate)
      .map(item=>({
        category:"Next Deliverables",
        source:"Project Plan",
        title:item.title||"",
        detail:executiveTaskPath(item),
        date:item.targetDate
      }))
  ].sort(executiveSortByDate);

  const pdfRisks=[
    ...risks.map(x=>({
      category:"Project Risks",
      source:"Deliverable",
      title:x.deliverable||"Deliverable Risk",
      detail:x.risk||"",
      date:x.date||"",
      kind:"deliverable"
    })),
    ...executivePlan.blocked.map(record=>({
      category:"Project Risks",
      source:"Project Plan",
      title:
        `${record.item.title} blocked by ${record.predecessors.length} ${
          record.predecessors.length===1?"Task":"Tasks"
        }`,
      detail:
        record.predecessors
          .map(predecessor=>predecessor.title)
          .join(", "),
      date:executiveBlockedRiskDate(record),
      kind:"dependency"
    }))
  ].sort(executiveSortRisks);

  const panelGap=10;
  const panelW=(contentWidth-panelGap)/2;

  summaryPanel(
    "CURRENT WORK",
    pdfCurrent
      .slice(0,EXECUTIVE_SUMMARY_LIMIT)
      .map(x=>
        `${x.title}${x.detail?` — ${x.detail}`:""}${x.date?`; ${date(x.date)}`:""}`
      ),
    margin,312,panelW,blue
  );

  summaryPanel(
    "REQUIRED FROM OTHERS",
    pdfRequired
      .slice(0,EXECUTIVE_SUMMARY_LIMIT)
      .map(x=>
        `${x.title}${x.detail?` — ${x.detail}`:""}${x.date?`; ${date(x.date)}`:""}`
      ),
    margin+panelW+panelGap,312,panelW,orange
  );

  summaryPanel(
    "NEXT DELIVERABLES",
    pdfNext
      .slice(0,EXECUTIVE_SUMMARY_LIMIT)
      .map(x=>
        `${x.title}${x.detail?` — ${x.detail}`:""}${x.date?`; ${date(x.date)}`:""}`
      ),
    margin,413,panelW,green
  );

  summaryPanel(
    "PROJECT RISKS",
    pdfRisks
      .slice(0,EXECUTIVE_SUMMARY_LIMIT)
      .map(x=>
        `${x.title}${x.detail?` — ${x.detail}`:""}${x.date?`; ${date(x.date)}`:""}`
      ),
    margin+panelW+panelGap,413,panelW,red
  );


  // ----------------------------------------------------------------
  // FULL EXECUTIVE SUMMARY DETAIL — NO SCREEN CAP
  // ----------------------------------------------------------------

  doc.addPage("letter","landscape");

  let y=34;

  y=sectionTitle(
    "Executive Summary Detail",
    y
  );

  const executiveDetailRows=[
    ...pdfCurrent,
    ...pdfRequired,
    ...pdfNext,
    ...pdfRisks
  ];

  /*
   * Executive Summary Detail is an index / management view.
   * Full Deliverable and Information Required descriptions are
   * printed later in their dedicated report sections.
   */
  function compactExecutiveDetail(record){
    const raw=clean(record?.detail||"");

    if(!raw || raw===clean(record?.title||"")){
      return "—";
    }

    const maxLength=115;

    if(raw.length<=maxLength){
      return raw;
    }

    const clipped=
      raw
        .slice(0,maxLength)
        .replace(/\s+\S*$/,"")
        .trim();

    return `${clipped||raw.slice(0,maxLength).trim()}…`;
  }

  doc.autoTable({
    startY:y,
    margin:{
      left:margin,
      right:margin,
      bottom:32
    },
    head:[[
      "Category",
      "Source",
      "Item",
      "Detail",
      "Input Needed / Target"
    ]],
    body:executiveDetailRows.map(record=>[
      val(record.category),
      val(record.source),
      val(record.title),
      compactExecutiveDetail(record),
      date(record.date)
    ]),
    theme:"grid",
    rowPageBreak:"avoid",
    styles:{
      font:"helvetica",
      fontSize:6.6,
      cellPadding:3,
      lineColor:line,
      lineWidth:.4,
      valign:"top",
      overflow:"linebreak"
    },
    headStyles:{
      fillColor:soft,
      textColor:navy,
      fontStyle:"bold",
      fontSize:6.4
    },
    columnStyles:{
      0:{cellWidth:88},
      1:{cellWidth:74},
      2:{cellWidth:205},
      3:{cellWidth:265},
      4:{cellWidth:74}
    }
  });


  // ----------------------------------------------------------------
  // Deliverables
  // Continue on the Executive Detail page when enough room remains.
  // ----------------------------------------------------------------

  let deliverablesStart=
    doc.lastAutoTable.finalY+22;

  if(deliverablesStart>pageHeight-135){
    doc.addPage("letter","landscape");
    deliverablesStart=34;
  }

  deliverablesStart=
    sectionTitle(
      "Deliverables",
      deliverablesStart
    );

  doc.autoTable({
    startY:deliverablesStart,
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
  if(calendarScheduleMode!=="project") await ensureSiteSchedule(false);
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

  /*
   * Calendar PDF always includes the complete Project Plan:
   * Tasks and Subtasks, regardless of screen expansion state.
   */
  const projectPdfEvents=projectScheduleRecords(ds)
    .filter(record=>record.date)
    .map(record=>({
      date:record.date,
      title:record.deliverable,
      status:record.status||"",
      source:"projectPlan",
      sourceId:record.id,
      parentWorkItemId:record.parentWorkItemId,
      level:Number(record.level||0),
      path:Array.isArray(record.path)?record.path:[],
      detail:record.status||""
    }));
  const sitePdfEvents=siteScheduleSnapshot.operations.flatMap(x=>{
    const detail=[siteLocationName(x.locationId),x.sitePhase,x.status].filter(Boolean).join(" · ");
    const rows=[];
    if(x.activityDate)rows.push({date:x.activityDate,title:x.title,status:x.status||"Planned",source:"site",detail});
    if(x.targetDate&&x.targetDate!==x.activityDate)rows.push({date:x.targetDate,title:x.title,status:x.status||"Planned",source:"site",detail});
    return rows;
  });
  const events=(calendarScheduleMode==="site"?sitePdfEvents:calendarScheduleMode==="combined"?[...projectPdfEvents,...sitePdfEvents]:projectPdfEvents).sort((a,b)=>String(a.date).localeCompare(String(b.date)));

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
    doc.text(`${clean(p.name)} · ${scheduleModeLabel(calendarScheduleMode)} Calendar · v${APP_CONFIG.version}`,pageWidth-margin,footerY,{align:"right"});
  }

  function header(){
    doc.setFont("helvetica","bold");
    doc.setTextColor(...navy);
    doc.setFontSize(9);
    doc.text("AHT GLOBAL · PROJECT CONTROL",margin,28);

    doc.setFontSize(20);
    doc.text(`${clean(p.name)} — ${scheduleModeLabel(calendarScheduleMode)} Calendar & Agenda`,margin,51);

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
  const panelGap=16;

  /*
   * Match the live dashboard:
   * Upcoming Agenda on the left, Calendar on the right.
   */
  const agendaLeft=margin;
  const agendaWidth=contentWidth*0.34;

  const gridLeft=agendaLeft+agendaWidth+panelGap;
  const gridWidth=pageWidth-margin-gridLeft;

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

  /*
   * PDF calendar week sizing.
   *
   * Each week grows according to the busiest day in that week.
   * If the complete month still cannot physically fit on one page,
   * reduce the number shown in the grid and put ALL events for the
   * affected dates on an automatic Calendar Detail page.
   */
  const weekMaxEvents=Array(rows).fill(0);

  for(let day=1;day<=daysInMonth;day++){
    const position=firstDay+day-1;
    const row=Math.floor(position/7);

    const key=
      `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

    const count=(grouped[key]||[]).length;

    weekMaxEvents[row]=Math.max(
      weekMaxEvents[row],
      count
    );
  }

  const pillH=18;
  const pillGap=3;
  const minWeekH=58;

  const requiredWeekHeight=count=>
    Math.max(
      minWeekH,
      24+(count*(pillH+pillGap))
    );

  const availableGridHeight=
    gridBottom-(headerY+8);

  const busiestDayCount=Math.max(
    1,
    ...weekMaxEvents
  );

  const totalHeightForCap=cap=>
    weekMaxEvents.reduce(
      (total,count)=>
        total+
        requiredWeekHeight(
          Math.min(count,cap)
        ),
      0
    );

  let pdfGridEventCap=busiestDayCount;

  while(
    pdfGridEventCap>1 &&
    totalHeightForCap(pdfGridEventCap)>availableGridHeight
  ){
    pdfGridEventCap-=1;
  }

  let rowHeights=weekMaxEvents.map(count=>
    requiredWeekHeight(
      Math.min(count,pdfGridEventCap)
    )
  );

  /*
   * Defensive fallback for an exceptionally dense month.
   */
  let calculatedGridHeight=
    rowHeights.reduce((a,b)=>a+b,0);

  if(calculatedGridHeight>availableGridHeight){
    rowHeights=Array(rows).fill(
      availableGridHeight/rows
    );
  }

  const rowTops=[];
  let runningY=headerY+8;

  rowHeights.forEach(height=>{
    rowTops.push(runningY);
    runningY+=height;
  });

  // Day-name header
  dayNames.forEach((day,index)=>{
    const x=gridLeft+(index*cellW);

    doc.setFillColor(...lightBlue);
    doc.setDrawColor(...line);
    doc.rect(
      x,
      headerY-10,
      cellW,
      18,
      "FD"
    );

    doc.setTextColor(...navy);
    doc.setFont("helvetica","bold");
    doc.setFontSize(7.5);

    doc.text(
      day,
      x+(cellW/2),
      headerY+2,
      {align:"center"}
    );
  });

  // Calendar cells
  doc.setLineWidth(.4);

  for(let row=0;row<rows;row++){
    for(let col=0;col<7;col++){
      const x=gridLeft+(col*cellW);
      const y=rowTops[row];
      const cellH=rowHeights[row];

      doc.setFillColor(...white);
      doc.setDrawColor(...line);

      doc.rect(
        x,
        y,
        cellW,
        cellH,
        "FD"
      );
    }
  }

  /*
   * Dates whose calendar cells could not contain every event.
   * These are repeated in full on the automatic detail page.
   */
  const pdfOverflowDates=new Set();

  for(let day=1;day<=daysInMonth;day++){
    const position=firstDay+day-1;
    const row=Math.floor(position/7);
    const col=position%7;

    const x=gridLeft+(col*cellW);
    const y=rowTops[row];
    const cellH=rowHeights[row];

    const key=
      `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

    const dayEvents=grouped[key]||[];

    const isToday=
      day===now.getDate() &&
      month===now.getMonth() &&
      year===now.getFullYear();

    if(isToday){
      doc.setFillColor(...lightBlue);
      doc.rect(
        x+1,
        y+1,
        cellW-2,
        cellH-2,
        "F"
      );
    }

    doc.setTextColor(...navy);
    doc.setFont("helvetica","bold");
    doc.setFontSize(8);

    doc.text(
      String(day),
      x+5,
      y+11
    );

    let textY=y+20;

    const eventsToRender=
      dayEvents.slice(
        0,
        pdfGridEventCap
      );

    eventsToRender.forEach(event=>{
      const fill=eventFill(event);
      const accent=eventColor(event);

      if(
        textY+pillH >
        y+cellH-4
      ){
        return;
      }

      const pillTop=textY-8;

      doc.setFillColor(...fill);
      doc.setDrawColor(...accent);

      doc.roundedRect(
        x+4,
        pillTop,
        cellW-8,
        pillH,
        3,
        3,
        "FD"
      );

      doc.setTextColor(...accent);
      doc.setFont("helvetica","bold");
      doc.setFontSize(5.7);

      const lines=
        doc
          .splitTextToSize(
            clean(event.title),
            cellW-14
          )
          .slice(0,2);

      const lineHeight=6.2;
      const textBlockH=
        lines.length*lineHeight;

      const centeredY=
        pillTop+
        ((pillH-textBlockH)/2)+
        lineHeight-1;

      doc.text(
        lines,
        x+7,
        centeredY,
        {lineHeightFactor:1.08}
      );

      textY+=pillH+pillGap;
    });

    if(dayEvents.length>eventsToRender.length){
      pdfOverflowDates.add(key);

      doc.setTextColor(...muted);
      doc.setFont("helvetica","bold");
      doc.setFontSize(5.5);

      doc.text(
        `+${dayEvents.length-eventsToRender.length} more · see detail`,
        x+6,
        Math.min(
          textY,
          y+cellH-6
        )
      );
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

  /*
   * PDF viewer-facing Task/Subtask hierarchy.
   *
   * Same rule as the live Calendar:
   * - If an item is due before its higher dated Task, it remains
   *   a viewer-facing Task.
   * - If due on/after the higher dated Task, it is shown as a
   *   Subtask and indented beneath that hierarchy.
   *
   * PDF always includes every scheduled record regardless of the
   * live expand/collapse state.
   */
  const pdfProjectById=new Map(
    projectPdfEvents.map(event=>[
      String(event.sourceId),
      event
    ])
  );

  const pdfAgendaDepth=event=>{
    if(event.source!=="projectPlan")return 0;

    let depth=0;
    let current=event;
    const seen=new Set();

    while(current?.parentWorkItemId!=null){
      const currentId=String(current.sourceId??"");

      if(seen.has(currentId))break;
      seen.add(currentId);

      const parent=pdfProjectById.get(
        String(current.parentWorkItemId)
      );

      if(!parent)break;

      /*
       * Child due before higher Task behaves as its own
       * viewer-facing Calendar Task.
       */
      if(
        String(current.date||"") &&
        String(parent.date||"") &&
        String(current.date) < String(parent.date)
      ){
        break;
      }

      depth+=1;
      current=parent;
    }

    return depth;
  };

  const upcoming=events
    .filter(event=>event.date>=todayKey)
    .map(event=>({
      ...event,
      pdfDepth:pdfAgendaDepth(event)
    }))
    .sort((a,b)=>
      String(a.date).localeCompare(String(b.date)) ||
      Number(a.pdfDepth||0)-Number(b.pdfDepth||0) ||
      String(a.title||"").localeCompare(String(b.title||""))
    );

  let agendaY=calendarTop+24;
  let renderedAgendaItems=0;

  if(!upcoming.length){
    doc.setTextColor(...muted);
    doc.setFont("helvetica","normal");
    doc.setFontSize(8);
    doc.text("No upcoming scheduled items.",agendaLeft+4,agendaY);
  }else{
    for(const event of upcoming){
      const depth=Math.min(2,Number(event.pdfDepth||0));
      const textIndent=depth*12;

      /*
       * Keep the Agenda band full width just like the live dashboard.
       * Only the Subtask text is indented.
       */
      const cardX=agendaLeft;
      const cardWidth=agendaWidth;

      const cardH=30;

      if(agendaY+cardH>footerY-14)break;

      const accent=eventColor(event);
      const fill=eventFill(event);

      doc.setFillColor(...fill);
      doc.setDrawColor(...line);
      doc.roundedRect(
        cardX,
        agendaY-8,
        cardWidth,
        cardH,
        4,
        4,
        "FD"
      );

      doc.setFillColor(...accent);
      doc.rect(
        cardX,
        agendaY-8,
        depth>0?3:4,
        cardH,
        "F"
      );

      const textX=
        cardX+
        10+
        textIndent;

      doc.setTextColor(...navy);
      doc.setFont("helvetica","bold");
      doc.setFontSize(depth>0?6.4:6.8);
      doc.text(
        fmtDate(event.date),
        textX,
        agendaY
      );

      doc.setTextColor(...accent);
      doc.setFont("helvetica","bold");
      doc.setFontSize(depth>0?6.8:7.1);

      const titleLines=doc
        .splitTextToSize(
          clean(event.title),
          cardWidth-18
        )
        .slice(0,1);

      doc.text(
        titleLines,
        textX,
        agendaY+9
      );

      doc.setTextColor(...muted);
      doc.setFont("helvetica","normal");
      doc.setFontSize(5.9);

      const detail=
        event.source==="projectPlan"
          ? [
              depth>0?"Subtask":"Task",
              event.status||""
            ]
              .filter(Boolean)
              .join(" · ")
          : clean(event.detail||event.status||"");

      if(detail){
        doc.text(
          doc
            .splitTextToSize(detail,cardWidth-18)
            .slice(0,1),
          textX,
          agendaY+18
        );
      }

      agendaY+=cardH+3;
      renderedAgendaItems+=1;
    }

    const remaining=upcoming.length-renderedAgendaItems;

    if(
      remaining>0 &&
      agendaY<footerY-10
    ){
      doc.setTextColor(...muted);
      doc.setFont("helvetica","bold");
      doc.setFontSize(6.2);
      doc.text(
        `+${remaining} additional scheduled item${remaining===1?"":"s"}`,
        agendaLeft+4,
        agendaY
      );
    }
  }

  // ---- Legend ----
  const legendY=footerY-18;
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

  /*
   * Automatic overflow page.
   *
   * Normal months stay one page. This page is only created when
   * one or more calendar dates physically cannot display all of
   * their scheduled records in the month grid.
   */
  if(pdfOverflowDates.size){
    doc.addPage("letter","landscape");
    header();

    let detailY=104;

    doc.setFillColor(...navy);
    doc.roundedRect(
      margin,
      detailY-15,
      contentWidth,
      24,
      5,
      5,
      "F"
    );

    doc.setTextColor(...white);
    doc.setFont("helvetica","bold");
    doc.setFontSize(11);

    doc.text(
      `${monthName.toUpperCase()} — CALENDAR DETAIL`,
      margin+10,
      detailY+1
    );

    detailY+=28;

    const overflowKeys=
      [...pdfOverflowDates]
        .sort();

    for(const key of overflowKeys){
      const dayEvents=grouped[key]||[];

      /*
       * Start another detail page if needed.
       */
      const estimatedHeight=
        22+
        (dayEvents.length*22);

      if(
        detailY+estimatedHeight >
        footerY-8
      ){
        footer();

        doc.addPage(
          "letter",
          "landscape"
        );

        header();

        detailY=104;

        doc.setFillColor(...navy);
        doc.roundedRect(
          margin,
          detailY-15,
          contentWidth,
          24,
          5,
          5,
          "F"
        );

        doc.setTextColor(...white);
        doc.setFont("helvetica","bold");
        doc.setFontSize(11);

        doc.text(
          `${monthName.toUpperCase()} — CALENDAR DETAIL`,
          margin+10,
          detailY+1
        );

        detailY+=28;
      }

      doc.setTextColor(...navy);
      doc.setFont("helvetica","bold");
      doc.setFontSize(9);

      doc.text(
        fmtDate(key),
        margin,
        detailY
      );

      detailY+=11;

      for(const event of dayEvents){
        const accent=eventColor(event);
        const fill=eventFill(event);

        const depth=
          event.source==="projectPlan"
            ?Math.min(
                2,
                pdfAgendaDepth(event)
              )
            :0;

        const textIndent=depth*14;

        doc.setFillColor(...fill);
        doc.setDrawColor(...line);

        doc.roundedRect(
          margin,
          detailY-7,
          contentWidth,
          19,
          3,
          3,
          "FD"
        );

        doc.setFillColor(...accent);
        doc.rect(
          margin,
          detailY-7,
          depth>0?3:4,
          19,
          "F"
        );

        doc.setTextColor(...accent);
        doc.setFont("helvetica","bold");
        doc.setFontSize(7);

        doc.text(
          clean(event.title),
          margin+10+textIndent,
          detailY+1
        );

        doc.setTextColor(...muted);
        doc.setFont(
          "helvetica",
          "normal"
        );
        doc.setFontSize(6);

        const label=
          event.source==="projectPlan"
            ?[
                depth>0?"Subtask":"Task",
                event.status||""
              ]
                .filter(Boolean)
                .join(" · ")
            :clean(
                event.detail||
                event.status||
                ""
              );

        if(label){
          doc.text(
            label,
            pageWidth-margin-4,
            detailY+1,
            {align:"right"}
          );
        }

        detailY+=22;
      }

      detailY+=7;
    }

    footer();
  }

  const dateStamp=new Date().toISOString().slice(0,10);
  const filename=`${projectReportSafeFileName(p.name)}-${scheduleModeLabel(calendarScheduleMode)}-Calendar-${dateStamp}.pdf`;
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
  if(ganttScheduleMode!=="project") await ensureSiteSchedule(false);
  const records=scheduleRecordsForGantt(visibleDeliverables(p));

  const scheduledRaw=records
    .map(record=>({
      record,
      start:ganttStartFor(record),
      end:ganttDate(record.date)
    }))
    .filter(item=>item.start&&item.end);

  /*
   * Gantt PDF always prints the complete Task / Subtask hierarchy.
   * A Task is followed immediately by its scheduled Subtasks,
   * regardless of the Subtask's target date.
   *
   * If a higher-level Project Plan item is not itself scheduled,
   * the dated descendant behaves as a root Task in this PDF.
   */
  const scheduledById=new Map(
    scheduledRaw
      .filter(item=>item.record?.id!=null)
      .map(item=>[
        String(item.record.id),
        item
      ])
  );

  /*
   * Viewer-facing Gantt hierarchy.
   *
   * A record only remains a Subtask when:
   * - its higher Task is also scheduled, AND
   * - its target date is on or after that higher Task.
   *
   * If it is due before the higher Task, it becomes its own
   * viewer-facing Task in the printable Gantt.
   */
  const effectiveParentId=item=>{
    const parentId=String(
      item.record?.parentWorkItemId??""
    );

    if(!parentId)return "";

    const parent=scheduledById.get(parentId);

    if(!parent)return "";

    const childDate=String(
      item.record?.date||""
    );

    const parentDate=String(
      parent.record?.date||""
    );

    if(
      childDate &&
      parentDate &&
      childDate < parentDate
    ){
      return "";
    }

    return parentId;
  };

  const scheduledChildren=new Map();
  const scheduledNestedIds=new Set();

  scheduledRaw.forEach(item=>{
    const parentId=effectiveParentId(item);

    if(!parentId)return;

    if(!scheduledChildren.has(parentId)){
      scheduledChildren.set(parentId,[]);
    }

    scheduledChildren
      .get(parentId)
      .push(item);

    if(item.record?.id!=null){
      scheduledNestedIds.add(
        String(item.record.id)
      );
    }
  });

  scheduledChildren.forEach(children=>{
    children.sort((a,b)=>
      a.end-b.end ||
      String(a.record?.deliverable||"")
        .localeCompare(
          String(b.record?.deliverable||"")
        )
    );
  });

  const scheduledRoots=scheduledRaw
    .filter(item=>
      item.record?.id==null ||
      !scheduledNestedIds.has(
        String(item.record.id)
      )
    )
    .sort((a,b)=>
      a.end-b.end ||
      String(a.record?.deliverable||"")
        .localeCompare(
          String(b.record?.deliverable||"")
        )
    );

  const scheduled=[];

  const appendScheduledHierarchy=(item,depth=0)=>{
    scheduled.push({
      ...item,
      pdfDepth:depth
    });

    const id=String(
      item.record?.id??""
    );

    (scheduledChildren.get(id)||[])
      .forEach(child=>
        appendScheduledHierarchy(
          child,
          depth+1
        )
      );
  };

  scheduledRoots.forEach(item=>
    appendScheduledHierarchy(item,0)
  );

  const unscheduled=records.filter(
    record=>!ganttDate(record.date)
  );

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

    const filename=`${projectReportSafeFileName(p.name)}-${scheduleModeLabel(ganttScheduleMode)}-Gantt-${dateStamp}.pdf`;
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
    doc.text("TASK / SUBTASK",margin+6,97);

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

      const depth=Math.min(
        3,
        Number(item.pdfDepth||0)
      );

      const textIndent=depth*14;
      const titleX=
        margin+
        6+
        textIndent;

      doc.setFont("helvetica","bold");
      doc.setFontSize(
        depth>0?6.9:7.2
      );
      doc.setTextColor(...navy);

      const titleLines=doc
        .splitTextToSize(
          clean(r.deliverable),
          leftCol-12-textIndent
        )
        .slice(0,2);

      doc.text(
        titleLines,
        titleX,
        y+9
      );

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

  const filename=`${projectReportSafeFileName(p.name)}-${scheduleModeLabel(ganttScheduleMode)}-Gantt-${dateStamp}.pdf`;
  await saveProjectPdfBlob(doc.output("blob"),filename);
}
