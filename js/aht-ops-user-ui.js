/* Operations User Management v4: grouping and per-user controls.
 * UI-only gate in addition to existing dashboard admin scope; real server authorization
 * of access fields must be enforced through SharePoint item permissions.
 */
(function(){'use strict';
 const opsRoles=['Operations Manager','Warehouse Manager'];
 const markup=['lighting','shades','cctv','devices','access'];
 const labels={labels:'Wire Label Printer',lighting:'Lighting / Keypads / PIR',shades:'Shades',cctv:'CCTV',devices:'Device Locations',access:'Access Control'};
 const $=id=>document.getElementById(id);
 const norm=v=>String(v||'').trim().toLowerCase();
 const ops=u=>opsRoles.includes(String(u?.role||''));
 function actor(){try{return typeof currentUser==='undefined'?null:currentUser;}catch(_){return null;}}
 function users(){try{return typeof USERS==='undefined'?[]:USERS;}catch(_){return [];}}
 function currentManaged(){return users().find(x=>String(x.id)===String($('adminUserSelect')?.value||''));}
 function authorizedManaged(u){const a=actor();if(!a||!u||a.active===false||a.isInternal===false)return false;
  if(a.isSystemOwner===true||a.canAdmin===true)return true;
  if(!a.canManageInternalUsers)return false;
  const office=norm(u.homeOffice||u.division),scope=Array.isArray(a.managementDivisions)?a.managementDivisions:[];
  const own=norm(a.homeOffice||a.division);
  return !!office && (office===own||scope.some(s=>norm(s)===office));}
 // AHT-OPS-RADIO-TEAMS-FIX-1: never default either Operations position.
 function selectedPosition(){return document.querySelector('#ahtOpsNewGroup input[name="ahtOpsNewPosition"]:checked')?.value||'';}
 function resolveAddRole(value){return value==='Operations'?selectedPosition():value;}
 function resetNewPosition(){document.querySelectorAll('#ahtOpsNewGroup input[name="ahtOpsNewPosition"]').forEach(c=>c.checked=false);newPosition();}
 function prepareNewUser(u,division){if(!ops(u))return true;
  if(!division){alert('An Operations user must have a verified Home Division in the employee directory.');return false;}
  u.homeOffice=division;
  u.toolGrants=[];
  u.projects=[];
  return true;
 }
 function newPosition(){const select=$('addAhtUserRole');if(!select)return;
  if(![...select.options].some(o=>o.value==='Operations'))select.add(new Option('Operations','Operations'));
  let panel=$('ahtOpsNewGroup');if(!panel){panel=document.createElement('div');panel.id='ahtOpsNewGroup';panel.className='aht-ops-role-group';panel.innerHTML='<div class="aht-ops-position-heading">Operations position <span class="aht-ops-required">(required)</span></div><div class="aht-ops-radio-options" role="radiogroup" aria-label="Operations position" aria-required="true"><label class="aht-ops-radio"><input type="radio" name="ahtOpsNewPosition" value="Operations Manager"> <span>Operations Manager</span></label><label class="aht-ops-radio"><input type="radio" name="ahtOpsNewPosition" value="Warehouse Manager"> <span>Warehouse Manager</span></label></div><p>Choose one position. Both start with the same permissions. Home office comes from the employee directory.</p>';select.insertAdjacentElement('afterend',panel);}
  panel.hidden=select.value!=='Operations';
  if(!select.dataset.ahtOpsBound){select.dataset.ahtOpsBound='1';select.addEventListener('change',()=>{panel.hidden=select.value!=='Operations';});}
 }
 function manageControl(){const select=$('adminRoleSelect');if(!select)return;
  opsRoles.forEach(r=>{if(![...select.options].some(o=>o.value===r))select.add(new Option(r,r));});
  let box=$('ahtOpsGrants');if(!box){box=document.createElement('div');box.id='ahtOpsGrants';box.className='aht-ops-grants';box.innerHTML='<strong>Operations Tools</strong><div id="ahtOpsGrantChecks"></div><p>Project Forms is included automatically. Wire Labels: Office Admin or Admin. Markup tools: System Owner only.</p>';select.insertAdjacentElement('afterend',box);}
  const target=currentManaged(),a=actor(),grants=Array.isArray(target?.toolGrants)?target.toolGrants:[];
  box.hidden=!(target&&ops(target));
  const container=$('ahtOpsGrantChecks');if(!container)return;
  container.replaceChildren();
  Object.entries(labels).forEach(([key,title])=>{
    if(key!=='labels'&&!a?.isSystemOwner)return;
    const el=document.createElement('label');el.className='aht-ops-grant-option';const c=document.createElement('input');c.type='checkbox';c.value=key;c.checked=grants.includes(key);c.disabled=!authorizedManaged(target)||(key!=='labels'&&!a?.isSystemOwner);el.append(c,document.createTextNode(' '+title));container.append(el);
  });
  const inScope=authorizedManaged(target);box.querySelector('p').textContent=inScope?'Only permissions you may grant are editable.':'Read-only: this user is outside your authorized office/user scope.';
 }
 function captureManagedUser(u){if(!ops(u))return true;
  const original=users().find(x=>String(x.id)===String(u.id));
  const division=String(u.homeOffice||u.division||original?.homeOffice||original?.division||'').trim();
  if(!division){alert('Operations home office is missing. Correct the AHT employee directory assignment before saving.');return false;}
  u.homeOffice=division;
  const a=actor(),box=$('ahtOpsGrants');
  if(!authorizedManaged(u)||!box||box.hidden)return true;
  const prior=Array.isArray(u.toolGrants)?u.toolGrants:[];
  const canLabels=!!(a?.canAdmin||a?.canManageInternalUsers||a?.isSystemOwner);
  const enabled=[...box.querySelectorAll('input:checked')].map(c=>c.value);
  const next=new Set(prior);
  if(canLabels){next.delete('labels');if(enabled.includes('labels'))next.add('labels');}
  if(a?.isSystemOwner)markup.forEach(k=>{next.delete(k);if(enabled.includes(k))next.add(k);});
  u.toolGrants=[...next];
  return true;
 }
 function manageRoleChange(){const select=$('adminRoleSelect');if(!select)return;
  select.addEventListener('change',()=>{
   const target=currentManaged();if(target&&ops(target)||ops({role:select.value})){const box=$('ahtOpsGrants');if(box)box.hidden=false;}
   else{const box=$('ahtOpsGrants');if(box)box.hidden=true;}
  });
 }
 function applyNavScope(){const active=ops(actor());document.body.classList.toggle('aht-ops-user',active);
  const sidebar=document.querySelector('.sidebar-nav');if(!sidebar)return;
  sidebar.querySelectorAll('button[data-view]').forEach(b=>b.classList.toggle('aht-ops-nav-hide',active&&!['operations','tools'].includes(b.dataset.view)));
  sidebar.querySelectorAll('.nav-section-label').forEach(el=>bypass(el));
  function bypass(el){const label=norm(el.textContent);el.classList.toggle('aht-ops-nav-hide',active&&!['operations','tools','support'].includes(label));}
 }
 function update(){newPosition();manageControl();applyNavScope();}
 function start(){update();manageRoleChange();const managed=$('adminUserSelect');managed?.addEventListener('change',()=>queueMicrotask(update));
  // AHT-OPS-ROLE-DROPDOWN-FIX-1: restore Operations when the employee/access
  // initializer rebuilds the Add AHT User role options after this script runs.
  const addRole=$('addAhtUserRole');
  if(addRole){
   let scheduled=false;
   new MutationObserver(()=>{
    if([...addRole.options].some(option=>option.value==='Operations'))return;
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{scheduled=false;newPosition();});
   }).observe(addRole,{childList:true,subtree:true});
   // Refresh position picker when this part of Administration is opened.
   addRole.addEventListener('focus',newPosition);
  }
  const roleLabel=$('roleLabel');if(roleLabel)new MutationObserver(applyNavScope).observe(roleLabel,{childList:true,characterData:true,subtree:true});
  const role=$('adminRoleSelect');if(role){new MutationObserver(()=>{const selected=role.value;opsRoles.forEach(r=>{if(![...role.options].some(o=>o.value===r))role.add(new Option(r,r));});if(opsRoles.includes(selected))role.value=selected;}).observe(role,{childList:true});}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
 window.AHTOpsUserUI={resolveAddRole,selectedPosition,resetNewPosition,prepareNewUser,captureManagedUser,opsRoles,isOperations:ops};
})();
