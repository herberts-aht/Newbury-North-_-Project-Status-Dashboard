/* AHT Drawing Details Phase 1.4 — shared, additive metadata controls.
   Uses existing markers, selection, undo and save/load. No external requests. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const surface = $('ov'), controls = $('selTools'), anchor = $('selPanel'), viewport = $('viewport');
  if (!surface || !controls || !anchor || !viewport || typeof markers === 'undefined' || typeof refresh !== 'function') return;
  const isMarkup = m => m && ['relocate','arrow_note','area','addmark','rmmark','remove'].includes(m.type);
  const fields = ['manufacturer','model','details'];
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href='aht-drawing-details-v1.css?v=20261106-6'; document.head.append(css);
  // Keep the entire selection + metadata workflow together, away from the sticky mode toolbar.
  const section=document.createElement('section');
  section.id='ahtDrawingDetailsSection';section.className='aht-dd-section workflow-step';
  section.innerHTML='<div class="aht-dd-section-title"><h2>Equipment Details</h2><span>Edit one or several placed icons</span></div>'+
    '<p class="aht-dd-intro">Choose <strong>Bulk Select</strong>, click the icons you want on the drawing, then enter and save their shared details here. Click a picked icon again to remove it.</p>';
  const bulkControls=document.createElement('div');bulkControls.className='aht-dd-bulk-controls';
  bulkControls.innerHTML='<button type="button" id="ahtDdBulkMode" aria-pressed="false">Bulk Select Icons</button>'+
    '<button type="button" id="ahtDdBulkClear" hidden>Clear picked</button>'+
    '<span id="ahtDdBulkCount" role="status">Select an icon normally, or use Bulk Select to pick several</span>';
  section.appendChild(bulkControls);
  const panel=document.createElement('div'); panel.id='ahtDrawingDetails'; panel.className='aht-dd-panel'; panel.innerHTML =
    '<strong>Details for selected icons</strong>'+
    '<p class="aht-dd-hint">For multiple icons, check only the fields you want to change. Unchecked fields are preserved.</p>'+
    '<label class="aht-dd-maker">Manufacturer / Make<input id="ahtDdMake" type="text" maxlength="120" placeholder="e.g. Avigilon"></label>'+
    '<label class="aht-dd-maker">Model<input id="ahtDdModel" type="text" maxlength="120" placeholder="Model number"></label>'+
    '<label>Details / Description<textarea id="ahtDdNote" rows="3" maxlength="2000" placeholder="Purpose, coverage, installation notes, relocation instructions..."></textarea></label>'+
    '<div class="aht-dd-pick"><label><input id="ahtDdUseMake" type="checkbox" checked> Make</label><label><input id="ahtDdUseModel" type="checkbox" checked> Model</label><label><input id="ahtDdUseNote" type="checkbox" checked> Details</label></div>'+
    '<button type="button" id="ahtDdApply">Save details to selected</button>'+
    '<p id="ahtDdStatus" class="aht-dd-hint" role="status"></p>';
  section.appendChild(panel);
  // CCTV organizes Adjust as a workflow step; the other tools keep selectionSettings
  // in the scrollable editor area. Insert immediately after the existing selection editor.
  const cctvAdjust=$('ahtStepAdjust');
  if(cctvAdjust){
    const bulkAdjust=$('bulkAdjustPanel');
    if(bulkAdjust&&bulkAdjust.parentElement===cctvAdjust)cctvAdjust.insertBefore(section,bulkAdjust);
    else cctvAdjust.appendChild(section);
  }else{
    const existingSettings=$('selectionSettings');
    if(existingSettings) existingSettings.insertAdjacentElement('afterend',section);
    else anchor.insertAdjacentElement('afterend',section);
  }
  // Phase 2.7: the jump labels and the actual workflow headings must agree.
  // Keep this strictly presentational; existing marker selection and persistence are untouched.
  {
    const title=section.querySelector('.aht-dd-section-title');
    if(title){
      const existing=title.querySelector('h2');
      if(existing) existing.remove();
      const heading=document.createElement('div');
      heading.className='step-heading';
      heading.innerHTML='<span class="step-number">4</span><h2>Equipment Details</h2>';
      title.prepend(heading);
    }
    const renumber=(id,num)=>{
      const root=$(id);
      const badge=root?.querySelector(':scope > .step-heading > .step-number');
      if(badge)badge.textContent=String(num);
    };
    renumber('ahtLayerSection',5);
    renumber('reviewSection',6);
    renumber('exportSection',7);
  }  const make=$('ahtDdMake'), model=$('ahtDdModel'), note=$('ahtDdNote');
  const apply=$('ahtDdApply'), status=$('ahtDdStatus');
  const bulkButton=$('ahtDdBulkMode'), bulkClear=$('ahtDdBulkClear'), bulkCount=$('ahtDdBulkCount');
  let bulkMode=false;
  let saveNotice='';
  // Floating guidance is a selection helper, not another drawing tool.
  let guidedStage=null;
  let guidedX=80,guidedY=100;
  const guide=document.createElement('div');
  guide.id='ahtDdGuide'; guide.hidden=true;
  guide.setAttribute('role','group');guide.setAttribute('aria-label','Bulk selection options');
  guide.innerHTML='<div class="aht-dd-guide-count" id="ahtDdGuideCount"></div>'+
    '<div id="ahtDdGuidePicking"><span>Select another icon, or</span><button type="button" id="ahtDdGuideDone">Done</button></div>'+
    '<div id="ahtDdGuideActions" hidden><button type="button" id="ahtDdGuideMove">Move</button><button type="button" id="ahtDdGuideEdit">Edit Details</button><button type="button" id="ahtDdGuideCopy">Copy</button><button type="button" id="ahtDdGuideMore">Select more</button></div>';
  document.body.append(guide);
  function placeGuide(){
    guide.style.left='8px';guide.style.top='8px';
    const width=guide.offsetWidth||220,height=guide.offsetHeight||90;
    guide.style.left=Math.max(8,Math.min(guidedX+16,window.innerWidth-width-8))+'px';
    guide.style.top=Math.max(8,Math.min(guidedY+18,window.innerHeight-height-8))+'px';
  }
  function showGuide(){
    const count=[...sel].filter(id=>markers.some(m=>m.id===id&&Number(m.page||1)===Number(pageNum))).length;
    const visible=count>0 && (bulkMode||guidedStage==='actions');
    guide.hidden=!visible;
    if(!visible)return;
    $('ahtDdGuideCount').textContent=`${count} icon${count===1?'':'s'} selected`;
    $('ahtDdGuidePicking').hidden=!bulkMode;
    $('ahtDdGuideActions').hidden=bulkMode;
    placeGuide();
  }
  function rememberPointer(event){guidedX=event.clientX;guidedY=event.clientY;}
  $('ahtDdGuideDone').addEventListener('click',()=>{
    if(!bulkMode)return;
    guidedStage='actions';toggleBulk(false);showGuide();
  });
  $('ahtDdGuideMore').addEventListener('click',()=>{guidedStage='pick';toggleBulk(true);});
  $('ahtDdGuideMove').addEventListener('click',()=>{
    guidedStage=null;guide.hidden=true;
    // Native editor handles multi-object dragging after selection is finished.
    if(typeof setTool==='function')setTool(null);
    status.textContent='Drag any selected icon to move the group; click blank drawing space to clear it.';
  });
  $('ahtDdGuideEdit').addEventListener('click',()=>{
    guidedStage=null;guide.hidden=true;
    const sidebar=section.closest('#sidebar')||$('sidebar');
    if(sidebar){const top=section.getBoundingClientRect().top-sidebar.getBoundingClientRect().top+sidebar.scrollTop-70;
      sidebar.scrollTo({top:Math.max(0,top),behavior:'smooth'});
    }else section.scrollIntoView({behavior:'smooth',block:'nearest'});
    make.focus({preventScroll:true});
  });
  $('ahtDdGuideCopy').addEventListener('click',()=>{
    guidedStage=null;guide.hidden=true;
    const copyButton=$('ahtCpCopy');
    if(copyButton&&!copyButton.disabled)copyButton.click();
    else status.textContent='Copy is unavailable until a PDF page is open. Use the Copy control below.';
  });
  window.addEventListener('resize',()=>{if(!guide.hidden)placeGuide();});
  function toggleBulk(on){
    bulkMode=!!on;
    if(bulkMode && typeof setTool==='function')setTool(null);
    bulkButton.setAttribute('aria-pressed',String(bulkMode));
    bulkButton.textContent=bulkMode?'Done Selecting':'Bulk Select';
    bulkControls.classList.toggle('aht-dd-bulk-on',bulkMode);
    bulkClear.hidden=!bulkMode;
    if(bulkMode) {guidedStage='pick';}
    else if(guidedStage!=='actions'){guidedStage=null;}
    sync();
    showGuide();
  }
  bulkButton.addEventListener('click',()=>{saveNotice='';if(bulkMode&&sel.size)guidedStage='actions';toggleBulk(!bulkMode);});
  bulkClear.addEventListener('click',()=>{saveNotice='';guidedStage=null;sel.clear();refresh();sync();});
  // Bulk selection has its own pointer-down activation. Starting the native editor's
  // move explicitly is necessary: otherwise its normal click handler can clear the
  // multi-selection before a drag is recognized.
  let bulkDragCandidate=null;
  viewport.addEventListener('pointerdown',event=>{
    if(!bulkMode || event.button!==0 || event.ctrlKey || event.metaKey)return;
    const el=event.target instanceof Element?event.target:null;
    const hit=el?.closest('g[data-id]');
    const id=hit&&surface.contains(hit)?Number(hit.getAttribute('data-id')):NaN;
    const marker=markers.find(m=>Number(m.id)===id && Number(m.page||1)===Number(pageNum));
    if(!marker){
      event.stopImmediatePropagation();event.preventDefault();
      bulkDragCandidate=null;
      if(sel.size){sel.clear();saveNotice='';guidedStage=null;refresh();}
      return;
    }
    saveNotice='';
    rememberPointer(event);
    event.stopImmediatePropagation();event.preventDefault();
    if(!sel.has(marker.id)){
      bulkDragCandidate=null;
      sel.add(marker.id);refresh();
      return;
    }
    // Do not mistake an adjustment handle for a group drag.
    if(el?.closest('[data-handle]')){bulkDragCandidate=null;return;}
    const start=toView(event);
    const m0={};
    markers.forEach(m=>{
      if(!sel.has(m.id) || Number(m.page||1)!==Number(pageNum))return;
      m0[m.id]={x:m.x,y:m.y,x2:m.x2,y2:m.y2,lx:m.lx,ly:m.ly,
        cx:m.cx,cy:m.cy,
        extraTips:Array.isArray(m.extraTips)?m.extraTips.map(p=>p.slice()):undefined,
        pts:Array.isArray(m.pts)?m.pts.map(p=>p.slice()):undefined};
    });
    drag={mode:'move',start,m0,handle:null,id:marker.id,moved:false};
    bulkDragCandidate={id:marker.id,pointerId:event.pointerId,
      x:event.clientX,y:event.clientY};
    try{viewport.setPointerCapture(event.pointerId);}catch(_){/* detached pointer */}
  },true);
  viewport.addEventListener('pointerup',event=>{
    if(!bulkMode||!bulkDragCandidate||bulkDragCandidate.pointerId!==event.pointerId)return;
    const candidate=bulkDragCandidate;bulkDragCandidate=null;
    const distance=Math.hypot(event.clientX-candidate.x,event.clientY-candidate.y);
    // Click again toggles the pick off. A moved pointer keeps the group selected;
    // the native pointermove/up handlers finish the one-step Undo operation.
    if(distance<4 && !drag?.moved){
      event.stopImmediatePropagation();event.preventDefault();
      drag=null;
      sel.delete(candidate.id);refresh();
    }
  },true);
  viewport.addEventListener('pointercancel',()=>{bulkDragCandidate=null;drag=null;},true);
  // Prevent default drawing navigation keys from editing while bulk selection is active.
  document.addEventListener('keydown',event=>{
    if(!bulkMode || event.key!=='Escape')return;
    event.stopImmediatePropagation();event.preventDefault();toggleBulk(false);
  },true);
  // Add a 7th quick-jump in the same navigation as Open/Place/Adjust/etc.
  // The other tools generate this navigation dynamically after startup.
  function addJump(){
    if($('ahtDdJump'))return true;
    const cctvGrid=$('ahtWorkflowNav')?.querySelector('.aht-workflow-grid');
    const guidedGrid=$('ahtGuidedSteps')?.querySelector('.aht-guided-grid');
    const grid=cctvGrid||guidedGrid;
    if(!grid)return false;
    const jump=document.createElement('button');jump.id='ahtDdJump';jump.type='button';
    jump.className=cctvGrid?'aht-jump aht-dd-jump':'aht-guided-link aht-dd-jump';
    // Details belongs immediately after Adjust: fourth step in the workflow.
    // Renumber the later jumps without changing their destinations or handlers.
    const existing=[...grid.querySelectorAll(cctvGrid?'button[data-aht-jump]':'button.aht-guided-link')]
      .filter(btn=>btn.id!=='ahtDdJump');
    const fourth=existing[3]||null;
    for(let i=3;i<existing.length;i++){
      const number=existing[i].querySelector('b');
      if(number)number.textContent=String(i+2);
    }
    jump.innerHTML='<b>4</b><span>Details</span>';
    jump.title='Equipment details and bulk icon selection';
    jump.addEventListener('click',()=>{
      // Navigate within the tool sidebar; leave all other workflow steps unchanged.
      const sidebar=section.closest('#sidebar') || $('sidebar');
      const sticky=sidebar?.querySelector('#ahtStickyControls, #ahtGuidedSteps');
      if(sidebar && sticky){
        const top=section.getBoundingClientRect().top-sidebar.getBoundingClientRect().top+sidebar.scrollTop-sticky.getBoundingClientRect().height-10;
        sidebar.scrollTo({top:Math.max(0,top),behavior:'smooth'});
      }else section.scrollIntoView({behavior:'smooth',block:'start'});
    });
    grid.insertBefore(jump,fourth);
    return true;
  }
  if(!addJump()){
    const navParent=$('sidebar');
    if(navParent){const observer=new MutationObserver(()=>{if(addJump())observer.disconnect();});
      observer.observe(navParent,{childList:true,subtree:true});}
  }
  const tooltip=document.createElement('div'); tooltip.id='ahtDdTooltip';tooltip.hidden=true;tooltip.setAttribute('role','tooltip'); document.body.append(tooltip);
  let previousSelection='', lastHover=null;
  function selectedMarkers(){return [...sel].map(id=>markers.find(m=>m.id===id)).filter(Boolean);}
  function from(m,key){return String(m?.ahtDetails?.[key]||'');}
  function sync(){
    const items=selectedMarkers(); const signature=items.map(m=>m.id).sort().join('|');
    // Clear next step: finish picking without losing selection, then drag as a group.
    bulkButton.textContent=bulkMode?'Done Selecting':'Bulk Select';
    bulkButton.title=bulkMode?'Finish choosing icons and see available actions':'Choose several icons';
    if(items.length)saveNotice='';
    bulkCount.textContent=saveNotice || (bulkMode?`${items.length} icon${items.length===1?'':'s'} picked · click icons to add/remove`:
      'Select normally or use Bulk Select to pick specific icons');
    panel.hidden=!items.length;
    if(!items.length)guidedStage=null;
    showGuide();
    if(signature===previousSelection)return;
    previousSelection=signature;
    status.textContent=items.length>1?`Editing ${items.length} selected items. Only checked fields will change.`:'';
    const first=items[0];
    for(const [key,input,check] of [['manufacturer',make,$('ahtDdUseMake')],['model',model,$('ahtDdUseModel')],['details',note,$('ahtDdUseNote')]]){
      const values=items.map(m=>from(m,key));
      const same=values.every(v=>v===values[0]);
      input.value=first && same?values[0]:'';
      input.placeholder=!same?'Different values · enter replacement':'Optional';
      // With multiple icons, avoid accidental overwrites (especially unique notes).
      check.checked=items.length===1;
    }
    const annotationOnly=items.length>0 && items.every(isMarkup);
    panel.classList.toggle('aht-dd-annotation-only',annotationOnly);
    if(annotationOnly){$('ahtDdUseMake').checked=false;$('ahtDdUseModel').checked=false;}
  }
  // Typing a new value in bulk mode enables only that field; other fields stay intact.
  [[make,'ahtDdUseMake'],[model,'ahtDdUseModel'],[note,'ahtDdUseNote']].forEach(([input,id])=>{
    input.addEventListener('input',()=>{if(selectedMarkers().length>1)$(id).checked=true;});
  });
  function metadataText(m){
    if(!m?.ahtDetails)return '';
    const v=m.ahtDetails, head=[v.manufacturer,v.model].filter(x=>String(x||'').trim()).join(' · ');
    return [head,String(v.details||'').trim()].filter(Boolean).join('\n');
  }
  function showTip(m,px,py){
    const text=metadataText(m); if(!text){tooltip.hidden=true;lastHover=null;return;}
    if(lastHover!==m.id){tooltip.textContent=text; lastHover=m.id;}
    tooltip.hidden=false;
    const w=Math.min(300,window.innerWidth-24);
    tooltip.style.left=Math.max(8,Math.min(px+14,window.innerWidth-w-8))+'px';
    tooltip.style.top=Math.max(8,Math.min(py+16,window.innerHeight-95))+'px';
  }
  function hoveredMarker(event){
    const target=event.target instanceof Element?event.target:null;
    const bound=target?.closest('g[data-id]'); if(!bound||!surface.contains(bound))return null;
    const id=Number(bound.getAttribute('data-id'));
    return markers.find(m=>Number(m.id)===id) || null;
  }
  surface.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const m=hoveredMarker(e);if(!m){tooltip.hidden=true;lastHover=null;return;} showTip(m,e.clientX,e.clientY);});
  surface.addEventListener('pointerleave',()=>{tooltip.hidden=true;lastHover=null;});
  // Touch preview via long press; normal taps still select/move devices.
  let touchTimer=null, touchX=0,touchY=0;
  surface.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;const m=hoveredMarker(e);touchX=e.clientX;touchY=e.clientY;
    clearTimeout(touchTimer); touchTimer=setTimeout(()=>{if(m)showTip(m,touchX,touchY);},550);});
  surface.addEventListener('pointerup',()=>clearTimeout(touchTimer));
  surface.addEventListener('pointercancel',()=>{clearTimeout(touchTimer);tooltip.hidden=true;});
  surface.addEventListener('pointermove',e=>{if(e.pointerType==='touch'&&Math.hypot(e.clientX-touchX,e.clientY-touchY)>9)clearTimeout(touchTimer);});
  document.addEventListener('pointerdown',e=>{if(!surface.contains(e.target))tooltip.hidden=true;},true);
  apply.onclick=function(){
    const items=selectedMarkers();if(!items.length)return;
    const chosen={manufacturer:$('ahtDdUseMake').checked,model:$('ahtDdUseModel').checked,details:$('ahtDdUseNote').checked};
    if(!Object.values(chosen).some(Boolean)){status.textContent='Choose at least one field to update.';return;}
    const values={manufacturer:make.value.trim(),model:model.value.trim(),details:note.value.trim()};
    if(typeof pushUndo==='function')pushUndo();
    items.forEach(m=>{
      const updated={...(m.ahtDetails||{})};
      for(const k of fields)if(chosen[k])updated[k]=values[k];
      if(Object.values(updated).some(v=>String(v||'').trim()))m.ahtDetails=updated;
      else delete m.ahtDetails;
    });
    // Saving completes the bulk edit: exit picking, clear the selection and restore
    // normal Select/Adjust behavior. A new selection can then be made explicitly.
    const count=items.length;
    bulkMode=false;
    guidedStage=null;guide.hidden=true;
    bulkButton.setAttribute('aria-pressed','false');
    bulkButton.textContent='Bulk Select';
    bulkControls.classList.remove('aht-dd-bulk-on');
    bulkClear.hidden=true;
    sel.clear();
    previousSelection='';
    saveNotice=`Saved details to ${count} icon${count===1?'':'s'}. Selection cleared.`;
    refresh();
    sync();
  };
  $('pageSel')?.addEventListener('change',()=>{guidedStage=null;guide.hidden=true;});
  const oldRefresh=refresh;
  refresh=function(){const result=oldRefresh.apply(this,arguments);requestAnimationFrame(sync);return result;};
  sync();
})();
