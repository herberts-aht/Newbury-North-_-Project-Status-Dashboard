/* AHT Wi-Fi Heat Map pilot. All saved coordinates remain in PDF viewport points. */
(function(){
'use strict';
const C=window.AHTWifiCore,NS='http://www.w3.org/2000/svg', $=id=>document.getElementById(id);
if(!C){$('status').textContent='Could not load Wi-Fi coverage geometry.';return;}
const state={devices:[],walls:[],poles:[],nextId:1,showCoverage:true,opacity:.65,scaleInch:.125,showPoles:true,showWalls:true};
let pdfDoc=null,pdfBytes=null,pdfName='',pageNum=1,vp=null,zoom=1,tx=0,ty=0,selected=null,tool='select',pendingWall=null,drag=null,pendingLoad=null;
const undo=[],redo=[];
const pointsPerFoot=()=>72*state.scaleInch;
const status=s=>{$('status').textContent=s;};
const onPage=m=>(Number(m.page)||1)===pageNum;
const pageAps=()=>state.devices.filter(onPage),pageWalls=()=>state.walls.filter(onPage),pagePoles=()=>state.poles.filter(onPage);
const selectedAp=()=>selected?.kind==='ap'?state.devices.find(d=>d.id===selected.id):null;
const selectedWall=()=>selected?.kind==='wall'?state.walls.find(w=>w.id===selected.id):null;
function snapshot(){return JSON.stringify({devices:state.devices,walls:state.walls,poles:state.poles,nextId:state.nextId});}
function restoreSnapshot(s){const o=JSON.parse(s);Object.assign(state,o);selected=null;syncSelection();draw();}
function remember(){undo.push(snapshot());if(undo.length>50)undo.shift();redo.length=0;updateUndo();}
function updateUndo(){$('undoBtn').disabled=undo.length===0;$('redoBtn').disabled=redo.length===0;}
function el(tag,attrs,parent){const n=document.createElementNS(NS,tag);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,String(v)));if(parent)parent.append(n);return n;}
function text(parent,s,x,y,size=12,color='#183e5d',weight=700){const n=el('text',{x,y,fill:color,'font-family':'Arial,Helvetica,sans-serif','font-weight':weight,'font-size':size,'pointer-events':'none'},parent);n.textContent=s;return n;}
function line(parent,x1,y1,x2,y2,color='#46677d',width=2,dash){return el('line',{x1,y1,x2,y2,stroke:color,'stroke-width':width,'stroke-linecap':'round',...(dash?{'stroke-dasharray':dash}:{})},parent);}
function circle(parent,x,y,r,color,stroke='#fff',sw=2){return el('circle',{cx:x,cy:y,r,fill:color,stroke,'stroke-width':sw},parent);}
function title(parent,s){el('title',{},parent).textContent=s;}
function clamp(v,a,b){return C.clamp(v,a,b);}
function updateMode(){for(const [id,active] of [['selectBtn',tool==='select'],['placeBtn',tool==='ap'],['wallBtn',tool==='wall'],['addWall',tool==='wall']])$(id).classList.toggle('active',active);$('viewport').style.cursor=tool==='select'?'grab':'crosshair';}
function setMode(mode){tool=mode;pendingWall=null;updateMode();status(mode==='ap'?'Click a location to place an access point.':mode==='wall'?'Click the first end of the wall, then its second end.':'Select an AP or wall, or drag the drawing to pan.');}
function toView(e){const r=$('viewport').getBoundingClientRect();return [(e.clientX-r.left-tx)/zoom,(e.clientY-r.top-ty)/zoom];}
function inDrawing(p){return vp&&p[0]>=0&&p[1]>=0&&p[0]<=vp.width&&p[1]<=vp.height;}
function applyTransform(){$('stage').style.transform=`translate(${tx}px,${ty}px) scale(${zoom})`;}
function fit(){if(!vp)return;const r=$('viewport').getBoundingClientRect();zoom=Math.min(r.width/vp.width,r.height/vp.height)*.96;tx=(r.width-vp.width*zoom)/2;ty=(r.height-vp.height*zoom)/2;applyTransform();}
function zoomAt(f,x,y){const nz=clamp(zoom*f,.05,10),ratio=nz/zoom;tx=x-(x-tx)*ratio;ty=y-(y-ty)*ratio;zoom=nz;applyTransform();}
function newAp(x,y){const kind=$('newKind').value,id=state.nextId++;return {id,type:'ap',page:pageNum,x,y,kind,rot:0,rangeFt:60,radii:C.shapeFor(kind),name:'AP '+id,make:'',model:'',note:'',showCoverage:true};}
function heatCanvasDraw(ctx,p,pageView){const w=pageView.width,h=pageView.height;ctx.clearRect(0,0,w,h);if(!state.showCoverage)return;
  const ppf=pointsPerFoot(),walls=state.walls.filter(m=>(m.page||1)===p);
  state.devices.filter(m=>(m.page||1)===p&&m.showCoverage!==false).forEach(ap=>{
    ctx.save();ctx.globalAlpha=state.opacity;
    for(let i=0;i<C.COUNT;i++){
      const a=C.angle(i)+(Number(ap.rot)||0)*Math.PI/180,b=C.angle(i+1)+(Number(ap.rot)||0)*Math.PI/180;
      const p1=C.pointAt(ap,a,ppf,walls),p2=C.pointAt(ap,b,ppf,walls);
      const mx=(p1[0]+p2[0])/2,my=(p1[1]+p2[1])/2;
      const grad=ctx.createLinearGradient(ap.x,ap.y,mx,my);
      grad.addColorStop(0,'rgba(229,57,53,1)');grad.addColorStop(.42,'rgba(229,57,53,.9)');
      grad.addColorStop(.67,'rgba(245,124,0,.88)');grad.addColorStop(.91,'rgba(253,216,53,.75)');grad.addColorStop(1,'rgba(253,216,53,0)');
      ctx.beginPath();ctx.moveTo(ap.x,ap.y);ctx.lineTo(...p1);ctx.lineTo(...p2);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
    }
    ctx.restore();
  });
}
function drawHeat(){if(!vp)return;const canvas=$('heatCanvas');heatCanvasDraw(canvas.getContext('2d'),pageNum,vp);}
function drawOverlay(){if(!vp)return;const root=$('overlay');root.replaceChildren();
  if(state.showWalls)pageWalls().forEach(w=>{
    const g=el('g',{'data-wall':w.id,style:'cursor:pointer'},root);const active=selected?.kind==='wall'&&selected.id===w.id;
    line(g,w.x,w.y,w.x2,w.y2,active?'#e89919':'#815f9c',Math.max(3,6*Number(w.attenuation||.5)),'9 5');
    line(g,w.x,w.y,w.x2,w.y2,'transparent',14);
    title(g,`${w.note||'Obstruction'} · ${Math.round((w.attenuation||0)*100)}% estimated blocking`);
    if(active){[['a',w.x,w.y],['b',w.x2,w.y2]].forEach(([h,x,y])=>{const d=circle(root,x,y,6,'#fff','#a36415',2);d.setAttribute('data-wall-handle',h);d.setAttribute('data-wall',w.id);d.style.cursor='move';});}
  });
  if(state.showPoles)pagePoles().forEach((pole,i)=>{
    const g=el('g',{'data-pole':i},root),size=17*(pole.size||1);
    circle(g,pole.x,pole.y,size*.48,'#e0e8ee','#384e60',2.2);circle(g,pole.x,pole.y,size*.22,'#40576b','#fff',1);
    C.poleHeads(pole,size).forEach(h=>{
      line(g,pole.x,pole.y,h.x,h.y,'#4c5964',Math.max(1.5,size*.095));
      if(h.kind==='lidar')circle(g,h.x,h.y,size*.23,'#865bb0','#fff',1);
      else {el('rect',{x:h.x-size*.25,y:h.y-size*.18,width:size*.5,height:size*.36,rx:1.5,fill:h.kind==='ptz'?'#376bc1':'#51637b',stroke:'#fff','stroke-width':1},g);}
    });
    title(g,'CCTV pole with '+(pole.heads?.length||0)+' mounted devices · camera cones hidden'+(pole.note?' · '+pole.note:''));
  });
  pageAps().forEach(ap=>{
    const active=selected?.kind==='ap'&&selected.id===ap.id,g=el('g',{'data-ap':ap.id,style:'cursor:move'},root);
    if(active){for(let i=0;i<C.COUNT;i++){
      const a=C.angle(i)+(Number(ap.rot)||0)*Math.PI/180,p=C.pointAt(ap,a,pointsPerFoot(),pageWalls());
      const h=circle(g,p[0],p[1],Math.max(3,5/zoom),'#ffe34b','#806516',1.4);
      h.setAttribute('data-handle',i);h.style.cursor='crosshair';
    }}
    circle(g,ap.x,ap.y,Math.max(active?11:9,7/zoom),'#eaf6fd',active?'#f2a91b':'#1b6698',active?3:2);
    circle(g,ap.x,ap.y,Math.max(3,2/zoom),'#1a6598','none',0);
    for(const r of [5,7])el('path',{d:`M ${ap.x-r} ${ap.y-2} Q ${ap.x} ${ap.y-r*1.65} ${ap.x+r} ${ap.y-2}`,
      fill:'none',stroke:'#1a6598','stroke-width':1.15,'pointer-events':'none'},g);
    text(g,ap.name||'AP',ap.x+13,ap.y-8,Math.max(9,10/zoom),'#20486c');
    title(g,[ap.name,ap.kind,ap.make,ap.model,ap.note].filter(Boolean).join(' · '));
  });
  if(pendingWall){const p=pendingWall;circle(root,p[0],p[1],5,'#ffa726');}
}
function draw(){if(!vp)return;drawHeat();drawOverlay();$('counts').textContent=`${state.devices.length} access points · ${state.poles.length} poles · ${state.walls.length} obstructions`;
  updateUndo();}
function syncSelection(){const ap=selectedAp(),w=selectedWall();$('selectedFields').hidden=!ap;$('wallFields').hidden=!w;
  $('selectionHelp').hidden=!!ap;
  if(ap){$('apName').value=ap.name||'';$('apKind').value=ap.kind;$('rangeFt').value=ap.rangeFt||60;$('rangeValue').textContent=ap.rangeFt||60;
    $('apRotation').value=ap.rot||0;$('directionValue').textContent=ap.rot||0;$('apMake').value=ap.make||'';$('apModel').value=ap.model||'';$('apNote').value=ap.note||'';$('apShowCoverage').checked=ap.showCoverage!==false;}
  if(w){$('wallAttenuation').value=Math.round((w.attenuation||0)*100);$('wallValue').textContent=$('wallAttenuation').value;$('wallNote').value=w.note||'';}
}
async function renderPage(){if(!pdfDoc)return;const page=await pdfDoc.getPage(pageNum);vp=page.getViewport({scale:1});
  for(const c of [$('planCanvas'),$('heatCanvas')]){c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);c.style.width=vp.width+'px';c.style.height=vp.height+'px';}
  $('stage').style.width=vp.width+'px';$('stage').style.height=vp.height+'px';
  $('overlay').setAttribute('viewBox',`0 0 ${vp.width} ${vp.height}`);$('overlay').setAttribute('width',vp.width);$('overlay').setAttribute('height',vp.height);
  const canvas=$('planCanvas'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  await page.render({canvasContext:ctx,viewport:vp}).promise;
  $('empty').hidden=true;selected=null;syncSelection();fit();draw();status('Page '+pageNum+' ready. Select/adjust or place access points.');
}
async function openPdf(file){try{status('Opening '+file.name+'…');const buffer=await file.arrayBuffer();pdfBytes=new Uint8Array(buffer);
    pdfDoc=await pdfjsLib.getDocument({data:pdfBytes.slice()}).promise;pdfName=file.name;pageNum=1;
    $('fileLabel').textContent=file.name+' · '+pdfDoc.numPages+' page(s)';$('pageSel').replaceChildren();
    for(let i=1;i<=pdfDoc.numPages;i++){const o=document.createElement('option');o.value=i;o.textContent='Page '+i;$('pageSel').append(o);} $('pageSel').disabled=false;
    if(pendingLoad){
      if(pendingLoad.pdfName&&pendingLoad.pdfName!==pdfName&&!confirm('The saved work names a different PDF. Load its positions on this drawing anyway?')){
        pendingLoad=null;status('Saved work was not loaded because the PDF names differ.');
      }else{applyWork(pendingLoad);pendingLoad=null;}
    }
    await renderPage();
  }catch(e){console.error(e);status('Could not open PDF: '+e.message);}}
function download(name,blob){const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=name;document.body.append(link);link.click();setTimeout(()=>{URL.revokeObjectURL(link.href);link.remove();},1500);}
function workData(){return {tool:'AHT Wi-Fi Heat Map',version:1,pdfName,page:pageNum,scaleInch:state.scaleInch,
  devices:state.devices,walls:state.walls,poles:state.poles,nextId:state.nextId,showCoverage:state.showCoverage,opacity:state.opacity,showWalls:state.showWalls,showPoles:state.showPoles};}
function applyWork(o){if(!o||!Array.isArray(o.devices)||!Array.isArray(o.walls))throw Error('Not a Wi-Fi work JSON.');
  state.devices=JSON.parse(JSON.stringify(o.devices));state.walls=JSON.parse(JSON.stringify(o.walls));state.poles=Array.isArray(o.poles)?JSON.parse(JSON.stringify(o.poles)):[];
  state.nextId=Math.max(Number(o.nextId)||1,1,...[...state.devices,...state.walls].map(m=>(Number(m.id)||0)+1));
  state.scaleInch=Number(o.scaleInch)||.125;state.showCoverage=o.showCoverage!==false;state.opacity=clamp(o.opacity==null?.65:Number(o.opacity),.1,.95);state.showPoles=o.showPoles!==false;state.showWalls=o.showWalls!==false;
  $('scaleSel').value=String(state.scaleInch);$('globalHeat').checked=state.showCoverage;$('heatOpacity').value=Math.round(state.opacity*100);$('opacityValue').textContent=$('heatOpacity').value;
  $('showPoles').checked=state.showPoles;$('showWalls').checked=state.showWalls;
  if(pdfDoc&&Number(o.page)>=1&&Number(o.page)<=pdfDoc.numPages){pageNum=Number(o.page);$('pageSel').value=pageNum;}
  selected=null;undo.length=0;redo.length=0;syncSelection();draw();
}
async function importPoles(source){try{
    if(!pdfDoc){status('Open the same PDF in Wi-Fi before importing CCTV pole locations.');return;}
    const result=C.importCctvPoles(source,pdfName);
    if(!result.poles.length){status('CCTV work file contains no camera poles.');return;}
    if(!result.samePdf&&!confirm('The CCTV work file references a different PDF name. Import poles anyway?'))return;
    // CCTV optionally rotates PDF pages while keeping marker coordinates in the
    // rotated viewport. Convert those coordinates into this tool's PDF viewport.
    const converted=[];
    for(const pole of result.poles){
      if(pole.page<1||pole.page>pdfDoc.numPages)continue;
      const extra=((Number(source.pageRotations?.[pole.page])||0)%360+360)%360;
      if(!extra){converted.push(pole);continue;}
      const page=await pdfDoc.getPage(pole.page);
      const dst=page.getViewport({scale:1}),src=page.getViewport({scale:1,rotation:(page.rotate+extra)%360});
      const transform=(x,y)=>{const [px,py]=src.convertToPdfPoint(x,y);return dst.convertToViewportPoint(px,py);};
      const [x,y]=transform(pole.x,pole.y);
      const r=(Number(pole.rot)||0)*Math.PI/180,[fx,fy]=transform(pole.x+Math.sin(r)*20,pole.y-Math.cos(r)*20);
      converted.push({...pole,x,y,rot:(Math.atan2(fx-x,-(fy-y))*180/Math.PI+360)%360});
    }
    remember();state.poles=converted;draw();$('poleStatus').textContent=`Imported ${converted.length} CCTV pole(s)${result.samePdf?' from matching PDF.':' — verify PDF alignment.'}`;
    status('CCTV poles imported with their arms/cameras; viewing cones remain hidden.');
  }catch(e){status('Pole import failed: '+e.message);}}
function pointerDown(e){if(!vp||e.button!==0)return;const p=toView(e),target=e.target;
  if(!inDrawing(p))return;
  const handle=target.closest?.('[data-handle]'),wallHandle=target.closest?.('[data-wall-handle]');
  const apEl=target.closest?.('[data-ap]'),wallEl=target.closest?.('[data-wall]');
  if(handle&&apEl){const ap=state.devices.find(m=>m.id===Number(apEl.dataset.ap));if(!ap)return;remember();selected={kind:'ap',id:ap.id};
    drag={kind:'handle',id:ap.id,index:Number(handle.dataset.handle)};syncSelection();e.preventDefault();$('viewport').setPointerCapture(e.pointerId);return;}
  if(wallHandle){const w=state.walls.find(m=>m.id===Number(wallHandle.dataset.wall));if(!w)return;remember();selected={kind:'wall',id:w.id};
    drag={kind:'wall-handle',id:w.id,handle:wallHandle.dataset.wallHandle};syncSelection();e.preventDefault();$('viewport').setPointerCapture(e.pointerId);return;}
  if(tool==='ap'){remember();const ap=newAp(...p);state.devices.push(ap);selected={kind:'ap',id:ap.id};syncSelection();draw();if(!$('multiPlace').checked)setMode('select');return;}
  if(tool==='wall'){
    if(!pendingWall){pendingWall=p;status('Click the other end of the obstruction line.');drawOverlay();}
    else{remember();const wall={id:state.nextId++,page:pageNum,type:'wall',x:pendingWall[0],y:pendingWall[1],x2:p[0],y2:p[1],attenuation:Number($('wallPreset').value),note:$('wallPreset').selectedOptions[0].textContent.split(' · ')[0]};
      state.walls.push(w);selected={kind:'wall',id:wall.id};syncSelection();draw();setMode('select');}return;
  }
  if(apEl){const ap=state.devices.find(m=>m.id===Number(apEl.dataset.ap));if(!ap)return;remember();selected={kind:'ap',id:ap.id};drag={kind:'move',id:ap.id,start:p,x:ap.x,y:ap.y};syncSelection();drawOverlay();$('viewport').setPointerCapture(e.pointerId);return;}
  if(wallEl){const w=state.walls.find(m=>m.id===Number(wallEl.dataset.wall));if(!w)return;selected={kind:'wall',id:w.id};syncSelection();drawOverlay();return;}
  selected=null;syncSelection();drawOverlay();drag={kind:'pan',sx:e.clientX,sy:e.clientY,tx,ty};$('viewport').setPointerCapture(e.pointerId);
}
function pointerMove(e){if(!drag)return;const p=toView(e);
  if(drag.kind==='pan'){tx=drag.tx+(e.clientX-drag.sx);ty=drag.ty+(e.clientY-drag.sy);applyTransform();return;}
  if(drag.kind==='move'){const ap=state.devices.find(m=>m.id===drag.id);if(!ap)return;ap.x=drag.x+p[0]-drag.start[0];ap.y=drag.y+p[1]-drag.start[1];}
  if(drag.kind==='handle'){const ap=state.devices.find(m=>m.id===drag.id);if(ap)C.updateHandle(ap,drag.index,...p,pointsPerFoot(),pageWalls());}
  if(drag.kind==='wall-handle'){const w=state.walls.find(m=>m.id===drag.id);if(w){const k=drag.handle==='a'?'':'2';w['x'+k]=p[0];w['y'+k]=p[1];}}
  draw();
}
function pointerUp(e){if(drag){drag=null;try{$('viewport').releasePointerCapture(e.pointerId);}catch(_){}updateUndo();}}
function bind(){
  $('openBtn').onclick=()=>$('pdfFile').click();$('pdfFile').onchange=e=>{const f=e.target.files?.[0];if(f)void openPdf(f);e.target.value='';};
  $('pageSel').onchange=e=>{pageNum=Number(e.target.value);void renderPage();};
  $('scaleSel').onchange=e=>{state.scaleInch=Number(e.target.value);draw();};
  $('selectBtn').onclick=()=>setMode('select');$('placeBtn').onclick=()=>setMode('ap');$('wallBtn').onclick=$('addWall').onclick=()=>setMode('wall');
  document.querySelectorAll('[data-step]').forEach((b)=>b.addEventListener('click',()=>{document.querySelectorAll('[data-step]').forEach(n=>n.removeAttribute('aria-current'));b.setAttribute('aria-current','step');$(b.dataset.step+'Section')?.scrollIntoView({behavior:'smooth',block:'start'});}));
  $('viewport').addEventListener('pointerdown',pointerDown);$('viewport').addEventListener('pointermove',pointerMove);$('viewport').addEventListener('pointerup',pointerUp);$('viewport').addEventListener('pointercancel',pointerUp);
  $('viewport').addEventListener('wheel',e=>{if(!vp)return;e.preventDefault();const r=$('viewport').getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);},{passive:false});
  $('zoomIn').onclick=()=>{const r=$('viewport').getBoundingClientRect();zoomAt(1.25,r.width/2,r.height/2);};
  $('zoomOut').onclick=()=>{const r=$('viewport').getBoundingClientRect();zoomAt(.8,r.width/2,r.height/2);};$('zFit').onclick=fit;
  window.addEventListener('resize',fit);
  $('undoBtn').onclick=()=>{if(!undo.length)return;redo.push(snapshot());restoreSnapshot(undo.pop());};
  $('redoBtn').onclick=()=>{if(!redo.length)return;undo.push(snapshot());restoreSnapshot(redo.pop());};
  const edit=(field,action,event='change')=>{$(field).addEventListener(event,e=>{const ap=selectedAp();if(!ap)return;remember();action(ap,e.target);draw();});};
  edit('apName',(a,t)=>{a.name=t.value;drawOverlay();});edit('apMake',(a,t)=>a.make=t.value);edit('apModel',(a,t)=>a.model=t.value);edit('apNote',(a,t)=>a.note=t.value);
  edit('apKind',(a,t)=>{a.kind=t.value;a.radii=C.shapeFor(a.kind);});
  edit('rangeFt',(a,t)=>{a.rangeFt=Number(t.value);$('rangeValue').textContent=t.value;},'input');
  edit('apRotation',(a,t)=>{a.rot=Number(t.value);$('directionValue').textContent=t.value;},'input');
  edit('apShowCoverage',(a,t)=>a.showCoverage=t.checked);
  $('resetShape').onclick=()=>{const a=selectedAp();if(!a)return;remember();a.radii=C.shapeFor(a.kind);draw();};
  $('deleteAp').onclick=()=>{const a=selectedAp();if(!a)return;remember();state.devices=state.devices.filter(m=>m.id!==a.id);selected=null;syncSelection();draw();};
  $('wallAttenuation').oninput=e=>{const w=selectedWall();if(!w)return;w.attenuation=Number(e.target.value)/100;$('wallValue').textContent=e.target.value;draw();};
  $('wallAttenuation').onpointerdown=()=>{if(selectedWall())remember();};
  $('wallNote').onchange=e=>{const w=selectedWall();if(w){remember();w.note=e.target.value;drawOverlay();}};
  $('deleteWall').onclick=()=>{const w=selectedWall();if(!w)return;remember();state.walls=state.walls.filter(m=>m.id!==w.id);selected=null;syncSelection();draw();};
  $('globalHeat').onchange=e=>{state.showCoverage=e.target.checked;drawHeat();};
  $('heatOpacity').oninput=e=>{state.opacity=Number(e.target.value)/100;$('opacityValue').textContent=e.target.value;drawHeat();};
  $('showPoles').onchange=e=>{state.showPoles=e.target.checked;drawOverlay();};$('showWalls').onchange=e=>{state.showWalls=e.target.checked;drawOverlay();};
  $('pastePoles').onclick=()=>{try{const raw=localStorage.getItem('aht:wifi:poles:v1');if(!raw){status('No CCTV poles copied yet. Use Copy poles for Wi-Fi in the CCTV tool.');return;}void importPoles(JSON.parse(raw));}catch(e){status('Pole clipboard could not be read: '+e.message);}};
  $('importPoles').onclick=()=>$('cctvFile').click();$('cctvFile').onchange=async e=>{const f=e.target.files?.[0];if(f)try{await importPoles(JSON.parse(await f.text()));}catch(err){status(err.message);}e.target.value='';};
  $('saveBtn').onclick=()=>download((pdfName||'Plan').replace(/\.pdf$/i,'')+' - Wi-Fi Heat Map Work.json',new Blob([JSON.stringify(workData(),null,2)],{type:'application/json'}));
  $('loadBtn').onclick=()=>$('workFile').click();$('workFile').onchange=async e=>{const f=e.target.files?.[0];if(f)try{const o=JSON.parse(await f.text());if(pdfDoc){if(o.pdfName&&o.pdfName!==pdfName&&!confirm('Work was saved against a different PDF. Load anyway?'))return;applyWork(o);await renderPage();}else{pendingLoad=o;status('Work file ready. Choose its matching PDF drawing.');}}catch(err){status('JSON load failed: '+err.message);}e.target.value='';};
  $('pdfBtn').onclick=exportPdf;
  document.addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea'))return;if(e.key==='Escape'){setMode('select');return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$('undoBtn').click();}});
  updateUndo();updateMode();
}
async function exportPdf(){if(!pdfBytes||!pdfDoc){status('Open a PDF drawing first.');return;}
  if(!window.PDFLib){status('PDF exporter is unavailable.');return;}
  const btn=$('pdfBtn');btn.disabled=true;status('Exporting all pages with Wi-Fi heat maps…');
  try{
    const {PDFDocument,StandardFonts,rgb,degrees}=PDFLib,doc=await PDFDocument.load(pdfBytes.slice());
    const font=await doc.embedFont(StandardFonts.HelveticaBold),pages=doc.getPages(),ppf=pointsPerFoot();
    for(let p=1;p<=pages.length;p++){
      const aps=state.devices.filter(m=>(m.page||1)===p),walls=state.walls.filter(m=>(m.page||1)===p),poles=state.poles.filter(m=>(m.page||1)===p);
      if(!aps.length&&!walls.length&&!poles.length)continue;
      const src=await pdfDoc.getPage(p),viewport=src.getViewport({scale:1}),page=pages[p-1];
      const conv=(x,y)=>viewport.convertToPdfPoint(x,y),bottomLeft=conv(0,viewport.height),bottomRight=conv(viewport.width,viewport.height),topLeft=conv(0,0);
      const angle=Math.atan2(bottomRight[1]-bottomLeft[1],bottomRight[0]-bottomLeft[0]);
      const imgWidth=Math.hypot(bottomRight[0]-bottomLeft[0],bottomRight[1]-bottomLeft[1]);
      const imgHeight=Math.hypot(topLeft[0]-bottomLeft[0],topLeft[1]-bottomLeft[1]);
      if(aps.length&&state.showCoverage){const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        heatCanvasDraw(canvas.getContext('2d'),p,viewport);const image=await doc.embedPng(canvas.toDataURL('image/png'));
        page.drawImage(image,{x:bottomLeft[0],y:bottomLeft[1],width:imgWidth,height:imgHeight,rotate:degrees(angle*180/Math.PI)});
      }
      const ink=rgb(.09,.29,.45),asci=s=>String(s||'').replace(/[^\x20-\x7e]/g,'?');
      const label=(s,x,y,size=9)=>{const a=conv(x,y);page.drawText(asci(s),{x:a[0],y:a[1],font,size,color:ink,rotate:degrees(angle*180/Math.PI)});};
      if(state.showWalls)walls.forEach(w=>{const a=conv(w.x,w.y),b=conv(w.x2,w.y2);page.drawLine({start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]},thickness:2,color:rgb(.52,.35,.65),dashArray:[7,4]});});
      if(state.showPoles)poles.forEach(pole=>{const origin=conv(pole.x,pole.y);page.drawCircle({x:origin[0],y:origin[1],size:7,color:rgb(.78,.84,.88),borderColor:ink,borderWidth:1.4});
        C.poleHeads(pole,17*(pole.size||1)).forEach(h=>{const end=conv(h.x,h.y);page.drawLine({start:{x:origin[0],y:origin[1]},end:{x:end[0],y:end[1]},thickness:2,color:ink});page.drawCircle({x:end[0],y:end[1],size:3.6,color:rgb(.24,.34,.49)});});});
      aps.forEach(ap=>{const a=conv(ap.x,ap.y);page.drawCircle({x:a[0],y:a[1],size:7,color:rgb(.91,.97,1),borderColor:rgb(.1,.38,.61),borderWidth:2});
        page.drawCircle({x:a[0],y:a[1],size:2,color:rgb(.1,.38,.61)});label(ap.name||'AP',ap.x+12,ap.y-9,9);});
      label('PRELIMINARY WIFI COVERAGE - ILLUSTRATIVE ONLY',24,24,9);
    }
    const out=await doc.save();download(pdfName.replace(/\.pdf$/i,'')+' - Wi-Fi Heat Map.pdf',new Blob([out],{type:'application/pdf'}));status('Exported '+pages.length+' PDF pages. Original drawing unchanged.');
  }catch(e){console.error(e);status('PDF export failed: '+e.message);}finally{btn.disabled=false;}
}
bind();
})();
