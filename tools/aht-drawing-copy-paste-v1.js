/* AHT Drawing Copy/Paste Phase 2 — same-PDF, same/cross-page, undoable.
   All clipboard state is in memory; persisted work remains the existing marker JSON. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const section=$('ahtDrawingDetailsSection'), viewport=$('viewport');
if(!section||!viewport||typeof markers==='undefined'||typeof sel==='undefined'||typeof pushUndo!=='function'||typeof refresh!=='function'||typeof toView!=='function')return;
const css=document.createElement('link');css.rel='stylesheet';css.href='aht-drawing-copy-paste-v1.css?v=20261106-1';document.head.append(css);
const pane=document.createElement('div');pane.id='ahtCopyPaste';pane.className='aht-cp-panel';
pane.innerHTML='<div class="aht-cp-heading">Copy / Paste Placed Icons</div>'+
  '<p class="aht-cp-hint">Select one or more icons (normal Select or Bulk Select), then Copy. Change PDF pages if needed, and paste. Copied details and icon settings stay with the icons.</p>'+
  '<div class="aht-cp-actions"><button type="button" id="ahtCpCopy">Copy selected</button><button type="button" id="ahtCpPaste">Paste</button><button type="button" id="ahtCpPlace">Paste at click</button><button type="button" id="ahtCpCancel" hidden>Cancel placement</button></div>'+
  '<p class="aht-cp-hint" id="ahtCpStatus" role="status">Ctrl/Cmd+C to copy; Ctrl/Cmd+V to paste. Right-click on the drawing for a copy/paste menu.</p>';
section.append(pane);
const copyBtn=$('ahtCpCopy'),pasteBtn=$('ahtCpPaste'),placeBtn=$('ahtCpPlace'),cancelBtn=$('ahtCpCancel'),msg=$('ahtCpStatus');
const contextMenu=document.createElement('div');contextMenu.id='ahtCpContextMenu';contextMenu.className='aht-cp-context';contextMenu.hidden=true;contextMenu.setAttribute('role','menu');contextMenu.setAttribute('aria-label','Drawing copy and paste');
contextMenu.innerHTML='<button type="button" role="menuitem" data-cp-action="copy">Copy</button><button type="button" role="menuitem" data-cp-action="paste-here">Paste here</button>';document.body.append(contextMenu);
let contextPoint=null;
function closeContext(){contextMenu.hidden=true;contextPoint=null;}

let copied=[],sourcePage=0,sourcePdfName='',sourceWidth=0,sourceHeight=0,pasteCount=0,placing=false;
function inform(s){msg.textContent=s;}
function selected(){return markers.filter(m=>sel.has(m.id)&&Number(m.page||1)===Number(pageNum));}
function enabled(){copyBtn.textContent=selected().length>1?`Copy selected (${selected().length})`:'Copy';const hasCopy=copied.length>0 && !!pdfDoc && !!vp && pdfName===sourcePdfName;copyBtn.disabled=!(!!pdfDoc&&selected().length);pasteBtn.disabled=!hasCopy;placeBtn.disabled=!hasCopy;cancelBtn.hidden=!placing;}
function copy(){if(!pdfDoc||!vp){inform('Open a PDF plan first.');return false;}const items=selected();if(!items.length){inform('Select icon(s) on this page first.');return false;}
  copied=items.map(m=>JSON.parse(JSON.stringify(m)));sourcePage=pageNum;sourcePdfName=pdfName;sourceWidth=vp.width;sourceHeight=vp.height;pasteCount=0;cancelPlacement(false);
  inform(`Copied ${copied.length} icon${copied.length===1?'':'s'} from page ${sourcePage}. Navigate to any page in this PDF and paste.`);enabled();return true;
}
function shift(m,dx,dy){
  for(const pair of [['x','y'],['x2','y2'],['lx','ly'],['cx','cy']])if(Number.isFinite(m[pair[0]])&&Number.isFinite(m[pair[1]])){m[pair[0]]+=dx;m[pair[1]]+=dy;}
  for(const key of ['pts','extraTips'])if(Array.isArray(m[key]))m[key]=m[key].map(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])?[p[0]+dx,p[1]+dy,...p.slice(2)]:p);
}
function convert(m){
  // Pages with differing drawing sizes retain proportional locations.
  const sx=sourceWidth>0?vp.width/sourceWidth:1,sy=sourceHeight>0?vp.height/sourceHeight:1;
  for(const pair of [['x','y'],['x2','y2'],['lx','ly'],['cx','cy']])if(Number.isFinite(m[pair[0]])&&Number.isFinite(m[pair[1]])){m[pair[0]]*=sx;m[pair[1]]*=sy;}
  for(const key of ['pts','extraTips'])if(Array.isArray(m[key]))m[key]=m[key].map(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])?[p[0]*sx,p[1]*sy,...p.slice(2)]:p);
}
function paste(at){
  if(!copied.length){inform('Copy selected icons first.');return false;}
  if(!pdfDoc||!vp){inform('Open the destination PDF page first.');return false;}
  if(pdfName!==sourcePdfName){inform('The copied icons belong to another PDF. Copy them again in this plan.');return false;}
  const clones=copied.map(m=>JSON.parse(JSON.stringify(m)));clones.forEach(convert);
  const coords=clones.flatMap(m=>Number.isFinite(m.x)&&Number.isFinite(m.y)?[[m.x,m.y]]:[]);
  const anchor=coords.length?[Math.min(...coords.map(p=>p[0])),Math.min(...coords.map(p=>p[1]))]:[0,0];
  // Paste-at-click: align the copied group's upper-left anchor with clicked point.
  // Regular Paste offsets on the same page to reveal the new copy.
  const offset=at?[at[0]-anchor[0],at[1]-anchor[1]]:
    (pageNum===sourcePage?[(pasteCount+1)*Math.max(12,iconBase()*1.2),(pasteCount+1)*Math.max(12,iconBase()*1.2)]:[0,0]);
  pushUndo();
  const ids=new Set();clones.forEach(m=>{m.id=nextId++;m.page=pageNum;shift(m,...offset);markers.push(m);ids.add(m.id);});
  sel=new Set(ids);pasteCount++;cancelPlacement(false);refresh();enabled();
  inform(`Pasted ${clones.length} icon${clones.length===1?'':'s'} on page ${pageNum}. Undo is available.`);
  return true;
}
function cancelPlacement(show=true){placing=false;viewport.classList.remove('aht-cp-placing');cancelBtn.hidden=true;placeBtn.setAttribute('aria-pressed','false');if(show)inform('Paste placement cancelled.');}
// Existing tools suppress the native context menu over the SVG drawing.
// Replace it only there; retain the native menu in inputs and the rest of the UI.
viewport.addEventListener('contextmenu',event=>{
  if(!pdfDoc||!vp)return;
  event.preventDefault();event.stopPropagation();
  cancelPlacement(false);
  const raw=toView(event);
  if(!Number.isFinite(raw[0])||!Number.isFinite(raw[1]))return;
  const icon=event.target instanceof Element ? event.target.closest('g[data-id], [data-id][data-handle]') : null;
  const id=icon?Number(icon.getAttribute('data-id')):NaN;
  if(Number.isFinite(id)&&markers.some(m=>m.id===id&&Number(m.page||1)===Number(pageNum))&&!sel.has(id)){
    sel=new Set([id]);refresh();
  }
  contextPoint=raw;
  const count=selected().length;
  const copyAction=contextMenu.querySelector('[data-cp-action="copy"]');
  copyAction.textContent=count>1?`Copy selected (${count})`:'Copy';
  copyAction.disabled=count===0;
  const available=copied.length>0&&pdfName===sourcePdfName;
  contextMenu.querySelector('[data-cp-action="paste-here"]').disabled=!available;
  contextMenu.hidden=false;
  const margin=8;
  const width=contextMenu.offsetWidth,height=contextMenu.offsetHeight;
  contextMenu.style.left=Math.max(margin,Math.min(event.clientX,window.innerWidth-width-margin))+'px';
  contextMenu.style.top=Math.max(margin,Math.min(event.clientY,window.innerHeight-height-margin))+'px';
},true);
contextMenu.addEventListener('click',event=>{
  const button=event.target instanceof Element?event.target.closest('button[data-cp-action]'):null;
  if(!button||button.disabled)return;
  const action=button.dataset.cpAction,at=contextPoint;
  closeContext();
  if(action==='copy')copy();
  else if(action==='paste-here'&&at)paste(at);
});
document.addEventListener('pointerdown',event=>{if(!contextMenu.hidden&&!contextMenu.contains(event.target))closeContext();},true);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!contextMenu.hidden){event.preventDefault();closeContext();}},true);
window.addEventListener('blur',closeContext);
window.addEventListener('resize',closeContext);
copyBtn.addEventListener('click',copy);
pasteBtn.addEventListener('click',()=>paste(null));
placeBtn.addEventListener('click',()=>{if(!copied.length||!pdfDoc||!vp)return;placing=!placing;viewport.classList.toggle('aht-cp-placing',placing);placeBtn.setAttribute('aria-pressed',String(placing));cancelBtn.hidden=!placing;if(placing)inform('Click a destination on the drawing to place the copied group. Press Esc to cancel.');else inform('Paste placement cancelled.');});
cancelBtn.addEventListener('click',()=>cancelPlacement());
// Capture at document, before the existing drawing click/move handlers.
document.addEventListener('pointerdown',event=>{
  if(!placing||event.button!==0||!viewport.contains(event.target))return;
  event.preventDefault();event.stopImmediatePropagation();
  const point=toView(event);if(!Number.isFinite(point[0])||!Number.isFinite(point[1]))return;
  paste(point);
},true);
document.addEventListener('keydown',event=>{
  const target=event.target;
  if(target instanceof Element&&(target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')))return;
  if(event.key==='Escape'&&placing){event.preventDefault();event.stopImmediatePropagation();cancelPlacement();return;}
  if(!(event.ctrlKey||event.metaKey)||event.altKey||event.repeat)return;
  const key=event.key.toLowerCase();
  if(key==='c'&&selected().length){event.preventDefault();event.stopImmediatePropagation();copy();}
  else if(key==='v'&&copied.length){event.preventDefault();event.stopImmediatePropagation();paste(null);}
},true);
// Synchronize availability after the existing refresh, including page changes.
const previousRefresh=refresh;
refresh=function(){const result=previousRefresh.apply(this,arguments);requestAnimationFrame(enabled);return result;};
$('pageSel')?.addEventListener('change',()=>{closeContext();if(placing)cancelPlacement(false);requestAnimationFrame(enabled);});
enabled();
})();
