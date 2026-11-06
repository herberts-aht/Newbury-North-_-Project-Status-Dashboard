/* AHT Drawing Details Phase 1 — shared, additive metadata controls.
   Uses existing markers, selection, undo and save/load. No external requests. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const surface = $('ov'), controls = $('selTools'), anchor = $('selPanel');
  if (!surface || !controls || !anchor || typeof markers === 'undefined' || typeof refresh !== 'function') return;
  const isMarkup = m => m && ['relocate','arrow_note','area','addmark','rmmark','remove'].includes(m.type);
  const fields = ['manufacturer','model','details'];
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href='aht-drawing-details-v1.css?v=20261106-1'; document.head.append(css);
  const panel=document.createElement('section'); panel.id='ahtDrawingDetails'; panel.className='aht-dd-panel'; panel.innerHTML =
    '<strong>Equipment / Arrow Details</strong>'+
    '<p class="aht-dd-hint">Optional information for the selected item(s). Hover to read; on touch, tap and hold.</p>'+
    '<label class="aht-dd-maker">Manufacturer / Make<input id="ahtDdMake" type="text" maxlength="120" placeholder="e.g. Avigilon"></label>'+
    '<label class="aht-dd-maker">Model<input id="ahtDdModel" type="text" maxlength="120" placeholder="Model number"></label>'+
    '<label>Details / Description<textarea id="ahtDdNote" rows="3" maxlength="2000" placeholder="Purpose, coverage, installation notes, relocation instructions..."></textarea></label>'+
    '<div class="aht-dd-pick"><label><input id="ahtDdUseMake" type="checkbox" checked> Make</label><label><input id="ahtDdUseModel" type="checkbox" checked> Model</label><label><input id="ahtDdUseNote" type="checkbox" checked> Details</label></div>'+
    '<button type="button" id="ahtDdApply">Save details to selected</button>'+
    '<p id="ahtDdStatus" class="aht-dd-hint" role="status"></p>';
  // Add to current selection controls without altering existing editors.
  controls.prepend(panel);
  const make=$('ahtDdMake'), model=$('ahtDdModel'), note=$('ahtDdNote');
  const apply=$('ahtDdApply'), status=$('ahtDdStatus');
  const tooltip=document.createElement('div'); tooltip.id='ahtDdTooltip';tooltip.hidden=true;tooltip.setAttribute('role','tooltip'); document.body.append(tooltip);
  let previousSelection='', lastHover=null;
  function selectedMarkers(){return [...sel].map(id=>markers.find(m=>m.id===id)).filter(Boolean);}
  function from(m,key){return String(m?.ahtDetails?.[key]||'');}
  function sync(){
    const items=selectedMarkers(); const signature=items.map(m=>m.id).sort().join('|');
    panel.hidden=!items.length;
    if(signature===previousSelection)return;
    previousSelection=signature;
    status.textContent=items.length>1?`Editing ${items.length} selected items. Check only fields to apply in bulk.`:'';
    const first=items[0];
    make.value=first?from(first,'manufacturer'):'';
    model.value=first?from(first,'model'):'';
    note.value=first?from(first,'details'):'';
    const annotationOnly=items.length>0 && items.every(isMarkup);
    panel.classList.toggle('aht-dd-annotation-only',annotationOnly);
    if(annotationOnly){$('ahtDdUseMake').checked=false;$('ahtDdUseModel').checked=false;}
    else {$('ahtDdUseMake').checked=true;$('ahtDdUseModel').checked=true;}
    $('ahtDdUseNote').checked=true;
  }
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
    const bound=target?.closest('[data-id]'); if(!bound||!surface.contains(bound))return null;
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
    status.textContent='Saved details to '+items.length+' selected item'+(items.length===1?'':'s')+'. Included in saved work JSON.';
    // refresh may rebuild the selection UI; preserve the status after render.
    refresh();status.textContent='Saved details to '+items.length+' selected item'+(items.length===1?'':'s')+'.';
  };
  const oldRefresh=refresh;
  refresh=function(){const result=oldRefresh.apply(this,arguments);requestAnimationFrame(sync);return result;};
  sync();
})();
