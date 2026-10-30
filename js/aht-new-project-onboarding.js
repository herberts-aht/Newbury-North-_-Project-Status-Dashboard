/* AHT New Project Onboarding — guarded Phase 1 pilot.
 * Reuses the dashboard's existing Add Project form/save path. No new SharePoint
 * schema and no automatic folder, location, or Project Plan writes.
 */
(function(){
  'use strict';
  const STYLE_ID='aht-onboard-overlay';
  const PHASES=['Planning','Design Development','Engineering','Permitting','Rough-In','Trim','Final','Complete'];
  const model={step:0,busy:false,verification:'',createdKey:'',customName:false,details:{projectName:'',address:'',city:'',state:'FL',description:'',division:'',phase:'Planning'},leads:{executiveLead:'',seniorProjectManager:'',projectManagerSiteLead:''},directoryScope:'office',directorySearch:''};
  const $=id=>document.getElementById(id);
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const norm=value=>String(value??'').trim().replace(/\s+/g,' ').toLowerCase();
  const normAddress=value=>norm(value).replace(/\b(drive|dr|road|rd|street|st|avenue|ave|boulevard|blvd|lane|ln|court|ct|place|pl|parkway|pkwy)\b\.?/g,'').replace(/[^a-z0-9]/g,'');
  // EXACT match of current native Add Project Key derivation in index.html.
  const projectKey=name=>String(name||'PROJECT').trim().toUpperCase()
    .replace(/\b(DRIVE|DR|STREET|ST|ROAD|RD|AVENUE|AVE|LANE|LN|COURT|CT|BOULEVARD|BLVD|WAY|PLACE|PL)\b\.?/g,'')
    .replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/-+/g,'-');
  // Employee names come from the company Employee Directory Cache, not Dashboard Access.
  // Provisioning and project permissions remain in Administration / Users & Access.
  function directoryEmployees(){
    const records=typeof DataProvider!=='undefined'&&typeof DataProvider.getCachedEmployeeDirectory==='function'
      ?DataProvider.getCachedEmployeeDirectory():[];
    return records.filter(employee=>{
      if(!employee||!String(employee.name||'').trim())return false;
      if(employee.employmentStatus&&norm(employee.employmentStatus)!=='employed')return false;
      const name=String(employee.name||'');
      const email=String(employee.email||'').toLowerCase();
      return !(/^AHT\s+/i.test(name)&&(email.includes('.office@')||email.includes('office@')));
    }).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  }
  function employeeMatches(employee,search){
    const terms=norm(search).split(' ').filter(Boolean);
    if(!terms.length)return true;
    const searchable=norm([employee.name,employee.jobTitle,employee.department,employee.division,employee.email].join(' '));
    return terms.every(term=>searchable.includes(term));
  }
  function leadOptionMarkup(records,value,showDivision){
    const options=records.map(employee=>{
      const name=String(employee.name||'').trim();
      const office=String(employee.division||'').trim();
      const caption=showDivision&&office?`${name} — ${office}`:name;
      return `<option value="${escapeHtml(name)}" ${name===value?'selected':''}>${escapeHtml(caption)}</option>`;
    });
    // Keep prior selections visible even when filtering or switching offices.
    if(value&&!records.some(item=>item.name===value)){
      const known=directoryEmployees().find(item=>item.name===value);
      const suffix=known?.division?` — ${escapeHtml(known.division)} (selected)`:' (previous selection)';
      options.unshift(`<option value="${escapeHtml(value)}" selected>${escapeHtml(value)}${suffix}</option>`);
    }
    return `<option value="">— Unassigned —</option>${options.join('')}`;
  }
  function leadSelect(label,id,records,value,showDivision){
    return `<label class="aht-ob-field"><span>${escapeHtml(label)}</span><select id="${id}">${leadOptionMarkup(records,value,showDivision)}</select></label>`;
  }
  function directorySearchSummary(matched,total){
    const term=String(model.directorySearch||'').trim();
    if(!term)return `Showing ${total} employed ${total===1?'employee':'employees'} across all offices. Search by name, title, or department to narrow the lists.`;
    if(!matched)return 'No matching employees. Try a different name, job title, department, or office. Previous selections are preserved.';
    return `Showing ${matched} of ${total} employees matching “${term}”.`;
  }
  function permittedDivisions(){
    if(!window.currentUser && typeof currentUser==='undefined')return [];
    const elevated=Boolean(currentUser?.canAdmin||currentUser?.isSystemOwner);
    if(elevated)return typeof AHT_DIVISIONS!=='undefined'?[...AHT_DIVISIONS]:[];
    return typeof effectiveManagementDivisions==='function'?[...effectiveManagementDivisions(currentUser)]:[];
  }
  function canOpen(){return typeof currentUser!=='undefined'&&Boolean(currentUser?.canManageProjects);}
  function field(label,id,value,required=false){return `<label class="aht-ob-field"><span>${escapeHtml(label)}${required?' *':''}</span><input id="${id}" type="text" value="${escapeHtml(value)}" ${required?'required':''} autocomplete="off"></label>`;}
  function select(label,id,options,value,required=false){return `<label class="aht-ob-field"><span>${escapeHtml(label)}${required?' *':''}</span><select id="${id}"><option value="">— Select —</option>${options.map(item=>`<option value="${escapeHtml(item)}" ${item===value?'selected':''}>${escapeHtml(item)}</option>`).join('')}</select></label>`;}
  function duplicateMatches(records){
    const d=model.details, key=projectKey(d.projectName||d.address), address=normAddress(d.address);
    return (records||[]).filter(record=>{
      const fields=record.fields||record;
      const oldKey=String(fields.ProjectKey||record.id||'');
      const oldName=String(fields.Title||record.name||'');
      const oldAddress=String(fields.ProjectAddress||record.address||'');
      const oldCity=String(fields.ProjectCity||record.city||'');
      const oldState=String(fields.ProjectState||record.state||'');
      return norm(oldKey)===norm(key)||norm(oldName)===norm(d.projectName)||
        Boolean(address&&oldAddress&&normAddress(oldAddress)===address&&norm(oldCity)===norm(d.city)&&norm(oldState)===norm(d.state));
    });
  }
  function currentRecords(){return (typeof state!=='undefined'&&Array.isArray(state.projects))?state.projects:[];}
  function render(){
    const el=$(STYLE_ID);if(!el)return;
    const d=model.details;
    const titles=['Project Information','Project Leadership','Review & Confirm','Next Setup Steps'];
    const row=(label,value)=>`<div class="aht-ob-review-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value||'—')}</strong></div>`;
    const localDup=duplicateMatches(currentRecords());
    let content='';
    if(model.step===0){
      content=`<p class="aht-ob-note">Start with the required details. No SharePoint records are created until the final confirmation.</p><div class="aht-ob-grid">${field('Project Address','ahtObAddress',d.address,true)}${field('Project Name','ahtObName',d.projectName,true)}${field('City','ahtObCity',d.city,true)}${field('State','ahtObState',d.state,true)}${field('Builder / Client','ahtObDescription',d.description)}${select('Division / Office','ahtObDivision',permittedDivisions(),d.division,true)}${select('Project Phase','ahtObPhase',PHASES,d.phase,true)}</div><div class="aht-ob-key">Proposed Project Key: <strong id="ahtObKey">${escapeHtml(projectKey(d.projectName||d.address))}</strong></div>`;
    }else if(model.step===1){
      const all=directoryEmployees();
      const office=String(d.division||'').trim();
      const showAll=model.directoryScope==='all';
      const visible=showAll?all:all.filter(employee=>norm(employee.division)===norm(office));
      const matches=showAll?visible.filter(employee=>employeeMatches(employee,model.directorySearch)):visible;
      const helper=all.length===0
        ?'The AHT Employee Directory Cache is empty or unavailable. An administrator can refresh it under Users & Access.'
        :visible.length===0
          ?`No employees found for ${office}. Try All Offices or refresh the Employee Directory Cache.`
          :showAll?directorySearchSummary(matches.length,visible.length)
          :`Showing ${visible.length} employed ${visible.length===1?'employee':'employees'} in ${office}.`;
      const search=showAll?`<label class="aht-ob-field aht-ob-employee-search"><span>Search employees — All Offices</span><input id="ahtObDirectorySearch" type="search" value="${escapeHtml(model.directorySearch)}" placeholder="Search name, job title, department, or office…" autocomplete="off" aria-describedby="ahtObDirectoryNote"></label>`:'';
      content=`<p class="aht-ob-note">Choose project leadership from the AHT Employee Directory, even if the employee does not have dashboard access. User accounts and project permissions are managed separately under Administration / Users &amp; Access.</p><label class="aht-ob-field aht-ob-office-filter"><span>Employee Directory</span><select id="ahtObDirectoryScope"><option value="office" ${!showAll?'selected':''}>Selected Office — ${escapeHtml(office)}</option><option value="all" ${showAll?'selected':''}>All Offices</option></select></label>${search}<p class="aht-ob-directory-note" id="ahtObDirectoryNote" aria-live="polite">${escapeHtml(helper)}</p><div class="aht-ob-grid">${leadSelect('Executive Lead','ahtObExecutive',matches,model.leads.executiveLead,showAll)}${leadSelect('Senior Project Manager','ahtObSenior',matches,model.leads.seniorProjectManager,showAll)}${leadSelect('Project Manager / Site Lead','ahtObPm',matches,model.leads.projectManagerSiteLead,showAll)}</div>`;
    }else if(model.step===2){
      content=`<p class="aht-ob-note">Review these details before creating the master project in the existing SharePoint Projects list.</p><div class="aht-ob-review">${row('Project',d.projectName)}${row('Address',d.address)}${row('City / State',`${d.city}, ${d.state}`)}${row('Builder / Client',d.description)}${row('Division',d.division)}${row('Phase',d.phase)}${row('Project Key',projectKey(d.projectName||d.address))}${row('Executive Lead',model.leads.executiveLead)}${row('Senior PM',model.leads.seniorProjectManager)}${row('PM / Site Lead',model.leads.projectManagerSiteLead)}</div><p class="aht-ob-check ${localDup.length?'aht-ob-alert':''}">${localDup.length?`Possible duplicate in loaded projects: ${localDup.map(p=>escapeHtml(p.name||p.fields?.Title||p.id)).join(', ')}. Creation is blocked.`:'No matching project found in the loaded dashboard. SharePoint will be checked again before creation.'}</p>`;
    }else{
      content=`<div class="aht-ob-success"><strong>Project Key: ${escapeHtml(model.createdKey)}</strong><p id="ahtObVerify">${escapeHtml(model.verification)}</p></div><p class="aht-ob-note">The project master record is created through the existing dashboard form. The steps below are <strong>not automatically completed</strong> in this pilot.</p><div class="aht-ob-todos"><div><strong>1. SharePoint project documents</strong><span>Confirm the matching office Projects folder. Nothing was created or linked automatically.</span></div><div><strong>2. Project Plan / modules</strong><span>Initialization is not automated yet. Existing Core/module PowerShell scripts remain unchanged.</span></div><div><strong>3. Dashboard users &amp; project access</strong><span>Assign users and configure project permissions separately in Administration / Users &amp; Access.</span></div><div><strong>4. Room Builder</strong><span>Use the existing Room Builder in Administration to set up floors and rooms.</span></div></div><button type="button" class="btn primary" id="ahtObRooms">Go to Room Builder</button>`;
    }
    el.innerHTML=`<div class="aht-ob-dialog" role="dialog" aria-modal="true" aria-labelledby="ahtObTitle"><header class="aht-ob-header"><div><span class="aht-ob-eyebrow">Administration / Projects &amp; Setup</span><h2 id="ahtObTitle">New Project Onboarding</h2></div><button class="aht-ob-close" id="ahtObClose" type="button" aria-label="Close onboarding">×</button></header><div class="aht-ob-steps">${titles.map((t,i)=>`<span class="${i===model.step?'active':i<model.step?'complete':''}">${i+1}. ${escapeHtml(t)}</span>`).join('')}</div><div class="aht-ob-body"><h3>${titles[model.step]}</h3>${content}<p class="aht-ob-error" id="ahtObError" role="alert"></p></div><footer class="aht-ob-actions">${model.step>0&&model.step<3?'<button type="button" class="btn" id="ahtObBack">Back</button>':'<span></span>'}<div class="aht-ob-right">${model.step<3?'<button type="button" class="btn" id="ahtObCancel">Cancel</button>':''}<button type="button" class="btn primary" id="ahtObNext" ${model.step===2&&localDup.length?'disabled':''}>${model.step===0||model.step===1?'Continue':model.step===2?'Create Project':'Finish'}</button></div></footer></div>`;
    $('ahtObClose').onclick=close;
    if($('ahtObCancel'))$('ahtObCancel').onclick=close;
    if($('ahtObBack'))$('ahtObBack').onclick=()=>{capture();model.step--;render();};
    $('ahtObNext').onclick=onNext;
    if($('ahtObRooms'))$('ahtObRooms').onclick=()=>{
      close();
      if(typeof showAdminSection==='function')showAdminSection('projects');
      const picker=$('roomBuilderProject');
      if(picker&&[...picker.options].some(option=>option.value===model.createdKey)){
        picker.value=model.createdKey;
        picker.dispatchEvent(new Event('change',{bubbles:true}));
      }
      $('roomBuilderPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
    };
    if(model.step===1){
      $('ahtObDirectoryScope').addEventListener('change',event=>{
        capture();
        model.directoryScope=event.target.value==='all'?'all':'office';
        model.directorySearch='';
        render();
        if(model.directoryScope==='all')$('ahtObDirectorySearch')?.focus();
      });
      $('ahtObDirectorySearch')?.addEventListener('input',event=>{
        // Filter the existing dropdowns in place so focus and typed text stay put.
        // Preserve all three leadership selections even if they are not a search match.
        const query=event.target.value;
        const matched=directoryEmployees().filter(employee=>employeeMatches(employee,query));
        const roles=[['ahtObExecutive','executiveLead'],['ahtObSenior','seniorProjectManager'],['ahtObPm','projectManagerSiteLead']];
        roles.forEach(([id,role])=>{
          const control=$(id);
          if(!control)return;
          const selected=control.value;
          model.leads[role]=selected;
          control.innerHTML=leadOptionMarkup(matched,selected,true);
          control.value=selected;
        });
        model.directorySearch=query;
        const note=$('ahtObDirectoryNote');
        if(note)note.textContent=directorySearchSummary(matched.length,directoryEmployees().length);
      });
    }
    if(model.step===0){
      $('ahtObAddress').addEventListener('input',()=>{if(!model.customName){$('ahtObName').value=$('ahtObAddress').value;} $('ahtObKey').textContent=projectKey($('ahtObName').value||$('ahtObAddress').value);});
      $('ahtObName').addEventListener('input',()=>{model.customName=Boolean($('ahtObName').value.trim());$('ahtObKey').textContent=projectKey($('ahtObName').value||$('ahtObAddress').value);});
    }
  }
  function capture(){
    const val=id=>String($(id)?.value??'').trim();
    if(model.step===0){model.details={projectName:val('ahtObName'),address:val('ahtObAddress'),city:val('ahtObCity'),state:val('ahtObState').toUpperCase(),description:val('ahtObDescription'),division:val('ahtObDivision'),phase:val('ahtObPhase')};}
    if(model.step===1){model.leads={executiveLead:val('ahtObExecutive'),seniorProjectManager:val('ahtObSenior'),projectManagerSiteLead:val('ahtObPm')};}
  }
  function error(message){const el=$('ahtObError');if(el)el.textContent=message;}
  function validate(){
    const d=model.details;
    if(!d.address||!d.projectName||!d.city||!d.state||!d.division)return 'Complete all required project fields, including Division / Office.';
    if(!permittedDivisions().includes(d.division))return 'Your account is not authorized to create projects in that division.';
    if(!PHASES.includes(d.phase))return 'Choose a valid project phase.';
    if(!projectKey(d.projectName))return 'The proposed Project Key is invalid.';
    return '';
  }
  function setNativeValue(form,name,value){const input=form.querySelector(`[name="${name}"]`);if(!input)throw Error(`Existing project form is missing ${name}.`);input.value=value;}
  async function createProject(){
    if(model.busy)return;
    const message=validate();if(message){error(message);return;}
    if(duplicateMatches(currentRecords()).length){error('Possible duplicate detected. Review the existing project rather than creating another.');return;}
    // A connected, fresh SharePoint read is REQUIRED before the first write.
    if(typeof APP_CONFIG==='undefined'||APP_CONFIG.dataProvider!=='sharePoint'||DataProvider?.fallbackWasUsed===true){error('SharePoint is not connected. Project creation is blocked to prevent local-only or duplicate records.');return;}
    model.busy=true;
    const button=$('ahtObNext');button.disabled=true;button.textContent='Checking SharePoint…';
    try{
      if(typeof SharePointDataProvider==='undefined'||typeof SharePointDataProvider.getProjectRows!=='function')throw Error('SharePoint project lookup is unavailable.');
      const records=await SharePointDataProvider.getProjectRows();
      const duplicates=duplicateMatches(records);
      if(duplicates.length){error(`A matching project already exists in SharePoint: ${duplicates.map(item=>item.fields?.Title||item.fields?.ProjectKey||item.id).join(', ')}. No changes made.`);return;}
      if(!canOpen())throw Error('You no longer have permission to create projects.');
      if(duplicateMatches(currentRecords()).length)throw Error('A matching project appeared in the dashboard during validation. No changes made.');
      // Pass details into the EXISTING Add Project handler. It owns the
      // definitive record creation, audit log and dashboard save behavior.
      if(typeof openModal!=='function'||typeof editForm==='undefined')throw Error('The existing project editor is unavailable.');
      openModal('project');
      const form=editForm;
      const d=model.details;
      const fields={projectName:d.projectName,address:d.address,city:d.city,state:d.state,description:d.description,division:d.division,phase:d.phase,...model.leads};
      Object.entries(fields).forEach(([name,value])=>setNativeValue(form,name,value));
      // Native Add Project defaults several people to checked. Clear them so
      // onboarding never grants dashboard project access without an explicit
      // action in Administration / Users & Access.
      form.querySelectorAll('[name="assignedUsers"]').forEach(input=>{input.checked=false;});
      // The native handler creates the project in state and triggers save().
      // Never bypass it with a second SharePoint writer.
      const priorKeys=new Set(currentRecords().map(project=>String(project.id)));
      form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
      const added=currentRecords().find(project=>!priorKeys.has(String(project.id)));
      if(!added){throw Error('The existing project form did not create a project. No second attempt was made.');}
      model.createdKey=String(added.id);
      model.verification='Project added to dashboard; checking SharePoint persistence…';
      model.step=3;render();
      verifyInSharePoint(model.createdKey);
    }catch(err){
      const modal=typeof modalBackdrop!=='undefined'?modalBackdrop:null;
      if(modal?.style.display==='flex')modal.style.display='none';
      error(err?.message||String(err));
    }finally{model.busy=false;const next=$('ahtObNext');if(model.step===2&&next){next.disabled=false;next.textContent='Create Project';}}
  }
  async function verifyInSharePoint(key){
    for(let attempt=0;attempt<8;attempt++){
      await new Promise(resolve=>setTimeout(resolve,1600));
      try{
        const rows=await SharePointDataProvider.getProjectRows();
        if(rows.some(row=>norm(row.fields?.ProjectKey)===norm(key))){
          model.verification='Verified: master project is saved in SharePoint.';
          if(model.step===3&&$('ahtObVerify'))$('ahtObVerify').textContent=model.verification;
          return;
        }
      }catch(err){console.warn('Project onboarding verification is pending',err);}
    }
    model.verification='SharePoint save is not confirmed yet. Do not create the project again. Refresh Projects or check the SharePoint list before retrying.';
    if(model.step===3&&$('ahtObVerify'))$('ahtObVerify').textContent=model.verification;
  }
  function onNext(){
    if(model.busy)return;
    if(model.step===3){close();return;}
    if(model.step===2){createProject();return;}
    capture();if(model.step===0){const validation=validate();if(validation){error(validation);return;}}
    model.step++;render();
  }
  function close(){const el=$(STYLE_ID);if(el)el.remove();document.body.classList.remove('aht-ob-open');}
  function open(){
    if(!canOpen())return;
    if($(STYLE_ID))return;
    model.step=0;model.busy=false;model.verification='';model.createdKey='';model.customName=false;
    model.details={projectName:'',address:'',city:'',state:'FL',description:'',division:'',phase:'Planning'};
    model.leads={executiveLead:'',seniorProjectManager:'',projectManagerSiteLead:''};model.directoryScope='office';model.directorySearch='';
    const backdrop=document.createElement('div');backdrop.id=STYLE_ID;backdrop.className='aht-ob-overlay';document.body.appendChild(backdrop);
    document.body.classList.add('aht-ob-open');
    // Keep onboarding open on backdrop clicks so partially entered data cannot be lost accidentally.
    // Only explicit Cancel, X, or Finish closes the wizard.
    render();
    $('ahtObAddress')?.focus();
  }
  window.AHTProjectOnboarding=Object.freeze({open,close});
})();
