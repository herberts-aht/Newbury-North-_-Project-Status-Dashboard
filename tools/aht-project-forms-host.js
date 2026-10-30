/* Dashboard-side adapter; add this script after the existing dashboard scripts.
   All access to the dashboard's current auth/project globals happens here.
   Never store access tokens, never bypass SharePoint's permissions. */
(function () {
  'use strict';
  function available(v) { return typeof v !== 'undefined' && v !== null; }
  function user() {
    try { if (typeof currentUser !== 'undefined' && currentUser) return currentUser; } catch (_) {}
    return window.currentUser || window.AuthManager?.currentUser || null;
  }
  function rawProjectRecords(){
    let list=[];
    try{if(typeof state!=='undefined' && Array.isArray(state?.projects))list=state.projects;}catch(_){}
    if(!list.length)try{if(typeof PROJECTS!=='undefined' && Array.isArray(PROJECTS))list=PROJECTS;}catch(_){}
    if(!list.length)list=window.dashboardState?.projects||window.PROJECTS||[];
    return Array.isArray(list)?list:[];
  }
  const textValue = v => typeof v==='string'?v.trim():'';
  function getFolderUrl(record){
    if(!record)return '';
    const names=['projectDocumentRootUrl','documentFolderUrl','projectFolderUrl','documentsFolderUrl','sharePointFolderUrl','sharePointProjectFolderUrl','sharePointDocumentsUrl','documentRootUrl','projectSharePointUrl'];
    for(const key of names){const value=textValue(record[key]);if(/^https:\/\//i.test(value))return value;}
    return '';
  }
  function officeFrom(value){
    if(!value)return '';
    const keys=['homeOffice','homeOfficeName','HomeOffice','HomeOfficeName','office','officeName','Office','OfficeName','branch','branchName','Branch','location','officeLocation'];
    for(const k of keys){const v=value[k];if(typeof v==='string'&&v.trim())return v.trim();if(v?.name)return String(v.name);}
    return '';
  }
  function projects() {
    // The existing dashboard project dropdown is authoritative for the projects
    // visible to the signed-in user. In newer dashboard versions its in-memory
    // project list is not necessarily published as window.PROJECTS.
    const selector = document.getElementById('projectSelect');
    const visible = selector ? Array.from(selector.options)
      .filter(o => o.value && !o.disabled && !o.closest('optgroup[disabled]'))
      .map(o => ({id:String(o.value), name:String(o.textContent || o.label || o.value).trim(), code:String(o.value)}))
      : [];
    if (visible.length){
      const records=rawProjectRecords();
      return visible.map(p=>{
        const exact=records.find(r=>[r.id,r.key,r.projectKey,r.ProjectKey,r.name,r.address,r.ProjectName,r.ProjectAddress]
          .filter(Boolean).some(k=>String(k).toLowerCase()===p.id.toLowerCase()||String(k).toLowerCase()===p.name.toLowerCase()));
        if(!exact)return p;
        return {...p,code:String(exact.projectNumber||exact.projectCode||exact.key||p.code),
          folderUrl:getFolderUrl(exact),office:officeFrom(exact)};
      });
    }
    let list = [];
    try { if (typeof PROJECTS !== 'undefined' && Array.isArray(PROJECTS)) list = PROJECTS; } catch (_) {}
    if (!list.length) list = window.PROJECTS || window.dashboardState?.projects || [];
    if (!Array.isArray(list)) return [];
    return list.filter(x => x && typeof x === 'object').map((x,i) => ({
      id: String(x.key || x.projectKey || x.id || x.ProjectKey || 'project-'+i),
      name: String(x.address || x.name || x.title || x.ProjectName || x.projectName || x.key || x.id || 'Project'),
      code: String(x.projectNumber || x.projectCode || x.key || x.projectKey || x.id || ''),
      folderUrl: getFolderUrl(x), office:officeFrom(x),
    }));
  }
  function tokenProvider() {
    const fns = [];
    try { if (typeof getGraphAccessToken === 'function') fns.push(getGraphAccessToken); } catch (_) {}
    try { if (typeof getAccessToken === 'function') fns.push(getAccessToken); } catch (_) {}
    if (typeof window.getGraphAccessToken === 'function') fns.push(window.getGraphAccessToken.bind(window));
    if (typeof window.AuthManager?.getAccessToken === 'function') fns.push(window.AuthManager.getAccessToken.bind(window.AuthManager));
    return fns;
  }
  async function getGraphToken() {
    for (const fn of tokenProvider()) {
      try {
        const value = await fn(['Sites.ReadWrite.All', 'User.Read']);
        const token = typeof value === 'string' ? value : value?.accessToken;
        if (token && typeof token === 'string') return token;
      } catch (_) { /* try dashboard's next supported provider */ }
    }
    let client = window.msalInstance || null;
    try { if (!client && typeof msalInstance !== 'undefined') client = msalInstance; } catch (_) {}
    if (client?.acquireTokenSilent) {
      const account = client.getActiveAccount?.() || client.getAllAccounts?.()[0];
      if (!account) throw new Error('Please sign in to the dashboard before saving to SharePoint.');
      const result = await client.acquireTokenSilent({scopes:['Sites.ReadWrite.All','User.Read'],account});
      if (result?.accessToken) return result.accessToken;
    }
    throw new Error('The dashboard has not exposed a Microsoft Graph access token. SharePoint upload is not yet connected.');
  }
  function sharePointSite() {
    try { if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG?.sharePoint?.siteUrl) return APP_CONFIG.sharePoint.siteUrl; } catch (_) {}
    return window.APP_CONFIG?.sharePoint?.siteUrl || '';
  }
  function folderRoots(){
    // AHT_PROJECT_FORMS_FOLDER_ROOTS holds VERIFIED office/project locations,
    // never guesses from geography or grants access to documents.
    return window.AHT_PROJECT_FORMS_FOLDER_ROOTS || window.APP_CONFIG?.sharePoint?.projectFormsFolderRoots || {offices:{},projects:{}};
  }
  async function submitTemplateRequest(payload){
    const list=window.APP_CONFIG?.sharePoint?.lists?.dashboardHelpTickets;
    let provider;
    try{if(typeof SharePointDataProvider!=='undefined')provider=SharePointDataProvider;}catch(_){}
    provider=provider||window.SharePointDataProvider;
    if(!list||!provider||typeof provider.createItem!=='function')throw new Error('Dashboard Help Tickets are unavailable');
    const u=user()||{};
    const fields={
      Title:'Project Forms — Master Template Change Request',
      RequesterName:String(u.name||'').trim(),RequesterEmail:String(u.email||'').trim(),
      RequesterRole:String(u.role||'Editor').trim(),RequesterUserId:String(u.id||'').trim(),
      ProjectName:String(payload.project||'No project'),ProjectKey:'',
      PageArea:'Tools & Utilities / Project Forms',RequestType:'Other',Urgency:'Normal',
      Description:'REQUEST FOR SITE-WIDE TEMPLATE CHANGE (owner review)\n\nForm: '+String(payload.title||'')+'\nProject: '+String(payload.project||'')+'\n\n'+String(payload.details||'').slice(0,4000),
      Status:'Open',SourceUrl:String(location.href||''),BrowserInfo:String(navigator.userAgent||'')
    };
    return provider.createItem(list,fields);
  }
  window.AHTProjectFormsHost = Object.freeze({
    version:5,
    getContext() { return {user:user(),projects:projects(),homeOffice:officeFrom(user()),siteUrl:sharePointSite(),
      folderRoots:folderRoots(),masterFile:window.AHT_PROJECT_FORMS_MASTER_FILE || null}; },
    getGraphToken,submitTemplateRequest
  });
})();
