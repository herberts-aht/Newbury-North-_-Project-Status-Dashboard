/* AHT Project Forms v7 — digits-only quantity columns, auto-extend rows & continuous keyboard entry. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const sp = window.AHTProjectFormsSP;
  const BASE = Object.freeze({v:2, title:'Delivery Ticket', columns:[{id:'make',name:'Make',width:27},{id:'model',name:'Model',width:55},{id:'qty',name:'Quantity',width:18,quantity:true}],from:'AHT Global'});
  const OWNER_EMAIL = 'stace@ahtglobal.com'; // UI check only. SharePoint ACL is authoritative.
  let master = structuredClone(BASE), cols = structuredClone(BASE.columns), rows=[{}];
  let projects = [], folder = null, explorer = {driveId:'',id:null,rootId:null,siteUrl:'',rootName:'',stack:[],name:''}, issued = null;
  let actor = null, isOwner = false, changed = false, customMode = false, isBusy = false;
  const dateToday = () => new Date().toLocaleDateString('en-CA');
  $('date').value = dateToday();
  const esc = str => String(str??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = val => {const n=Number(String(val).replace(/,/g,''));return Number.isFinite(n)&&String(val).trim()!==''?n:0;};
  const alertMsg = (msg,error=false)=>{const el=$('message');el.hidden=!msg;el.textContent=msg||'';el.classList.toggle('error',error);};
  const setBusy = flag => {isBusy=flag;['saveSharePoint','preview','saveMaster'].forEach(x=>$(x).disabled=flag);};
  const project = () => projects.find(x=>x.id===$('project').value);
  const projectCode = () => {const p=project();const s=String(p?.code||p?.name||officeKey().toUpperCase()||'GENERAL');const m=s.match(/\b\d{4,8}\b/);return (m?m[0]:s.replace(/[^a-zA-Z0-9]/g,'').slice(0,14)).toUpperCase();};
  const nonblankRows = ()=>rows.filter(r=>cols.some(c=>String(r[c.id]??'').trim()));
  function updateSummary(){
    $('summaryProject').textContent=project()?.name||'Office / no project';
    $('summaryItems').textContent=String(nonblankRows().length);
    const q=cols.find(c=>c.quantity), n=q?nonblankRows().reduce((a,r)=>a+number(r[q.id]),0):null;
    $('total').textContent=q?'Total '+q.name+': '+n.toLocaleString():'';
    $('summaryQty').textContent=q?n.toLocaleString():'—';
    $('rowCount').textContent=nonblankRows().length+' item(s)';
    $('status').textContent=issued?'Issued':'Draft';
    $('ticketNo').textContent=issued?.name?.replace(/\.pdf$/i,'')||'Assigned on issue';
    $('issuedLink').hidden=!issued?.url;
    if(issued?.url)$('issuedLink').href=issued.url;
    $('folderSummary').textContent=folder?folder.driveName+' / '+folder.path:'Not selected — choose a SharePoint destination if you want to issue a PDF.';
  }
  function dirty(){ changed=true;if(issued){issued=null;$('issuedLink').hidden=true;}updateSummary(); }
  function grow(t){ if(t.tagName!=='TEXTAREA')return;t.style.height='auto';t.style.height=Math.max(31,t.scrollHeight)+'px'; }
  // A single trailing blank row supports spreadsheet-style entry. Appending that row
  // directly (instead of rebuilding the table) preserves the caret and current focus.
  function rowHasData(r){return cols.some(c=>String(r[c.id]??'').trim());}
  function focusCell(rowIndex,colIndex){
    const row=$('tableBody').rows[rowIndex];
    const cell=row?.cells[colIndex]?.querySelector('textarea, input');
    if(cell)cell.focus();
  }
  function removeRow(index,restoreFocus=false){
    rows.splice(index,1);
    if(!rows.length||rowHasData(rows[rows.length-1]))rows.push({});
    renderTable();
    dirty();
    if(restoreFocus)focusCell(Math.min(index,rows.length-1),0);
  }
  function appendTableRow(r,i){
    const body=$('tableBody'),tr=document.createElement('tr');
    for(let j=0;j<cols.length;j++){
      const c=cols[j],td=document.createElement('td'),ta=document.createElement(c.quantity?'input':'textarea');
      if(c.quantity){
        // type=text with inputmode=numeric, rather than type=number: number inputs
        // allow exponent signs, decimal separators and negative signs in browsers.
        // Quantities on this form are non-negative whole numbers only.
        ta.type='text';ta.inputMode='numeric';ta.pattern='[0-9]*';ta.autocomplete='off';
        ta.maxLength=12;
        ta.title='Quantity: whole numbers only';
        ta.addEventListener('beforeinput',event=>{
          if(event.data && /[^0-9]/.test(event.data))event.preventDefault();
        });
      }else{ta.rows=1;}
      ta.value=String(r[c.id]??'');
      ta.setAttribute('aria-label',`${c.name}, row ${i+1}`);
      ta.addEventListener('input',()=>{
        if(c.quantity && !/^[0-9]*$/.test(ta.value)){
          // Reject invalid pasted/dropped/autofilled values without changing data.
          ta.value=String(r[c.id]??'');
          return;
        }
        r[c.id]=ta.value;grow(ta);
        // Only append when the currently last row first receives actual content.
        // Never re-render here, as that would discard the field's focus/caret.
        if(i===rows.length-1&&rowHasData(r)){
          const blank={};rows.push(blank);appendTableRow(blank,rows.length-1);
        }
        dirty();
      });
      ta.addEventListener('keydown',event=>{
        if(event.altKey&&event.key==='Delete'){
          event.preventDefault();removeRow(i,true);return;
        }
        if(event.key!=='Tab'||event.altKey||event.ctrlKey||event.metaKey)return;
        if(event.shiftKey&&j===0&&i>0){
          event.preventDefault();focusCell(i-1,cols.length-1);
        }else if(!event.shiftKey&&j===cols.length-1){
          // Skip the row's remove action, staying within cells. The last EMPTY
          // row exits to Add Row, avoiding an infinite keyboard-tab trap.
          event.preventDefault();
          if(i<rows.length-1)focusCell(i+1,0);
          else $('addRow').focus();
        }
      });
      td.append(ta);tr.append(td);setTimeout(()=>grow(ta),0);
    }
    const del=document.createElement('td'),b=document.createElement('button');
    b.type='button';b.className='remove-row';b.textContent='×';
    b.title='Remove row (Alt+Delete while editing a row)';
    b.setAttribute('aria-label','Remove row '+(i+1));
    // Tab skips row-action buttons; Alt+Delete provides keyboard removal.
    b.tabIndex=-1;
    b.onclick=()=>removeRow(i);
    del.append(b);tr.append(del);body.append(tr);
  }
  function renderTable(){
    const head=$('tableHead'),body=$('tableBody');head.replaceChildren();body.replaceChildren();
    cols.forEach(c=>{const th=document.createElement('th');th.style.width=c.width+'%';th.textContent=c.name;head.append(th);});
    const actionTh=document.createElement('th');actionTh.style.width='43px';actionTh.textContent='';head.append(actionTh);
    if(!rows.length||rowHasData(rows[rows.length-1]))rows.push({});
    rows.forEach((r,i)=>appendTableRow(r,i));
    updateSummary();
  }
  function repairWidths(){const sum=cols.reduce((a,c)=>a+Number(c.width||0),0)||1;cols.forEach(c=>c.width=Math.max(5,Math.round(Number(c.width||0)/sum*100)));const diff=100-cols.reduce((a,c)=>a+c.width,0);cols[cols.length-1].width+=diff;}
  function renderLayout(){
    const target=$('columnControls');target.replaceChildren();
    cols.forEach((c,i)=>{const wrap=document.createElement('div');wrap.className='layout-col';
      const nam=document.createElement('div');
      const nameLabel=document.createElement('label');nameLabel.innerHTML='<span class="label">COLUMN NAME</span>';
      const ni=document.createElement('input');ni.value=c.name;ni.maxLength=42;
      const quantityLabel=document.createElement('label');quantityLabel.className='quantity-option';
      const quantityBox=document.createElement('input');quantityBox.type='checkbox';quantityBox.checked=!!c.quantity;
      quantityLabel.append(quantityBox,document.createTextNode('Quantity (whole numbers only)'));
      function selectQuantity(){
        // One quantity column carries the running total. Other columns remain text.
        const invalid=rows.some(r=>String(r[c.id]??'').trim()&&!/^[0-9]+$/.test(String(r[c.id]).trim()));
        if(invalid&&!confirm('This column contains text. Clear those entries to make this a numeric Quantity column?'))return false;
        if(invalid)rows.forEach(r=>{if(String(r[c.id]??'').trim()&&!/^[0-9]+$/.test(String(r[c.id]).trim()))r[c.id]='';});
        cols.forEach(other=>{other.quantity=(other===c);});
        renderLayout();renderTable();dirty();return true;
      }
      quantityBox.onchange=()=>{
        if(quantityBox.checked){if(!selectQuantity())quantityBox.checked=false;}
        else{c.quantity=false;renderTable();dirty();}
      };
      ni.oninput=()=>{
        c.name=ni.value||'Column';
        if(/^(qty|quantity|quantities)$/i.test(c.name.trim())&&!c.quantity){selectQuantity();}
        else {renderTable();dirty();}
      };
      nameLabel.append(ni);nam.append(nameLabel,quantityLabel);
      const wid=document.createElement('label');wid.innerHTML='<span class="label">WIDTH %</span>';
      const wi=document.createElement('input');wi.type='number';wi.min='5';wi.max='85';wi.value=c.width;wi.onchange=()=>{c.width=Math.max(5,Math.min(85,Number(wi.value)||10));repairWidths();renderLayout();renderTable();dirty();};wid.append(wi);
      const makebtn=(label,title,fn,disabled)=>{const b=document.createElement('button');b.className='button small light';b.title=title;b.textContent=label;b.disabled=disabled;b.onclick=fn;return b;};
      wrap.append(nam,wid,makebtn('↑','Move left',()=>{[cols[i-1],cols[i]]=[cols[i],cols[i-1]];renderLayout();renderTable();dirty();},i===0),makebtn('↓','Move right',()=>{[cols[i+1],cols[i]]=[cols[i],cols[i+1]];renderLayout();renderTable();dirty();},i===cols.length-1),makebtn('×','Delete column',()=>{cols.splice(i,1);repairWidths();renderLayout();renderTable();dirty();},cols.length<=1));target.append(wrap);
    });
  }
  function applyMaster(){cols=structuredClone(master.columns);if(!cols.some(c=>c.quantity)){const q=cols.find(c=>/^(qty|quantity|quantities)$/i.test(String(c.name||'').trim()));if(q)q.quantity=true;}repairWidths();$('from').value=master.from||'AHT Global';$('formTitle').value=master.title||'Delivery Ticket';renderTable();}
  function reset(confirmFirst=true){if(confirmFirst&&changed&&!confirm('Discard the current ticket and start a new one?'))return;rows=[{}];issued=null;changed=false;customMode=false;$('layoutPanel').hidden=true;$('editLayout').textContent='Customize This Form';['to','description','notes'].forEach(x=>$(x).value='');$('date').value=dateToday();$('project').value='';folder=null;applyMaster();updateSummary();alertMsg('');}
  function formData(){return {title:formTitle(),project:project(),date:$('date').value,to:$('to').value.trim(),from:$('from').value.trim()||'AHT Global',description:$('description').value.trim(),notes:$('notes').value.trim(),columns:structuredClone(cols),rows:structuredClone(nonblankRows())};}
  function validate(){
    const q=cols.find(c=>c.quantity);
    if(q){const bad=rows.findIndex(r=>String(r[q.id]??'').trim() && !/^[0-9]+$/.test(String(r[q.id]).trim()));
      if(bad>=0){alertMsg('Quantity must contain whole numbers only (row '+(bad+1)+').',true);focusCell(bad,cols.indexOf(q));return false;}}
    if(!formTitle()){alertMsg('Enter a form name.',true);$('formTitle').focus();return false;}if(!$('date').value){alertMsg('Enter the date.',true);return false;}if(!$('to').value.trim()){alertMsg('Enter the recipient.',true);return false;}if(!nonblankRows().length){alertMsg('Add at least one line item.',true);return false;}return true;}
  function storedFolderKey(){return 'aht-project-forms-folder:'+location.host+':'+(project()?.id||'office-'+officeKey());}
  function setFolder(value){folder=value;updateSummary();if(value)try{localStorage.setItem(storedFolderKey(),JSON.stringify(value));}catch(_){}}
  function onProjectChanged(){if(issued)issued=null;folder=null;/* Do not reuse a stale SharePoint folder without verifying project/office context. */changed=true;updateSummary();}
  function updateProjectList(){
    const select=$('project'), old=select.value;select.replaceChildren();select.add(new Option('Select project…',''));
    for(const p of projects)select.add(new Option(p.name,p.id));if(projects.some(p=>p.id===old))select.value=old;
    updateSummary();
  }
  function formTitle(){return String($('formTitle').value||'').trim().replace(/\s+/g,' ').slice(0,72);}
  function slugTitle(){return formTitle().replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,55)||'Project-Form';}
  function officeKey(){const ctx=sp.context;const a=String(ctx.homeOffice||actor?.officeLocation||'').trim().toLowerCase();return a.replace(/[^a-z0-9]/g,'');}
  function documentCode(){const t=formTitle().toLowerCase();return {'delivery ticket':'DT','equipment handoff':'EH','material transfer':'MT','receiving report':'RR'}[t]||'PF';}
  function officeFolderSpec(requestedOffice){
    const map=sp.context.folderRoots?.offices||{};const office=String(requestedOffice||officeKey()).toLowerCase().replace(/[^a-z0-9]/g,'');
    if(!office)return null;
    let value=Object.entries(map).find(([name])=>name.toLowerCase().replace(/[^a-z0-9]/g,'')===office)?.[1];
    if(!value && /naples|aspen/.test(office))value=Object.entries(map).find(([name])=>{const k=name.toLowerCase().replace(/[^a-z0-9]/g,'');return k.length>=4&&(office.includes(k)||k.includes(office));})?.[1];
    return value||null;
  }
  async function folderStart(){
    const ctx=sp.context,p=project(),map=ctx.folderRoots?.projects||{};
    if(p){
      const spec=p.folderUrl||p.folderSpec||map[p.id]||map[p.code]||map[p.name];
      if(spec)return {...(await sp.resolveFolderSpec(spec)),context:'Project: '+p.name};
      // Discover an exact, unambiguous project folder in verified branch Projects
      // libraries. Never start at a random library or silently choose a near match.
      const options=[officeFolderSpec(p.office),officeFolderSpec(),...Object.values(ctx.folderRoots?.offices||{})].filter(Boolean);
      const unique=[...new Set(options.map(x=>typeof x==='string'?x:JSON.stringify(x)))];
      const compact=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
      const pName=compact(p.name),pCode=compact(p.code);let candidates=[];
      for(const spec of unique){
        try{const root=await sp.resolveFolderSpec(typeof spec==='string'?spec:JSON.parse(spec));
          const items=(await sp.children(root.driveId,root.folderId)).filter(x=>x.folder);
          const exact=items.filter(f=>{
            const name=compact(f.name);
            // Address/full project title is authoritative; short job number only when
            // the long text does not match (to avoid cross-project false positives).
            return pName.length>=8&&name.includes(pName);
          });
          const hits=exact.length?exact:items.filter(f=>pCode.length>=4 && compact(f.name).includes(pCode));
          for(const f of hits)candidates.push({...root,folderId:f.id,path:[root.path,f.name].filter(Boolean).join('/'),rootName:f.name,context:'Project: '+p.name});
        }catch(e){/* An inaccessible branch or deleted mapping does not grant access. */}
      }
      if(candidates.length===1)return candidates[0];
      if(candidates.length>1)throw new Error('More than one SharePoint folder matches this project. Ask the site owner to provide its exact root URL.');
      throw new Error('No matching project folder was verified in the branch Projects libraries. Ask the site owner to map this project’s document root.');
    }
    const root=officeFolderSpec();
    if(!root)throw new Error('No home-office SharePoint root is configured'+(officeKey()?' for '+(sp.context.homeOffice||actor?.officeLocation):' for this account')+'. Ask the site owner to map your office folder.');
    return {...(await sp.resolveFolderSpec(root)),context:'Home office: '+(sp.context.homeOffice||actor?.officeLocation)};
  }
  function initButtons(){
    $('addRow').onclick=()=>{const blank={};rows.push(blank);appendTableRow(blank,rows.length-1);dirty();};
    $('editLayout').onclick=()=>{customMode=!customMode;$('layoutPanel').hidden=!customMode;$('editLayout').textContent=customMode?'Close Layout Editor':'Customize This Form';if(customMode)renderLayout();};
    $('doneLayout').onclick=()=>$('editLayout').click();
    $('addColumn').onclick=()=>{if(cols.length>=10){alertMsg('Maximum 10 columns per document.',true);return;}const id='col_'+crypto.randomUUID().replaceAll('-','').slice(0,10);cols.push({id,name:'New Column',width:12});repairWidths();renderLayout();renderTable();dirty();};
    $('resetForm').onclick=()=>reset(true);
    $('project').onchange=onProjectChanged;
    ['formTitle','date','to','from','description','notes'].forEach(id=>$(id).addEventListener('input',dirty));
    $('preview').onclick=async()=>{if(!validate())return;setBusy(true);try{const blob=await PDF.make(formData(),'DRAFT PREVIEW');download(blob,projectCode()+'-'+slugTitle()+'-PREVIEW.pdf');alertMsg('Preview PDF downloaded. It has not been stored or issued.');}catch(e){alertMsg(e.message,true);}finally{setBusy(false);}};
    $('saveSharePoint').onclick=issue;
    $('saveMaster').onclick=saveMaster;
    $('chooseFolder').onclick=chooseFolder;
    $('sharePointHelp').onclick=()=>{const el=$('sharePointExplanation');el.hidden=!el.hidden;};
    $('requestTemplate').onclick=()=>$('requestDialog').showModal();
    $('closeRequest').onclick=()=>$('requestDialog').close();
    $('sendRequest').onclick=sendRequest;
    $('closeFolder').onclick=()=>$('folderDialog').close();
    $('folderUp').onclick=()=>{if(explorer.stack.length){const p=explorer.stack.pop();explorer.id=p.id;explorer.name=p.name;showFolders();}};
    $('useFolder').onclick=()=>{if(!explorer.id)return;setFolder({driveId:explorer.driveId,folderId:explorer.id,driveName:explorer.driveName||'Documents',path:[explorer.rootPath,...explorer.stack.map(x=>x.name).slice(1),explorer.name===explorer.rootName?'':explorer.name].filter(Boolean).join('/'),siteUrl:explorer.siteUrl});$('folderDialog').close();alertMsg('SharePoint destination selected.');};
    window.addEventListener('beforeunload',e=>{if(changed&&!issued){e.preventDefault();e.returnValue='';}});
  }
  async function chooseFolder(){
    if(!sp.connected){alertMsg('SharePoint is unavailable in this session. Preview / Print PDF remains available.',true);return;}
    $('folderDialog').showModal();$('folderList').textContent='Resolving your authorized SharePoint folder…';$('driveChooser').replaceChildren();
    $('useFolder').disabled=true;
    try{
      const root=await folderStart();
      explorer={driveId:root.driveId,driveName:root.driveName,siteUrl:root.siteUrl,
        id:root.folderId,rootId:root.folderId,rootPath:root.path||root.rootName||'',
        rootName:root.rootName||root.path?.split('/').pop()||'Project Documents',name:root.rootName||root.path?.split('/').pop()||'Project Documents',stack:[]};
      $('driveChooser').textContent=root.context+' — '+(root.driveName||'Documents');
      $('driveChooser').className='folder-context';
      $('useFolder').disabled=false;
      await showFolders();
    }catch(e){$('folderList').textContent=e.message;$('folderPath').textContent='No verified starting folder';$('driveChooser').textContent='No documents will be written until the location is resolved.';alertMsg(e.message,true);}
  }
  async function showFolders(){
    $('folderPath').textContent=[explorer.rootPath,...explorer.stack.map(x=>x.name).slice(1),explorer.id===explorer.rootId?'':explorer.name].filter(Boolean).join(' / ');
    $('folderUp').disabled=explorer.stack.length===0;
    $('folderList').textContent='Loading folders…';
    try{const list=(await sp.children(explorer.driveId,explorer.id)).filter(x=>!!x.folder).sort((a,b)=>a.name.localeCompare(b.name));
      $('folderList').replaceChildren();if(!list.length)$('folderList').textContent='No subfolders. You may use this folder.';
      for(const f of list){const b=document.createElement('button');b.className='folder-item';b.textContent='📁  '+f.name;b.onclick=()=>{explorer.stack.push({id:explorer.id,name:explorer.name});explorer.id=f.id;explorer.name=f.name;showFolders();};$('folderList').append(b);}
    }catch(e){$('folderList').textContent=e.message;}
  }
  async function sendRequest(){
    const details=$('requestDetails').value.trim();if(details.length<10){alertMsg('Describe the requested template change before submitting.',true);return;}
    const payload={title:formTitle(),project:project()?.name||'No project',details};
    $('sendRequest').disabled=true;
    try{
      const result=await window.parent.AHTProjectFormsHost?.submitTemplateRequest?.(payload);
      if(result?.id){$('requestDialog').close();$('requestDetails').value='';alertMsg('Master-template request HELP-'+result.id+' created in the AHT Help queue for owner review.');return;}
      throw new Error('Help queue is unavailable');
    }catch(e){
      // No Mail.Send permission requested. A mailto draft is explicit user action, not a sent message.
      const subject='AHT Project Forms — Master Template Change Request';
      const body=['Form: '+payload.title,'Project: '+payload.project,'Requested by: '+(sp.context.user?.name||actor?.displayName||''),'',details,'','Submitted from AHT Project Control'].join('\n');
      const url='mailto:'+OWNER_EMAIL+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
      const anchor=document.createElement('a');anchor.href=url;anchor.style.display='none';document.body.append(anchor);anchor.click();anchor.remove();
      $('requestDialog').close();alertMsg('A preaddressed email draft was opened for the site owner. You must send the email to submit your request.');
    }finally{$('sendRequest').disabled=false;}
  }
  async function saveMaster(){
    if(!isOwner){alertMsg('Only the designated site owner may change the master template.',true);return;}
    if(!sp.context.masterFile){alertMsg('A restricted master file must first be configured in SharePoint. See SETUP.md.',true);return;}
    if(!confirm('Update the default form name and column layout for all FUTURE project forms? Existing issued PDFs will not change.'))return;
    setBusy(true);try{const updated={v:2,title:formTitle(),columns:structuredClone(cols),from:$('from').value.trim()||'AHT Global'};await sp.setMaster(updated);master=updated;alertMsg('Master template saved to SharePoint. Future tickets will use the new layout.');}catch(e){alertMsg(e.message,true);}finally{setBusy(false);}
  }
  async function issue(){
    if(!validate())return;
    if(!folder){alertMsg('Choose a SharePoint destination before issuing.',true);return;}
    if(!sp.connected){alertMsg('SharePoint upload is not connected. Preview PDF remains available.',true);return;}
    if(!confirm('Issue this '+formTitle()+' as a new PDF in the selected SharePoint folder?'))return;
    setBusy(true);
    try{
      const names=(await sp.children(folder.driveId,folder.folderId)).map(x=>x.name||'');
      const prefix=projectCode()+'-'+documentCode()+'-';const used=names.map(n=>n.match(new RegExp('^'+prefix+'(\\d{4})\\.pdf$','i'))).filter(Boolean).map(m=>Number(m[1]));let next=Math.max(0,...used)+1;
      for(let tries=0;tries<8;tries++,next++){
        const ref=prefix+String(next).padStart(4,'0');const name=ref+'.pdf';const blob=await PDF.make(formData(),ref);
        try {const item=await sp.issuePDF(folder.driveId,folder.folderId,name,blob);issued={name,url:item.webUrl||''};changed=false;updateSummary();alertMsg('Issued '+ref+' to SharePoint. Open the document using the link on the right.');return;}
        catch(e){if(/409|conflict|already exists/i.test(e.message))continue;throw e;}
      }
      throw new Error('Could not reserve a unique ticket number. Try issuing again.');
    }catch(e){alertMsg(e.message,true);}finally{setBusy(false);}
  }
  function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);}
  async function initialize(){
    initButtons();try{
      const ctx=sp.context;
      projects=ctx.projects||[];updateProjectList();
      if(sp.connected){
        try{actor=await sp.me();const mail=(actor.mail||actor.userPrincipalName||'').toLowerCase();isOwner=(mail===OWNER_EMAIL);$('connection').textContent='Signed in: '+(actor.displayName||mail||'AHT user');$('saveMaster').hidden=!isOwner;}
        catch(e){$('connection').textContent='SharePoint connection requires sign-in';alertMsg('Project Forms is available for PDF previews. SharePoint features: '+e.message,true);}
        if(ctx.masterFile && actor){try{const x=await sp.getMaster();if(x?.columns?.length&&x.columns.length<=10){master=x;applyMaster();}}catch(e){alertMsg('Could not read master template: '+e.message,true);}}
      }else{$('connection').textContent='Standalone preview · SharePoint not connected';}
    }catch(e){alertMsg(e.message,true);}renderTable();
  }
  initialize();
  // Browser-native PDF generation. Letter-size, multi-page, AHT-branded; no CDN or server.
  const PDF = (()=>{
    const W=1275,H=1650,M=75,CONTENT=W-2*M,END=1510;
    let logoPromise;
    function logo(){if(!logoPromise)logoPromise=new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src='aht-project-forms-logo.png';});return logoPromise;}
    function wrap(ctx,text,maxW){
      const lines=[];const paragraphs=String(text??'').split(/\r?\n/);
      for(const p of paragraphs){if(!p){lines.push('');continue;}let current='';for(const word of p.split(/\s+/)){
        const test=current?current+' '+word:word;
        if(ctx.measureText(test).width<=maxW){current=test;continue;}
        if(current){lines.push(current);current='';}
        if(ctx.measureText(word).width<=maxW){current=word;continue;}
        let fragment='';for(const ch of word){if(fragment && ctx.measureText(fragment+ch).width>maxW){lines.push(fragment);fragment=ch;}else fragment+=ch;}current=fragment;
      }if(current)lines.push(current);}return lines.length?lines:[''];
    }
    function ctxColor(ctx,color){ctx.fillStyle=color;}
    function fill(ctx,text,x,y,sz=19,color='#1f3c4f',weight='normal'){ctx.font=`${weight} ${sz}px Arial, sans-serif`;ctxColor(ctx,color);ctx.fillText(String(text),x,y);}
    async function render(data,reference){
      const img=await logo(),pages=[];let canvas,ctx,y=0,pageNo=0;
      function page(){
        if(canvas){pages.push(canvas.toDataURL('image/jpeg',.87));}
        canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;ctx=canvas.getContext('2d');pageNo++;
        ctxColor(ctx,'#ffffff');ctx.fillRect(0,0,W,H);
        ctxColor(ctx,'#102a3b');ctx.fillRect(0,0,W,140);
        if(img){ctx.drawImage(img,M,20,220,93);}else fill(ctx,'AHT GLOBAL',M,75,40,'#ffffff','bold');
        ctx.textAlign='right';fill(ctx,'AHT GLOBAL',W-M,56,17,'#ffffff','bold');fill(ctx,'LIFESTYLE TECHNOLOGY',W-M,90,12,'#8bb9d7');ctx.textAlign='left';
        let titleSize=37;do{ctx.font=`bold ${titleSize}px Arial, sans-serif`;if(ctx.measureText(data.title.toUpperCase()).width<CONTENT)break;titleSize-=2;}while(titleSize>20);fill(ctx,data.title.toUpperCase(),M,207,titleSize,'#102a3b','bold');
        fill(ctx,reference,M,242,17,'#0088c7','bold');
        ctxColor(ctx,'#e3edf3');ctx.fillRect(M,268,CONTENT,2);
        fill(ctx,'PROJECT / OFFICE',M,294,13,'#60798a','bold');fill(ctx,'DATE',675,294,13,'#60798a','bold');
        fill(ctx,data.project?.name||'General / Office',M,325,23,'#1a3648','bold');fill(ctx,data.date,675,325,22);
        fill(ctx,'RECIPIENT / FOR',M,359,13,'#60798a','bold');fill(ctx,'FROM / PREPARED BY',675,359,13,'#60798a','bold');
        fill(ctx,data.to,M,386,19);fill(ctx,data.from,675,386,19);
        y=425;
        if(data.description){ctx.font='16px Arial';const description=wrap(ctx,data.description,CONTENT-160);
          fill(ctx,'DETAILS / REFERENCE',M,y,13,'#60798a','bold');y+=8;
          for(const line of description){y+=19;fill(ctx,line,M,y,16);}
          y+=15;
        }
      }
      function tableHeader(){const top=y;ctxColor(ctx,'#102a3b');ctx.fillRect(M,top,CONTENT,37);let x=M;
        for(const c of data.columns){const width=CONTENT*c.width/100;fill(ctx,c.name,x+11,top+24,17,'#ffffff','bold');x+=width;}
        y+=37;
      }
      function nextWithHeader(){page();tableHeader();}
      function drawRow(row){
        let cwX=M;
        const cellLines=data.columns.map(c=>{const w=CONTENT*c.width/100;ctx.font='17px Arial';const lines=wrap(ctx,row[c.id]??'',Math.max(20,w-22));cwX+=w;return lines;});
        let idx=0,total=Math.max(...cellLines.map(x=>x.length),1);
        while(idx<total){
          let available=Math.floor((END-y-21)/23);
          if(available<1){nextWithHeader();available=Math.floor((END-y-21)/23);}
          const count=Math.min(available,total-idx),h=Math.max(39,count*23+17);
          ctxColor(ctx,(data._rowIndex%2===0)?'#f1f6fa':'#ffffff');ctx.fillRect(M,y,CONTENT,h);
          let x=M;data.columns.forEach((c,ci)=>{
            const width=CONTENT*c.width/100;
            ctxColor(ctx,'#dbe5eb');ctx.fillRect(x+width-1,y,1,h);
            for(let l=0;l<count;l++)fill(ctx,cellLines[ci][idx+l]??'',x+10,y+26+l*23,17,'#1a3545');
            x+=width;
          });
          ctxColor(ctx,'#dbe5eb');ctx.fillRect(M,y+h-1,CONTENT,1);y+=h;idx+=count;
          if(idx<total)nextWithHeader();
        }
      }
      function ensure(height){if(y+height>END)page();}
      page();tableHeader();
      for(let i=0;i<data.rows.length;i++){data._rowIndex=i;drawRow(data.rows[i]);}
      const qty=data.columns.find(c=>c.quantity);
      if(qty){ensure(58);ctxColor(ctx,'#e4f0f7');ctx.fillRect(M,y,CONTENT,49);
        fill(ctx,'TOTAL '+qty.name.toUpperCase(),M+13,y+31,17,'#0d3f63','bold');
        const v=data.rows.reduce((a,r)=>a+number(r[qty.id]),0).toLocaleString();ctx.textAlign='right';fill(ctx,v,W-M-16,y+31,21,'#0d3f63','bold');ctx.textAlign='left';y+=64;}
      if(data.notes){
        ensure(58);fill(ctx,'NOTES / EXCEPTIONS',M,y+21,17,'#153d58','bold');y+=38;
        ctx.font='17px Arial';const lines=wrap(ctx,data.notes,CONTENT-8);
        for(const line of lines){if(y+27>END)page();fill(ctx,line,M,y+19,17);y+=25;}y+=8;
      }
      // Keep the acknowledgement in one piece, with a generous gap from notes/quantity.
      const ackHeight=224;
      if(y+70+ackHeight>END)page();
      y+=70;
      fill(ctx,'ACKNOWLEDGEMENT',M,y+17,18,'#153d58','bold');y+=45;
      const gap=42, colW=(CONTENT-gap)/2, left1=M, left2=M+colW+gap;
      ctxColor(ctx,'#eff6fa');ctx.fillRect(M,y,CONTENT,28);
      fill(ctx,'PREPARED / GIVEN BY',left1+9,y+19,15,'#184b6b','bold');
      fill(ctx,'RECEIVED / ACCEPTED BY',left2+9,y+19,15,'#184b6b','bold');
      y+=48;
      for(const x of [left1,left2]){
        fill(ctx,'Print name',x,y+15,14,'#537083');
        ctxColor(ctx,'#718b9a');ctx.fillRect(x,y+48,colW,1);
        fill(ctx,'Signature',x,y+72,14,'#537083');
        const dateW=139,dateX=x+colW-dateW;
        ctxColor(ctx,'#718b9a');ctx.fillRect(x,y+111,colW-dateW-20,1);ctx.fillRect(dateX+42,y+111,dateW-42,1);
        fill(ctx,'Date',dateX,y+108,15,'#405e72','bold');
      }
      y+=143;
      pages.push(canvas.toDataURL('image/jpeg',.87));
      for(let i=0;i<pages.length;i++){
        // Footers are drawn before export to avoid changing page numbers after JPEG generation.
        const im=new Image();await new Promise(ok=>{im.onload=ok;im.src=pages[i];});
        canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
        ctxColor(ctx,'#c7d7e1');ctx.fillRect(M,1587,CONTENT,1);
        fill(ctx,'AHT GLOBAL  /  PROJECT FORMS  /  '+reference,M,1621,13,'#60798a','bold');
        ctx.textAlign='right';fill(ctx,String(i+1)+' / '+pages.length,W-M,1621,14,'#60798a');ctx.textAlign='left';
        pages[i]=canvas.toDataURL('image/jpeg',.87);
      }
      return pages;
    }
    function binaryPDF(urls){
      const enc=new TextEncoder(),parts=[],offsets=[0];let size=0;
      const add=(v)=>{const b=typeof v==='string'?enc.encode(v):v;parts.push(b);size+=b.length;};
      const obj=(n,content)=>{offsets[n]=size;add(n+' 0 obj\n');content();add('\nendobj\n');};
      add('%PDF-1.4\n% AHT Project Forms\n');const n=urls.length;
      obj(1,()=>add('<< /Type /Catalog /Pages 2 0 R >>'));
      obj(2,()=>add('<< /Type /Pages /Kids ['+urls.map((_,i)=>3+i*3+' 0 R').join(' ') +'] /Count '+n+' >>'));
      for(let i=0;i<n;i++){
        const pg=3+i*3,im=pg+1,stream=pg+2;
        const raw=atob(urls[i].slice(urls[i].indexOf(',')+1));const bytes=new Uint8Array(raw.length);for(let j=0;j<raw.length;j++)bytes[j]=raw.charCodeAt(j);
        const cmds='q\n612 0 0 792 0 0 cm\n/Im1 Do\nQ\n';
        obj(pg,()=>add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 ${im} 0 R >> >> /Contents ${stream} 0 R >>`));
        obj(im,()=>{add(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);add(bytes);add('\nendstream');});
        obj(stream,()=>add(`<< /Length ${enc.encode(cmds).length} >>\nstream\n${cmds}endstream`));
      }
      const start=size;add('xref\n0 '+(3+n*3)+'\n0000000000 65535 f \n');for(let i=1;i<3+n*3;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
      add('trailer\n<< /Size '+(3+n*3)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n');
      return new Blob(parts,{type:'application/pdf'});
    }
    return {make:async(data,ref)=>binaryPDF(await render(data,ref))};
  })();
})();
