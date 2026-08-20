// Browser storage, backup, and restore helpers.
// This remains browser-only until a hosted database is added.

async function save(){
 await DataProvider.saveState(state);
 render();
}

function backupFileName(){
 const stamp=new Date().toISOString().slice(0,10);
 return `aht-project-control-backup-${stamp}.json`;
}

async function exportBackup(){
 if(!currentUser?.canAdmin)return;
 const payload={
   format:"AHT Project Control Backup",
   formatVersion:APP_CONFIG.backupFormatVersion,
   application:{
     name:APP_CONFIG.appName,
     version:APP_CONFIG.version,
     buildDate:APP_CONFIG.buildDate,
     environment:APP_CONFIG.environment
   },
   exportedAt:new Date().toISOString(),
   exportedBy:{id:currentUser.id,name:currentUser.name},
   recordCounts:{
     users:USERS.length,
     projects:state.projects.length,
     deliverables:state.projects.reduce((sum,project)=>sum+project.deliverables.length,0),
     informationRequests:state.projects.reduce((sum,project)=>sum+project.info.length,0),
     auditEntries:state.auditLog.length
   },
   state:snapshot(state),
   users:snapshot(USERS)
 };
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob);
 const link=document.createElement("a");
 link.href=url;
 link.download=backupFileName();
 document.body.appendChild(link);
 link.click();
 link.remove();
 URL.revokeObjectURL(url);
 logChange("Create","admin","System Backup","Dashboard backup",`Backup exported by ${currentUser.name}.`);
 await DataProvider.saveState(state);
 render();
}

function validateBackup(payload){
 if(!payload||payload.format!=="AHT Project Control Backup"){
   throw new Error("This is not an AHT Project Control backup file.");
 }
 const formatVersion=payload.formatVersion??payload.version??1;
 if(formatVersion>APP_CONFIG.backupFormatVersion){
   throw new Error(`This backup uses format version ${formatVersion}, which is newer than this dashboard supports.`);
 }
 if(!payload.state||!Array.isArray(payload.state.projects)){
   throw new Error("The backup does not contain valid project data.");
 }
 if(!payload.state.projects.every(project=>
   project&&project.id&&project.name&&
   Array.isArray(project.deliverables)&&Array.isArray(project.info)
 )){
   throw new Error("One or more projects in the backup are incomplete.");
 }
 if(!Array.isArray(payload.users)){
   throw new Error("The backup does not contain a valid user list.");
 }
 return true;
}

function importBackupFile(file){
 if(!currentUser?.canAdmin||!file)return;
 const reader=new FileReader();
 reader.onload=async()=>{
   try{
     const payload=JSON.parse(reader.result);
     validateBackup(payload);
     const exportedAt=payload.exportedAt?new Date(payload.exportedAt).toLocaleString("en-US"):"an unknown date";
     if(!confirm(`Replace the current dashboard data with the backup exported ${exportedAt}?\n\nThis cannot be undone unless you export the current data first.`))return;
     state=snapshot(payload.state);
     if(!state.auditLog)state.auditLog=[];
     if(Array.isArray(payload.users)){
       USERS.splice(0,USERS.length,...snapshot(payload.users));
       await DataProvider.saveUsers(USERS);
       populateLoginUsers(currentUser?.id||"");
     }
     if(!state.projects.some(p=>p.id===state.currentProjectId&&!p.archived)){
       state.currentProjectId=state.projects.find(p=>!p.archived)?.id||state.projects[0]?.id||"";
     }
     logChange("Update","admin","System Backup","Dashboard restore",`Backup from ${exportedAt} imported by ${currentUser.name}.`);
     await DataProvider.saveState(state);
     alert("Backup imported successfully.");
     render();
     showView("projects");
   }catch(error){
     alert(`Backup could not be imported: ${error.message}`);
   }finally{
     importBackupFileInput.value="";
   }
 };
 reader.onerror=()=>alert("The selected backup file could not be read.");
 reader.readAsText(file);
}
