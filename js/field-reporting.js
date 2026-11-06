/* AHT Field Reporting v2.9 — PM-focused, read-only AI findings with explicit approval.
 * Uses existing Microsoft sign-in and SharePointDataProvider.
 * Applies an explicit, previewed update to one project record only after PM confirmation.
 * AI is read-only. Automatic speech transcription, Teams alerts and project updates remain unavailable.
 */
(function () {
  'use strict';
  const root = document.getElementById('fieldReporting');
  const nav = document.querySelector('.sidebar-nav [data-view="fieldReporting"]');
  if (!root || !nav) return;
  const REPORTS = 'AHT Field Reports';
  const AUDIO = 'AHT Field Report Audio';
  const $ = id => root.querySelector('#' + id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const norm = v => String(v ?? '').trim().toLowerCase();
  const dateText = v => { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}) : 'Unknown time'; };
  // SharePoint TargetDate is a date-only business value even when Graph sends an ISO timestamp.
  const targetDateText = value => {const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})/);if(!m)return value?'Date unavailable':'Not set';const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));return Number.isFinite(d.getTime())?d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'Date unavailable';};
  let tab = 'capture', mounted = false, loading = false, submitting = false, records = [], errorText = '';
  let recorder = null, mediaStream = null, recordedBlob = null, chunks = [], recordTimer = null, started = 0;
  let activeAudioUrl = null, loadSerial = 0, pendingUpload = null;
  const relatedStates = new Map(), relatedProjectCache = new Map();
  const proposalSelections = new Map(), proposalPreviews = new Map();
  const draftPreviews = new Map();
  const reviewPreviews = new Map();
  const workflowSteps = new Map();
  const aiStates = new Map();
  const transcriptDrafts = new Map(); // PM-only, browser-session drafts until explicitly saved.
  const draftAutoFilled = new Set();
  let activeReviewId = '';
  const actor = () => { try { return typeof currentUser === 'undefined' ? null : currentUser; } catch (_) { return null; } };
  function role(u) {
    const r = norm(u?.role);
    if (['admin', 'administrator', 'project admin'].includes(r) || u?.canAdmin === true || u?.canProjectAdmin === true) return 'pm';
    if (['editor', 'internal editor'].includes(r) && u?.canEdit === true) return 'tech';
    return '';
  }
  function permitted() {
    const u = actor();
    return Boolean(u && u.active !== false && u.isInternal !== false && u.accessProfileSyncError !== true && norm(u.entraUserType) !== 'guest' && role(u));
  }
  const reviewer = () => role(actor()) === 'pm' && permitted();
  const identity = () => norm(actor()?.email || actor()?.mail || actor()?.userPrincipalName || '');
  const displayName = () => String(actor()?.name || identity() || 'AHT employee');
  function projects() {
    if (!permitted()) return [];
    try { if (typeof allowedProjects === 'function') {
      const p = allowedProjects();
      return Array.isArray(p) ? p.filter(x => x && !x.archived) : [];
    }} catch (_) { /* no inferred projects */ }
    return [];
  }
  const projectIds = () => new Set(projects().map(p => String(p.id)));
  const projectName = id => projects().find(p => String(p.id) === String(id))?.name || '(project unavailable)';
  function provider() {
    if (typeof APP_CONFIG === 'undefined' || APP_CONFIG.dataProvider !== 'sharePoint' ||
        typeof SharePointDataProvider === 'undefined' || typeof window.getMicrosoftAccessToken !== 'function') {
      throw Error('Microsoft SharePoint provider is not active. Field reports cannot be saved.');
    }
    return SharePointDataProvider;
  }
  // Candidate lookup is only a source-linked reference search, never an AI determination or task update.
  const referenceLists = [
    { name: 'Project Work Items', label: 'Project Plan', kind: 'work' },
    { name: 'Deliverables', label: 'Deliverable', kind: 'deliverable' },
    { name: 'Information Required', label: 'Information Required', kind: 'information' }
  ];
  function keywords(text) {
    const ignore = new Set(['about','after','again','already','also','been','before','could','did','does','done','from','have','just','more','need','needed','only','ours','over','please','report','said','says','some','talked','that','them','there','these','they','this','those','today','told','were','what','when','where','which','with','would','your','russell','client','meeting','approved','approve','approval','confirmed','confirm','completed','complete','finished','work','the','and','are','for','our','was','we','has','his','her','its','but','not','all','got','get','will','can']);
    return [...new Set(String(text || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').split(' ').map(t => t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0,-1) : t).filter(t => t.length >= 3 && !ignore.has(t)))];
  }
  function shortText(v, max=210) {const s=String(v || '').replace(/\s+/g,' ').trim();return s.length>max?s.slice(0,max-1).trimEnd()+'…':s;}
  function candidatesFor(report, source) {
    const tokens = keywords(report.original);
    if (tokens.length < 2) return [];
    const wantsIndoor = tokens.includes('indoor');
    return source.records.map(row => {
      const f = row.fields || {}, title = String(f.Title || ''), status = String(f.WorkStatus || f.OperationalStatus || f.RequestStatus || 'Not specified');
      const description = source.kind === 'work' ? [f.InformationRequired, f.Workstream, f.SystemName].filter(Boolean).join(' ') :
        source.kind === 'deliverable' ? [f.CurrentActivity,f.NextStep,f.WaitingOn,f.Risk].filter(Boolean).join(' ') :
        [f.Notes,f.Blocking,f.RequestedFrom].filter(Boolean).join(' ');
      const nameTokens = new Set(keywords(title));
      const detailTokens = new Set(keywords(description));
      const matches = tokens.filter(t => nameTokens.has(t) || detailTokens.has(t));
      if (matches.length < 2) return null;
      const outdoorOnly = wantsIndoor && /\boutdoor\b/i.test(title) && !/\bindoor\b/i.test(title+' '+description);
      const titleHits = matches.filter(t=>nameTokens.has(t)).length;
      const score = (titleHits * 4) + (matches.length - titleHits) + (source.kind === 'deliverable' ? 0.4 : 0) - (outdoorOnly ? 5 : 0);
      return {source:source.label,kind:source.kind,title,status,description:shortText(description),matches,score,outdoorOnly,url:row.webUrl || '',id:String(row.id)};
    }).filter(Boolean).sort((a,b)=>b.score-a.score);
  }
  function verifiedSourceUrl(url,siteUrl) {
    try {const u=new URL(url), s=new URL(siteUrl);return u.protocol==='https:' && u.origin===s.origin && u.pathname.toLowerCase().startsWith(s.pathname.toLowerCase().replace(/\/$/,'')+'/')?u.href:'';}catch(_){return '';}
  }
  async function loadProjectReferences(projectId) {
    if (relatedProjectCache.has(projectId)) return relatedProjectCache.get(projectId);
    const task = (async () => {
      const p=provider(), site=await p.getSite();
      const projectRows=await p.getListRows('Projects');
      const project=projectRows.find(x => String(x.fields?.ProjectKey || '')===String(projectId) || String(x.id)===String(projectId));
      if (!project) throw Error('Project not found in the SharePoint Projects list. No cross-project search was performed.');
      const key=String(project.fields?.ProjectKey || ''), lookupId=String(project.id);
      if (!key) throw Error('Project key is missing; cannot safely scope related records.');
      const settled=await Promise.allSettled(referenceLists.map(async spec => ({spec,rows:await p.getListRows(spec.name)})));
      let successful=0;const records=[],warnings=[];
      for (let i=0;i<settled.length;i++) {
        const r=settled[i], spec=referenceLists[i];
        if(r.status!=='fulfilled') {warnings.push(spec.label+' unavailable');continue;}
        successful++;
        const matches=r.value.rows.filter(row=>{
          const f=row.fields || {};
          if(f.Archived===true || String(f.Archived).toLowerCase()==='true')return false;
          return spec.kind==='work' ? String(f.ProjectKey || '')===key || String(f.ProjectSharePointId || '')===lookupId : String(f.ProjectLookupId || '')===lookupId;
        });
        records.push({label:spec.label,kind:spec.kind,records:matches});
      }
      if(!successful) throw Error('Project reference lists could not be read using this Microsoft account.');
      return {siteUrl:site.webUrl || '',records,warnings};
    })();
    relatedProjectCache.set(projectId,task);
    try {return await task;}catch(e){relatedProjectCache.delete(projectId);throw e;}
  }
  function refreshRelatedDisplay(report){
    const box=[...root.querySelectorAll('.fr-report[data-report]')].find(x=>x.dataset.report===report.id);
    const current=box?.querySelector('.fr-related');if(!current)return;
    const wrapper=document.createElement('div');wrapper.innerHTML=referenceHtml(report);
    current.replaceWith(wrapper.firstElementChild);
  }
  async function findRelated(report, force=false) {
    if (!reviewer() || !projectIds().has(report.projectId)) return;
    const existing=relatedStates.get(report.id);
    if(existing?.state==='loading')return existing.promise;
    if(existing?.state==='ready'&&!force)return;
    if(force)relatedProjectCache.delete(report.projectId);
    const state={state:'loading',items:[],warnings:[],promise:null};
    relatedStates.set(report.id,state);refreshRelatedDisplay(report);
    const search=(async()=>{
      try{
        if(!String(report.original||'').trim())throw Error('Audio-only report: typed notes or a transcript are required to search report meaning.');
        const index=await loadProjectReferences(report.projectId);
        const found=index.records.flatMap(group=>candidatesFor(report,group)).filter(x=>verifiedSourceUrl(x.url,index.siteUrl));
        found.sort((x,y)=>y.score-x.score);
        relatedStates.set(report.id,{state:'ready',items:found.slice(0,5).map(x=>({...x,url:verifiedSourceUrl(x.url,index.siteUrl)})),warnings:index.warnings,manual:false,allItems:[]});
      }catch(e){relatedStates.set(report.id,{state:'error',error:String(e.message||e),items:[],warnings:[]});}
      refreshRelatedDisplay(report);
    })();
    state.promise=search;
    return search;
  }
  // Local, conservative intent hint. This is NOT an AI analysis service.
  function reportIntent(text) {
    const s=String(text||'').toLowerCase();
    if (/\b(might|maybe|probably|think|possibly|unsure|uncertain|not sure|don't know|do not know)\b/.test(s)) return {action:'none',why:'Uncertain report wording'};
    if (/\b(not finished|not complete|wasn't complete|isn't complete|still working|still waiting|waiting on|not installed|not approved)\b/.test(s)) return {action:'none',why:'Report indicates unfinished or blocked work'};
    // A speaker MODEL approval must never be misread as completed speaker INSTALLATION.
    if (/\b(approved|approval|selected|chosen|confirmed|changed|revised|switched|replaced|agreed)\b/.test(s)) return {action:'record',why:'Reported decision or change—not installation completion'};
    if (/\b(finished|completed|complete|installed|tested|commissioned|pulled|terminated|done)\b/.test(s)) return {action:'complete',why:'Reported completion; PM must verify full task scope'};
    return {action:'none',why:'No clear project-record action in the report'};
  }
  function availableTargets(report){
    const state=relatedStates.get(report.id);
    if(state?.state!=='ready')return [];
    const all=[...(state.items||[]),...(state.manual?(state.allItems||[]):[])];
    const seen=new Set();
    return all.filter(x=>{const key=x.kind+'|'+x.id;if(seen.has(key))return false;seen.add(key);return (x.kind==='work'||x.kind==='deliverable')&&!x.outdoorOnly;});
  }
  function selectedProposal(report){
    const saved=proposalSelections.get(report.id);
    if(saved) return saved;
    const intent=reportIntent(report.original), targets=availableTargets(report);
    const first=targets[0], second=targets[1];
    // Require a clear title match and a real lead to suggest a default target.
    const unique=first && first.matches.length>=2 && first.score>=7 && (!second || first.score-second.score>=3);
    return {target:unique?(first.kind+'|'+first.id):'',action:intent.action};
  }
  // v2.3: A report can hold several project-specific proposed actions.
  // ReviewPlan is a SharePoint Note field, not a browser-only cache.
  function readPlan(value) {
    if (!value) return [];
    const rows = JSON.parse(value);
    if (!Array.isArray(rows) || rows.length>40 || rows.some(x=>!x||!x.id||!x.action||!x.state)) throw Error('Invalid saved PM plan; ask an administrator to inspect it.');
    return rows;
  }
  function planFor(r){try{return readPlan(r.plan);}catch(_){return null;}}
  function planMarkup(r){
    if(r.status==='Uploading Audio')return '';
    const plan=planFor(r), hint=reportIntent(r.original), related=relatedStates.get(r.id);
    if(plan===null)return '<section class="fr-pm-proposal"><strong>Saved PM plan cannot be read. No changes are allowed.</strong></section>';
    // Action-specific matching records are populated by syncDraftTarget().
    const rows=plan.map((a,i)=>{
      const preview=reviewPreviews.get(r.id+'|'+a.id);
      const label= a.action==='complete'?'Mark complete':a.action==='record'?'Replace deliverable Current Activity with confirmed decision':a.action==='newTask'?'Create task':a.action==='newMilestone'?'Create milestone':'Unresolved / clarify';

      return `<div class="fr-plan-entry" data-plan-id="${esc(a.id)}" data-plan-state="${esc(a.state)}"><div class="fr-plan-heading"><strong>${i+1}. ${esc(label)}</strong><span class="fr-pill ${a.state==='applied'?'is-done':a.state==='clarification'?'is-question':''}">${esc(a.state)}</span></div>
        <div class="fr-muted">${esc(a.targetName||a.title||'No matching record selected')}${a.note?' · '+esc(shortText(a.note,180)):''}</div>
        ${a.action==='unknown'&&a.state==='proposed'?'<div class="fr-muted">Uncertain: no project write is allowed. Choose Clarify or Reject.</div>':''}
        ${a.action==='record'&&a.state==='proposed'&&!a.replacement?'<div class="fr-plan-warning">Older proposal: replacement wording is missing. Reject it and add a new proposal before applying.</div>':''}
        ${a.state==='applying'||a.state==='undoing'?'<div class="fr-plan-warning">A SharePoint write may be incomplete. Do not retry. Reconcile this action with an administrator.</div>':''}
        ${preview?`<div class="fr-change-diff"><strong>Verify before applying</strong><div class="fr-diff-before"><span>Current SharePoint value</span>${esc(preview.summaryBefore)}</div><div class="fr-diff-after"><span>${preview.mode==='create'?'New work item to be created':'Proposed change'}</span>${esc(preview.summaryAfter)}</div><p class="fr-muted">${esc(preview.impact||'No other records will change.')}</p><button type="button" class="fr-btn fr-btn-primary" data-plan-apply>Approve & apply to SharePoint</button></div>`:''}
        <div class="fr-plan-actions">
          ${a.state==='proposed'&&a.action!=='unknown'&&(a.action!=='record'||a.replacement)?'<button type="button" class="fr-btn" data-plan-preview>Review exact change</button>':''}
          ${a.state==='proposed'?'<button type="button" class="fr-btn" data-plan-clarify>Needs clarification</button><button type="button" class="fr-btn" data-plan-reject>Reject</button>':''}
          ${a.state==='applied'&&a.snapshot?'<button type="button" class="fr-btn fr-btn-undo" data-plan-undo>↶ Undo change</button>':''}
        </div>
      </div>`;
    }).join('');
    const planCount=plan.filter(a=>a.state==='proposed').length;
    return `<section class="fr-pm-proposal"><div class="fr-proposal-title">Proposed project changes <span class="fr-muted">(${planCount} to review)</span></div>
      <p class="fr-muted">Each report may affect several records. Choose an action, select an eligible record, and preview before saving. No AI conclusions or Teams alerts yet.</p>
      ${related?.state==='loading'?'<div class="fr-muted">Checking project records…</div>':''}
      ${rows||'<div class="fr-muted">No proposed changes saved yet.</div>'}
      <details class="fr-add-action" open><summary>Add a proposed change</summary>
        <div class="fr-field"><label>Proposed action</label><select data-plan-action>
          <option value="none">Unknown — needs clarification</option>
          <option value="record">Replace deliverable activity with confirmed decision</option>
          <option value="complete">Mark an existing task or deliverable Complete</option>
          <option value="newTask">Create a new task</option><option value="newMilestone">Create a new milestone</option>
        </select></div>
        <div class="fr-field" data-draft-target-wrap><label>Matching project record</label><select data-plan-target><option value="">Select a record — never guessed</option></select></div>
        <div class="fr-field" data-draft-create-field><label>Title (required for new task/milestone)</label><input type="text" data-plan-title maxlength="180" placeholder="e.g., Coordinate rack cooling fans"/></div>
        <div class="fr-inline" data-draft-create-field><div class="fr-field fr-half"><label>Workstream for new item</label><input type="text" data-plan-workstream maxlength="90" placeholder="e.g., AV / Audio"/></div>
          <div class="fr-field fr-half"><label>Project phase for new item</label><select data-plan-phase><option value="">Select when creating new work</option><option value="Planning">Planning</option><option value="Engineering">Engineering</option><option value="Coordination">Coordination</option><option value="Installation">Installation</option><option value="Rough-In">Rough-In</option><option value="Trim">Trim</option><option value="Final">Final</option></select></div></div>
        <div class="fr-field" data-draft-replacement-field hidden><label>Confirmed replacement wording for Current Activity *</label><textarea data-plan-replacement maxlength="1800" placeholder="Enter the final wording for the deliverable. This replaces the existing Current Activity after PM approval."></textarea><p class="fr-muted">The original report and prior activity remain in approval history. Do not paste a report ID here.</p></div>
        <div class="fr-field" data-draft-create-field><label>Information Required — saved to project task</label><textarea data-plan-info-required maxlength="1200" placeholder="What needs confirmation or follow-up?"></textarea></div>
        <div class="fr-field" data-draft-create-field><label>Blocker / Dependency — saved to project task</label><textarea data-plan-blocker maxlength="1200" placeholder="What is preventing the work from moving forward?"></textarea></div>
        <div class="fr-field"><label>PM note / clarification (approval history only)</label><textarea data-plan-note maxlength="1200" placeholder="Optional context for the review record."></textarea></div>
        <div class="fr-plan-actions"><button type="button" class="fr-btn" data-draft-preview>Preview before saving</button><button type="button" class="fr-btn fr-btn-primary" data-plan-add disabled>Save proposal to SharePoint</button></div>
        <div data-draft-preview-result aria-live="polite"></div>
      </details>
      <details class="fr-history-panel"><summary>View history (${historyEntries(r).length})</summary>${historyHtml(r)}</details>
    </section>`;
  }
  function readAudit(value){const a=JSON.parse(value||'[]');if(!Array.isArray(a))throw Error('Audit trail is invalid. Stop without writing.');return a;}
  function historyEntries(r){try{return readAudit(r.history);}catch(_){return [];}}
  // v2.9.5: The audit trail is a read-only record of events. Only an applied,
  // snapshot-backed approval can offer Undo; the existing guarded Undo path
  // still re-reads SharePoint and enforces exact record version + dependencies.
  function historyFields(sn){
    if(!sn || !sn.after || typeof sn.after!=='object')return '';
    const labels={Title:'Title',DeliveryPhase:'Phase',Workstream:'Workstream',WorkStatus:'Status',OperationalStatus:'Status',
      InformationRequired:'Information required',BlockerDependency:'Blocker / dependency',CurrentActivity:'Current activity',PercentComplete:'Progress'};
    const keys=Object.keys(sn.after).filter(k=>Object.prototype.hasOwnProperty.call(labels,k));
    const shown=sn.kind==='create'?keys.filter(k=>['Title','DeliveryPhase','Workstream','WorkStatus','InformationRequired','BlockerDependency'].includes(k)):keys;
    const values=shown.map(k=>{
      const prev=sn.kind==='create'?'—':shortText(sn.before?.[k]??'(blank)',350);
      const next=shortText(sn.after[k]??'(blank)',350);
      return `<div class="fr-history-field"><dt>${esc(labels[k])}</dt><dd>${sn.kind==='create'?esc(next):`<span class="fr-history-prior">${esc(prev)}</span><span class="fr-history-arrow" aria-label="changed to">→</span><span>${esc(next)}</span>`}</dd></div>`;
    }).join('');
    return values?`<dl class="fr-history-fields">${values}</dl>`:'';
  }
  function historyHtml(r){
    let events;
    try{events=readAudit(r.history);}catch(_){return '<p class="fr-plan-warning">History could not be read. Do not undo until an administrator reviews the audit trail.</p>';}
    if(!events.length)return '<p class="fr-muted">No history recorded yet.</p>';
    const plan=planFor(r)||[];
    return events.slice().reverse().map((x,i)=>{
      const label=String(x.event||x.action||x.after||'Review event');
      const isApproval=label==='approved and applied' && Boolean(x.proposalId);
      const a=isApproval?plan.find(item=>item.id===x.proposalId):null;
      const sn=a?.snapshot;
      // Audit identity and snapshot target must correspond. A missing, older,
      // or mismatched snapshot is always view-only.
      const linked=Boolean(isApproval&&sn&&String(sn.id)===String(x.targetId)&&sn.list===x.targetList);
      const undoAvailable=linked&&a.state==='applied'&&Boolean(sn.etagAfter);
      const wasUndone=linked&&a.state==='undone';
      const target=linked?`${sn.list} #${sn.id}`:x.targetId?`${x.targetList||'Project record'} #${x.targetId}`:'';
      const title=linked?(a.targetName||a.title||sn.title||'Project change'):(x.note||x.replacement||'');
      const status=wasUndone?'<span class="fr-history-state is-undone">Undone</span>':undoAvailable?'<span class="fr-history-state is-eligible">Undo available*</span>':'';
      const recordFields=linked?historyFields(sn):'';
      const note=linked&&a.note?`<p class="fr-history-note"><strong>PM note:</strong> ${esc(a.note)}</p>`:'';
      const changeType=linked?`<p class="fr-history-change-type">${sn.kind==='create'?'Created project work item':'Updated project record'}${target?' · '+esc(target):''}</p>`:target?`<p class="fr-history-change-type">${esc(target)}</p>`:'';
      const detail=linked?`${sn.kind==='create'?'<p class="fr-muted">Before: no project work item existed.</p>':''}${recordFields}${note}`:x.before!==undefined||x.after!==undefined?`<p class="fr-muted">${x.before!==undefined?'Before: '+esc(shortText(x.before,300))+' · ':''}${x.after!==undefined?'After: '+esc(shortText(x.after,300)):''}</p>`:'';
      const outcome=wasUndone?'<p class="fr-history-notice">This change was already undone. Its history is preserved.</p>':undoAvailable?'<p class="fr-history-notice">*Undo will recheck the current SharePoint record and block reversal if it changed or has dependent work.</p>':'';
      const undoButton=undoAvailable?'<button type="button" class="fr-btn fr-btn-undo" data-plan-undo>Undo this change</button>':'';
      return `<details class="fr-history-event" ${linked?`data-plan-id="${esc(a.id)}"`:''}>
        <summary><span class="fr-history-summary"><span class="fr-history-event-name">${esc(label)}</span><span class="fr-history-time">${esc(dateText(x.at))} · ${esc(x.by||'Unknown')}</span></span>${status}</summary>
        <div class="fr-history-body">${title?`<p class="fr-history-title">${esc(shortText(title,240))}</p>`:''}${changeType}${detail}${outcome}${undoButton}</div>
      </details>`;
    }).join('');
  }
  function proposalHtml(report){return planMarkup(report);}
  async function updatePlan(r,mutator){
    if(!reviewer()||!projectIds().has(r.projectId))throw Error('PM/project access unavailable.');
    const p=provider(),item=await freshItem(p,REPORTS,r.id),f=item.fields||{};
    if(String(f.ProjectId||'')!==r.projectId || String(f.ClientReportId||'')!==r.clientId)throw Error('Report project or identity changed.');
    if(String(f.ReviewPlan||'')!==r.plan)throw Error('Another PM edited this plan. Refresh before changing it.');
    const etag=item.eTag||item['@odata.etag'];if(!etag)throw Error('Missing SharePoint version; cannot safely save.');
    const plan=readPlan(f.ReviewPlan||'');const audit=readAudit(String(f.ReviewHistory||''));
    const result=await mutator(plan,audit,{item,p,etag,fields:f});
    if(!result)return;
    const json=JSON.stringify(plan), history=JSON.stringify(audit);
    if(json.length>48000||history.length>48000)throw Error('Plan or history is too long. No changes saved.');
    const state=plan.some(x=>x.state==='proposed')?'Pending PM Review':plan.some(x=>x.state==='clarification')?'Clarification Needed':plan.some(x=>x.state==='applied')?'Changes Applied':'Acknowledged';
    await patchReport(r.id,{ReviewPlan:json,ReviewHistory:history,ReportStatus:state},etag);
    await refresh();
  }
  // v2.4: preview a PM draft before it can be saved as a proposal.
  // Preview is read-only. A later, separate PM confirmation is required for any project record write.
  function readDraft(box){
    return {
      action:box.querySelector('[data-plan-action]').value,
      target:box.querySelector('[data-plan-target]').value,
      title:box.querySelector('[data-plan-title]').value.trim(),
      workstream:box.querySelector('[data-plan-workstream]').value.trim(),
      phase:box.querySelector('[data-plan-phase]').value,
      note:box.querySelector('[data-plan-note]').value.trim(),
      informationRequired:box.querySelector('[data-plan-info-required]').value.trim(),
      blockerDependency:box.querySelector('[data-plan-blocker]').value.trim(),
      replacement:box.querySelector('[data-plan-replacement]').value.trim()
    };
  }
  function draftKey(d){return JSON.stringify([d.action,d.target,d.title,d.workstream,d.phase,d.note,d.replacement,d.informationRequired,d.blockerDependency]);}
  function validateReplacement(value){
    const v=String(value||'').trim();
    if(!v)throw Error('Enter the PM-confirmed replacement wording for Current Activity before previewing.');
    if(v.length>1800)throw Error('Replacement wording exceeds 1,800 characters.');
    if(/\bahtfr-[a-z0-9-]+\b/i.test(v))throw Error('Do not include internal Field Report IDs in project activity wording.');
    return v;
  }
  function checkDraft(r,d){
    if(!['none','record','complete','newTask','newMilestone'].includes(d.action))throw Error('Choose a supported action.');
    const allowed=availableTargets(r).filter(x => d.action==='record'?x.kind==='deliverable':d.action==='complete'?['deliverable','work'].includes(x.kind):false);
    if(d.action==='record'||d.action==='complete'){
      if(!allowed.some(x=>x.kind+'|'+x.id===d.target))throw Error('Choose a verified '+(d.action==='record'?'Deliverable':'task or Deliverable')+' from this project.');
    }
    if(['newTask','newMilestone'].includes(d.action)&&(!d.title||!d.workstream||!d.phase))throw Error('New work needs a title, workstream and phase. No values will be guessed.');
    if(d.action==='record')validateReplacement(d.replacement);
    if(d.action==='none' && !d.note)throw Error('Add a clarification note for the unresolved item.');
  }
  function syncDraftTarget(box,reset=false){
    const r=records.find(x=>x.id===box?.dataset.report);
    const form=box?.querySelector('.fr-add-action');if(!r||!form)return;
    const action=form.querySelector('[data-plan-action]').value,target=form.querySelector('[data-plan-target]');
    const current=reset?'':target.value;
    const eligible=availableTargets(r).filter(x=>action==='record'?x.kind==='deliverable':action==='complete'?['work','deliverable'].includes(x.kind):false);
    const q=norm(form.querySelector('[data-record-search]')?.value||'');
    const visible=eligible.filter(x=>!q||norm(x.source+' '+x.title+' '+x.status).includes(q)||x.kind+'|'+x.id===current);
    target.innerHTML='<option value="">Select a matching '+(action==='record'?'deliverable':'project record')+'</option>'+visible.map(x=>`<option value="${esc(x.kind+'|'+x.id)}">${esc(x.source+' — '+x.title+' ('+x.status+')')}</option>`).join('');
    if(visible.some(x=>x.kind+'|'+x.id===current))target.value=current;
    const existing=action==='record'||action==='complete',create=action==='newTask'||action==='newMilestone';
    form.querySelector('[data-draft-target-wrap]').hidden=!existing;
    form.querySelectorAll('[data-draft-create-field]').forEach(el=>el.hidden=!create);
    form.querySelector('[data-draft-replacement-field]').hidden=action!=='record';
    target.disabled=!existing;
  }
  function invalidateDraft(box){
    const id=box?.dataset.report;if(id)draftPreviews.delete(id);
    const form=box?.querySelector('.fr-add-action');if(!form)return;
    const result=form.querySelector('[data-draft-preview-result]');if(result)result.replaceChildren();
    const save=form.querySelector('[data-plan-add]');if(save)save.disabled=true;
  }
  function onRecordFilter(e){
    if(!e.target?.matches?.('[data-record-search]'))return;
    const box=e.target.closest('[data-report]');if(box)syncDraftTarget(box);
  }
  function onDraftEdited(e){
    if(!e.target?.matches?.('[data-plan-action],[data-plan-target],[data-plan-title],[data-plan-workstream],[data-plan-phase],[data-plan-note],[data-plan-replacement],[data-plan-info-required],[data-plan-blocker]'))return;
    const box=e.target.closest('[data-report]');if(!box)return;
    if(e.target.matches('[data-plan-action]'))syncDraftTarget(box,true);
    invalidateDraft(box);
  }
  async function onDraftPreview(e){
    const btn=e.target.closest('[data-draft-preview]');if(!btn||!reviewer())return;
    const box=btn.closest('[data-report]'),r=records.find(x=>x.id===box?.dataset.report);if(!r)return;
    invalidateDraft(box);
    const form=box.querySelector('.fr-add-action'),d=readDraft(form);
    btn.disabled=true;
    try{
      checkDraft(r,d);
      let prev;
      if(d.action==='none'){
        prev={summaryBefore:'No project record selected',summaryAfter:'No record will be updated. Clarification requested: '+d.note,impact:'This proposal cannot be applied to a project task.'};
      }else{
        // No persistence or Graph writes occur inside constructPlanPreview().
        prev=await constructPlanPreview(r,{...d,id:'p-draft-preview-only'});
      }
      const caution=d.action==='record'?'<p class="fr-muted"><strong>Important:</strong> Applying this proposal will REPLACE the full Current Activity with your confirmed wording. Its previous contents remain available for Undo. The deliverable status and dates will not change.</p>':'';
      form.querySelector('[data-draft-preview-result]').innerHTML=`<div class="fr-change-diff"><strong>Read-only preview — not yet saved</strong><div class="fr-diff-before"><span>Before</span>${esc(prev.summaryBefore)}</div><div class="fr-diff-after"><span>Proposed</span>${esc(prev.summaryAfter)}</div><p class="fr-muted">${esc(prev.impact)}</p>${caution}<p class="fr-muted">Save creates a pending proposal only. Applying the project change requires a separate PM preview and explicit confirmation.</p></div>`;
      draftPreviews.set(r.id,{signature:draftKey(d),plan:r.plan});
      form.querySelector('[data-plan-add]').disabled=false;
    }catch(err){
      form.querySelector('[data-draft-preview-result]').textContent='Preview unavailable: '+String(err.message||err);
    }finally{btn.disabled=false;}
  }
  async function onPlanAdd(e){const btn=e.target.closest('[data-plan-add]');if(!btn||!reviewer())return;
    const box=btn.closest('[data-report]'),r=records.find(x=>x.id===box?.dataset.report);if(!r)return;
    const d=readDraft(box),{action,target,title,workstream,phase,note,replacement,informationRequired,blockerDependency}=d;
    const approvedPreview=draftPreviews.get(r.id);
    if(!approvedPreview||approvedPreview.signature!==draftKey(d)||approvedPreview.plan!==r.plan)return alert('Preview these exact values before saving the proposal.');
    try{checkDraft(r,d);}catch(err){return alert(err.message||err);}
    const match=availableTargets(r).find(x=>x.kind+'|'+x.id===target);
    btn.disabled=true;workflowSteps.set(r.id,4);
    try{await updatePlan(r,async (plan,history)=>{
      if(plan.length>=30)throw Error('At most 30 proposed actions per report.');
      const id='p-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
      plan.push({id,action:action==='none'?'unknown':action,target, targetName:match?.title||'',title,workstream,phase,note,informationRequired,blockerDependency,replacement:action==='record'?replacement:'',sourceReportClientId:r.clientId,state:'proposed',at:new Date().toISOString(),by:identity()});
      history.push({at:new Date().toISOString(),by:identity(),event:'proposal added',proposalId:id,action,sourceReportClientId:r.clientId});
      return true;
    });}catch(err){alert('Could not save proposal: '+(err.message||err));}finally{btn.disabled=false;}
  }
  async function onPlanDecision(e){const btn=e.target.closest('[data-plan-reject],[data-plan-clarify]');if(!btn||!reviewer())return;
    const box=btn.closest('[data-report]'),r=records.find(x=>x.id===box?.dataset.report),id=btn.closest('[data-plan-id]')?.dataset.planId;if(!r||!id)return;
    const question=btn.matches('[data-plan-clarify]');
    const note=question?window.prompt('What should the technician clarify in Teams? (Notifications are not connected yet.)',''):'';
    if(question&&!note?.trim())return;
    if(!question&&!window.confirm('Reject this proposed action? No project record will change.'))return;
    btn.disabled=true;
    try{await updatePlan(r,async(plan,history)=>{const a=plan.find(x=>x.id===id);if(!a||a.state!=='proposed')throw Error('Proposal already handled. Refresh.');a.state=question?'clarification':'rejected';a.decidedAt=new Date().toISOString();a.decidedBy=identity();if(question)a.note=String(note).trim().slice(0,1200);
      history.push({at:a.decidedAt,by:identity(),event:a.state,proposalId:a.id,action:a.action});return true;});}
    catch(err){alert('Could not save decision: '+(err.message||err));}finally{btn.disabled=false;}
  }
  async function freshItem(p,list,id){
    const site=await p.getSite(),listId=await p.getListId(list);
    return p.graph(`/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(id)}?$expand=fields`);
  }
  async function verifiedChange(report,selection){
    if(!reviewer()||!projectIds().has(report.projectId))throw Error('PM permission or project access is unavailable.');
    if(!['complete','record'].includes(selection.action))throw Error('Choose a specific proposed action.');
    const match=availableTargets(report).find(x=>x.kind+'|'+x.id===selection.target);
    if(!match)throw Error('Select a valid matching record. Open references for uncertain reports.');
    if (selection.action==='record' && match.kind==='work') throw Error('For a work item, recording a decision would overwrite its Information Required field. Select a Deliverable for the decision, or leave this unresolved.');
    const p=provider(),list=match.kind==='work'?'Project Work Items':'Deliverables';
    const projectRows=await p.getListRows('Projects');
    const project=projectRows.find(x=>String(x.fields?.ProjectKey||'')===report.projectId||String(x.id)===report.projectId);
    if(!project)throw Error('Report project not found.');
    const item=await freshItem(p,list,match.id),f=item.fields||{},k=String(project.fields?.ProjectKey||''),pid=String(project.id);
    const scope=match.kind==='work' ? String(f.ProjectKey||'')===k : String(f.ProjectLookupId||'')===pid;
    if(!scope || f.Archived===true||String(f.Archived).toLowerCase()==='true')throw Error('Target is not an active record in this project.');
    const liveReport=await freshItem(p,REPORTS,report.id),rf=liveReport.fields||{};
    if(String(rf.ProjectId||'')!==report.projectId || String(rf.ClientReportId||'')!==report.clientId)throw Error('Report identity/project changed.');
    if(['Uploading Audio'].includes(String(rf.ReportStatus||'')))throw Error('Report is not eligible for a new project change.');
    if(!(item.eTag || item['@odata.etag']) || !(liveReport.eTag || liveReport['@odata.etag'])) throw Error('SharePoint change tokens missing; do not update without conflict protection.');
    const result={p,match,item,liveReport,kind:match.kind,list,id:match.id,title:f.Title||match.title,projectKey:k,reportId:report.id,selection,fields:{}};
    let field,before,after;
    if(selection.action==='complete'){
      field=match.kind==='work'?'WorkStatus':'OperationalStatus';before=String(f[field]||'');after='Complete';
      if(before.toLowerCase()==='complete')throw Error('This record is already Complete. Do not apply another completion.');
      result.fields[field]=after;
      if(match.kind==='work' && f.TrackProgress===true && Number(f.PercentComplete||0)<100){result.fields.PercentComplete=100;result.percentBefore=Number(f.PercentComplete||0);}
    }else{
      // The PM confirms exact final wording. No AI guess, transcript append or internal report ID is written to the deliverable.
      field='CurrentActivity';before=String(f[field]||'');
      after=validateReplacement(selection.replacement);
      if(after===before.trim())throw Error('The confirmed wording already matches Current Activity; no update is needed.');
      result.fields[field]=after;
    }
    const predecessors=match.kind==='work'? (()=>{try {const arr=JSON.parse(f.PredecessorKeys||'[]');return Array.isArray(arr)?arr:[];}catch(_){return [];}})():[];
    let impact='Target date: '+targetDateText(f.TargetDate)+'; other project records will not be changed.';
    if(match.kind==='work'){
      const workItems=await p.getListRows('Project Work Items');
      const children=workItems.filter(x=>String(x.fields?.ProjectKey||'')===k && String(x.fields?.ParentWorkItemKey||'')===String(f.WorkItemKey||'') && x.fields?.Archived!==true);
      const unfinished=children.filter(x=>String(x.fields?.WorkStatus||'').toLowerCase()!=='complete');
      if(selection.action==='complete' && unfinished.length)throw Error('This parent task has unfinished subtasks: '+unfinished.slice(0,4).map(x=>x.fields?.Title||'Untitled').join(', ')+'. Update child tasks first or clarify scope.');
      const successors=workItems.filter(x=>String(x.fields?.ProjectKey||'')===k && x.fields?.Archived!==true && (()=>{try{const a=JSON.parse(x.fields.PredecessorKeys||'[]');return Array.isArray(a)&&a.includes(f.WorkItemKey);}catch(_){return false;}})());
      impact='Target date: '+targetDateText(f.TargetDate)+'; '+predecessors.length+' predecessor(s); '+children.length+' child task(s); '+successors.length+' successor task(s)'+(successors.length?' ('+successors.slice(0,3).map(x=>x.fields?.Title||'Untitled').join(', ')+')':'')+'. No linked record will change automatically.';
    }
    return {...result,field,before,after,impact,etag:item.eTag||item['@odata.etag']||'',reportEtag:liveReport.eTag||liveReport['@odata.etag']||''};
  }
  async function constructPlanPreview(r,a){
    if(a.action==='unknown')throw Error('Unknown action must be clarified, not applied.');
    if(['record','complete'].includes(a.action)){
      const verified=await verifiedChange(r,{target:a.target,action:a.action,replacement:a.replacement});
      return {...verified,mode:'patch',summaryBefore:verified.title+' — '+verified.field+': '+(a.action==='record'?String(verified.before||'(blank)'):shortText(verified.before||'(blank)',440)),summaryAfter:verified.field+': '+(a.action==='record'?verified.after:shortText(verified.after,520))};
    }
    if(!['newTask','newMilestone'].includes(a.action)||!a.title||!a.workstream||!a.phase)throw Error('New work needs a title, workstream and phase.');
    if(!['Planning','Engineering','Coordination','Installation','Rough-In','Trim','Final'].includes(a.phase))throw Error('Unsupported project phase.');
    const p=provider(),projectRows=await p.getListRows('Projects');
    const project=projectRows.find(x=>String(x.fields?.ProjectKey||'')===r.projectId||String(x.id)===r.projectId);
    if(!project||project.fields?.Archived===true)throw Error('Project not found or archived.');
    const key=String(project.fields?.ProjectKey||'');
    const safeId=a.id.replace(/[^a-z0-9-]/gi,'').slice(0,55);
    const workKey=key+'-field-'+safeId;
    const work=await p.getListRows('Project Work Items');
    if(work.some(x=>String(x.fields?.WorkItemKey||'')===workKey))throw Error('This proposed task already exists; do not create it twice.');
    const fields={Title:a.title,WorkItemKey:workKey,ProjectKey:key,ProjectSharePointId:Number(project.id),ItemType:a.action==='newTask'?'Task':'Milestone',Workstream:a.workstream,DeliveryPhase:a.phase,WorkStatus:'Planned',PercentComplete:0,ProgressWeight:1,TrackProgress:true,PredecessorKeys:'[]',WorkVisibility:'Project',Archived:false,InformationRequired:String(a.informationRequired||'').slice(0,1200),BlockerDependency:String(a.blockerDependency||'').slice(0,1200)};
    const liveReport=await freshItem(p,REPORTS,r.id),reportEtag=liveReport.eTag||liveReport['@odata.etag'];
    if(!reportEtag || String(liveReport.fields?.ReviewPlan||'')!==r.plan)throw Error('Report was edited. Refresh.');
    return {p,mode:'create',kind:'work',list:'Project Work Items',fields,reportEtag,id:'',title:a.title,
      summaryBefore:'No existing work item',summaryAfter:`${fields.ItemType}: ${a.title} | ${a.phase} / ${a.workstream} | Planned | no due date\nInformation Required: ${fields.InformationRequired||'(none)'}\nBlocker / Dependency: ${fields.BlockerDependency||'(none)'}`,
      impact:'A new planned work item will be created. No dates, owners, predecessors or other records will be changed.'};
  }
  async function onPlanPreview(e){const btn=e.target.closest('[data-plan-preview]');if(!btn||!reviewer())return;
    const box=btn.closest('[data-report]'),r=records.find(x=>x.id===box?.dataset.report),id=btn.closest('[data-plan-id]')?.dataset.planId;
    const a=r&&planFor(r)?.find(x=>x.id===id);if(!a||a.state!=='proposed')return;
    btn.disabled=true;
    try{await ensureSavedTarget(r,a);const prev=await constructPlanPreview(r,a);reviewPreviews.set(r.id+'|'+a.id,{...prev,planId:id,planSnapshot:r.plan});renderReview();}
    catch(err){reviewPreviews.delete(r.id+'|'+id);alert('Cannot preview change: '+(err.message||err));btn.disabled=false;}
  }
  async function onPlanApply(e){const btn=e.target.closest('[data-plan-apply]');if(!btn||!reviewer())return;
    const box=btn.closest('[data-report]'),r=records.find(x=>x.id===box?.dataset.report),id=btn.closest('[data-plan-id]')?.dataset.planId;
    const a=r&&planFor(r)?.find(x=>x.id===id),prev=reviewPreviews.get(r?.id+'|'+id);
    if(!a||a.state!=='proposed'||!prev||prev.planSnapshot!==r.plan)return alert('Proposal changed. Preview again.');
    // The explicit Approve & apply button is the final PM confirmation, after the live before/after preview.
    btn.disabled=true;
    let staged=false,targetWritten=false;
    try{
      await ensureSavedTarget(r,a);
      const verified=await constructPlanPreview(r,a);
      if(verified.mode!==prev.mode || (verified.mode==='patch'&&(verified.etag!==prev.etag||verified.before!==prev.before||verified.after!==prev.after)) || verified.summaryAfter!==prev.summaryAfter)throw Error('The underlying project record changed. Preview again.');
      const p=provider(),site=await p.getSite(),reportListId=await p.getListId(REPORTS);
      const reportItem=await freshItem(p,REPORTS,r.id),rf=reportItem.fields||{},e=reportItem.eTag||reportItem['@odata.etag'];
      if(!e||String(rf.ReviewPlan||'')!==r.plan)throw Error('PM plan was updated by someone else; refresh.');
      const plan=readPlan(rf.ReviewPlan),entry=plan.find(x=>x.id===id);
      if(!entry||entry.state!=='proposed')throw Error('Proposal no longer pending.');
      entry.state='applying';entry.approver=identity();entry.startedAt=new Date().toISOString();
      const stage={ReviewPlan:JSON.stringify(plan)};
      await p.graph(`/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(reportListId)}/items/${encodeURIComponent(r.id)}/fields`,{method:'PATCH',headers:{'If-Match':e},body:JSON.stringify(stage)});
      staged=true;
      const listId=await p.getListId(verified.list);let targetId=verified.id, before={}, after={};
      if(verified.mode==='patch'){
        targetId=verified.id;after=verified.fields;
        for(const k of Object.keys(after))before[k]=k==='PercentComplete'?verified.percentBefore:verified.item.fields?.[k]??null;
        await p.graph(`/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(targetId)}/fields`,{method:'PATCH',headers:{'If-Match':verified.etag},body:JSON.stringify(after)});
      } else {
        const created=await p.graph(`/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items`,{method:'POST',body:JSON.stringify({fields:verified.fields})});
        if(!created?.id)throw Error('SharePoint did not confirm the newly created item ID. Check project records before retry.');
        targetId=String(created.id);after=verified.fields;
      }
      targetWritten=true;
      const written=await freshItem(p,verified.list,targetId),recordedEtag=written.eTag||written['@odata.etag'];
      if(!recordedEtag)throw Error('Could not capture applied record version. Reconciliation required.');
      const now=new Date().toISOString(),snapshot={list:verified.list,id:String(targetId),kind:verified.mode,workKey:after.WorkItemKey||'',before,after,etagAfter:recordedEtag,title:verified.title};
      const final=await freshItem(p,REPORTS,r.id),fe=final.eTag||final['@odata.etag'];const finalPlan=readPlan(final.fields?.ReviewPlan||'');
      const done=finalPlan.find(x=>x.id===id);if(!fe||!done||done.state!=='applying')throw Error('Approval staging record changed. Reconciliation required.');
      done.state='applied';done.completedAt=now;done.snapshot=snapshot;
      const hist=readAudit(String(final.fields?.ReviewHistory||''));hist.push({at:now,by:identity(),event:'approved and applied',proposalId:id,action:a.action,sourceReportClientId:r.clientId,targetList:verified.list,targetId:String(targetId),fields:Object.keys(after)});
      if(JSON.stringify(hist).length>48000||JSON.stringify(finalPlan).length>48000)throw Error('Audit storage full. Reconciliation required.');
      await p.graph(`/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(reportListId)}/items/${encodeURIComponent(r.id)}/fields`,{method:'PATCH',headers:{'If-Match':fe},body:JSON.stringify({ReviewPlan:JSON.stringify(finalPlan),ReviewHistory:JSON.stringify(hist),ReportStatus:finalPlan.some(x=>x.state==='proposed')?'Pending PM Review':finalPlan.some(x=>x.state==='clarification')?'Clarification Needed':'Changes Applied',ReviewedByName:displayName().slice(0,255),ReviewedAt:now})});
      reviewPreviews.delete(r.id+'|'+id);relatedProjectCache.delete(r.projectId);relatedStates.delete(r.id);
      workflowSteps.set(r.id,5);alert('PM-approved change applied to SharePoint and saved to report history.');await refresh();
    }catch(err){alert((staged?'A CHANGE MAY HAVE BEEN MADE. DO NOT RETRY. Please check the project record and report approval history. ':'Could not apply: ')+(err.message||err));if(!staged)btn.disabled=false;await refresh();}
  }
  // v2.9: clarify the exact Undo impact; verification remains server-side in onPlanUndo.
  function confirmUndo(sn,r){
    const operation=sn.kind==='create'?'ARCHIVE the new task':'RESTORE the prior fields of';
    const message=`${operation}: ${sn.title}\nProject: ${projectName(r.projectId)}\nSharePoint record: ${sn.id}\n\nThe field report and review history remain. Undo only proceeds if the SharePoint record version still matches.`;
    if(typeof HTMLDialogElement==='undefined' || !document.createElement('dialog').showModal)return Promise.resolve(window.confirm('Undo approved change?\n\n'+message));
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='fr-undo-dialog';
      dialog.innerHTML=`<div class="fr-undo-content"><h3>Undo approved change?</h3><p class="fr-undo-impact">${esc(sn.kind==='create'?'Archive newly created task':'Restore previous values')}</p><strong>${esc(sn.title)}</strong><p class="fr-muted">${esc(projectName(r.projectId))} · SharePoint record #${esc(sn.id)}</p><p>${esc(sn.kind==='create'?'The new task will be archived and removed from the active plan.':'The previous field values will be restored if the record is unchanged.')}</p><p class="fr-muted">Original report and history are kept. SharePoint version will be verified.</p><div class="fr-undo-actions"><button type="button" class="fr-btn" data-undo-cancel>Cancel</button><button type="button" class="fr-btn fr-btn-undo" data-undo-confirm>↶ Undo change</button></div></div>`;
      let resolved=false;const done=ok=>{if(resolved)return;resolved=true;dialog.close();dialog.remove();resolve(ok);};
      dialog.addEventListener('click',e=>{if(e.target.closest('[data-undo-confirm]'))done(true);else if(e.target.closest('[data-undo-cancel]'))done(false);});
      dialog.addEventListener('cancel',e=>{e.preventDefault();done(false);});
      document.body.appendChild(dialog);dialog.showModal();
    });
  }
  async function onPlanUndo(e){const btn=e.target.closest('[data-plan-undo]');if(!btn||!reviewer())return;
    const box=btn.closest('[data-report]'),r=records.find(x=>x.id===box?.dataset.report),id=btn.closest('[data-plan-id]')?.dataset.planId;
    const a=r&&planFor(r)?.find(x=>x.id===id),sn=a?.snapshot;
    if(!a||a.state!=='applied'||!sn||!projectIds().has(r.projectId))return;
    if(!await confirmUndo(sn,r))return;
    btn.disabled=true;let staged=false;
    try{
      const p=provider(),site=await p.getSite(),reportListId=await p.getListId(REPORTS);
      const target=await freshItem(p,sn.list,sn.id),etag=target.eTag||target['@odata.etag'];
      if(!etag||etag!==sn.etagAfter)throw Error('Record was modified after approval. Undo blocked; review manually.');
      const projectRows=await p.getListRows('Projects'),project=projectRows.find(x=>String(x.fields?.ProjectKey||'')===r.projectId||String(x.id)===r.projectId);
      if(!project)throw Error('Project missing.');
      const f=target.fields||{},scope=sn.list==='Project Work Items'?String(f.ProjectKey||'')===String(project.fields?.ProjectKey||''):String(f.ProjectLookupId||'')===String(project.id);
      if(!scope)throw Error('Target no longer belongs to the assigned project.');
      if(sn.kind==='create'){
        if(String(f.WorkItemKey||'')!==sn.workKey)throw Error('New work item key changed.');
        const other=await p.getListRows('Project Work Items');
        const related=other.filter(x=>String(x.fields?.ProjectKey||'')===r.projectId&&String(x.id)!==String(sn.id)&&x.fields?.Archived!==true&&(
          String(x.fields?.ParentWorkItemKey||'')===sn.workKey || (()=>{try{const arr=JSON.parse(x.fields?.PredecessorKeys||'[]');return Array.isArray(arr)&&arr.includes(sn.workKey);}catch(_){return true;}})()
        ));
        if(related.length)throw Error('Other work now depends on this item. Undo blocked; inspect affected tasks first.');
      }
      for(const [k,v] of Object.entries(sn.after)){
        const actual=f[k],matches=(actual===v||String(actual??'')===String(v??''));
        if(!matches)throw Error('Field '+k+' changed since approval. Undo blocked.');
      }
      const reportItem=await freshItem(p,REPORTS,r.id),re=reportItem.eTag||reportItem['@odata.etag'];
      if(!re||String(reportItem.fields?.ReviewPlan||'')!==r.plan)throw Error('Plan changed since display. Refresh.');
      const plan=readPlan(r.plan),pending=plan.find(x=>x.id===id);if(!pending||pending.state!=='applied')throw Error('Action not eligible for undo.');
      pending.state='undoing';pending.undoBy=identity();pending.undoStarted=new Date().toISOString();
      await p.graph(`/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(reportListId)}/items/${encodeURIComponent(r.id)}/fields`,{method:'PATCH',headers:{'If-Match':re},body:JSON.stringify({ReviewPlan:JSON.stringify(plan)})});staged=true;
      const listId=await p.getListId(sn.list);
      const patch=sn.kind==='create'?{Archived:true}:sn.before;
      await p.graph(`/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(sn.id)}/fields`,{method:'PATCH',headers:{'If-Match':etag},body:JSON.stringify(patch)});
      const final=await freshItem(p,REPORTS,r.id),fe=final.eTag||final['@odata.etag'];const finalPlan=readPlan(final.fields?.ReviewPlan||'');const done=finalPlan.find(x=>x.id===id);
      if(!fe||!done||done.state!=='undoing')throw Error('Undo completed, but reporting audit requires reconciliation.');
      done.state='undone';done.undoneAt=new Date().toISOString();done.undoneBy=identity();
      const hist=readAudit(String(final.fields?.ReviewHistory||''));hist.push({at:done.undoneAt,by:identity(),event:'undone',proposalId:id,action:a.action,targetList:sn.list,targetId:sn.id});
      if(JSON.stringify(hist).length>48000||JSON.stringify(finalPlan).length>48000)throw Error('Audit storage full; reconciliation required.');
      await p.graph(`/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(reportListId)}/items/${encodeURIComponent(r.id)}/fields`,{method:'PATCH',headers:{'If-Match':fe},body:JSON.stringify({ReviewPlan:JSON.stringify(finalPlan),ReviewHistory:JSON.stringify(hist)})});
      relatedProjectCache.delete(r.projectId);relatedStates.delete(r.id);workflowSteps.set(r.id,5);alert(sn.kind==='create'?'Undo successful: '+sn.title+' was archived from '+projectName(r.projectId)+'. The report and approval history were retained.':'Undo successful: previous values were restored for '+sn.title+'. Approval history was retained.');await refresh();
    }catch(err){alert((staged?'Undo may be incomplete. Do not retry automatically. ':'Undo blocked: ')+(err.message||err));await refresh();}
    finally{if(!staged)btn.disabled=false;}
  }
  function projectSelectableItems(index){
    return index.records.filter(g=>g.kind==='work'||g.kind==='deliverable').flatMap(g=>g.records.map(row=>{
      const f=row.fields||{},url=verifiedSourceUrl(row.webUrl||'',index.siteUrl);
      if(!url)return null;
      return {source:g.label,kind:g.kind,title:String(f.Title||'(Untitled)'),status:String(f.WorkStatus||f.OperationalStatus||'Not specified'),description:shortText([f.CurrentActivity,f.InformationRequired,f.NextStep].filter(Boolean).join(' ')),matches:[],score:0,outdoorOnly:false,url,id:String(row.id)};
    }).filter(Boolean));
  }
  // Explicit manual browsing stays within the report's assigned SharePoint project.
  async function browseProjectRecords(e){
    const btn=e.target.closest('[data-browse-records]');if(!btn||!reviewer())return;
    const box=btn.closest('[data-report]'),r=records.find(x=>x.id===box?.dataset.report);if(!r||!projectIds().has(r.projectId))return;
    btn.disabled=true;btn.textContent='Loading eligible records…';
    try{
      const index=await loadProjectReferences(r.projectId);
      const allItems=projectSelectableItems(index);
      const current=relatedStates.get(r.id);
      const state=current?.state==='ready'?current:{state:'ready',items:[],warnings:index.warnings||[]};
      relatedStates.set(r.id,{...state,manual:true,allItems});
      workflowSteps.set(r.id,3);
      renderReview();
    }catch(err){alert('Could not browse this project’s SharePoint records: '+(err.message||err));btn.disabled=false;btn.textContent='Browse all project records';}
  }
  // Saved proposals must remain previewable after a browser reload, even without a keyword match.
  async function ensureSavedTarget(r,a){
    if(!['record','complete'].includes(a.action)||availableTargets(r).some(x=>x.kind+'|'+x.id===a.target))return;
    const index=await loadProjectReferences(r.projectId),exact=projectSelectableItems(index).find(x=>x.kind+'|'+x.id===a.target);
    if(!exact)throw Error('Saved target is not an eligible SharePoint record in this project. No write is allowed.');
    const state=relatedStates.get(r.id);
    relatedStates.set(r.id,{state:'ready',items:state?.items||[],warnings:state?.warnings||index.warnings||[],manual:true,allItems:projectSelectableItems(index)});
  }
  function referenceHtml(r) {
    const state=relatedStates.get(r.id);
    const head='<div class="fr-refs-title"><strong>Matching project records</strong><span class="fr-muted">Source-linked suggestions only</span></div>';
    if(!state) return `<section class="fr-related">${head}<div class="fr-muted">Checking matching project records automatically when this report is opened.</div></section>`;
    if(state.state==='loading')return `<section class="fr-related">${head}<div class="fr-muted">Searching this project's existing records…</div></section>`;
    if(state.state==='error')return `<section class="fr-related">${head}<div class="fr-muted">${esc(state.error)}</div><button type="button" class="fr-btn" data-find-related>Retry search</button></section>`;
    const matches=state.items.length?state.items.map((x,i)=>`<div class="fr-reference-row"><div class="fr-reference-caption">${esc(x.source)} · ${esc(x.status)}${x.outdoorOnly?' · Outdoor-only context':''}</div><strong>${esc(x.title)}</strong><div class="fr-muted">${esc(x.description || 'No supporting description available.')}</div><div class="fr-reference-actions"><span class="fr-muted">Matched: ${esc(x.matches.slice(0,4).join(', '))}</span><a class="fr-source-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Open original record ↗</a></div></div>`).join('') : '<div class="fr-muted">No convincing record matches. Leave the item unresolved or propose a new task for PM review.</div>';
    const warn=state.warnings.length?`<p class="fr-muted">Partial search: ${esc(state.warnings.join('; '))}.</p>`:'';
    return `<section class="fr-related"><details class="fr-related-details"><summary>Matching project records: ${state.items.length} found</summary>${head}${matches}${warn}<div class="fr-reference-footer"><span class="fr-muted">Suggestions are read-only. Verify project scope before approval.</span><button type="button" class="fr-btn" data-find-related>Recheck</button></div></details></section>`;
  }
  function onRelatedClick(e) {
    const b=e.target.closest('[data-find-related]');if(!b || !reviewer())return;
    const box=b.closest('[data-report]'),r=records.find(x=>x.id===box?.dataset.report);
    if(r)void findRelated(r,true);
  }
  function autoFindPendingReferences(){
    if(!reviewer()||tab!=='review'||errorText||activeReviewId==='__closed__')return;
    const report=records.find(x=>x.id===activeReviewId);
    if(!report||!report.original?.trim()||report.status==='Uploading Audio')return;
    if(!relatedStates.has(report.id))void findRelated(report);
  }
  function status(message, type = '') {
    const el = $('fr-status'); if (!el) return;
    el.textContent = message; el.className = 'fr-status ' + (type ? 'fr-' + type : ''); el.hidden = !message;
  }
  function setBusy(on) {
    submitting = on;
    const btn = $('fr-submit'); if (btn) { btn.disabled = on || !!errorText || projects().length === 0; btn.textContent = on ? 'Saving to SharePoint…' : 'Submit report'; }
  }
  function syncNav() {
    const ok = permitted(); nav.hidden = !ok; nav.classList.toggle('hidden', !ok);
    if (root.classList.contains('active') && !ok) { root.classList.remove('active'); if (typeof showView === 'function') showView('projects'); }
  }
  function layout() {
    if (mounted) return;
    mounted = true;
    root.innerHTML = `<div class="fr-wrap">
      <header class="fr-head"><div><div class="fr-eyebrow">AHT Project Control</div><h2>Field Reporting</h2><div class="fr-muted">Field progress reporting · PM review · Teams for communication</div></div><span class="fr-demo" id="fr-mode">SHAREPOINT</span></header>
      <div class="fr-connection" id="fr-connection" role="status" hidden></div>
      <div class="fr-tabs" role="tablist" aria-label="Field Reporting views">
        <button class="fr-tab" id="fr-tab-capture" data-tab="capture" role="tab" aria-selected="true" type="button">New Report</button>
        <button class="fr-tab" id="fr-tab-mine" data-tab="mine" role="tab" aria-selected="false" type="button">My Reports</button>
        <button class="fr-tab" id="fr-tab-review" data-tab="review" role="tab" aria-selected="false" type="button" hidden>PM Review <span id="fr-count"></span></button>
      </div>
      <div id="fr-pane-capture" class="fr-card">
        <div id="fr-project-wrap" class="fr-field"><label for="fr-project">Project</label><select id="fr-project"></select><div class="fr-muted" id="fr-project-hint"></div></div>
        <div class="fr-capture">
          <div class="fr-record-wrap"><button type="button" id="fr-record" class="fr-record" aria-label="Start recording"><span class="fr-record-icon">🎙</span></button>
            <div class="fr-record-copy"><strong id="fr-record-label">Tap to record</strong><div class="fr-muted" id="fr-record-note">Allow microphone access if prompted. Tap again to stop.</div></div>
            <audio id="fr-play" controls hidden></audio><button type="button" class="fr-btn" id="fr-clear-audio" hidden>Remove recording</button></div>
          <div class="fr-text-wrap"><label for="fr-text">Or type your update</label><textarea id="fr-text" maxlength="12000" placeholder="What was completed? Any delays? What's next?"></textarea>
            <div class="fr-muted">Report naturally. Transcription is not yet connected: add typed notes for automatic findings. Recordings remain available to the PM.</div></div>
        </div>
        <div class="fr-main-actions"><span class="fr-muted">Reports and optional recordings save to AHT SharePoint; tasks do not change.</span><button type="button" class="fr-btn fr-btn-primary" id="fr-submit">Submit report</button></div>
        <div id="fr-status" role="status" class="fr-status" hidden></div>
      </div>
      <div id="fr-pane-mine" hidden><div class="fr-inline fr-toolbar"><span class="fr-muted">Your submitted reports</span><button type="button" class="fr-btn" id="fr-refresh-mine">Refresh</button></div><div id="fr-mine-list" class="fr-queue"></div></div>
      <div id="fr-pane-review" hidden><div class="fr-card fr-review-explainer"><h3>PM Review Queue</h3><div class="fr-muted">Open a report and follow its five review steps. Report findings are prepared automatically when a PM opens a report with text. Only explicit PM approval updates SharePoint.</div><button type="button" class="fr-btn fr-refresh" id="fr-refresh-review">Refresh reports</button></div><div id="fr-review-list" class="fr-queue"></div></div>
      <p class="fr-muted fr-bottom-note">SharePoint-backed field reporting. Original recordings are stored in the AHT Field Report Audio library. Task updates require a PM-selected record, preview, and confirmation. Read-only findings are available to authorized PMs. Audio transcription, Teams alerts and automatic scheduling remain unconnected.</p>
    </div>`;
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => changeTab(b.dataset.tab)));
    $('fr-submit').addEventListener('click', submit);
    $('fr-record').addEventListener('click', toggleRecording);
    $('fr-clear-audio').addEventListener('click', clearRecording);
    $('fr-refresh-mine').addEventListener('click', refresh);
    $('fr-refresh-review').addEventListener('click', refresh);
    $('fr-review-list').addEventListener('click', onReviewClick);
    $('fr-review-list').addEventListener('click', onRelatedClick);
    $('fr-review-list').addEventListener('input', onDraftEdited);
    $('fr-review-list').addEventListener('change', onDraftEdited);
    $('fr-review-list').addEventListener('input', onRecordFilter);
    $('fr-review-list').addEventListener('click', browseProjectRecords);
    $('fr-review-list').addEventListener('click', onWorkflowClick);
    $('fr-review-list').addEventListener('click', onAIAnalyze);
    $('fr-review-list').addEventListener('click', onTranscriptAction);
    $('fr-review-list').addEventListener('click', onUseFinding);
    $('fr-review-list').addEventListener('click', onDraftPreview);
    $('fr-review-list').addEventListener('click', onPlanAdd);
    $('fr-review-list').addEventListener('click', onPlanDecision);
    $('fr-review-list').addEventListener('click', onPlanPreview);
    $('fr-review-list').addEventListener('click', onPlanApply);
    $('fr-review-list').addEventListener('click', onPlanUndo);
    root.addEventListener('click', playAudioClick);
    fillProjects();
  }
  function fillProjects() {
    const sel = $('fr-project'); if (!sel) return;
    const ps = projects(), prev = sel.value;
    sel.replaceChildren(); ps.forEach(p => sel.add(new Option(p.name || String(p.id), String(p.id))));
    if (ps.some(p => String(p.id) === prev)) sel.value = prev;
    $('fr-project-wrap').hidden = ps.length === 1;
    $('fr-project-hint').textContent = ps.length === 1 ? 'Automatically selected: ' + (ps[0].name || 'assigned project') : 'Choose an assigned project';
    setBusy(submitting);
  }
  function changeTab(next) {
    if (next === 'review' && !reviewer()) next = 'capture';
    tab = next;
    for (const t of ['capture', 'mine', 'review']) {
      $('fr-pane-' + t).hidden = t !== next;
      $('fr-tab-' + t).setAttribute('aria-selected', String(t === next));
    }
    render();
    if (next !== 'capture') refresh();
    if (next === 'review') autoFindPendingReferences();
  }
  function readRecord(row) {
    const f = row.fields || {};
    return { id: String(row.id), clientId: String(f.ClientReportId || ''), projectId: String(f.ProjectId || ''),
      project: String(f.ProjectName || ''), author: String(f.SubmittedByName || ''), authorEmail: norm(f.SubmittedByEmail),
      original: String(f.OriginalText || ''), audioFile: String(f.AudioFileName || ''),
      status: String(f.ReportStatus || 'Pending PM Review'), reviewNote: String(f.ReviewNote || ''),
      reviewedBy: String(f.ReviewedByName || ''), reviewedAt: String(f.ReviewedAt || ''),
      created: row.createdDateTime || f.Created || '', history: String(f.ReviewHistory || ''), plan: String(f.ReviewPlan || ''), etag: row.eTag || row['@odata.etag'] || '' };
  }
  async function refresh() {
    if (!permitted() || loading) return;
    const serial = ++loadSerial; loading = true;
    $('fr-mode').textContent = 'CONNECTING…';
    $('fr-mode').classList.remove('fr-connected','fr-disconnected');
    try {
      const p = provider();
      // Missing list must fail closed, not silently fall back to browser demo storage.
      await p.getListId(REPORTS);
      const rows = await p.getListRows(REPORTS);
      if (serial !== loadSerial) return;
      records = rows.map(readRecord).filter(r => projectIds().has(r.projectId));
      errorText = '';
      $('fr-mode').textContent = 'SHAREPOINT CONNECTED';$('fr-mode').classList.add('fr-connected');$('fr-mode').classList.remove('fr-disconnected');
      $('fr-connection').hidden = true; $('fr-connection').textContent = '';
      if (tab === 'capture' && !submitting) status('Connected to AHT SharePoint. Reports you submit here are real records.', 'success');
    } catch (e) {
      errorText = e.message || String(e);
      $('fr-mode').textContent = 'NOT CONNECTED';$('fr-mode').classList.add('fr-disconnected');$('fr-mode').classList.remove('fr-connected');
      $('fr-connection').hidden = false; $('fr-connection').textContent = 'SharePoint reporting unavailable: ' + errorText;
      status('SharePoint reports are unavailable: ' + errorText + '. No report was submitted.', 'warning');
      records = [];
    } finally { loading = false; setBusy(submitting); render(); autoFindPendingReferences(); }
  }
  function makeId() { return 'ahtfr-' + (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2))); }
  function fileExtension(mime) { return /mp4|m4a/i.test(mime || '') ? '.m4a' : /ogg/i.test(mime || '') ? '.ogg' : '.webm'; }
  async function audioDrive() {
    const p = provider(), site = await p.getSite();
    let url = `/sites/${encodeURIComponent(site.id)}/drives?$select=id,name,webUrl&$top=200`;
    while (url) {
      const page = await p.graph(url);
      const match = (page.value || []).find(d => d.name === AUDIO);
      if (match?.id) return match.id;
      url = page['@odata.nextLink'] || '';
    }
    throw Error('SharePoint audio library drive not found: ' + AUDIO);
  }
  async function uploadAudio(blob, filename) {
    if (blob.size > 15 * 1024 * 1024) throw Error('Recording is larger than the 15 MB pilot limit. Make a shorter recording or type the report.');
    const p = provider(), driveId = await audioDrive();
    const token = await p.getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${encodeURIComponent(filename)}:/content`;
    // Binary upload must not use the provider's JSON Content-Type.
    const result = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
    if (!result.ok) { let info=''; try { const d = await result.json(); info = d?.error?.message || ''; } catch (_) {} throw Error('Audio upload failed (' + result.status + ')' + (info ? ': ' + info : '')); }
    return result.json();
  }
  async function createReport(fields) {
    const p = provider();
    // Retry after a network timeout: query by immutable client ID before creating another row.
    const existing = (await p.getListRows(REPORTS)).find(r => r.fields?.ClientReportId === fields.ClientReportId);
    if (existing) return existing;
    return p.createItem(REPORTS, fields);
  }
  async function patchReport(id, fields, etag) {
    const p = provider(), site = await p.getSite(), listId = await p.getListId(REPORTS);
    const path = `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(id)}/fields`;
    return p.graph(path, { method: 'PATCH', headers: etag ? { 'If-Match': etag } : {}, body: JSON.stringify(fields) });
  }
  function captureText() { return $('fr-text').value.trim(); }
  async function submit() {
    if (!permitted() || submitting) return;
    if (recorder?.state === 'recording') return status('Stop the recording before submitting.', 'warning');
    const pid = String($('fr-project').value || ''), original = captureText();
    if (!projectIds().has(pid)) return status('Select a project assigned to you.', 'warning');
    if (!original && !recordedBlob) return status('Record a report or enter text before submitting.', 'warning');
    if (original.length > 12000) return status('Report exceeds 12,000 characters.', 'warning');
    if (recordedBlob && recordedBlob.size > 15*1024*1024) return status('Recording is too large. Please make a shorter recording.', 'warning');
    if (!identity()) return status('Microsoft account identity is unavailable. Sign in again before submitting.', 'warning');
    setBusy(true);
    try {
      const p = provider();
      await p.getListId(REPORTS);
      if (recordedBlob) await p.getListId(AUDIO);
      if (pendingUpload && (pendingUpload.pid !== pid || pendingUpload.text !== original)) throw Error('Your report changed after a partial save. Refresh before submitting a different report.');
      if (!pendingUpload) pendingUpload = { id: makeId(), pid, text: original, filename: recordedBlob ? null : '' };
      if (recordedBlob && !pendingUpload.filename) pendingUpload.filename = pendingUpload.id + fileExtension(recordedBlob.type);
      const fields = { Title: 'Field report ' + pendingUpload.id.slice(-18), ClientReportId: pendingUpload.id,
        ProjectId: pid, ProjectName: projectName(pid).slice(0,255), SubmittedByName: displayName().slice(0,255),
        SubmittedByEmail: identity().slice(0,255), OriginalText: original,
        ReportStatus: recordedBlob ? 'Uploading Audio' : 'Pending PM Review', AudioFileName: pendingUpload.filename || '',
        ReviewNote: '', ReviewedByName: '', ReviewedAt: '', ReviewHistory: '', ReviewPlan: '[]' };
      const row = await createReport(fields);
      if (recordedBlob) {
        await uploadAudio(recordedBlob, pendingUpload.filename);
        await patchReport(row.id, { ReportStatus: 'Pending PM Review' });
      }
      pendingUpload = null;
      $('fr-text').value = '';
      clearRecording();
      status('Report saved to AHT SharePoint. PM can view it in the review queue. No tasks were changed.', 'success');
      await refresh();
    } catch (e) {
      status('Could not finish submitting: ' + (e.message || e) + '. Keep this page open; your text/recording is still here. Retry Submit.', 'warning');
    } finally { setBusy(false); }
  }
  async function toggleRecording() {
    if (recorder?.state === 'recording') { recorder.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return status('Audio recording is not supported here. You can type the report.', 'warning');
    if (recordedBlob) clearRecording();
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(v => MediaRecorder.isTypeSupported(v));
      recorder = new MediaRecorder(mediaStream, mime ? {mimeType:mime} : undefined);
      chunks = [];
      recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
      recorder.onstop = () => {
        recordedBlob = chunks.length ? new Blob(chunks, {type: recorder.mimeType || chunks[0].type}) : null;
        mediaStream?.getTracks().forEach(t => t.stop()); mediaStream = null; clearInterval(recordTimer);
        $('fr-record').classList.remove('is-recording'); $('fr-record').setAttribute('aria-label', 'Start recording');
        $('fr-record-label').textContent = recordedBlob ? 'Recording ready' : 'No recording saved';
        $('fr-record-note').textContent = recordedBlob ? 'Play it back or submit the report.' : 'Try again or type your update.';
        if (recordedBlob) { if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl); activeAudioUrl = URL.createObjectURL(recordedBlob);
          $('fr-play').src = activeAudioUrl; $('fr-play').hidden = false; $('fr-clear-audio').hidden = false; }
      };
      recorder.onerror = () => status('Recording failed. Try again or type the report.', 'warning');
      recorder.start(1000); started = Date.now();
      $('fr-record').classList.add('is-recording'); $('fr-record').setAttribute('aria-label', 'Stop recording');
      $('fr-record-label').textContent = 'Recording… tap to stop';
      recordTimer = setInterval(() => {const s = Math.floor((Date.now()-started)/1000); $('fr-record-note').textContent = String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');}, 1000);
    } catch (_) { mediaStream?.getTracks().forEach(t => t.stop()); mediaStream=null; status('Microphone unavailable or permission denied. You can type instead.', 'warning'); }
  }
  function clearRecording() {
    if (recorder?.state === 'recording') return;
    recordedBlob = null;
    if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl); activeAudioUrl = null;
    $('fr-play').hidden = true; $('fr-play').removeAttribute('src'); $('fr-clear-audio').hidden = true;
    $('fr-record-label').textContent = 'Tap to record';
    $('fr-record-note').textContent = 'Allow microphone access if prompted. Tap again to stop.';
  }
  function statusLabel(v) { return ({'Pending PM Review':'Pending review','Clarification Needed':'Needs clarification','Acknowledged':'Acknowledged','Changes Applied':'Changes applied','Uploading Audio':'Audio not finished'})[v] || v; }
  function reportHeader(r) {
    return `<div class="fr-report-top"><div><strong>${esc(r.project || projectName(r.projectId))}</strong>
      <div class="fr-muted">${esc(r.author)} · ${esc(dateText(r.created))}</div></div>
      <span class="fr-pill ${r.status === 'Acknowledged' ? 'is-done' : r.status === 'Clarification Needed' ? 'is-question' : ''}">${esc(statusLabel(r.status))}</span></div>`;
  }
  function originalHtml(r, allowTranscript=false) {
    const draft=transcriptDrafts.get(r.id);
    const eligible=allowTranscript&&reviewer()&&r.audioFile&&!r.original.trim()&&r.status!=='Uploading Audio';
    const preview=eligible&&draft?`<div class="fr-field"><label>Review transcription before saving</label><textarea data-transcript-text maxlength="12000" rows="6">${esc(draft)}</textarea><div class="fr-main-actions"><button class="fr-btn fr-btn-primary" type="button" data-save-transcript>Save transcript to report</button><button class="fr-btn" type="button" data-discard-transcript>Discard</button></div><p class="fr-muted">Original audio remains in SharePoint. AI findings still require PM approval before project changes.</p></div>`:'';
    return `<details ${eligible?'open':''}><summary>Original report${r.audioFile ? ' · Listen to recording' : ''}${r.audioFile && !r.original ? ' · Transcript unavailable' : ''}</summary>
      <div class="fr-original">${r.original ? esc(r.original) : 'Audio-only report — review the recording or transcribe it below.'}</div>
      ${r.audioFile ? `<button class="fr-btn" type="button" data-audio="${esc(r.audioFile)}">▶ Play original recording</button><audio controls hidden></audio>` : ''}
      ${eligible?`<div class="fr-main-actions"><button type="button" class="fr-btn" data-run-transcript>Transcribe recording</button></div>${preview}`:''}</details>`;
  }
  function renderMine() {
    const list = $('fr-mine-list'); if (!list) return;
    const mine = records.filter(r => r.authorEmail && r.authorEmail === identity()).sort((a,b) => new Date(b.created) - new Date(a.created));
    list.innerHTML = mine.length ? mine.map(r => `<article class="fr-report">${reportHeader(r)}${originalHtml(r)}
      ${r.reviewNote ? `<div class="fr-review-note"><strong>PM note:</strong> ${esc(r.reviewNote)}</div>` : ''}
      ${planFor(r)?.length?`<div class="fr-review-note"><strong>PM change review:</strong> ${planFor(r).filter(x=>x.state==='applied').length} applied · ${planFor(r).filter(x=>x.state==='clarification').length} needs clarification · ${planFor(r).filter(x=>x.state==='rejected').length} rejected · ${planFor(r).filter(x=>x.state==='proposed').length} pending</div>`:''}</article>`).join('')
      : '<div class="fr-empty">No submitted SharePoint reports found for this account and assigned projects.</div>';
  }
  // v2.9: read-only findings; decisions and record changes remain explicitly PM-controlled.
  const findingLabels={confirmed_decision:'Decision to verify',unapproved_option:'Not approved',reported_completed_work:'Reported completed',outstanding_dependency:'Blocked / waiting',issue_or_risk:'Potential risk',other:'Observation'};
  const attentionCategories=new Set(['outstanding_dependency','issue_or_risk','unapproved_option','confirmed_decision']);
  function findingTokens(f){return new Set(keywords(String(f.subject||'')+' '+String(f.evidence||'')));}
  function conciseFindings(data){
    const all=(Array.isArray(data?.findings)?data.findings:[]).map((item,index)=>({...item,index}));
    const priority={outstanding_dependency:0,unapproved_option:1,confirmed_decision:2,issue_or_risk:3,reported_completed_work:4,other:5};
    const sorted=all.slice().sort((a,b)=>(priority[a.category]??6)-(priority[b.category]??6));
    const visible=[];
    for(const item of sorted){
      const tokens=findingTokens(item);
      const overlap=visible.some(prev=>{
        if(!(['outstanding_dependency','issue_or_risk'].includes(prev.category)&&['outstanding_dependency','issue_or_risk'].includes(item.category)))return false;
        const other=findingTokens(prev),common=[...tokens].filter(k=>other.has(k)).length;
        return common>=2 && common/Math.min(tokens.size||1,other.size||1)>=0.5;
      });
      if(!overlap)visible.push(item);
    }
    return visible;
  }
  function showAI(box,report){
    const panel=box.querySelector('[data-fr-ai-panel]');if(!panel)return;
    const state=aiStates.get(report.id);
    let rows='';
    if(state?.state==='ready'){
      const data=state.data,items=conciseFindings(data);
      const attention=items.filter(x=>attentionCategories.has(x.category));
      const completed=items.filter(x=>x.category==='reported_completed_work');
      const other=items.filter(x=>!attentionCategories.has(x.category)&&x.category!=='reported_completed_work');
      // Scan-first: separate category metadata from the actionable finding title.
      const brief=item=>{
        const needsReview=attentionCategories.has(item.category);
        const kind=needsReview?'attention':item.category==='reported_completed_work'?'done':'other';
        return `<article class="fr-highlight fr-highlight-${kind}"><div class="fr-highlight-copy">
          <span class="fr-highlight-kind">${esc(findingLabels[item.category]||'Observation')}</span>
          <strong class="fr-highlight-title">${esc(shortText(item.subject,140))}</strong>
          ${item.recommended_update?`<p class="fr-highlight-next">${needsReview?'<b>Next:</b> ':''}${esc(shortText(item.recommended_update,200))}</p>`:''}</div>
          ${needsReview?`<button type="button" class="fr-btn fr-prepare-finding" data-fr-use-finding="${item.index}">Prepare task</button>`:''}</article>`;
      };
      const detail=data.findings.map((f,i)=>`<div class="fr-ai-detail"><strong>${esc(findingLabels[f.category]||'Observation')} — ${esc(f.subject)}</strong><p><b>From report:</b> ${esc(f.evidence)}</p>${f.recommended_update?`<p><b>Suggested follow-up:</b> ${esc(f.recommended_update)}</p>`:''}${f.uncertainty?`<p><b>Verify:</b> ${esc(f.uncertainty)}</p>`:''}${f.suggested_record_title?`<p><b>Possible record:</b> ${esc(f.suggested_record_title)} — check manually</p>`:''}</div>`).join('');
      rows=`<div class="fr-ai-result">
        <div class="fr-summary-brief" aria-label="Report findings counts"><span class="fr-summary-attention"><strong>${attention.length}</strong> need${attention.length===1?'s':''} review</span><span class="fr-summary-completed"><strong>${completed.length}</strong> reported complete</span></div>
        ${attention.length?`<section class="fr-findings-section fr-findings-attention"><h4>For PM review</h4><div class="fr-findings-grid">${attention.slice(0,4).map(brief).join('')}</div>${attention.length>4?`<p class="fr-muted">${attention.length-4} more findings in the details below.</p>`:''}</section>`:''}
        ${completed.length?`<section class="fr-findings-section fr-findings-completed"><h4>Work reported complete</h4>${completed.slice(0,3).map(brief).join('')}</section>`:''}
        ${other.length?`<section class="fr-findings-section fr-findings-other"><h4>Other notes</h4>${other.slice(0,2).map(brief).join('')}</section>`:''}
        ${!items.length?'<p class="fr-muted">No distinct findings were identified. Review the original report.</p>':''}
        <details class="fr-ai-expanded"><summary>Full analysis and supporting evidence</summary><p class="fr-ai-overall-summary"><b>Summary:</b> ${esc(data.summary||'No summary available.')}</p>${detail}${data.missing_information?.length?`<div class="fr-ai-detail"><strong>Information to confirm</strong><ul>${data.missing_information.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}</details>
        <p class="fr-ai-disclaimer">Suggestions only. No project records changed. PM approval required.</p></div>`;
    } else if(state?.state==='queued'||state?.state==='loading')rows='<div class="fr-ai-loading" role="status">Preparing your report findings…</div>';
    else if(state?.state==='error')rows=`<div class="fr-ai-error" role="alert">${esc(state.message)} <span>Use “Retry findings” when ready.</span></div>`;
    panel.innerHTML=`<div class="fr-ai-heading"><button type="button" class="fr-btn fr-ai-retry" data-fr-run-ai ${state?.state==='loading'||state?.state==='queued'||!report.original?.trim()?'disabled':''}>${state?.state==='ready'?'Refresh findings':state?.state==='error'?'Retry findings':'Run findings'}</button></div>
      ${!report.original?.trim()?'<div class="fr-muted">No written report available. Play the original recording; automatic transcription is not yet connected.</div>':''}${rows}`;
    // Keep the existing Run/Refresh/Retry action in the report heading.
    // Recreate only this button on each refresh; event delegation still handles clicks.
    const heading=panel.closest('[data-fr-panel="2"]')?.querySelector('.fr-step-heading');
    const action=panel.querySelector('.fr-ai-heading [data-fr-run-ai]');
    if(heading&&action){
      heading.querySelector('[data-fr-run-ai]')?.remove();
      heading.appendChild(action);
      panel.querySelector('.fr-ai-heading')?.remove();
    }
  }
  async function analyzeReport(report,interactive=false){
    if(!reviewer()||!projectIds().has(report.projectId)||!report.original?.trim())return;
    aiStates.set(report.id,{state:'loading'});
    const box=[...root.querySelectorAll('.fr-report[data-report]')].find(x=>x.dataset.report===report.id);
    if(box)showAI(box,report);
    try{
      if(typeof window.getAhtAiAccessToken!=='function')throw Error('AHT AI sign-in is unavailable. Refresh your dashboard and retry.');
      // Background analysis only attempts silent Microsoft authentication; user-triggered retry may show a sign-in prompt.
      const apiToken=await window.getAhtAiAccessToken({interactive});
      if(!apiToken)throw Error('Microsoft did not issue an API token. Select Retry findings to sign in.');
      const matches=relatedStates.get(report.id)?.items||[];
      const candidateRecords=matches.slice(0,12).map(v=>({title:v.title,kind:v.kind||v.source,status:v.status,description:v.description}));
      const response=await fetch('/api/analyze-report',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-AHT-Access-Token':`Bearer ${apiToken}`},body:JSON.stringify({projectName:report.project||projectName(report.projectId),reportText:report.original,candidateRecords})});
      const type=response.headers.get('content-type')||'';
      if(!type.includes('json'))throw Error('The secure analysis service returned an unexpected response. Try refreshing your session.');
      const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Report analysis failed.');
      aiStates.set(report.id,{state:'ready',data});
    }catch(err){aiStates.set(report.id,{state:'error',message:String(err.message||err).slice(0,400)});}
    const current=[...root.querySelectorAll('.fr-report[data-report]')].find(x=>x.dataset.report===report.id);
    if(current){showAI(current,report);const step=current.querySelector('[data-fr-step="2"]');const status=workflowStatus(report)[1];if(step){step.dataset.state=status.state;const note=step.querySelector('small');if(note)note.textContent=status.note;}}
  }
  function startAutomaticReview(report){
    if(!reviewer()||tab!=='review'||errorText||report.id!==activeReviewId||!report.original?.trim()||report.status==='Uploading Audio')return;
    if(aiStates.has(report.id))return; // one analysis per open browser session; explicit Refresh can rerun.
    aiStates.set(report.id,{state:'queued'});
    const box=[...root.querySelectorAll('.fr-report[data-report]')].find(x=>x.dataset.report===report.id);
    if(box)showAI(box,report);
    queueMicrotask(async()=>{
      try{await findRelated(report);}catch(_){}
      if(aiStates.get(report.id)?.state!=='queued')return;
      await analyzeReport(report,false);
    });
  }
  function onAIAnalyze(event){
    const button=event.target.closest('[data-fr-run-ai]');if(!button||!reviewer())return;
    const box=button.closest('[data-report]'),report=records.find(x=>x.id===box?.dataset.report);
    if(!report||aiStates.get(report.id)?.state==='loading')return;
    void analyzeReport(report,true);
  }
  function fillDraftFromFinding(box,report,finding){
    const form=box.querySelector('.fr-add-action');if(!form||!finding)return;
    const action=form.querySelector('[data-plan-action]');action.value='newTask';
    syncDraftTarget(box,true);
    const subject=shortText(finding.subject||'Review reported issue',120);
    // An actionable title for the common framing/speaker dependency; otherwise preserve the finding's meaning.
    const evidenceText=[subject,finding.evidence||''].join(' ');
    const isFramingSpeakerBlock=finding.category==='outstanding_dependency'&&/\bspeakers?\b/i.test(evidenceText)&&/\bfram(?:e|ing)\b/i.test(evidenceText);
    const inLivingRoom=/\bliving\s+room\b/i.test([evidenceText,report.original||''].join(' '));
    const title=isFramingSpeakerBlock
      ?`Confirm framing readiness for remaining ${inLivingRoom?'living room ':''}speakers`
      :(/^(?:confirm|review|follow up|coordinate)\b/i.test(subject)?subject:'Follow up: '+subject);
    form.querySelector('[data-plan-title]').value=shortText(title,180);
    // Only use an obvious system label; leave unknown phase/workstream for PM to decide.
    const context=[subject,finding.evidence].join(' ').toLowerCase();
    const workstream=/speaker|audio|subwoofer/i.test(context)?'AV / Audio':/camera|security|access reader|cctv/i.test(context)?'Security':'',phase='';
    form.querySelector('[data-plan-workstream]').value=workstream;
    form.querySelector('[data-plan-phase]').value=phase;
    form.querySelector('[data-plan-info-required]').value=shortText(finding.recommended_update||'Confirm required next steps with the responsible party.',1000);
    form.querySelector('[data-plan-blocker]').value=finding.category==='outstanding_dependency'?shortText([finding.evidence,finding.uncertainty].filter(Boolean).join(' '),1000):'';
    form.querySelector('[data-plan-note]').value=shortText('Prepared from report finding; PM must confirm scope, workstream, phase and exact wording.',250);
    invalidateDraft(box);
    const banner=box.querySelector('[data-fr-prefill-note]');if(banner)banner.textContent='Draft prepared from report finding. Verify or edit every field, select the project phase, then Preview before saving.';
  }
  function onUseFinding(event){
    const btn=event.target.closest('[data-fr-use-finding]');if(!btn||!reviewer())return;
    const box=btn.closest('[data-report]'),report=records.find(x=>x.id===box?.dataset.report);
    const index=Number(btn.dataset.frUseFinding),finding=aiStates.get(report?.id)?.data?.findings?.[index];
    if(!report||!finding||!projectIds().has(report.projectId))return;
    workflowSteps.set(report.id,3);activateWorkflowStep(box,3);
    fillDraftFromFinding(box,report,finding);draftAutoFilled.add(report.id);
    box.querySelector('.fr-workflow')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  // v2.6: guided presentation only. The v2.5 ETag, preview, approval, Undo and audit routines remain authoritative.
  function workflowStatus(r){
    const plan=planFor(r)||[],state=relatedStates.get(r.id);
    const anyPending=plan.some(a=>a.state==='proposed'),anyApplied=plan.some(a=>['applied','undone'].includes(a.state));
    const attention=plan.some(a=>['applying','undoing'].includes(a.state));
    return [
      {title:'Report',note:'Submitted',state:'complete'},
      {title:'Findings',note:aiStates.get(r.id)?.state==='ready'?'Ready':aiStates.get(r.id)?.state==='loading'||aiStates.get(r.id)?.state==='queued'?'Preparing':state?.state==='ready'?'Records checked':state?.state==='error'?'Check failed':'Not checked',state:aiStates.get(r.id)?.state==='ready'||state?.state==='ready'?'complete':state?.state==='error'?'attention':'idle'},
      {title:'Propose',note:plan.length?'Saved':'Not started',state:plan.length?'complete':'idle'},
      {title:'PM approval',note:attention?'Reconcile':anyPending?'Awaiting PM':anyApplied?'Reviewed':'Not started',state:attention?'attention':anyPending?'pending':anyApplied?'complete':'idle'},
      {title:'History',note:anyApplied?'Available':'Not started',state:anyApplied?'complete':'idle'}
    ];
  }
  function initialWorkflowStep(r){
    const plan=planFor(r)||[];
    return plan.some(a=>a.state==='proposed')?4:plan.some(a=>['applied','undone','applying','undoing'].includes(a.state))?5:2;
  }
  function activateWorkflowStep(box,step){
    const r=records.find(x=>x.id===box.dataset.report);if(!r)return;
    const chosen=Math.max(1,Math.min(5,Number(step)||1));workflowSteps.set(r.id,chosen);
    box.querySelectorAll('[data-fr-step]').forEach(b=>{const active=Number(b.dataset.frStep)===chosen;b.setAttribute('aria-current',active?'step':'false');});
    box.querySelectorAll('[data-fr-panel]').forEach(panel=>{panel.hidden=Number(panel.dataset.frPanel)!==chosen;});
    const current=box.querySelector('[data-fr-current-step]');if(current)current.textContent=`Step ${chosen} of 5 · ${workflowStatus(r)[chosen-1].title}`;
    if(chosen===3&&!draftAutoFilled.has(r.id)&&!(planFor(r)||[]).length){
      const finding=conciseFindings(aiStates.get(r.id)?.data).find(x=>attentionCategories.has(x.category));
      if(finding){fillDraftFromFinding(box,r,finding);draftAutoFilled.add(r.id);}
    }
  }
  function onWorkflowClick(e){
    const toggle=e.target.closest('[data-open-report]');
    if(toggle){const id=toggle.closest('[data-report]')?.dataset.report;activeReviewId=activeReviewId===id?'__closed__':id;renderReview();return;}
    const btn=e.target.closest('[data-fr-step],[data-fr-next]');if(!btn)return;
    const box=btn.closest('[data-report]');if(box){activateWorkflowStep(box,btn.dataset.frStep||btn.dataset.frNext);box.querySelector('.fr-workflow')?.scrollIntoView({behavior:'smooth',block:'start'});}
  }
  function workflowPanel(n,title,description){
    const el=document.createElement('section');el.className='fr-step-panel';el.dataset.frPanel=String(n);
    el.innerHTML=`<div class="fr-step-heading"><h3>${title}</h3><p class="fr-muted">${description}</p></div>`;
    return el;
  }
  function workflowNext(target,label){const row=document.createElement('div');row.className='fr-step-footer';row.innerHTML=`<button type="button" class="fr-btn fr-btn-primary" data-fr-next="${target}">${label}</button>`;return row;}
  function setupWorkflow(box,r){
    if(!r)return;
    const source=box.querySelector('.fr-pm-proposal'),references=box.querySelector('.fr-related');if(!source||!references)return;
    const original=box.querySelector('details:not(.fr-add-action):not(.fr-history-panel)');
    const acknowledgment=box.querySelector('.fr-proposal');
    const draft=source.querySelector('.fr-add-action'),history=source.querySelector('.fr-history-panel');
    const entries=[...source.querySelectorAll('.fr-plan-entry')];
    const workflow=document.createElement('div');workflow.className='fr-workflow';
    const steps=workflowStatus(r);
    workflow.innerHTML=`<div class="fr-workflow-top"><strong>Review this report</strong><span class="fr-muted" data-fr-current-step></span></div>
      <div class="fr-step-nav" aria-label="Review workflow steps">${steps.map((x,i)=>`<button type="button" class="fr-step-button" data-fr-step="${i+1}" data-state="${x.state}" aria-current="false"><span class="fr-step-number">${i+1}</span><span class="fr-step-copy"><strong>${esc(x.title)}</strong><small>${esc(x.note)}</small></span></button>`).join('')}</div>
      <div class="fr-step-legend"><span><b class="fr-legend-dot is-done"></b>Done</span><span><b class="fr-legend-dot is-pending"></b>Pending PM</span><span><b class="fr-legend-dot is-attention"></b>Needs attention</span><span><b class="fr-legend-dot is-idle"></b>Not started</span></div>`;
    const p1=workflowPanel(1,'Field report','Original technician notes are preserved. Report acknowledgment does not approve project changes.');
    if(original){original.open=true;p1.appendChild(original);}
    if(acknowledgment){const details=document.createElement('details');details.className='fr-acknowledgment';details.innerHTML='<summary>Report acknowledgment (separate from change approval)</summary>';details.appendChild(acknowledgment);p1.appendChild(details);}
    p1.appendChild(workflowNext(2,'Review findings →'));
    const p2=workflowPanel(2,'Report findings','');
    const aiBox=document.createElement('section');aiBox.className='fr-ai-panel';aiBox.setAttribute('data-fr-ai-panel','');p2.appendChild(aiBox);
    p2.appendChild(references);
    if(original){const proof=original.cloneNode(true);proof.open=false;proof.classList.add('fr-source-evidence');p2.appendChild(proof);}
    const manual=document.createElement('details');manual.className='fr-manual-records';manual.innerHTML='<summary>Need a different project record?</summary><p class="fr-muted">Browse records within this project. A PM must still select and approve every actual update.</p><button type="button" class="fr-btn" data-browse-records>Browse project records</button>';
    p2.appendChild(manual);p2.appendChild(workflowNext(3,'Continue to proposal →'));
    const p3=workflowPanel(3,'Prepare proposal','Start from a report finding, verify the details and preview before saving. Saving a proposal does not change the Project Plan.');
    if(draft){draft.open=true;draft.querySelector('summary').hidden=true;const prep=document.createElement('p');prep.className='fr-prefill-note';prep.setAttribute('data-fr-prefill-note','');prep.textContent='Choose a finding above or enter a proposal. Nothing is saved automatically.';p3.appendChild(prep);
      const targetWrap=draft.querySelector('[data-draft-target-wrap]');
      if(targetWrap){const search=document.createElement('input');search.type='text';search.placeholder='Filter available records by name…';search.setAttribute('data-record-search','');search.setAttribute('aria-label','Filter matching project records');search.className='fr-record-search';targetWrap.insertBefore(search,targetWrap.querySelector('[data-plan-target]'));}
      p3.appendChild(draft);
    }
    if((planFor(r)||[]).length)p3.appendChild(workflowNext(4,'Review saved proposals →'));
    const p4=workflowPanel(4,'PM approval','Preview the current SharePoint value for each saved proposal, then approve, clarify or reject individually. Approval updates only the selected record.');
    if(planFor(r)===null){const warning=document.createElement('div');warning.className='fr-plan-warning';warning.textContent='Saved PM plan cannot be read. No project changes are allowed until an administrator reconciles it.';p4.appendChild(warning);}
    const pending=entries.filter(x=>!['applied','undone'].includes(x.dataset.planState));
    if(pending.length)pending.forEach(x=>p4.appendChild(x));else{const message=document.createElement('p');message.className='fr-muted fr-step-empty';message.textContent='No pending proposals for this report. Add one in Step 3, or review completed actions in Step 5.';p4.appendChild(message);}
    p4.appendChild(workflowNext(5,'View history →'));
    const p5=workflowPanel(5,'History & reversals','Review prior changes below. Undo is a separate, protected action available only for eligible applied changes.');
    // History is the primary reversal workspace. Retain the old applied-action
    // card only when an older record has no linked approval audit event.
    const historicalIds=new Set(historyEntries(r).filter(x=>x.event==='approved and applied'&&x.proposalId).map(x=>String(x.proposalId)));
    entries.filter(x=>['applied','undone'].includes(x.dataset.planState)&&!historicalIds.has(x.dataset.planId)).forEach(x=>p5.appendChild(x));
    if(history){history.open=true;history.querySelector('summary').textContent='Change history ('+historyEntries(r).length+')';p5.appendChild(history);}
    const panes=document.createElement('div');panes.className='fr-workflow-panes';[p1,p2,p3,p4,p5].forEach(x=>panes.appendChild(x));workflow.appendChild(panes);
    source.remove();box.appendChild(workflow);
    showAI(box,r);
    activateWorkflowStep(box,workflowSteps.has(r.id)?workflowSteps.get(r.id):initialWorkflowStep(r));
  }
  function renderReview() {
    const list = $('fr-review-list'); if (!list) return;
    if (!reviewer()) {list.textContent = 'PM or Administrator permission required.';return;}
    const items = records.slice().sort((a,b) => new Date(b.created) - new Date(a.created));
    if(items.length && !activeReviewId)activeReviewId=items[0].id;
    if(items.length && activeReviewId!=='__closed__' && !items.some(x=>x.id===activeReviewId))activeReviewId=items[0].id;
    list.innerHTML = items.length ? items.map(r => {
      const plan=planFor(r)||[],pending=plan.filter(x=>x.state==='proposed').length;
      const expanded=activeReviewId===r.id;
      const summary=`${pending} proposed change${pending===1?'':'s'} · ${historyEntries(r).length} history entr${historyEntries(r).length===1?'y':'ies'}`;
      return `<article class="fr-report ${expanded?'fr-report-open':'fr-report-closed'}" data-report="${esc(r.id)}">
        <div class="fr-review-head">${reportHeader(r)}<button type="button" class="fr-btn fr-open-report" data-open-report aria-expanded="${expanded}">${expanded?'Close review':'Open review'} <span aria-hidden="true">${expanded?'−':'+'}</span></button></div>
        ${expanded?`${originalHtml(r,true)}${proposalHtml(r)}${referenceHtml(r)}
          ${r.status==='Changes Applied' ? '<div class="fr-muted fr-review-complete">Approved project update recorded; verify the target and use Undo from Step 5 if needed.</div>' : `<div class="fr-proposal"><div class="fr-proposal-title">Report acknowledgment (separate from task approval)</div>
          ${r.status==='Uploading Audio' ? '<p class="fr-muted">Audio upload incomplete. Submitter must retry before this report can be reviewed.</p>' : ''}
          <div class="fr-field"><label for="fr-review-${esc(r.id)}">Decision</label><select id="fr-review-${esc(r.id)}" data-review-status>
            <option value="Pending PM Review" ${r.status==='Pending PM Review'?'selected':''}>Not sure / Hold for review</option>
            <option value="Acknowledged" ${r.status==='Acknowledged'?'selected':''}>Acknowledge report received</option>
            <option value="Clarification Needed" ${r.status==='Clarification Needed'?'selected':''}>Needs clarification in Teams</option>
          </select></div><div class="fr-field"><label for="fr-note-${esc(r.id)}">PM note (optional)</label><textarea id="fr-note-${esc(r.id)}" data-review-note maxlength="2000" placeholder="Which detail needs clarification?">${esc(r.reviewNote)}</textarea></div>
          <div class="fr-main-actions"><span class="fr-muted">Updates report review status only.</span><button class="fr-btn fr-btn-primary" type="button" data-save-review>Confirm review</button></div></div>`}`
          :`<div class="fr-queue-summary">${esc(summary)} · ${esc(shortText(r.original,105))}</div>`}
      </article>`;
    }).join('') : '<div class="fr-empty">No SharePoint field reports found for your assigned projects.</div>';
    list.querySelectorAll('.fr-report-open[data-report]').forEach(box=>{
      const report=records.find(x=>x.id===box.dataset.report);
      setupWorkflow(box,report);syncDraftTarget(box);
      if(report){startAutomaticReview(report);if(!relatedStates.has(report.id)&&!report.original?.trim())refreshRelatedDisplay(report);}
    });
  }
  function render() {
    if (!mounted) return; syncNav(); fillProjects(); $('fr-tab-review').hidden = !reviewer();
    $('fr-count').textContent = reviewer() ? '(' + records.filter(r => r.status === 'Pending PM Review').length + ')' : '';
    renderMine(); renderReview();
  }
  async function onReviewClick(e) {
    const b = e.target.closest('[data-save-review]'); if (!b || !reviewer()) return;
    const box = b.closest('[data-report]'); const r = records.find(x => x.id === box?.dataset.report);
    if (!r || !projectIds().has(r.projectId)) return;
    if (r.status === 'Uploading Audio') return alert('This recording has not finished uploading. Ask the submitter to retry first.');
    if (r.status === 'Changes Applied') return alert('This report has applied changes. To propose more, use Proposed project changes above.');
    const decision = box.querySelector('[data-review-status]').value;
    const note = box.querySelector('[data-review-note]').value.trim();
    if (!['Pending PM Review', 'Acknowledged', 'Clarification Needed'].includes(decision)) return;
    if (decision === 'Clarification Needed' && !note) return alert('Add a short clarification note first. Teams notifications are not connected yet.');
    if (!window.confirm('Save PM review status to SharePoint?\n\n' + statusLabel(decision) + '\n\nNo Project Plan task will change.')) return;
    b.disabled = true;
    try {
      const p = provider(), site = await p.getSite(), listId = await p.getListId(REPORTS);
      // Read newest server state; require a matching ETag for conflict detection.
      const latest = await p.graph(`/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(r.id)}?$expand=fields`);
      const fresh = readRecord(latest);
      if (fresh.status !== r.status || fresh.reviewNote !== r.reviewNote) throw Error('This report changed since you opened it. Refresh before reviewing.');
      let history = [];
      try {history = JSON.parse(fresh.history || '[]'); if (!Array.isArray(history)) history=[];} catch (_) { history=[]; }
      history.push({at: new Date().toISOString(), by: identity(), before: fresh.status, after: decision, note});
      if (JSON.stringify(history).length > 60000) throw Error('Review history is at capacity; contact administrator.');
      await patchReport(r.id, {ReportStatus: decision, ReviewNote:note, ReviewedByName:displayName().slice(0,255), ReviewedAt:new Date().toISOString(), ReviewHistory:JSON.stringify(history)}, latest.eTag || latest['@odata.etag'] || '');
      await refresh();
    } catch (err) {alert('Could not save PM review: '+ (err.message || err));}
    finally {b.disabled = false;}
  }
  async function onTranscriptAction(event) {
    const button=event.target.closest('[data-run-transcript],[data-save-transcript],[data-discard-transcript]');
    if(!button||!reviewer())return;
    const box=button.closest('.fr-report[data-report]');const r=records.find(x=>x.id===box?.dataset.report);
    if(!r||!projectIds().has(r.projectId)||!r.audioFile||r.original.trim()||r.status==='Uploading Audio')return;
    if(button.hasAttribute('data-discard-transcript')){transcriptDrafts.delete(r.id);renderReview();return;}
    button.disabled=true;
    try{
      if(button.hasAttribute('data-run-transcript')){
        if(typeof window.getAhtAiAccessToken!=='function')throw Error('AHT AI sign-in is not available.');
        const token=await window.getAhtAiAccessToken({interactive:true});
        if(!token)throw Error('Microsoft AI access token was not issued.');
        const p=provider(),driveId=await audioDrive();
        if(!/^ahtfr-[a-z0-9-]+\.(webm|m4a|ogg|mp4)$/.test(r.audioFile))throw Error('Unexpected audio filename.');
        const item=await p.graph(`/drives/${encodeURIComponent(driveId)}/root:/${encodeURIComponent(r.audioFile)}:`);
        const url=item?.['@microsoft.graph.downloadUrl'];
        if(!url||!/^https:\/\//i.test(url))throw Error('Microsoft did not provide the recording download.');
        const downloaded=await fetch(url);if(!downloaded.ok)throw Error('Could not download the original recording.');
        const blob=await downloaded.blob();if(blob.size>15*1024*1024)throw Error('Recording exceeds the transcription limit.');
        const form=new FormData();form.append('file',blob,r.audioFile);
        const response=await fetch('/api/transcribe-report',{method:'POST',credentials:'same-origin',headers:{'X-AHT-Access-Token':`Bearer ${token}`},body:form});
        if(!(response.headers.get('content-type')||'').includes('json'))throw Error('Unexpected transcription service response.');
        const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Transcription failed.');
        transcriptDrafts.set(r.id,String(data.transcript).slice(0,12000));renderReview();return;
      }
      if(button.hasAttribute('data-save-transcript')){
        const transcript=String(box.querySelector('[data-transcript-text]')?.value||'').trim();
        if(!transcript||transcript.length>12000)throw Error('Review a transcript of 12,000 characters or fewer.');
        const p=provider(),site=await p.getSite(),listId=await p.getListId(REPORTS);
        const latest=await p.graph(`/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(r.id)}?$expand=fields`);
        const fresh=readRecord(latest);
        if(fresh.projectId!==r.projectId||fresh.audioFile!==r.audioFile||fresh.original.trim()||fresh.status==='Uploading Audio')throw Error('Report changed. Refresh before saving the transcript.');
        const history=readAudit(fresh.history);history.push({at:new Date().toISOString(),by:identity(),event:'transcript reviewed and saved',audioFile:r.audioFile});
        if(JSON.stringify(history).length>60000)throw Error('Audit history is at capacity.');
        await patchReport(r.id,{OriginalText:transcript,ReviewHistory:JSON.stringify(history)},latest.eTag||latest['@odata.etag']);
        transcriptDrafts.delete(r.id);aiStates.delete(r.id);await refresh();return;
      }
    }catch(ex){alert('Transcription: '+String(ex?.message||ex));}
    finally{button.disabled=false;}
  }
  async function playAudioClick(event) {
    const btn = event.target.closest('[data-audio]'); if (!btn) return;
    const filename = btn.dataset.audio;
    if (!/^ahtfr-[a-z0-9-]+\.(webm|m4a|ogg)$/.test(filename)) return alert('Unexpected audio filename.');
    const audio = btn.parentElement.querySelector('audio'); if (!audio) return;
    btn.disabled = true;
    try {
      const p = provider(), driveId = await audioDrive();
      // Do not use $select for the temporary download annotation: Graph may omit it.
      // Request the DriveItem normally so we also receive its SharePoint webUrl.
      const item = await p.graph(`/drives/${encodeURIComponent(driveId)}/root:/${encodeURIComponent(filename)}:`);
      const downloadUrl = item?.['@microsoft.graph.downloadUrl'];
      const fallback = item?.webUrl;
      const previousLink = btn.parentElement.querySelector('[data-audio-sharepoint]');
      if (previousLink) previousLink.remove();
      // This link is a user-clickable fallback, never an automatic cross-origin redirect.
      if (fallback) {
        const u = new URL(fallback);
        if (u.protocol === 'https:' && u.hostname === 'ahtglobalteam.sharepoint.com') {
          const link = document.createElement('a');
          link.href = u.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className = 'fr-btn';
          link.dataset.audioSharepoint = '1';
          link.textContent = 'Open recording in SharePoint';
          btn.insertAdjacentElement('afterend', link);
        }
      }
      if (!downloadUrl || !/^https:\/\//.test(downloadUrl)) {
        throw Error('Microsoft did not provide a direct playback URL. Use Open recording in SharePoint.');
      }
      const response = await fetch(downloadUrl);
      if (!response.ok) throw Error('Could not download recording (' + response.status + '). Use Open recording in SharePoint.');
      const blob = await response.blob();
      if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
      activeAudioUrl = URL.createObjectURL(blob);
      audio.src = activeAudioUrl;
      audio.hidden = false;
      await audio.play();
    } catch (e) {alert('Audio unavailable: ' + (e.message || e));}
    finally {btn.disabled = false;}
  }
  function onView() {if (!permitted()) {syncNav();return;} layout(); fillProjects(); render(); refresh();}
  function init() {
    syncNav();
    const label = document.getElementById('roleLabel');
    if (label) new MutationObserver(syncNav).observe(label,{childList:true,subtree:true,characterData:true});
    const app = document.getElementById('app');
    if (app) new MutationObserver(syncNav).observe(app,{attributes:true,attributeFilter:['class']});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.AHTFieldReporting = {canAccess:permitted, onView, syncNav};
})();
