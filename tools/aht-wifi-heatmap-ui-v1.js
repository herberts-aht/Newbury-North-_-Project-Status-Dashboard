/* AHT Wi-Fi Heat Map pilot. All saved coordinates remain in PDF viewport points. */
(function(){
'use strict';
const C=window.AHTWifiCore,NS='http://www.w3.org/2000/svg', $=id=>document.getElementById(id);
const BOUNDARY_STEPS=8;
if(!C){$('status').textContent='Could not load Wi-Fi coverage geometry.';return;}
const state={devices:[],walls:[],poles:[],nextId:1,showCoverage:true,opacity:.65,scaleInch:.125,showPoles:true,showWalls:true};
let pdfDoc=null,pdfBytes=null,pdfName='',pdfHash='',pageNum=1,vp=null,zoom=1,tx=0,ty=0,selected=null,tool='select',pendingWall=null,drag=null,pendingLoad=null;
let copied=null,copyCount=0,contextPoint=null;
const undo=[],redo=[];
const pointsPerFoot=()=>72*state.scaleInch;
const status=s=>{$('status').textContent=s;};
const onPage=m=>(Number(m.page)||1)===pageNum;
const pageAps=()=>state.devices.filter(onPage),pageWalls=()=>state.walls.filter(onPage),pagePoles=()=>state.poles.filter(onPage);
const selectedAp=()=>selected?.kind==='ap'?state.devices.find(d=>d.id===selected.id):null;
const selectedWall=()=>selected?.kind==='wall'?state.walls.find(w=>w.id===selected.id):null;
const selectedPole=()=>selected?.kind==='pole'?state.poles.find(p=>p.id===selected.id):null;
function snapshot(){return JSON.stringify({devices:state.devices,walls:state.walls,poles:state.poles,nextId:state.nextId});}
function restoreSnapshot(s){const o=JSON.parse(s);Object.assign(state,o);selected=null;pendingWall=null;drag=null;updateMode();syncSelection();draw();}
function remember(){undo.push(snapshot());if(undo.length>50)undo.shift();redo.length=0;updateUndo();}
function updateUndo(){$('undoBtn').disabled=undo.length===0;$('redoBtn').disabled=redo.length===0;$('copyItem').disabled=!selected;$('pasteItem').disabled=!copied||copied.pdfName!==pdfName;}
function el(tag,attrs,parent){const n=document.createElementNS(NS,tag);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,String(v)));if(parent)parent.append(n);return n;}
function text(parent,s,x,y,size=12,color='#183e5d',weight=700){const n=el('text',{x,y,fill:color,'font-family':'Arial,Helvetica,sans-serif','font-weight':weight,'font-size':size,'pointer-events':'none'},parent);n.textContent=s;return n;}
function line(parent,x1,y1,x2,y2,color='#46677d',width=2,dash){return el('line',{x1,y1,x2,y2,stroke:color,'stroke-width':width,'stroke-linecap':'round',...(dash?{'stroke-dasharray':dash}:{})},parent);}
function circle(parent,x,y,r,color,stroke='#fff',sw=2){return el('circle',{cx:x,cy:y,r,fill:color,stroke,'stroke-width':sw},parent);}
function title(parent,s){el('title',{},parent).textContent=s;}
function clamp(v,a,b){return C.clamp(v,a,b);}
const shapeName=shape=>({line:'line',rect:'rectangle',ellipse:'circle/oval',polyline:'freeform line',polygon:'closed freeform area'})[shape]||'obstruction';
const isFreeform=shape=>shape==='polyline'||shape==='polygon';
const shapePath=(points,closed)=>'M '+points.map(p=>p.join(' ')).join(' L ')+(closed?' Z':'');
const obstructionColor=w=>/^#[0-9a-f]{6}$/i.test(w.color||'')?w.color:'#815f9c';
const obstructionOpacity=w=>clamp(Number(w.opacity??.85),.05,1);
function obstructionLabelPosition(w){
  const points=C.obstructionOutline(w),center=points.length?
    [points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length]:[w.x,w.y];
  return {anchor:center,x:center[0]+Number(w.labelDx??32),y:center[1]+Number(w.labelDy??-24)};
}
function updateMode(){for(const [id,active] of [['selectBtn',tool==='select'],['placeBtn',tool==='ap'],['addWall',tool==='wall'],['reshapeBtn',tool==='reshape']])$(id).classList.toggle('active',active);
  $('viewport').style.cursor=tool==='select'?'grab':tool==='reshape'?'crosshair':'crosshair';
  const shape=$('obstructionShape').value;
  $('modeHelp').textContent=tool==='ap'?'Placing APs · click a location; Esc to finish.':tool==='wall'?'DRAWING ACTIVE · '+shapeName(shape)+' · Esc to stop.':tool==='reshape'?'Reshape · select an AP and drag yellow edge points.':'Active · Click to select; drag blank drawing to pan.';
  $('addWall').textContent=tool==='wall'?'● DRAWING ACTIVE — Esc to stop':'Draw obstruction on PDF';
  $('obstructionGuide').textContent=isFreeform(shape)?shape==='polyline'?'Click points along the line, then PRESS ENTER. It will stay OPEN.':'Click around the area, then PRESS ENTER. It will CLOSE to the first point.':'Drag between two opposite points, or click a start and end point.';
  $('cancelWall').hidden=!pendingWall;$('wallDraftHelp').hidden=!pendingWall;
  $('finishPolygon').hidden=!pendingWall||!isFreeform(pendingWall.shape)||pendingWall.points.length<(pendingWall.shape==='polygon'?3:2);
  const dock=$('obstructionFinishDock');dock.hidden=!pendingWall||!isFreeform(pendingWall.shape);
  if(!dock.hidden){$('obstructionFinishTitle').textContent=pendingWall.shape==='polyline'?'FREEFORM LINE ACTIVE':'FREEFORM AREA ACTIVE';
    $('obstructionFinishHint').textContent=pendingWall.shape==='polyline'?'Click to add bends · Line stays OPEN · Esc cancels':'Click around area · Enter CLOSES to first dot · Esc cancels';}
}
function cancelWall(showStatus=true){pendingWall=null;if(drag?.kind==='wall-draft')drag=null;updateMode();if(vp)drawOverlay();if(showStatus)status('Unfinished obstruction cancelled.');}
function setMode(mode){if(pendingWall)cancelWall(false);tool=mode;updateMode();
  const shape=$('obstructionShape').value;
  status(mode==='ap'?'Click a location to place an access point.':mode==='wall'?(isFreeform(shape)?'Click the first point, then add bends. Press Enter to finish '+(shape==='polyline'?'the OPEN line.':'the CLOSED area.'):'Drag to draw a '+shapeName(shape)+', or click two opposite points.'):mode==='reshape'?'Select an AP, then drag a yellow boundary point to reshape it.':'Select APs, CCTV poles or obstructions; drag blank drawing space to pan.');}
function toView(e){const r=$('viewport').getBoundingClientRect();return [(e.clientX-r.left-tx)/zoom,(e.clientY-r.top-ty)/zoom];}
function inDrawing(p){return vp&&p[0]>=0&&p[1]>=0&&p[0]<=vp.width&&p[1]<=vp.height;}
function applyTransform(){$('stage').style.transform=`translate(${tx}px,${ty}px) scale(${zoom})`;}
function fit(){if(!vp)return;const r=$('viewport').getBoundingClientRect();zoom=Math.min(r.width/vp.width,r.height/vp.height)*.96;tx=(r.width-vp.width*zoom)/2;ty=(r.height-vp.height*zoom)/2;applyTransform();drawOverlay();}
function zoomAt(f,x,y){const nz=clamp(zoom*f,.05,10),ratio=nz/zoom;tx=x-(x-tx)*ratio;ty=y-(y-ty)*ratio;zoom=nz;applyTransform();drawOverlay();}
function visibleHandle(ap,p){if(!vp)return p;const pad=Math.min(10/zoom,vp.width/10,vp.height/10);
  const dx=p[0]-ap.x,dy=p[1]-ap.y;let t=1;
  if(dx<0&&p[0]<pad)t=Math.min(t,(pad-ap.x)/dx);
  else if(dx>0&&p[0]>vp.width-pad)t=Math.min(t,(vp.width-pad-ap.x)/dx);
  if(dy<0&&p[1]<pad)t=Math.min(t,(pad-ap.y)/dy);
  else if(dy>0&&p[1]>vp.height-pad)t=Math.min(t,(vp.height-pad-ap.y)/dy);
  t=clamp(t,0,1);return [ap.x+dx*t,ap.y+dy*t];}
async function hashBytes(bytes){if(!window.crypto?.subtle||!bytes?.length)return '';try{const digest=await window.crypto.subtle.digest('SHA-256',bytes.slice());return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}catch(_){return '';}}
function newAp(x,y){const kind=$('newKind').value,id=state.nextId++;return {id,type:'ap',page:pageNum,x,y,kind,rot:0,rangeFt:60,radii:C.shapeFor(kind),name:'AP '+id,make:'',model:'',note:'',showCoverage:true};}
function heatCanvasDraw(ctx,p,pageView){const w=pageView.width,h=pageView.height;ctx.clearRect(0,0,w,h);if(!state.showCoverage)return;
  const ppf=pointsPerFoot(),walls=state.walls.filter(m=>(m.page||1)===p);
  state.devices.filter(m=>(m.page||1)===p&&m.showCoverage!==false).forEach(ap=>{
    // Subdivide the editable control points into a rounded contour before
    // painting each narrow gradient sector. This removes straight, angular
    // wedges while preserving per-direction reach and wall attenuation.
    const edge=C.smoothBoundary(ap,ppf,walls,BOUNDARY_STEPS);
    ctx.save();ctx.globalAlpha=state.opacity;
    for(let i=0;i<edge.length;i++){
      const p1=edge[i],p2=edge[(i+1)%edge.length];
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
    const active=selected?.kind==='wall'&&selected.id===w.id,shape=w.shape||'line';
    const color=obstructionColor(w),opacity=obstructionOpacity(w),points=C.obstructionOutline(w);
    if(w.show!==false&&points.length>=2){
      const g=el('g',{'data-wall':w.id,style:'cursor:move'},root),closed=shape!=='line'&&shape!=='polyline',d=shapePath(points,closed);
      el('path',{d,fill:closed?color:'none','fill-opacity':closed?opacity*.16:0,stroke:color,'stroke-opacity':opacity,
        'stroke-width':Math.max(3,6*Number(w.attenuation||.5)),'stroke-dasharray':'9 5','stroke-linejoin':'round'},g);
      el('path',{d,fill:closed?'transparent':'none',stroke:'transparent','stroke-width':14,'pointer-events':closed?'all':'stroke'},g);
      title(g,`${w.note||'Obstruction'} · ${Math.round((w.attenuation||0)*100)}% estimated blocking`);
      if(active){let handles;
        if(isFreeform(shape))handles=points.map((p,i)=>['v'+i,...p]);
        else if(shape==='rect'||shape==='ellipse')handles=[[w.x,w.y],[w.x2,w.y],[w.x2,w.y2],[w.x,w.y2]].map((p,i)=>['c'+i,...p]);
        else handles=[['a',w.x,w.y],['b',w.x2,w.y2]];
        handles.forEach(([h,x,y])=>{const dot=circle(root,x,y,Math.max(6,6/zoom),'#fff','#a36415',2);
          dot.setAttribute('data-wall-handle',h);dot.setAttribute('data-wall',w.id);dot.style.cursor='move';});}
    }
    if(w.showLabel===true&&w.labelText){const L=obstructionLabelPosition(w),label=String(w.labelText).slice(0,120);
      const width=Math.max(34,label.length*6.6+15),height=22;
      const leader=line(root,L.anchor[0],L.anchor[1],L.x,L.y,color,Math.max(1.4,1.4/zoom));
      leader.setAttribute('stroke-opacity',opacity);leader.setAttribute('pointer-events','none');
      const group=el('g',{'data-wall-label':w.id,'data-wall':w.id,style:'cursor:move'},root);
      el('rect',{x:L.x-width/2,y:L.y-height/2,width,height,rx:4,fill:'#fff','fill-opacity':.93,stroke:color,
        'stroke-opacity':opacity,'stroke-width':Math.max(1.1,1.1/zoom)},group);
      text(group,label,L.x-width/2+7,L.y+3.7,11,color,700);
      title(group,'Drag this attached label to move it without moving the obstruction');
    }
  });
  if(state.showPoles)pagePoles().forEach(pole=>{
    const active=selected?.kind==='pole'&&selected.id===pole.id,g=el('g',{'data-pole':pole.id,style:'cursor:move'},root),size=17*(pole.size||1);
    if(active)circle(g,pole.x,pole.y,size*.72,'none','#df9f24',Math.max(2,2/zoom));
    circle(g,pole.x,pole.y,size*.48,'#e0e8ee','#384e60',2.2);circle(g,pole.x,pole.y,size*.22,'#40576b','#fff',1);
    C.poleHeads(pole,size).forEach(h=>{
      line(g,pole.x,pole.y,h.x,h.y,'#4c5964',Math.max(1.5,size*.095));
      if(h.kind==='lidar')circle(g,h.x,h.y,size*.23,'#865bb0','#fff',1);
      else {el('rect',{x:h.x-size*.25,y:h.y-size*.18,width:size*.5,height:size*.36,rx:1.5,fill:h.kind==='ptz'?'#376bc1':'#51637b',stroke:'#fff','stroke-width':1},g);}
    });
    circle(g,pole.x,pole.y,Math.max(size*.6,11/zoom),'transparent','none',0);
    title(g,'CCTV pole with '+(pole.heads?.length||0)+' mounted devices · camera cones hidden'+(pole.note?' · '+pole.note:''));
  });
  pageAps().forEach(ap=>{
    const active=selected?.kind==='ap'&&selected.id===ap.id,g=el('g',{'data-ap':ap.id,style:'cursor:move'},root);
    if(active){const edge=C.smoothBoundary(ap,pointsPerFoot(),pageWalls(),BOUNDARY_STEPS);
      const d='M '+edge.map(p=>p.join(' ')).join(' L ')+' Z';
      const outline=el('path',{d,fill:'none',stroke:'#77540c','stroke-width':Math.max(1.8,2/zoom),'stroke-dasharray':`${8/zoom} ${5/zoom}`,'pointer-events':'stroke','data-boundary-ap':ap.id,style:'cursor:crosshair'},g);
      title(outline,'Drag this boundary to reshape Wi-Fi coverage');
      for(let i=0;i<C.COUNT;i++){const p=edge[i*BOUNDARY_STEPS],hPos=visibleHandle(ap,p),h=circle(g,hPos[0],hPos[1],Math.max(3.5,6/zoom),'#ffe34b','#77540c',Math.max(1,1.3/zoom));
        h.setAttribute('data-handle',i);h.style.cursor='crosshair';title(h,'Drag to reshape this direction');}
    }
    circle(g,ap.x,ap.y,Math.max(active?11:9,7/zoom),'#eaf6fd',active?'#f2a91b':'#1b6698',active?3:2);
    circle(g,ap.x,ap.y,Math.max(3,2/zoom),'#1a6598','none',0);
    circle(g,ap.x,ap.y,Math.max(12,12/zoom),'transparent','none',0);
    for(const r of [5,7])el('path',{d:`M ${ap.x-r} ${ap.y-2} Q ${ap.x} ${ap.y-r*1.65} ${ap.x+r} ${ap.y-2}`,
      fill:'none',stroke:'#1a6598','stroke-width':1.15,'pointer-events':'none'},g);
    text(g,ap.name||'AP',ap.x+13,ap.y-8,Math.max(9,10/zoom),'#20486c');
    title(g,[ap.name,ap.kind,ap.make,ap.model,ap.note].filter(Boolean).join(' · '));
  });
  if(pendingWall){const a=pendingWall.start,b=pendingWall.end||a,shape=pendingWall.shape;
    const points=isFreeform(shape)?[...pendingWall.points,b]:C.obstructionOutline({shape,x:a[0],y:a[1],x2:b[0],y2:b[1]});
    const preview=el('path',{d:shapePath(points,shape!=='line'&&!isFreeform(shape)),fill:'none',stroke:'#b25b08',
      'stroke-width':Math.max(3,3/zoom),'stroke-dasharray':'6 4','pointer-events':'none'},root);
    title(preview,'Obstruction preview');
    (isFreeform(shape)?pendingWall.points:[a,b]).forEach((p,i)=>{
      const dot=circle(root,p[0],p[1],Math.max(5,6/zoom),i===0?'#ffa726':'#fff','#b25b08',2);
      dot.setAttribute('pointer-events','none');});
  }
}
function draw(){if(!vp)return;drawHeat();drawOverlay();$('counts').textContent=`${state.devices.length} access points · ${state.poles.length} poles · ${state.walls.length} obstructions`;
  updateUndo();}
function refreshObstructionList(){const list=$('obstructionList');list.replaceChildren();
  const first=document.createElement('option');first.value='';first.textContent='Select one on the drawing or here…';list.append(first);
  pageWalls().forEach(w=>{const option=document.createElement('option');option.value=String(w.id);
    option.textContent=`#${w.id} · ${w.labelText||w.note||shapeName(w.shape||'line')} · ${shapeName(w.shape||'line')}${w.show===false?' (outline hidden)':''}`;
    list.append(option);});
  list.value=selected?.kind==='wall'?String(selected.id):'';
}
function syncSelection(){const ap=selectedAp(),w=selectedWall(),pole=selectedPole();$('selectedFields').hidden=!ap;$('wallFields').hidden=!w;$('poleFields').hidden=!pole;
  $('obstructionClosedModeRow').hidden=!w||!isFreeform(w.shape);
  $('selectionHelp').hidden=!!ap;$('selectionHelp').textContent=pole?'A CCTV pole is selected. Use its panel in step 5 to edit or remove it.':w?'An obstruction is selected. Use its panel in step 4.':'Select an AP on the drawing to edit its shape and settings.';
  if(ap){$('apName').value=ap.name||'';$('apKind').value=ap.kind;$('rangeFt').value=ap.rangeFt||60;$('rangeValue').textContent=ap.rangeFt||60;
    $('apRotation').value=ap.rot||0;$('directionValue').textContent=ap.rot||0;$('apMake').value=ap.make||'';$('apModel').value=ap.model||'';$('apNote').value=ap.note||'';$('apShowCoverage').checked=ap.showCoverage!==false;}
  if(w){if(isFreeform(w.shape))$('obstructionClosedMode').value=w.shape;
    $('wallAttenuation').value=Math.round((w.attenuation??0)*100);$('wallValue').textContent=$('wallAttenuation').value;$('wallNote').value=w.note||'';
    $('obstructionLabelText').value=w.labelText||'';$('obstructionLabelVisible').checked=w.showLabel===true;
    $('obstructionVisible').checked=w.show!==false;$('obstructionColor').value=obstructionColor(w);
    $('obstructionOpacity').value=Math.round(obstructionOpacity(w)*100);$('obstructionOpacityValue').textContent=$('obstructionOpacity').value;}
  if(pole)$('poleDetails').textContent=`Page ${pole.page} · ${pole.heads?.length||0} camera head(s) · drag the pole to relocate it.`;
  refreshObstructionList();
  updateUndo();
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
    pdfDoc=await pdfjsLib.getDocument({data:pdfBytes.slice()}).promise;pdfName=file.name;pdfHash=await hashBytes(pdfBytes);pageNum=1;
    $('fileLabel').textContent=file.name+' · '+pdfDoc.numPages+' page(s)';$('pageSel').replaceChildren();
    for(let i=1;i<=pdfDoc.numPages;i++){const o=document.createElement('option');o.value=i;o.textContent='Page '+i;$('pageSel').append(o);} $('pageSel').disabled=false;
    let pendingWarning='';if(pendingLoad){
      try{applyWork(pendingLoad);}catch(e){pendingWarning='Saved work not loaded: '+e.message;}finally{pendingLoad=null;}
    }
    await renderPage();
    if(pendingWarning)status(pendingWarning);
  }catch(e){console.error(e);status('Could not open PDF: '+e.message);}}
function download(name,blob){const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=name;document.body.append(link);link.click();setTimeout(()=>{URL.revokeObjectURL(link.href);link.remove();},1500);}
function workData(){return {tool:'AHT Wi-Fi Heat Map',version:3,pdfName,pdfHash,page:pageNum,scaleInch:state.scaleInch,
  devices:state.devices,walls:state.walls,poles:state.poles,nextId:state.nextId,showCoverage:state.showCoverage,opacity:state.opacity,showWalls:state.showWalls,showPoles:state.showPoles};}
function applyWork(o){if(!o||!Array.isArray(o.devices)||!Array.isArray(o.walls))throw Error('Not a Wi-Fi work JSON.');
  if(pdfDoc){if(!C.pdfFileName(o.pdfName)||C.pdfFileName(o.pdfName)!==C.pdfFileName(pdfName))throw Error('JSON belongs to a different PDF drawing.');
    if(o.pdfHash&&pdfHash&&o.pdfHash!==pdfHash)throw Error('PDF filename matches but drawing content is different.');}
  state.devices=JSON.parse(JSON.stringify(o.devices));state.walls=JSON.parse(JSON.stringify(o.walls));state.poles=Array.isArray(o.poles)?JSON.parse(JSON.stringify(o.poles)):[];
  state.nextId=Math.max(Number(o.nextId)||1,1,...[...state.devices,...state.walls,...state.poles].map(m=>(Number(m.id)||0)+1));
  const ids=new Set([...state.devices,...state.walls].map(m=>m.id));state.poles.forEach(p=>{if(!Number.isInteger(p.id)||ids.has(p.id))p.id=state.nextId++;ids.add(p.id);});
  state.scaleInch=Number(o.scaleInch)||.125;state.showCoverage=o.showCoverage!==false;state.opacity=clamp(o.opacity==null?.65:Number(o.opacity),.1,.95);state.showPoles=o.showPoles!==false;state.showWalls=o.showWalls!==false;
  $('scaleSel').value=String(state.scaleInch);$('globalHeat').checked=state.showCoverage;$('heatOpacity').value=Math.round(state.opacity*100);$('opacityValue').textContent=$('heatOpacity').value;
  $('showPoles').checked=state.showPoles;$('showWalls').checked=state.showWalls;
  if(pdfDoc&&Number(o.page)>=1&&Number(o.page)<=pdfDoc.numPages){pageNum=Number(o.page);$('pageSel').value=pageNum;}
  selected=null;undo.length=0;redo.length=0;syncSelection();draw();
}
async function importPoles(source){try{
    if(!pdfDoc){status('Open the same PDF in Wi-Fi before importing CCTV pole locations.');return;}
    const result=C.importCctvPoles(source,pdfName);
    if(!result.samePdf){const reason=`Import blocked: CCTV JSON is for “${source.pdfName||'unknown PDF'}” but Wi-Fi has “${pdfName}”. Open the matching drawing in both tools.`;
      $('poleStatus').textContent=reason;status(reason);return;}
    if(source.pdfHash&&pdfHash&&source.pdfHash!==pdfHash){status('Import blocked: these PDF files have the same name but different content.');$('poleStatus').textContent='Source PDF fingerprint does not match the open drawing.';return;}
    if(source.pageCount&&Number(source.pageCount)!==pdfDoc.numPages){status(`Import blocked: CCTV has ${source.pageCount} pages; this drawing has ${pdfDoc.numPages}.`);return;}
    if(!result.poles.length){status('CCTV work file contains no multi-head camera poles. Standalone cameras are not imported.');return;}
    if(result.poles.some(p=>p.page<1||p.page>pdfDoc.numPages)){status('Import blocked: the CCTV file refers to pages not present in this PDF.');return;}
    const scope=source.clipboard?'all':$('poleImportScope').value;
    const requested=result.poles.filter(p=>scope==='all'||p.page===pageNum);
    if(!requested.length){const pages=[...new Set(result.poles.map(p=>p.page))].sort((a,b)=>a-b).join(', ');
      status(`No poles on current page ${pageNum}. Source poles are on page(s) ${pages}. Select “All pages” if appropriate.`);return;}
    if(!source.pdfHash&&!source.clipboard&&!confirm(`This older CCTV JSON has no PDF content fingerprint. It contains ${requested.length} multi-head pole(s) and ${result.ignoredMarkers} other markers, which will not be imported. Verify that “${pdfName}” is the same drawing revision. Continue?`))return;
    // CCTV optionally rotates PDF pages while keeping marker coordinates in the
    // rotated viewport. Convert those coordinates into this tool's PDF viewport.
    const converted=[];
    for(const pole of requested){
      const page=await pdfDoc.getPage(pole.page),dst=page.getViewport({scale:1});
      const expected=source.pageDimensions?.[pole.page];
      if(expected&&(Math.abs(Number(expected.width)-dst.width)>1||Math.abs(Number(expected.height)-dst.height)>1)){
        status(`Import blocked: page ${pole.page} dimensions do not match the CCTV drawing.`);return;
      }
      const extra=((Number(source.pageRotations?.[pole.page])||0)%360+360)%360;
      if(!extra){converted.push({...pole});continue;}
      const src=page.getViewport({scale:1,rotation:(page.rotate+extra)%360});
      const transform=(x,y)=>{const [px,py]=src.convertToPdfPoint(x,y);return dst.convertToViewportPoint(px,py);};
      const [x,y]=transform(pole.x,pole.y);
      const r=(Number(pole.rot)||0)*Math.PI/180,[fx,fy]=transform(pole.x+Math.sin(r)*20,pole.y-Math.cos(r)*20);
      converted.push({...pole,x,y,rot:(Math.atan2(fx-x,-(fy-y))*180/Math.PI+360)%360});
    }
    remember();converted.forEach(p=>p.id=state.nextId++);
    state.poles=scope==='all'?converted:[...state.poles.filter(p=>p.page!==pageNum),...converted];
    selected=null;syncSelection();draw();
    $('poleStatus').textContent=`Imported ${converted.length} multi-head pole(s) from matching PDF · ${result.ignoredMarkers} standalone/other markers excluded · ${scope==='all'?'all pages':'page '+pageNum}.`;
    status(`Imported ${converted.length} CCTV pole(s) at verified positions. Camera cones hidden. Undo restores the previous poles.`);
  }catch(e){status('Pole import failed: '+e.message);}}
function itemForSelection(){if(!selected)return null;return selected.kind==='ap'?selectedAp():selected.kind==='wall'?selectedWall():selectedPole();}
function deleteSelected(){if(pendingWall){cancelWall();return true;}const item=itemForSelection();if(!item)return false;remember();
  if(selected.kind==='ap')state.devices=state.devices.filter(x=>x.id!==item.id);
  else if(selected.kind==='wall')state.walls=state.walls.filter(x=>x.id!==item.id);
  else if(selected.kind==='pole')state.poles=state.poles.filter(x=>x.id!==item.id);
  selected=null;syncSelection();draw();status('Selected drawing item deleted. Undo is available.');return true;}
function copySelected(){const item=itemForSelection();if(!pdfDoc||!item){status('Select an AP, wall or CCTV pole on the drawing before copying.');return false;}
  copied={kind:selected.kind,item:JSON.parse(JSON.stringify(item)),pdfName,page:pageNum,width:vp.width,height:vp.height};copyCount=0;updateUndo();
  status('Copied selected '+(selected.kind==='ap'?'access point':selected.kind==='wall'?'obstruction':'CCTV pole')+'. Choose Paste or right-click a destination.');return true;}
function translateObstruction(w,dx,dy){w.x+=dx;w.y+=dy;
  if(w.x2!==undefined){w.x2+=dx;w.y2+=dy;}
  if(Array.isArray(w.points))w.points=w.points.map(p=>[p[0]+dx,p[1]+dy]);}
function pasteCopied(at=null){if(!copied||!pdfDoc||!vp){status('Copy an existing item before pasting.');return false;}
  if(C.pdfFileName(copied.pdfName)!==C.pdfFileName(pdfName)){status('Paste blocked: copied item belongs to a different PDF.');return false;}
  const m=JSON.parse(JSON.stringify(copied.item)),sx=vp.width/copied.width,sy=vp.height/copied.height;
  m.x*=sx;m.y*=sy;if(m.x2!==undefined){m.x2*=sx;m.y2*=sy;}
  if(Array.isArray(m.points))m.points=m.points.map(p=>[p[0]*sx,p[1]*sy]);
  const offset=at?[at[0]-m.x,at[1]-m.y]:pageNum===copied.page?[(copyCount+1)*18,(copyCount+1)*18]:[0,0];
  remember();if(copied.kind==='wall')translateObstruction(m,offset[0],offset[1]);else{m.x+=offset[0];m.y+=offset[1];}
  m.id=state.nextId++;m.page=pageNum;
  if(copied.kind==='ap')state.devices.push(m);else if(copied.kind==='wall')state.walls.push(m);else state.poles.push(m);
  selected={kind:copied.kind,id:m.id};copyCount++;syncSelection();draw();status('Pasted '+copied.kind+' on page '+pageNum+'. Undo is available.');return true;}
function closeContext(){const menu=$('wifiContextMenu');menu.hidden=true;contextPoint=null;}
function openContext(e){if(!pdfDoc||!vp)return;e.preventDefault();e.stopPropagation();
  const p=toView(e);if(!inDrawing(p))return;
  const element=e.target instanceof Element?e.target:null;
  const ap=element?.closest('[data-ap]'),wall=element?.closest('[data-wall]'),pole=element?.closest('[data-pole]');
  if(ap)selected={kind:'ap',id:Number(ap.dataset.ap)};
  else if(wall)selected={kind:'wall',id:Number(wall.dataset.wall)};
  else if(pole)selected={kind:'pole',id:Number(pole.dataset.pole)};
  syncSelection();drawOverlay();contextPoint=p;
  const menu=$('wifiContextMenu');menu.querySelector('[data-action="copy"]').disabled=!itemForSelection();
  menu.querySelector('[data-action="delete"]').disabled=!itemForSelection()&&!pendingWall;
  menu.querySelector('[data-action="duplicate"]').disabled=!itemForSelection();
  menu.querySelector('[data-action="paste"]').disabled=!copied||C.pdfFileName(copied.pdfName)!==C.pdfFileName(pdfName);
  menu.querySelector('[data-action="cancel-wall"]').hidden=!pendingWall;
  menu.hidden=false;
  const margin=8;menu.style.left=Math.max(margin,Math.min(e.clientX,window.innerWidth-menu.offsetWidth-margin))+'px';
  menu.style.top=Math.max(margin,Math.min(e.clientY,window.innerHeight-menu.offsetHeight-margin))+'px';
}
function saveObstruction(shape,start,end,points){
  const material=$('wallPreset').selectedOptions[0].textContent.split(' · ')[0];
  remember();const wall={id:state.nextId++,page:pageNum,type:'wall',shape,
    x:start[0],y:start[1],x2:end[0],y2:end[1],attenuation:Number($('wallPreset').value),
    note:material,labelText:material,showLabel:false,show:true,color:'#815f9c',opacity:.85,labelDx:32,labelDy:-24};
  if(isFreeform(shape))wall.points=points.map(p=>p.slice());
  state.walls.push(wall);pendingWall=null;selected={kind:'wall',id:wall.id};
  setMode($('placeMultiple').checked?'wall':'select');syncSelection();draw();
  status(shapeName(shape)+' obstruction added. Drag to move; select and drag its handles to reshape. Undo is available.');
}
function finishWall(endpoint){if(!pendingWall)return;const a=pendingWall.start,shape=pendingWall.shape;
  if(isFreeform(shape)){finishFreeform();return;}
  if(Math.hypot(endpoint[0]-a[0],endpoint[1]-a[1])<Math.max(8,8/zoom)||
    (shape!=='line'&&(Math.abs(endpoint[0]-a[0])<Math.max(5,5/zoom)||Math.abs(endpoint[1]-a[1])<Math.max(5,5/zoom)))){
    status('Draw a larger '+shapeName(shape)+' with two separated corners.');return;}
  saveObstruction(shape,a,endpoint);
}
function finishFreeform(){if(!pendingWall||!isFreeform(pendingWall.shape))return;
  const shape=pendingWall.shape;
  const points=pendingWall.points.slice();const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  if(points.length>1&&distance(points[0],points.at(-1))<Math.max(9,9/zoom))points.pop();
  if(points.length<(shape==='polyline'?2:3)){status('Add more points before finishing this '+shapeName(shape)+'.');return;}
  if(shape==='polygon'){
    const area=Math.abs(points.reduce((sum,p,i)=>{const next=points[(i+1)%points.length];return sum+p[0]*next[1]-next[0]*p[1];},0))/2;
    if(area<30){status('Freeform area is too small or nearly a straight line. Add more area.');return;}
  }else if(points.every(p=>distance(p,points[0])<Math.max(8,8/zoom))){status('Freeform line needs more length. Add another point.');return;}
  saveObstruction(shape,points[0],points[1],points);
}
function startDrag(e,settings){drag={...settings,changed:false};$('viewport').setPointerCapture(e.pointerId);e.preventDefault();}
function selectItem(kind,id){selected={kind,id};syncSelection();drawOverlay();}
function pointerDown(e){if(!vp||e.button!==0)return;closeContext();const p=toView(e),target=e.target;
  if(!inDrawing(p))return;
  if(tool==='wall'){
    const shape=$('obstructionShape').value;
    if(isFreeform(shape)){
      e.preventDefault();
      if(!pendingWall){pendingWall={shape,start:p,points:[p],end:p};status('Click to add points. Press Enter to finish '+(shape==='polyline'?'this OPEN line.':'this CLOSED area.'));}
      else if(shape==='polygon'&&pendingWall.points.length>=3&&Math.hypot(p[0]-pendingWall.start[0],p[1]-pendingWall.start[1])<Math.max(10,10/zoom)){finishFreeform();return;}
      else if(Math.hypot(p[0]-pendingWall.points.at(-1)[0],p[1]-pendingWall.points.at(-1)[1])>=Math.max(4,4/zoom))pendingWall.points.push(p);
      pendingWall.end=p;updateMode();drawOverlay();return;
    }
    if(pendingWall){finishWall(p);}
    else{pendingWall={shape,start:p,end:p};updateMode();drawOverlay();startDrag(e,{kind:'wall-draft',start:p});
      status('Drag to the opposite corner, or release and click a second point. Esc cancels.');}
    return;
  }
  if(tool==='ap'){remember();const ap=newAp(...p);state.devices.push(ap);selected={kind:'ap',id:ap.id};syncSelection();draw();
    if(!$('placeMultiple').checked)setMode('select');status('AP placed. Select it to reshape coverage; yellow boundary handles appear around it.');return;}
  const handle=target.closest?.('[data-handle]'),wallHandle=target.closest?.('[data-wall-handle]'),boundary=target.closest?.('[data-boundary-ap]');
  const wallLabel=target.closest?.('[data-wall-label]');
  const apEl=target.closest?.('[data-ap]'),wallEl=target.closest?.('[data-wall]'),poleEl=target.closest?.('[data-pole]');
  if(handle&&apEl){const ap=state.devices.find(m=>m.id===Number(apEl.dataset.ap));if(!ap)return;
    const index=Number(handle.dataset.handle),a=C.angle(index)+(Number(ap.rot)||0)*Math.PI/180;
    selectItem('ap',ap.id);startDrag(e,{kind:'handle',id:ap.id,index,start:p,baseline:C.effectiveRadius(ap,a,pointsPerFoot(),pageWalls()),unit:C.unit(a)});return;}
  if(boundary&&apEl){const ap=state.devices.find(m=>m.id===Number(apEl.dataset.ap));if(!ap)return;
    const a=Math.atan2(p[0]-ap.x,-(p[1]-ap.y))-(Number(ap.rot)||0)*Math.PI/180;
    const index=((Math.round((a%(2*Math.PI)+2*Math.PI)%(2*Math.PI)/(2*Math.PI)*C.COUNT)%C.COUNT)+C.COUNT)%C.COUNT;
    const angle=C.angle(index)+(Number(ap.rot)||0)*Math.PI/180;
    selectItem('ap',ap.id);startDrag(e,{kind:'handle',id:ap.id,index,start:p,baseline:C.effectiveRadius(ap,angle,pointsPerFoot(),pageWalls()),unit:C.unit(angle)});return;}
  if(wallHandle){const w=state.walls.find(m=>m.id===Number(wallHandle.dataset.wall));if(!w)return;
    selectItem('wall',w.id);startDrag(e,{kind:'wall-handle',id:w.id,handle:wallHandle.dataset.wallHandle,start:p});return;}
  if(wallLabel){const w=state.walls.find(m=>m.id===Number(wallLabel.dataset.wallLabel));if(!w)return;
    selectItem('wall',w.id);startDrag(e,{kind:'wall-label',id:w.id,start:p,dx:Number(w.labelDx??32),dy:Number(w.labelDy??-24)});return;}
  if(apEl){const ap=state.devices.find(m=>m.id===Number(apEl.dataset.ap));if(!ap)return;selectItem('ap',ap.id);
    if(tool==='reshape')return;startDrag(e,{kind:'move',id:ap.id,start:p,x:ap.x,y:ap.y});return;}
  if(poleEl){const pole=state.poles.find(m=>m.id===Number(poleEl.dataset.pole));if(!pole)return;selectItem('pole',pole.id);
    if(tool==='reshape')return;startDrag(e,{kind:'pole-move',id:pole.id,start:p,x:pole.x,y:pole.y});return;}
  if(wallEl){const w=state.walls.find(m=>m.id===Number(wallEl.dataset.wall));if(!w)return;
    selectItem('wall',w.id);startDrag(e,{kind:'wall-move',id:w.id,start:p,original:JSON.parse(JSON.stringify(w))});return;}
  if(tool==='reshape'){const candidates=pageAps().map(ap=>{const dx=p[0]-ap.x,dy=p[1]-ap.y;
      const a=Math.atan2(dx,-dy),d=Math.hypot(dx,dy),r=C.smoothEffectiveRadius(ap,a,pointsPerFoot(),pageWalls());return {ap,d,inside:d<=r};})
      .filter(x=>x.inside).sort((a,b)=>a.d-b.d);
    if(candidates.length){selectItem('ap',candidates[0].ap.id);status('AP selected. Drag a yellow boundary handle or the dashed outline.');return;}}
  selected=null;syncSelection();drawOverlay();startDrag(e,{kind:'pan',sx:e.clientX,sy:e.clientY,tx,ty});
}
function pointerMove(e){if(!drag){if(isFreeform(pendingWall?.shape)&&tool==='wall'){pendingWall.end=toView(e);drawOverlay();}return;}const p=toView(e);
  if(drag.kind==='wall-draft'){if(!pendingWall)return;pendingWall.end=p;
    if(Math.hypot(p[0]-drag.start[0],p[1]-drag.start[1])>Math.max(8,8/zoom))drag.changed=true;
    drawOverlay();return;}
  if(drag.kind==='pan'){tx=drag.tx+(e.clientX-drag.sx);ty=drag.ty+(e.clientY-drag.sy);applyTransform();return;}
  if(!drag.changed){if(Math.hypot(p[0]-drag.start[0],p[1]-drag.start[1])<3/zoom)return;remember();drag.changed=true;}
  if(drag.kind==='move'||drag.kind==='pole-move'){const items=drag.kind==='move'?state.devices:state.poles,ap=items.find(m=>m.id===drag.id);
    if(!ap)return;ap.x=drag.x+p[0]-drag.start[0];ap.y=drag.y+p[1]-drag.start[1];}
  if(drag.kind==='wall-move'){const w=state.walls.find(m=>m.id===drag.id);if(w){
    Object.assign(w,drag.original);translateObstruction(w,p[0]-drag.start[0],p[1]-drag.start[1]);}}
  if(drag.kind==='wall-label'){const w=state.walls.find(m=>m.id===drag.id);if(w){
    w.labelDx=drag.dx+p[0]-drag.start[0];w.labelDy=drag.dy+p[1]-drag.start[1];}}
  if(drag.kind==='handle'){const ap=state.devices.find(m=>m.id===drag.id);if(ap){const delta=(p[0]-drag.start[0])*drag.unit[0]+(p[1]-drag.start[1])*drag.unit[1];
      const r=Math.max(0,drag.baseline+delta);C.updateHandle(ap,drag.index,ap.x+drag.unit[0]*r,ap.y+drag.unit[1]*r,pointsPerFoot(),pageWalls());}}
  if(drag.kind==='wall-handle'){const w=state.walls.find(m=>m.id===drag.id);if(w){
    const handle=drag.handle;
    if(handle.startsWith('v')&&Array.isArray(w.points)){
      w.points[Number(handle.slice(1))]=p;
      w.x=w.points[0][0];w.y=w.points[0][1];w.x2=w.points[1][0];w.y2=w.points[1][1];
    }else if(handle.startsWith('c')){
      const corner=Number(handle.slice(1));if(corner===0||corner===3)w.x=p[0];else w.x2=p[0];
      if(corner===0||corner===1)w.y=p[1];else w.y2=p[1];
    }else{const k=handle==='a'?'':'2';w['x'+k]=p[0];w['y'+k]=p[1];}
  }}
  draw();
}
function pointerUp(e){if(!drag)return;const d=drag;drag=null;
  try{$('viewport').releasePointerCapture(e.pointerId);}catch(_){}
  if(d.kind==='wall-draft'){if(e.type==='pointercancel'){cancelWall();return;}
    if(d.changed&&pendingWall)finishWall(pendingWall.end);
    else status('Obstruction start placed. Click the second point or press Esc to cancel.');}
  updateUndo();
}
function bind(){
  $('openBtn').onclick=()=>$('pdfFile').click();$('pdfFile').onchange=e=>{const f=e.target.files?.[0];if(f)void openPdf(f);e.target.value='';};
  $('pageSel').onchange=e=>{pageNum=Number(e.target.value);void renderPage();};
  $('scaleSel').onchange=e=>{state.scaleInch=Number(e.target.value);draw();};
  $('selectBtn').onclick=()=>setMode('select');$('placeBtn').onclick=()=>setMode('ap');$('addWall').onclick=()=>setMode('wall');
  $('reshapeBtn').onclick=()=>setMode(tool==='reshape'?'select':'reshape');$('cancelWall').onclick=()=>{cancelWall();setMode('select');};
  $('finishPolygon').onclick=finishFreeform;
  $('obstructionShape').onchange=()=>{if(pendingWall)cancelWall(false);if(tool==='wall')setMode('wall');else updateMode();};
  $('copyItem').onclick=copySelected;$('pasteItem').onclick=()=>pasteCopied();
  document.querySelectorAll('[data-step]').forEach((b)=>b.addEventListener('click',()=>{document.querySelectorAll('[data-step]').forEach(n=>n.removeAttribute('aria-current'));b.setAttribute('aria-current','step');$(b.dataset.step+'Section')?.scrollIntoView({behavior:'smooth',block:'start'});}));
  $('viewport').addEventListener('pointerdown',pointerDown);$('viewport').addEventListener('pointermove',pointerMove);$('viewport').addEventListener('pointerup',pointerUp);$('viewport').addEventListener('pointercancel',pointerUp);
  $('viewport').addEventListener('dblclick',e=>{if(isFreeform(pendingWall?.shape)){e.preventDefault();finishFreeform();}});
  $('viewport').addEventListener('wheel',e=>{if(!vp)return;e.preventDefault();const r=$('viewport').getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);},{passive:false});
  $('zoomIn').onclick=()=>{const r=$('viewport').getBoundingClientRect();zoomAt(1.25,r.width/2,r.height/2);};
  $('zoomOut').onclick=()=>{const r=$('viewport').getBoundingClientRect();zoomAt(.8,r.width/2,r.height/2);};$('zFit').onclick=fit;
  window.addEventListener('resize',fit);
  $('undoBtn').onclick=()=>{if(!undo.length)return;redo.push(snapshot());restoreSnapshot(undo.pop());};
  $('redoBtn').onclick=()=>{if(!redo.length)return;undo.push(snapshot());restoreSnapshot(redo.pop());};
  const edit=(field,action,event='change')=>{$(field).addEventListener(event,e=>{const ap=selectedAp();if(!ap)return;remember();action(ap,e.target);draw();});};
  const slider=(field,action)=>{const input=$(field);let started=false;
    input.addEventListener('pointerdown',()=>{if(selectedAp()&&!started){remember();started=true;}});
    input.addEventListener('input',e=>{const ap=selectedAp();if(!ap)return;if(!started){remember();started=true;}action(ap,e.target);draw();});
    input.addEventListener('change',()=>{started=false;});};
  edit('apName',(a,t)=>{a.name=t.value;drawOverlay();});edit('apMake',(a,t)=>a.make=t.value);edit('apModel',(a,t)=>a.model=t.value);edit('apNote',(a,t)=>a.note=t.value);
  edit('apKind',(a,t)=>{a.kind=t.value;a.radii=C.shapeFor(a.kind);});
  slider('rangeFt',(a,t)=>{a.rangeFt=Number(t.value);$('rangeValue').textContent=t.value;});
  slider('apRotation',(a,t)=>{a.rot=Number(t.value);$('directionValue').textContent=t.value;});
  edit('apShowCoverage',(a,t)=>a.showCoverage=t.checked);
  $('softenShape').onclick=()=>{const a=selectedAp();if(!a)return;remember();C.softenShape(a);draw();status('Coverage rounded into a softer, organic shape. Undo is available.');};
  $('resetShape').onclick=()=>{const a=selectedAp();if(!a)return;remember();a.radii=C.shapeFor(a.kind);draw();};
  $('deleteAp').onclick=deleteSelected;
  $('wallAttenuation').oninput=e=>{const w=selectedWall();if(!w)return;w.attenuation=Number(e.target.value)/100;$('wallValue').textContent=e.target.value;draw();};
  $('wallAttenuation').onpointerdown=()=>{if(selectedWall())remember();};
  $('wallNote').onchange=e=>{const w=selectedWall();if(w){remember();w.note=e.target.value;refreshObstructionList();drawOverlay();}};
  $('obstructionList').onchange=e=>{const id=Number(e.target.value);if(!id){selected=null;syncSelection();drawOverlay();return;}
    const w=pageWalls().find(m=>m.id===id);if(w)selectItem('wall',w.id);};
  $('obstructionClosedMode').onchange=e=>{const w=selectedWall(),shape=e.target.value;if(!w||!isFreeform(w.shape)||!isFreeform(shape))return;
    if(shape==='polygon'&&(!Array.isArray(w.points)||w.points.length<3)){
      e.target.value='polyline';status('Add at least three points before converting a line into a closed area.');return;}
    remember();w.shape=shape;refreshObstructionList();draw();
    status(shape==='polyline'?'Converted to an OPEN freeform line; every existing point is preserved.':'Converted to a CLOSED freeform area; every existing point is preserved.');};
  $('obstructionLabelText').onchange=e=>{const w=selectedWall();if(!w)return;remember();w.labelText=e.target.value;
    refreshObstructionList();drawOverlay();};
  $('obstructionLabelVisible').onchange=e=>{const w=selectedWall();if(!w)return;remember();w.showLabel=e.target.checked;
    if(w.showLabel&&!w.labelText){w.labelText=w.note||'Obstruction';$('obstructionLabelText').value=w.labelText;}
    drawOverlay();};
  $('obstructionVisible').onchange=e=>{const w=selectedWall();if(!w)return;remember();w.show=e.target.checked;
    refreshObstructionList();draw();};
  $('obstructionColor').onchange=e=>{const w=selectedWall();if(!w)return;remember();w.color=e.target.value;drawOverlay();};
  let opacityStarted=false;
  $('obstructionOpacity').addEventListener('pointerdown',()=>{if(selectedWall()&&!opacityStarted){remember();opacityStarted=true;}});
  $('obstructionOpacity').oninput=e=>{const w=selectedWall();if(!w)return;if(!opacityStarted){remember();opacityStarted=true;}
    w.opacity=Number(e.target.value)/100;$('obstructionOpacityValue').textContent=e.target.value;drawOverlay();};
  $('obstructionOpacity').onchange=()=>{opacityStarted=false;};
  $('deleteWall').onclick=deleteSelected;
  $('deletePole').onclick=deleteSelected;
  $('clearPoles').onclick=()=>{if(!state.poles.length){status('No CCTV poles to clear.');return;}
    if(!confirm('Remove all imported CCTV poles from the Wi-Fi drawing? Undo will restore them.'))return;
    remember();state.poles=[];selected=null;syncSelection();draw();status('Imported CCTV poles cleared. Undo is available.');};
  $('globalHeat').onchange=e=>{state.showCoverage=e.target.checked;drawHeat();};
  $('heatOpacity').oninput=e=>{state.opacity=Number(e.target.value)/100;$('opacityValue').textContent=e.target.value;drawHeat();};
  $('showPoles').onchange=e=>{state.showPoles=e.target.checked;drawOverlay();};$('showWalls').onchange=e=>{state.showWalls=e.target.checked;drawOverlay();};
  $('pastePoles').onclick=()=>{try{const raw=localStorage.getItem('aht:wifi:poles:v1');if(!raw){status('No CCTV poles copied yet. Use Copy poles for Wi-Fi in the CCTV tool.');return;}void importPoles(JSON.parse(raw));}catch(e){status('Pole clipboard could not be read: '+e.message);}};
  $('importPoles').onclick=()=>$('cctvFile').click();$('cctvFile').onchange=async e=>{const f=e.target.files?.[0];if(f)try{await importPoles(JSON.parse(await f.text()));}catch(err){status(err.message);}e.target.value='';};
  $('saveBtn').onclick=()=>download((pdfName||'Plan').replace(/\.pdf$/i,'')+' - Wi-Fi Heat Map Work.json',new Blob([JSON.stringify(workData(),null,2)],{type:'application/json'}));
  $('loadBtn').onclick=()=>$('workFile').click();$('workFile').onchange=async e=>{const f=e.target.files?.[0];if(f)try{const o=JSON.parse(await f.text());if(pdfDoc){applyWork(o);await renderPage();}else{pendingLoad=o;status('Work file ready. Choose its matching PDF drawing.');}}catch(err){status('JSON load failed: '+err.message);}e.target.value='';};
  $('pdfBtn').onclick=exportPdf;
  $('viewport').addEventListener('contextmenu',openContext,true);
  $('wifiContextMenu').addEventListener('click',e=>{const button=e.target.closest('button[data-action]');if(!button||button.disabled)return;
    const action=button.dataset.action,at=contextPoint;closeContext();
    if(action==='copy')copySelected();else if(action==='paste')pasteCopied(at);
    else if(action==='duplicate'){if(copySelected())pasteCopied();}
    else if(action==='delete')deleteSelected();else if(action==='cancel-wall')cancelWall();});
  document.addEventListener('pointerdown',e=>{if(!$('wifiContextMenu').hidden&&!$('wifiContextMenu').contains(e.target))closeContext();},true);
  window.addEventListener('blur',closeContext);window.addEventListener('resize',closeContext);
  document.addEventListener('keydown',e=>{
    if(e.target instanceof Element&&e.target.closest('input,select,textarea,[contenteditable="true"]'))return;
    if(e.key==='Escape'){e.preventDefault();if(!$('wifiContextMenu').hidden)closeContext();else{if(pendingWall)cancelWall();setMode('select');}return;}
    if(e.key==='Enter'&&isFreeform(pendingWall?.shape)){e.preventDefault();finishFreeform();return;}
    if((e.ctrlKey||e.metaKey)&&!e.altKey){const key=e.key.toLowerCase();
      if(key==='z'){e.preventDefault();$(e.shiftKey?'redoBtn':'undoBtn').click();return;}
      if(key==='y'){e.preventDefault();$('redoBtn').click();return;}
      if(key==='c'&&itemForSelection()){e.preventDefault();copySelected();return;}
      if(key==='v'&&copied){e.preventDefault();pasteCopied();return;}}
    if((e.key==='Delete'||e.key==='Backspace')&&(selected||pendingWall)){e.preventDefault();deleteSelected();return;}
    if(selected&&e.key.startsWith('Arrow')){const item=itemForSelection();if(!item)return;e.preventDefault();
      const step=e.shiftKey?10:1,dx=e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0;
      const dy=e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0;
      remember();if(selected.kind==='wall')translateObstruction(item,dx,dy);else{item.x+=dx;item.y+=dy;}draw();}
  });
  updateUndo();updateMode();
}
async function exportPdf(){if(!pdfBytes||!pdfDoc){status('Open a PDF drawing first.');return;}
  if(!window.PDFLib){status('PDF exporter is unavailable.');return;}
  const btn=$('pdfBtn');btn.disabled=true;status('Exporting all pages with Wi-Fi heat maps…');
  try{
    const {PDFDocument,StandardFonts,rgb,degrees}=window.PDFLib,doc=await PDFDocument.load(pdfBytes.slice());
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
      if(state.showWalls)walls.forEach(w=>{
        const hex=obstructionColor(w).slice(1),paint=rgb(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);
        const opacity=obstructionOpacity(w),points=C.obstructionOutline(w);
        if(w.show!==false&&points.length>=2){const closed=(w.shape||'line')!=='line'&&w.shape!=='polyline';
          for(let i=0;i<(closed?points.length:points.length-1);i++){
            const a=conv(...points[i]),b=conv(...points[(i+1)%points.length]);
            page.drawLine({start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]},thickness:2,color:paint,opacity,dashArray:[7,4]});
          }}
        if(w.showLabel===true&&w.labelText){const L=obstructionLabelPosition(w),labelText=asci(w.labelText).slice(0,120),width=Math.max(36,labelText.length*6.3+15),height=20;
          const a=conv(...L.anchor),b=conv(L.x,L.y),bottomLeftLabel=conv(L.x-width/2,L.y+height/2);
          page.drawLine({start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]},thickness:1.1,color:paint,opacity});
          page.drawRectangle({x:bottomLeftLabel[0],y:bottomLeftLabel[1],width,height,rotate:degrees(angle*180/Math.PI),
            color:rgb(1,1,1),opacity:.92,borderColor:paint,borderOpacity:opacity,borderWidth:1});
          const labelPoint=conv(L.x-width/2+6,L.y+3.5);
          page.drawText(labelText,{x:labelPoint[0],y:labelPoint[1],font,size:10,color:paint,opacity,rotate:degrees(angle*180/Math.PI)});
        }
      });
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
