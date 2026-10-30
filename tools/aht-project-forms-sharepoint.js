(function () {
  'use strict';
  let host = null;
  try { if (window.parent !== window && window.parent.location.origin === window.location.origin) host=window.parent.AHTProjectFormsHost; } catch (_) {}
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  const API = {
    get connected() { return !!host?.getGraphToken; },
    get context() { return host?.getContext?.() || {user:null,projects:[],siteUrl:''}; },
    async token(){ if(!host) throw new Error('Open this tool inside the signed-in AHT dashboard to use SharePoint.'); return host.getGraphToken(); },
    async request(path, opts={}) {
      const token = await API.token();
      const headers = {'Authorization':'Bearer '+token,...(opts.headers||{})};
      if (opts.body && typeof opts.body==='string' && !headers['Content-Type']) headers['Content-Type']='application/json';
      const res = await fetch(GRAPH + path,{...opts,headers});
      if(!res.ok){const msg = await res.text();throw new Error('SharePoint '+res.status+': '+msg.slice(0,350));}
      if(res.status===204)return null;
      return res.json();
    },
    async me(){return API.request('/me?$select=id,mail,userPrincipalName,displayName,officeLocation');},
    async site(siteUrl){
      const url=siteUrl||API.context.siteUrl;
      if(!url)throw new Error('SharePoint site URL is not configured in the dashboard.');
      const u=new URL(url);
      return API.request('/sites/'+encodeURIComponent(u.hostname)+':'+u.pathname);
    },
    async drives(siteUrl){const s=await API.site(siteUrl);const r=await API.request('/sites/'+encodeURIComponent(s.id)+'/drives?$select=id,name,webUrl,driveType');return r.value||[];},
    async children(driveId,folderId){
      let path=folderId ? '/drives/'+encodeURIComponent(driveId)+'/items/'+encodeURIComponent(folderId)+'/children' : '/drives/'+encodeURIComponent(driveId)+'/root/children';
      const all=[];do {const r=await API.request(path);all.push(...(r.value||[]));path=r['@odata.nextLink']?.replace(GRAPH,'')||'';}while(path && all.length<3000);
      return all;
    },
    async folderItem(driveId,path){
      const encoded=path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
      return API.request('/drives/'+encodeURIComponent(driveId)+(encoded?'/root:/'+encoded:'/root'));
    },
    async resolveFolderSpec(spec){
      if(!spec)throw new Error('No SharePoint folder mapping configured.');
      if(typeof spec==='string')spec={url:spec};
      let {driveId,folderId,driveName,siteUrl,path,rootName,url}=spec;
      if(url){
        // Handle a direct folder URL or SharePoint's AllItems.aspx?id=/sites/... link.
        const parsed=new URL(url);
        const id=parsed.searchParams.get('id');
        const pathname=id?.startsWith('/')?id:parsed.pathname;
        const nodes=decodeURIComponent(pathname).split('/').filter(Boolean);
        if(!['sites','teams'].includes(nodes[0]?.toLowerCase())||nodes.length<3)
          throw new Error('Use a direct SharePoint folder link with its site and document-library path.');
        siteUrl=parsed.origin+'/'+nodes[0]+'/'+nodes[1];
        driveName=nodes[2];path=nodes.slice(3).join('/');
      }
      siteUrl=siteUrl||API.context.siteUrl;
      if(!siteUrl)throw new Error('The folder mapping does not specify a SharePoint site.');
      if(!driveId){
        const drives=await API.drives(siteUrl);
        if(!drives.length)throw new Error('No authorized document libraries were found at '+siteUrl);
        const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
        const match=drives.filter(d=>normalize(d.name)===normalize(driveName)||normalize(decodeURIComponent(new URL(d.webUrl||siteUrl).pathname.split('/').pop()||''))===normalize(driveName));
        if(driveName&&match.length!==1)throw new Error('Could not uniquely match document library "'+driveName+'" in '+siteUrl);
        const chosen=match[0]||drives.find(d=>normalize(d.name)==='documents');
        if(!chosen)throw new Error('A document library must be specified in the folder mapping.');
        driveId=chosen.id;driveName=chosen.name;
      }
      const item=folderId?{id:folderId,folder:{}}:await API.folderItem(driveId,String(path||''));
      if(!item.folder)throw new Error('The mapped SharePoint location is not a folder.');
      const name=rootName||(path?item.name:driveName)||item.name||'Documents';
      return {driveId,folderId:item.id,driveName:driveName||'Documents',rootName:name,path:String(path||name),siteUrl};
    },
    async getMaster() {
      const m=API.context.masterFile;
      if(!m?.driveId || !m?.itemId)return null;
      const token=await API.token();
      const url=GRAPH+'/drives/'+encodeURIComponent(m.driveId)+'/items/'+encodeURIComponent(m.itemId)+'/content';
      const res=await fetch(url,{headers:{Authorization:'Bearer '+token}});
      if(!res.ok)throw new Error('Unable to load locked SharePoint master template ('+res.status+').');
      return res.json();
    },
    async setMaster(value) {
      const m=API.context.masterFile;
      if(!m?.driveId||!m?.itemId)throw new Error('Master SharePoint file is not configured. See SETUP.md to set its restricted file ID.');
      const token=await API.token();
      const bytes=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
      const url=GRAPH+'/drives/'+encodeURIComponent(m.driveId)+'/items/'+encodeURIComponent(m.itemId)+'/content';
      const res=await fetch(url,{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:bytes});
      if(!res.ok)throw new Error('SharePoint refused the master update ('+res.status+'). Check template permissions.');
      return res.json();
    },
    async issuePDF(driveId,folderId,name,blob) {
      if (!driveId||!folderId)throw new Error('Choose a project SharePoint folder first.');
      // Create an upload session with conflict=fail. Never replace an issued ticket.
      const item={'@microsoft.graph.conflictBehavior':'fail',name};
      const session=await API.request('/drives/'+encodeURIComponent(driveId)+'/items/'+encodeURIComponent(folderId)+':/'+encodeURIComponent(name)+':/createUploadSession', {method:'POST',body:JSON.stringify({item})});
      if(!session?.uploadUrl)throw new Error('SharePoint did not return an upload session.');
      const r=await fetch(session.uploadUrl,{method:'PUT',headers:{'Content-Range':`bytes 0-${blob.size-1}/${blob.size}`},body:blob});
      if(!r.ok)throw new Error('PDF upload failed ('+r.status+'). No issued number has been confirmed.');
      return r.json();
    }
  };
  window.AHTProjectFormsSP=Object.freeze(API);
})();
