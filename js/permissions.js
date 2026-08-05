// Project access and record-visibility rules.
//
// These rules are intentionally separate from authentication so the same
// permissions can remain in place when hosted login or AHT SSO is added.

function allowedProjects(){const base=currentUser.projects.includes("*")?state.projects:state.projects.filter(p=>currentUser.projects.includes(p.id));return base.filter(p=>!p.archived)}

function currentProject(){const visible=allowedProjects();return visible.find(p=>p.id===state.currentProjectId)||visible[0]}

function canSeeRecord(x){
 const v=x.visibility||"Shared";
 if(v==="Shared")return true;
 if(v==="AHT Internal")return !!currentUser.isInternal;
 if(v==="Admin Only")return !!currentUser.canAdmin;
 return false;
}

function visibleDeliverables(p){return p.deliverables.filter(canSeeRecord)}

function visibleInfo(p){return p.info.filter(canSeeRecord)}
