/* Main dashboard Tools section integration. No dashboard router/auth changes. */
(function(){
  'use strict';
  function mount(){
    const root=document.getElementById('aht-project-forms-launcher');
    if(!root)return;
    const tile=root.querySelector('[data-aht-forms-tile]');
    const panel=root.querySelector('[data-aht-forms-panel]');
    const frame=root.querySelector('[data-aht-forms-frame]');
    const open=root.querySelector('[data-aht-forms-open]');
    const back=root.querySelector('[data-aht-forms-back]');
    if(!tile||!panel||!frame||!open||!back)return;
    open.addEventListener('click',()=>{
      tile.hidden=true;panel.hidden=false;
      frame.src='tools/aht-project-forms.html';
    });
    back.addEventListener('click',()=>{
      if(!confirm('Leave Project Forms? Unsaved ticket information in this tab will be lost. Issue or preview your PDF first if needed.'))return;
      frame.src='about:blank';panel.hidden=true;tile.hidden=false;
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
