/* AHT Operations tool visibility pilot. This is a client UI policy, not authorization.
 * SharePoint/file ACLs MUST enforce access in production. ToolGrants must come
 * from an authoritative Dashboard Access record before office-admin grants go live.
 */
(function(){'use strict';
 const normal=v=>String(v||'').trim().toLowerCase();
 function actor(){try{return typeof currentUser==='undefined'?null:currentUser;}catch(_){return null;}}
 function owner(u){return Boolean(u?.isSystemOwner);}
 function admin(u){return Boolean(u?.canAdmin)||['admin','administrator','system owner'].includes(normal(u?.role));}
 function ops(u){return ['operations','operations manager','warehouse manager'].includes(normal(u?.role));}
 function eligible(u){return Boolean(u&&u.active!==false&&u.isInternal!==false&&normal(u.entraUserType)!=='guest');}
 function canOpen(key){const u=actor();if(!eligible(u))return false;
  if(!ops(u))return Boolean(u.canEdit||admin(u));
  if(owner(u)||admin(u))return true;
  if(key==='forms')return true;
  const grants=Array.isArray(u.toolGrants)?u.toolGrants:[];
  if(key==='labels')return grants.includes('labels');
  // Markup tool grants require a System Owner-approved permission record.
  return grants.includes(key) && ['lighting','shades','cctv','devices','access'].includes(key);
 }
 function canOpenHub(){const u=actor();return Boolean(eligible(u)&&(ops(u)||u.canEdit||admin(u)));}
 function refresh(){const u=actor();if(!eligible(u))return;
  const link=document.querySelector('.sidebar-nav [data-view="tools"]');if(link&&ops(u))link.hidden=false;
  const hub=document.getElementById('aht-tools-hub');if(hub)hub.querySelectorAll('[data-aht-tool]').forEach(b=>{const key=b.getAttribute('data-aht-tool');b.hidden=!canOpen(key);const tile=b.closest('.aht-hub-tile,.aht-tool-card');if(tile)tile.hidden=!canOpen(key);});
  if(hub)hub.querySelectorAll('.aht-hub-grid').forEach(grid=>{const visible=[...grid.querySelectorAll('[data-aht-tool]')].some(b=>!b.hidden);grid.hidden=!visible;const heading=grid.previousElementSibling;if(heading?.classList.contains('aht-hub-section'))heading.hidden=!visible;});
 }
 window.AHTToolAccess={canOpen,canOpenHub,refresh};
 document.addEventListener('DOMContentLoaded',refresh);
 const role=document.getElementById('roleLabel');if(role&&window.MutationObserver)new MutationObserver(refresh).observe(role,{childList:true,subtree:true,characterData:true});
})();
