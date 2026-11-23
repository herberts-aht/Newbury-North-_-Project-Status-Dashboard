/* AHT Wi-Fi Heat Map pilot. All saved coordinates remain in PDF viewport points. */
(function(){
'use strict';
const C=window.AHTWifiCore,NS='http://www.w3.org/2000/svg', $=id=>document.getElementById(id);
const BOUNDARY_STEPS=8;
if(!C){$('status').textContent='Could not load Wi-Fi coverage geometry.';return;}
const state={devices:[],walls:[],poles:[],nextId:1,showCoverage:true,opacity:.65,scaleInch:.125,showPoles:true,showWalls:true,viewRadio:'combined'};
let pdfDoc=null,pdfBytes=null,pdfName='',pdfHash='',pageNum=1,vp=null,zoom=1,tx=0,ty=0,selected=null,tool='select',pendingWall=null,drag=null,pendingLoad=null;
let bulkMode=false;
const selectedKeys=new Set();
let bulkGuideStage=null,bulkGuideX=80,bulkGuideY=100;
let copied=null,copyCount=0,contextPoint=null;
const undo=[],redo=[];
const pointsPerFoot=()=>72*state.scaleInch;
let statusTimer=null;
const status=s=>{const popup=$('status');$('statusText').textContent=s;popup.hidden=false;
  if(statusTimer!==null)clearTimeout(statusTimer);
  statusTimer=setTimeout(()=>{popup.hidden=true;statusTimer=null;},/blocked|failed|could not|error|unavailable/i.test(s)?10000:5500);};
const dismissStatus=()=>{if(statusTimer!==null)clearTimeout(statusTimer);statusTimer=null;$('status').hidden=true;};
const onPage=m=>(Number(m.page)||1)===pageNum;
const pageAps=()=>state.devices.filter(onPage),pageWalls=()=>state.walls.filter(onPage),pagePoles=()=>state.poles.filter(onPage);
const selectedAp=()=>selected?.kind==='ap'?state.devices.find(d=>d.id===selected.id):null;
const selectedWall=()=>selected?.kind==='wall'?state.walls.find(w=>w.id===selected.id):null;
const selectedPole=()=>selected?.kind==='pole'?state.poles.find(p=>p.id===selected.id):null;
const selectionKey=(kind,id)=>`${kind}:${id}`;
const collectionFor=kind=>kind==='ap'?state.devices:kind==='wall'?state.walls:state.poles;
const isSelected=(kind,id)=>selectedKeys.has(selectionKey(kind,id));
function selectedItems(){return [...selectedKeys].map(key=>{const [kind,id]=key.split(':');return {kind,item:collectionFor(kind).find(m=>m.id===Number(id)&&onPage(m))};}).filter(x=>x.item);}
function clearSelected(){selected=null;selectedKeys.clear();}
function positionBulkGuide(){const guide=$('bulkGuide'),width=guide.offsetWidth||210,height=guide.offsetHeight||90;
  guide.style.left=Math.max(8,Math.min(bulkGuideX+16,window.innerWidth-width-8))+'px';
  guide.style.top=Math.max(8,Math.min(bulkGuideY+18,window.innerHeight-height-8))+'px';}
function updateBulkGuide(){const guide=$('bulkGuide'),count=selectedItems().length;
  if(!count&&bulkGuideStage==='actions')bulkGuideStage=null;
  guide.hidden=!count||(!bulkMode&&bulkGuideStage!=='actions');
  if(guide.hidden)return;
  $('bulkGuideCount').textContent=`${count} icon${count===1?'':'s'} selected`;
  $('bulkGuidePicking').hidden=!bulkMode;$('bulkGuideActions').hidden=bulkMode;
  positionBulkGuide();
}
function rememberBulkGuidePoint(e){bulkGuideX=e.clientX;bulkGuideY=e.clientY;}
function setSelected(kind,id,additive=false,toggle=false){const key=selectionKey(kind,id);
  if(!additive)selectedKeys.clear();
  if(toggle&&selectedKeys.has(key))selectedKeys.delete(key);else selectedKeys.add(key);
  if(selectedKeys.has(key))selected={kind,id};
  else{const tail=[...selectedKeys].at(-1);const [otherKind,otherId]=tail?tail.split(':'):[];selected=tail?{kind:otherKind,id:Number(otherId)}:null;}
  syncSelection();drawOverlay();
}
const apIconScale=ap=>clamp(Number(ap?.iconScale)||1,.5,2.5);
function snapshot(){return JSON.stringify({devices:state.devices,walls:state.walls,poles:state.poles,nextId:state.nextId});}
function restoreSnapshot(s){const o=JSON.parse(s);Object.assign(state,o);clearSelected();pendingWall=null;drag=null;updateMode();syncSelection();draw();}
function remember(){undo.push(snapshot());if(undo.length>50)undo.shift();redo.length=0;updateUndo();}
function updateUndo(){$('undoBtn').disabled=undo.length===0;$('redoBtn').disabled=redo.length===0;$('copyItem').disabled=!selectedItems().length;$('pasteItem').disabled=!copied||copied.pdfName!==pdfName;}
function el(tag,attrs,parent){const n=document.createElementNS(NS,tag);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,String(v)));if(parent)parent.append(n);return n;}
function text(parent,s,x,y,size=12,color='#183e5d',weight=700){const n=el('text',{x,y,fill:color,'font-family':'Arial,Helvetica,sans-serif','font-weight':weight,'font-size':size,'pointer-events':'none'},parent);n.textContent=s;return n;}
function line(parent,x1,y1,x2,y2,color='#46677d',width=2,dash){return el('line',{x1,y1,x2,y2,stroke:color,'stroke-width':width,'stroke-linecap':'round',...(dash?{'stroke-dasharray':dash}:{})},parent);}
function circle(parent,x,y,r,color,stroke='#fff',sw=2){return el('circle',{cx:x,cy:y,r,fill:color,stroke,'stroke-width':sw},parent);}
function title(parent,s){el('title',{},parent).textContent=s;}
function clamp(v,a,b){return C.clamp(v,a,b);}
const shapeName=shape=>({line:'line',rect:'rectangle',ellipse:'circle/oval',polyline:'freeform line',polygon:'closed freeform area'})[shape]||'obstruction';
const isFreeform=shape=>shape==='polyline'||shape==='polygon';
const wifiKeyName=m=>m.type==='ap'?'Wi-Fi Access Point':m.type==='pole3'?`CCTV Pole (${m.heads?.length||0} heads)`:
  `${m.note||'Wi-Fi'} obstruction (${shapeName(m.shape||'line')})`;
const wifiKeyVariant=m=>m.type==='ap'?'wifi:ap':m.type==='pole3'?
  'wifi:pole:'+((m.heads||[]).map(h=>h.kind||'cam').sort().join('+')||'bare'):
  'wifi:obstruction:'+(m.shape||'line')+':'+(m.note||'')+':'+obstructionColor(m);
const wifiKeyDevice=m=>m.type==='ap'?{kind:'wifi-ap',color:'#1b6698'}:m.type==='pole3'?
  {kind:'wifi-pole',color:'#4c5964',headKinds:(m.heads||[]).map(h=>h.kind||'cam')}:
  {kind:'wifi-obstruction',color:obstructionColor(m),shape:m.shape||'line'};
function wifiKeySvgIcon(dev,x,y,size,group){const s=size*.5,color=dev.color||'#1b6698';
  if(dev.kind==='wifi-ap'){
    circle(group,x,y,s*.7,'#eaf6fd',color,Math.max(1,size*.09));circle(group,x,y,s*.2,color,'none',0);
    for(const r of [.55,.85])el('path',{d:`M ${x-r*s} ${y-s*.22} Q ${x} ${y-r*s*1.7} ${x+r*s} ${y-s*.22}`,
      fill:'none',stroke:color,'stroke-width':Math.max(1,size*.06)},group);
  }else if(dev.kind==='wifi-pole'){
    circle(group,x,y,s*.4,'#e0e8ee',color,Math.max(1,size*.08));
    const count=Math.min(5,Math.max(1,dev.headKinds?.length||1));
    for(let i=0;i<count;i++){const a=(i/count)*Math.PI*2,xx=x+Math.cos(a)*s*.85,yy=y+Math.sin(a)*s*.85;
      line(group,x,y,xx,yy,color,Math.max(1,size*.09));
      el('rect',{x:xx-s*.18,y:yy-s*.12,width:s*.36,height:s*.24,rx:1,fill:dev.headKinds?.[i]==='lidar'?'#865bb0':color,stroke:'#fff','stroke-width':.6},group);}
  }else if(dev.kind==='wifi-obstruction'){
    const attrs={fill:'none',stroke:color,'stroke-width':Math.max(1.5,size*.13),'stroke-dasharray':'4 2'};
    if(dev.shape==='ellipse')el('ellipse',{cx:x,cy:y,rx:s*.85,ry:s*.53,...attrs},group);
    else if(dev.shape==='rect'||dev.shape==='polygon')el('rect',{x:x-s*.8,y:y-s*.55,width:s*1.6,height:s*1.1,rx:1,...attrs},group);
    else line(group,x-s*.85,y+s*.30,x+s*.85,y-s*.30,color,Math.max(1.5,size*.14));
  }
}
function setupWifiDrawingKey(){if(!window.AHTDrawingKey)return;
  window.ahtDrawingKey=window.AHTDrawingKey.create({
    toolName:'Wi-Fi Heat Map',rootSvgId:'overlay',sceneId:'overlay',getPage:()=>pageNum,getViewport:()=>vp,
    getMarkers:()=>[...state.devices,...state.poles,...state.walls],
    isDevice:m=>['ap','pole3','wall'].includes(m.type),
    isVisible:m=>m.type==='ap'||m.type==='pole3'?m.type==='ap'||state.showPoles:state.showWalls&&m.show!==false,
    variantKey:wifiKeyVariant,labelFor:wifiKeyName,deviceFor:wifiKeyDevice,
    drawSvgIcon:wifiKeySvgIcon
  });
}
const shapePath=(points,closed)=>'M '+points.map(p=>p.join(' ')).join(' L ')+(closed?' Z':'');
const obstructionColor=w=>/^#[0-9a-f]{6}$/i.test(w.color||'')?w.color:'#815f9c';
const obstructionOpacity=w=>clamp(Number(w.opacity??.85),.05,1);
const obstructionLabelSize=w=>clamp(Number(w.labelSize)||11,7,28);
function obstructionLabelMetrics(w){const size=obstructionLabelSize(w),length=String(w.labelText||'').slice(0,120).length;
  return {size,width:Math.max(34,length*size*.61+15),height:size+12};}
function obstructionLabelPosition(w){
  const points=C.obstructionOutline(w),center=points.length?
    [points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length]:[w.x,w.y];
  return {anchor:center,x:center[0]+Number(w.labelDx??32),y:center[1]+Number(w.labelDy??-24)};
}
function updateMode(){for(const [id,active] of [['selectBtn',tool==='select'],['placeBtn',tool==='ap'],['addWall',tool==='wall'],['reshapeBtn',tool==='reshape'],['bulkSelectBtn',bulkMode]])$(id).classList.toggle('active',active);
  $('bulkSelectBtn').setAttribute('aria-pressed',bulkMode?'true':'false');
  $('bulkSelectBtn').textContent=bulkMode?'✓ Done Selecting':'□ Bulk Select / Box';
  $('viewport').style.cursor=tool==='select'?(bulkMode?'crosshair':'grab'):'crosshair';
  const shape=$('obstructionShape').value;
  $('modeHelp').textContent=tool==='ap'?'Placing APs · click a location; Esc to finish.':tool==='wall'?'DRAWING ACTIVE · '+shapeName(shape)+' · Esc to stop.':tool==='reshape'?'Reshape · select an AP and drag yellow edge points.':bulkMode?'Bulk Select ON · Click to add; drag a box to select; drag a selected icon to move group.':'Active · Click to select; drag blank drawing to pan.';
  $('addWall').textContent=tool==='wall'?'● DRAWING ACTIVE — Esc to stop':'Draw obstruction on PDF';
  $('obstructionGuide').textContent=isFreeform(shape)?shape==='polyline'?'Click points along the line, then PRESS ENTER. It will stay OPEN.':'Click around the area, then PRESS ENTER. It will CLOSE to the first point.':'Drag between two opposite points, or click a start and end point.';
  $('cancelWall').hidden=!pendingWall;$('wallDraftHelp').hidden=!pendingWall;
  $('finishPolygon').hidden=!pendingWall||!isFreeform(pendingWall.shape)||pendingWall.points.length<(pendingWall.shape==='polygon'?3:2);
  const dock=$('obstructionFinishDock');dock.hidden=!pendingWall||!isFreeform(pendingWall.shape);
  if(!dock.hidden){$('obstructionFinishTitle').textContent=pendingWall.shape==='polyline'?'FREEFORM LINE ACTIVE':'FREEFORM AREA ACTIVE';
    $('obstructionFinishHint').textContent=pendingWall.shape==='polyline'?'Click to add bends · Line stays OPEN · Esc cancels':'Click around area · Enter CLOSES to first dot · Esc cancels';}
  updateBulkGuide();
}
function cancelWall(showStatus=true){pendingWall=null;if(drag?.kind==='wall-draft')drag=null;updateMode();if(vp)drawOverlay();if(showStatus)status('Unfinished obstruction cancelled.');}
function setMode(mode){if(pendingWall)cancelWall(false);tool=mode;if(mode!=='select'){bulkMode=false;bulkGuideStage=null;}updateMode();
  const shape=$('obstructionShape').value;
  status(mode==='ap'?'Click a location to place an access point.':mode==='wall'?(isFreeform(shape)?'Click the first point, then add bends. Press Enter to finish '+(shape==='polyline'?'the OPEN line.':'the CLOSED area.'):'Drag to draw a '+shapeName(shape)+', or click two opposite points.'):mode==='reshape'?'Select an AP, then drag a yellow boundary point to reshape it.':bulkMode?'Bulk Select: click to add items, drag a box to select a group, then drag any selected item to move all.':'Select APs, CCTV poles or obstructions; drag blank drawing space to pan.');}
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
function newAp(x,y){const kind=$('newKind').value,id=state.nextId++;return {id,type:'ap',page:pageNum,x,y,kind,rot:0,iconScale:1,rangeFt:60,radii:C.shapeFor(kind),
  radioMode:'both',editBand:'2.4',zoneRanges:{'2.4':C.zoneRanges({rangeFt:60},'2.4'),'5':C.zoneRanges({rangeFt:60},'5')},
  name:'AP '+id,make:'',model:'',note:'',showCoverage:true};}
function heatCanvasDraw(ctx,p,pageView){const w=pageView.width,h=pageView.height;ctx.clearRect(0,0,w,h);if(!state.showCoverage)return;
  const ppf=pointsPerFoot(),walls=state.walls.filter(m=>(m.page||1)===p);
  state.devices.filter(m=>(m.page||1)===p&&m.showCoverage!==false).forEach(ap=>{
    const shapes=C.coverageContours(ap,ppf,walls,state.viewRadio,BOUNDARY_STEPS);
    if(!shapes.bands.length)return;
    const edge=shapes.marginal;
    ctx.save();ctx.globalAlpha=state.opacity;
    for(let i=0;i<edge.length;i++){
      const next=(i+1)%edge.length,p1=edge[i],p2=edge[next];
      const mx=(p1[0]+p2[0])/2,my=(p1[1]+p2[1])/2;
      const dist=(pt)=>Math.hypot(pt[0]-ap.x,pt[1]-ap.y);
      const outer=Math.max(.001,(dist(p1)+dist(p2))/2);
      const strong=clamp((dist(shapes.strong[i])+dist(shapes.strong[next]))/(2*outer),0,1);
      const moderate=clamp((dist(shapes.moderate[i])+dist(shapes.moderate[next]))/(2*outer),strong,1);
      const grad=ctx.createLinearGradient(ap.x,ap.y,mx,my);
      grad.addColorStop(0,'rgba(229,57,53,1)');grad.addColorStop(strong*.86,'rgba(229,57,53,.96)');
      grad.addColorStop(strong,'rgba(245,124,0,.92)');grad.addColorStop((strong+moderate)/2,'rgba(245,124,0,.9)');
      grad.addColorStop(moderate,'rgba(253,216,53,.84)');grad.addColorStop(1,'rgba(253,216,53,0)');
      ctx.beginPath();ctx.moveTo(ap.x,ap.y);ctx.lineTo(...p1);ctx.lineTo(...p2);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
    }
    ctx.restore();
  });
}
function drawHeat(){if(!vp)return;const canvas=$('heatCanvas');heatCanvasDraw(canvas.getContext('2d'),pageNum,vp);}
function drawOverlay(){if(!vp)return;const root=$('overlay');root.replaceChildren();
  if(state.showWalls)pageWalls().forEach(w=>{
    const active=isSelected('wall',w.id),single=selectedKeys.size===1,shape=w.shape||'line';
    const color=obstructionColor(w),opacity=obstructionOpacity(w),points=C.obstructionOutline(w);
    if(w.show!==false&&points.length>=2){
      const g=el('g',{'data-wall':w.id,style:'cursor:move'},root),closed=shape!=='line'&&shape!=='polyline',d=shapePath(points,closed);
      el('path',{d,fill:closed?color:'none','fill-opacity':closed?opacity*.16:0,stroke:color,'stroke-opacity':opacity,
        'stroke-width':Math.max(3,6*Number(w.attenuation||.5))+(active?1.4:0),'stroke-dasharray':'9 5','stroke-linejoin':'round'},g);
      if(active)el('path',{d,fill:'none',stroke:'#e5a023','stroke-width':Math.max(1.5,2/zoom),
        'stroke-dasharray':'5 4','pointer-events':'none'},g);
      el('path',{d,fill:closed?'transparent':'none',stroke:'transparent','stroke-width':14,'pointer-events':closed?'all':'stroke'},g);
      title(g,`${w.note||'Obstruction'} · ${Math.round((w.attenuation||0)*100)}% estimated blocking`);
      if(active&&single){let handles;
        if(isFreeform(shape))handles=points.map((p,i)=>['v'+i,...p]);
        else if(shape==='rect'||shape==='ellipse')handles=[[w.x,w.y],[w.x2,w.y],[w.x2,w.y2],[w.x,w.y2]].map((p,i)=>['c'+i,...p]);
        else handles=[['a',w.x,w.y],['b',w.x2,w.y2]];
        handles.forEach(([h,x,y])=>{const dot=circle(root,x,y,Math.max(6,6/zoom),'#fff','#a36415',2);
          dot.setAttribute('data-wall-handle',h);dot.setAttribute('data-wall',w.id);dot.style.cursor='move';});}
    }
    if(w.showLabel===true&&w.labelText){const L=obstructionLabelPosition(w),label=String(w.labelText).slice(0,120);
      const {size,width,height}=obstructionLabelMetrics(w);
      const leader=line(root,L.anchor[0],L.anchor[1],L.x,L.y,color,Math.max(1.4,1.4/zoom));
      leader.setAttribute('stroke-opacity',opacity);leader.setAttribute('pointer-events','none');
      const group=el('g',{'data-wall-label':w.id,'data-wall':w.id,style:'cursor:move'},root);
      el('rect',{x:L.x-width/2,y:L.y-height/2,width,height,rx:4,fill:'#fff','fill-opacity':.93,stroke:color,
        'stroke-opacity':opacity,'stroke-width':Math.max(1.1,1.1/zoom)},group);
      text(group,label,L.x-width/2+7,L.y+size*.34,size,color,700);
      title(group,'Drag this attached label to move it without moving the obstruction');
    }
  });
  if(state.showPoles)pagePoles().forEach(pole=>{
    const active=isSelected('pole',pole.id),g=el('g',{'data-pole':pole.id,style:'cursor:move'},root),size=17*(pole.size||1);
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
    const active=isSelected('ap',ap.id),single=selectedKeys.size===1,size=apIconScale(ap),g=el('g',{'data-ap':ap.id,style:'cursor:move'},root);
    if(active&&single&&C.activeBands(ap,state.viewRadio).length){const edge=C.coverageContours(ap,pointsPerFoot(),pageWalls(),state.viewRadio,BOUNDARY_STEPS).marginal;
      const d='M '+edge.map(p=>p.join(' ')).join(' L ')+' Z';
      const outline=el('path',{d,fill:'none',stroke:'#77540c','stroke-width':Math.max(1.8,2/zoom),'stroke-dasharray':`${8/zoom} ${5/zoom}`,'pointer-events':'stroke','data-boundary-ap':ap.id,style:'cursor:crosshair'},g);
      title(outline,'Drag this boundary to reshape Wi-Fi coverage');
      for(let i=0;i<C.COUNT;i++){const p=edge[i*BOUNDARY_STEPS],hPos=visibleHandle(ap,p),h=circle(g,hPos[0],hPos[1],Math.max(3.5,6/zoom),'#ffe34b','#77540c',Math.max(1,1.3/zoom));
        h.setAttribute('data-handle',i);h.style.cursor='crosshair';title(h,'Drag to reshape this direction');}
    }
    circle(g,ap.x,ap.y,Math.max((active?11:9)*size,7/zoom),'#eaf6fd',active?'#f2a91b':'#1b6698',(active?3:2)*size);
    circle(g,ap.x,ap.y,Math.max(3*size,2/zoom),'#1a6598','none',0);
    circle(g,ap.x,ap.y,Math.max(12*size,12/zoom),'transparent','none',0);
    for(const r of [5,7])el('path',{d:`M ${ap.x-r*size} ${ap.y-2*size} Q ${ap.x} ${ap.y-r*1.65*size} ${ap.x+r*size} ${ap.y-2*size}`,
      fill:'none',stroke:'#1a6598','stroke-width':1.15*size,'pointer-events':'none'},g);
    text(g,ap.name||'AP',ap.x+13*size,ap.y-8*size,Math.max(9,10/zoom),'#20486c');
    title(g,[ap.name,ap.kind,ap.radioMode==='2.4'?'2.4 GHz':ap.radioMode==='5'?'5 GHz':'2.4 + 5 GHz',ap.make,ap.model,ap.note].filter(Boolean).join(' · '));
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
  if(drag?.kind==='marquee'){
    const x=Math.min(drag.start[0],drag.end[0]),y=Math.min(drag.start[1],drag.end[1]);
    el('rect',{x,y,width:Math.abs(drag.end[0]-drag.start[0]),height:Math.abs(drag.end[1]-drag.start[1]),
      fill:'#2378b8','fill-opacity':.13,stroke:'#1b649b','stroke-width':Math.max(1.1,1.1/zoom),'stroke-dasharray':`${6/zoom} ${4/zoom}`,'pointer-events':'none'},root);
  }
  window.ahtDrawingKey?.refresh();
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
function syncApRangeFields(ap){const radio=ap.radioMode==='2.4'||ap.radioMode==='5'?ap.radioMode:(ap.editBand==='5'?'5':'2.4');
  $('apEditBand').value=radio;$('apEditBand').disabled=ap.radioMode==='2.4'||ap.radioMode==='5';
  const ranges=C.zoneRanges(ap,radio);
  for(const zone of ['strong','moderate','marginal']){$(zone+'Range').value=ranges[zone];$(zone+'RangeValue').textContent=ranges[zone];}
}
function syncSelection(){const count=selectedItems().length,multiple=count>1,ap=multiple?null:selectedAp(),w=multiple?null:selectedWall(),pole=multiple?null:selectedPole();
  $('bulkSelectionCount').textContent=count?`${count} item${count===1?'':'s'} selected${multiple?' · drag one selected item to move all':''}`:'No items selected';
  $('selectedFields').hidden=!ap;$('wallFields').hidden=!w;$('poleFields').hidden=!pole;
  $('obstructionClosedModeRow').hidden=!w||!isFreeform(w.shape);
  $('selectionHelp').hidden=!!ap;$('selectionHelp').textContent=multiple?`${count} items selected. Drag one to move the group, or Copy, Paste, Delete, or use arrow keys. Clear the selection to edit one AP.`:pole?'A CCTV pole is selected. Use its panel in step 5 to edit or remove it.':w?'An obstruction is selected. Use its panel in step 4.':'Select an AP on the drawing to edit its shape and settings.';
  if(ap){$('apName').value=ap.name||'';$('apKind').value=ap.kind;$('apRadios').value=ap.radioMode||'both';syncApRangeFields(ap);
    $('apIconScale').value=Math.round(apIconScale(ap)*100);$('apIconScaleValue').textContent=$('apIconScale').value;
    $('apRotation').value=ap.rot||0;$('directionValue').textContent=ap.rot||0;$('apMake').value=ap.make||'';$('apModel').value=ap.model||'';$('apNote').value=ap.note||'';$('apShowCoverage').checked=ap.showCoverage!==false;}
  if(w){if(isFreeform(w.shape))$('obstructionClosedMode').value=w.shape;
    $('wallAttenuation').value=Math.round((w.attenuation??0)*100);$('wallValue').textContent=$('wallAttenuation').value;$('wallNote').value=w.note||'';
    $('obstructionLabelText').value=w.labelText||'';$('obstructionLabelVisible').checked=w.showLabel===true;
    $('obstructionLabelSize').value=obstructionLabelSize(w);$('obstructionLabelSizeValue').textContent=obstructionLabelSize(w);
    $('obstructionVisible').checked=w.show!==false;$('obstructionColor').value=obstructionColor(w);
    $('obstructionOpacity').value=Math.round(obstructionOpacity(w)*100);$('obstructionOpacityValue').textContent=$('obstructionOpacity').value;}
  if(pole)$('poleDetails').textContent=`Page ${pole.page} · ${pole.heads?.length||0} camera head(s) · drag the pole to relocate it.`;
  refreshObstructionList();
  updateUndo();
  updateBulkGuide();
}
async function renderPage(){if(!pdfDoc)return;const page=await pdfDoc.getPage(pageNum);vp=page.getViewport({scale:1});
  for(const c of [$('planCanvas'),$('heatCanvas')]){c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);c.style.width=vp.width+'px';c.style.height=vp.height+'px';}
  $('stage').style.width=vp.width+'px';$('stage').style.height=vp.height+'px';
  $('overlay').setAttribute('viewBox',`0 0 ${vp.width} ${vp.height}`);$('overlay').setAttribute('width',vp.width);$('overlay').setAttribute('height',vp.height);
  const canvas=$('planCanvas'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  await page.render({canvasContext:ctx,viewport:vp}).promise;
  $('empty').hidden=true;clearSelected();syncSelection();fit();draw();status('Page '+pageNum+' ready. Select/adjust or place access points.');
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
function workData(){return {tool:'AHT Wi-Fi Heat Map',version:5,pdfName,pdfHash,page:pageNum,scaleInch:state.scaleInch,
  devices:state.devices,walls:state.walls,poles:state.poles,nextId:state.nextId,showCoverage:state.showCoverage,opacity:state.opacity,showWalls:state.showWalls,showPoles:state.showPoles,viewRadio:state.viewRadio,
  drawingKey:window.ahtDrawingKey?.serialize()};}
function applyWork(o){if(!o||!Array.isArray(o.devices)||!Array.isArray(o.walls))throw Error('Not a Wi-Fi work JSON.');
  if(pdfDoc){if(!C.pdfFileName(o.pdfName)||C.pdfFileName(o.pdfName)!==C.pdfFileName(pdfName))throw Error('JSON belongs to a different PDF drawing.');
    if(o.pdfHash&&pdfHash&&o.pdfHash!==pdfHash)throw Error('PDF filename matches but drawing content is different.');}
  state.devices=JSON.parse(JSON.stringify(o.devices));state.walls=JSON.parse(JSON.stringify(o.walls));state.poles=Array.isArray(o.poles)?JSON.parse(JSON.stringify(o.poles)):[];
  state.nextId=Math.max(Number(o.nextId)||1,1,...[...state.devices,...state.walls,...state.poles].map(m=>(Number(m.id)||0)+1));
  const ids=new Set([...state.devices,...state.walls].map(m=>m.id));state.poles.forEach(p=>{if(!Number.isInteger(p.id)||ids.has(p.id))p.id=state.nextId++;ids.add(p.id);});
  state.scaleInch=Number(o.scaleInch)||.125;state.showCoverage=o.showCoverage!==false;state.opacity=clamp(o.opacity==null?.65:Number(o.opacity),.1,.95);state.showPoles=o.showPoles!==false;state.showWalls=o.showWalls!==false;
  state.viewRadio=['combined','2.4','5'].includes(o.viewRadio)?o.viewRadio:'combined';
  window.ahtDrawingKey?.restore(o.drawingKey);
  $('scaleSel').value=String(state.scaleInch);$('globalHeat').checked=state.showCoverage;$('heatOpacity').value=Math.round(state.opacity*100);$('opacityValue').textContent=$('heatOpacity').value;
  $('showPoles').checked=state.showPoles;$('showWalls').checked=state.showWalls;$('viewRadio').value=state.viewRadio;
  if(pdfDoc&&Number(o.page)>=1&&Number(o.page)<=pdfDoc.numPages){pageNum=Number(o.page);$('pageSel').value=pageNum;}
  clearSelected();undo.length=0;redo.length=0;syncSelection();draw();
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
    clearSelected();syncSelection();draw();
    $('poleStatus').textContent=`Imported ${converted.length} multi-head pole(s) from matching PDF · ${result.ignoredMarkers} standalone/other markers excluded · ${scope==='all'?'all pages':'page '+pageNum}.`;
    status(`Imported ${converted.length} CCTV pole(s) at verified positions. Camera cones hidden. Undo restores the previous poles.`);
  }catch(e){status('Pole import failed: '+e.message);}}
function itemForSelection(){if(!selected)return null;return collectionFor(selected.kind).find(m=>m.id===selected.id&&onPage(m))||null;}
function deleteSelected(){if(pendingWall){cancelWall();return true;}const items=selectedItems();if(!items.length)return false;remember();
  for(const [kind,field] of [['ap','devices'],['wall','walls'],['pole','poles']]){
    const ids=new Set(items.filter(x=>x.kind===kind).map(x=>x.item.id));state[field]=state[field].filter(x=>!ids.has(x.id));}
  clearSelected();syncSelection();draw();status(`Deleted ${items.length} selected item${items.length===1?'':'s'}. Undo restores the group.`);return true;}
function copySelected(){const items=selectedItems();if(!pdfDoc||!items.length){status('Select one or more APs, obstructions or CCTV poles before copying.');return false;}
  const entries=items.map(({kind,item})=>({kind,item:JSON.parse(JSON.stringify(item))}));
  const anchor=entries.length===1?[entries[0].item.x,entries[0].item.y]:[
    Math.min(...entries.flatMap(({kind,item})=>kind==='wall'?C.obstructionOutline(item).map(p=>p[0]):[item.x])),
    Math.min(...entries.flatMap(({kind,item})=>kind==='wall'?C.obstructionOutline(item).map(p=>p[1]):[item.y]))];
  copied={entries,anchor,pdfName,page:pageNum,width:vp.width,height:vp.height};copyCount=0;updateUndo();
  status(`Copied ${entries.length} item${entries.length===1?'':'s'}. Choose Paste or right-click a destination.`);return true;}
function translateObstruction(w,dx,dy){w.x+=dx;w.y+=dy;
  if(w.x2!==undefined){w.x2+=dx;w.y2+=dy;}
  if(Array.isArray(w.points))w.points=w.points.map(p=>[p[0]+dx,p[1]+dy]);}
function pasteCopied(at=null){if(!copied||!pdfDoc||!vp){status('Copy an existing item before pasting.');return false;}
  if(C.pdfFileName(copied.pdfName)!==C.pdfFileName(pdfName)){status('Paste blocked: copied items belong to a different PDF.');return false;}
  const sx=vp.width/copied.width,sy=vp.height/copied.height;
  const offset=at?[at[0]-copied.anchor[0]*sx,at[1]-copied.anchor[1]*sy]:pageNum===copied.page?[(copyCount+1)*18,(copyCount+1)*18]:[0,0];
  remember();clearSelected();
  for(const {kind,item} of copied.entries){const m=JSON.parse(JSON.stringify(item));
    m.x*=sx;m.y*=sy;if(m.x2!==undefined){m.x2*=sx;m.y2*=sy;}
    if(Array.isArray(m.points))m.points=m.points.map(p=>[p[0]*sx,p[1]*sy]);
    if(kind==='wall')translateObstruction(m,offset[0],offset[1]);else{m.x+=offset[0];m.y+=offset[1];}
    m.id=state.nextId++;m.page=pageNum;collectionFor(kind).push(m);
    selectedKeys.add(selectionKey(kind,m.id));selected={kind,id:m.id};
  }
  copyCount++;syncSelection();draw();status(`Pasted ${copied.entries.length} item${copied.entries.length===1?'':'s'} on page ${pageNum}. Undo is available.`);return true;}
function closeContext(){const menu=$('wifiContextMenu'),wasOpen=!menu.hidden;menu.hidden=true;contextPoint=null;
  if(wasOpen)updateBulkGuide();}
function openContext(e){if(!pdfDoc||!vp)return;e.preventDefault();e.stopPropagation();
  const p=toView(e);if(!inDrawing(p))return;
  const element=e.target instanceof Element?e.target:null;
  const ap=element?.closest('[data-ap]'),wall=element?.closest('[data-wall]'),pole=element?.closest('[data-pole]');
  const hit=ap?{kind:'ap',id:Number(ap.dataset.ap)}:wall?{kind:'wall',id:Number(wall.dataset.wall)}:pole?{kind:'pole',id:Number(pole.dataset.pole)}:null;
  if(hit&&!isSelected(hit.kind,hit.id))setSelected(hit.kind,hit.id);
  contextPoint=p;
  const menu=$('wifiContextMenu'),count=selectedItems().length;
  for(const action of ['copy','delete','duplicate']){
    const btn=menu.querySelector(`[data-action="${action}"]`);btn.disabled=!count&&(action!=='delete'||!pendingWall);
    btn.textContent=action==='duplicate'?`Duplicate${count>1?' '+count+' selected':''}`:`${action==='copy'?'Copy':'Delete'} ${count>1?count+' selected':'selected'}`;
  }
  menu.querySelector('[data-action="paste"]').disabled=!copied||C.pdfFileName(copied.pdfName)!==C.pdfFileName(pdfName);
  menu.querySelector('[data-action="cancel-wall"]').hidden=!pendingWall;
  $('bulkGuide').hidden=true;
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
  state.walls.push(wall);pendingWall=null;clearSelected();selectedKeys.add(selectionKey('wall',wall.id));selected={kind:'wall',id:wall.id};
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
function selectItem(kind,id){setSelected(kind,id);}
function selectAllPage(){if(!vp)return;clearSelected();
  for(const [kind,items] of [['ap',pageAps()],['pole',state.showPoles?pagePoles():[]],
    ['wall',state.showWalls?pageWalls().filter(w=>w.show!==false||w.showLabel===true):[]]]){
    for(const item of items){selectedKeys.add(selectionKey(kind,item.id));selected={kind,id:item.id};}}
  syncSelection();drawOverlay();status(`Selected ${selectedKeys.size} visible item${selectedKeys.size===1?'':'s'} on page ${pageNum}.`);
}
function startItemMove(e,p,kind,item){if(selectedItems().length>1){const originals=selectedItems().map(({kind,item})=>({kind,id:item.id,original:JSON.parse(JSON.stringify(item))}));
    $('bulkGuide').hidden=true;startDrag(e,{kind:'group-move',start:p,originals,selectionTarget:{kind,id:item.id}});return;}
  $('bulkGuide').hidden=true;
  if(kind==='wall')startDrag(e,{kind:'wall-move',id:item.id,start:p,original:JSON.parse(JSON.stringify(item)),selectionTarget:{kind,id:item.id}});
  else startDrag(e,{kind:kind==='ap'?'move':'pole-move',id:item.id,start:p,x:item.x,y:item.y,selectionTarget:{kind,id:item.id}});
}
function marqueeSelect(start,end,additive=false){const [x1,x2]=[Math.min(start[0],end[0]),Math.max(start[0],end[0])];
  const [y1,y2]=[Math.min(start[1],end[1]),Math.max(start[1],end[1])];
  if(!additive)clearSelected();
  const inside=(x,y)=>x>=x1&&x<=x2&&y>=y1&&y<=y2;
  const add=(kind,item)=>{selectedKeys.add(selectionKey(kind,item.id));selected={kind,id:item.id};};
  pageAps().forEach(ap=>{if(inside(ap.x,ap.y))add('ap',ap);});
  if(state.showPoles)pagePoles().forEach(p=>{if(inside(p.x,p.y))add('pole',p);});
  if(state.showWalls)pageWalls().forEach(w=>{if(w.show===false&&w.showLabel!==true)return;
    const points=C.obstructionOutline(w);if(points.length&&Math.max(...points.map(p=>p[0]))>=x1&&Math.min(...points.map(p=>p[0]))<=x2&&
      Math.max(...points.map(p=>p[1]))>=y1&&Math.min(...points.map(p=>p[1]))<=y2)add('wall',w);});
  syncSelection();drawOverlay();
}
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
  if(tool==='ap'){remember();const ap=newAp(...p);state.devices.push(ap);clearSelected();selectedKeys.add(selectionKey('ap',ap.id));selected={kind:'ap',id:ap.id};syncSelection();draw();
    if(!$('placeMultiple').checked)setMode('select');status('AP placed. Select it to reshape coverage; yellow boundary handles appear around it.');return;}
  const handle=target.closest?.('[data-handle]'),wallHandle=target.closest?.('[data-wall-handle]'),boundary=target.closest?.('[data-boundary-ap]');
  const wallLabel=target.closest?.('[data-wall-label]');
  const apEl=target.closest?.('[data-ap]'),wallEl=target.closest?.('[data-wall]'),poleEl=target.closest?.('[data-pole]');
  const hit=apEl?{kind:'ap',id:Number(apEl.dataset.ap)}:poleEl?{kind:'pole',id:Number(poleEl.dataset.pole)}:wallEl?{kind:'wall',id:Number(wallEl.dataset.wall)}:null;
  if(tool==='select'&&hit&&(e.shiftKey||(bulkMode&&!isSelected(hit.kind,hit.id)))){
    if(bulkMode)rememberBulkGuidePoint(e);
    setSelected(hit.kind,hit.id,true,!!e.shiftKey);return;}
  if(handle&&apEl){const ap=state.devices.find(m=>m.id===Number(apEl.dataset.ap));if(!ap)return;
    const index=Number(handle.dataset.handle),a=C.angle(index)+(Number(ap.rot)||0)*Math.PI/180;
    const reachFt=C.outerReach(ap,state.viewRadio),shape={...ap,rangeFt:reachFt};
    selectItem('ap',ap.id);startDrag(e,{kind:'handle',id:ap.id,index,start:p,reachFt,baseline:C.effectiveRadius(shape,a,pointsPerFoot(),pageWalls()),unit:C.unit(a)});return;}
  if(boundary&&apEl){const ap=state.devices.find(m=>m.id===Number(apEl.dataset.ap));if(!ap)return;
    const a=Math.atan2(p[0]-ap.x,-(p[1]-ap.y))-(Number(ap.rot)||0)*Math.PI/180;
    const index=((Math.round((a%(2*Math.PI)+2*Math.PI)%(2*Math.PI)/(2*Math.PI)*C.COUNT)%C.COUNT)+C.COUNT)%C.COUNT;
    const angle=C.angle(index)+(Number(ap.rot)||0)*Math.PI/180;
    const reachFt=C.outerReach(ap,state.viewRadio),shape={...ap,rangeFt:reachFt};
    selectItem('ap',ap.id);startDrag(e,{kind:'handle',id:ap.id,index,start:p,reachFt,baseline:C.effectiveRadius(shape,angle,pointsPerFoot(),pageWalls()),unit:C.unit(angle)});return;}
  if(wallHandle){const w=state.walls.find(m=>m.id===Number(wallHandle.dataset.wall));if(!w)return;
    selectItem('wall',w.id);startDrag(e,{kind:'wall-handle',id:w.id,handle:wallHandle.dataset.wallHandle,start:p});return;}
  if(wallLabel){const w=state.walls.find(m=>m.id===Number(wallLabel.dataset.wallLabel));if(!w)return;
    if(isSelected('wall',w.id)&&selectedItems().length>1){startItemMove(e,p,'wall',w);return;}
    selectItem('wall',w.id);startDrag(e,{kind:'wall-label',id:w.id,start:p,dx:Number(w.labelDx??32),dy:Number(w.labelDy??-24)});return;}
  if(apEl){const ap=state.devices.find(m=>m.id===Number(apEl.dataset.ap));if(!ap)return;
    if(!isSelected('ap',ap.id))selectItem('ap',ap.id);
    if(tool==='reshape')return;startItemMove(e,p,'ap',ap);return;}
  if(poleEl){const pole=state.poles.find(m=>m.id===Number(poleEl.dataset.pole));if(!pole)return;
    if(!isSelected('pole',pole.id))selectItem('pole',pole.id);
    if(tool==='reshape')return;startItemMove(e,p,'pole',pole);return;}
  if(wallEl){const w=state.walls.find(m=>m.id===Number(wallEl.dataset.wall));if(!w)return;
    if(!isSelected('wall',w.id))selectItem('wall',w.id);startItemMove(e,p,'wall',w);return;}
  if(tool==='reshape'){const candidates=pageAps().map(ap=>{const dx=p[0]-ap.x,dy=p[1]-ap.y;
      const a=Math.atan2(dx,-dy),d=Math.hypot(dx,dy),reachFt=C.outerReach(ap,state.viewRadio);
      const r=reachFt?C.smoothEffectiveRadius({...ap,rangeFt:reachFt},a,pointsPerFoot(),pageWalls()):0;return {ap,d,inside:reachFt>0&&d<=r};})
      .filter(x=>x.inside).sort((a,b)=>a.d-b.d);
    if(candidates.length){selectItem('ap',candidates[0].ap.id);status('AP selected. Drag a yellow boundary handle or the dashed outline.');return;}}
  if(tool==='select'&&bulkMode){$('bulkGuide').hidden=true;startDrag(e,{kind:'marquee',start:p,end:p,additive:!!e.shiftKey});drawOverlay();return;}
  clearSelected();syncSelection();drawOverlay();startDrag(e,{kind:'pan',sx:e.clientX,sy:e.clientY,tx,ty});
}
function pointerMove(e){if(!drag){if(isFreeform(pendingWall?.shape)&&tool==='wall'){pendingWall.end=toView(e);drawOverlay();}return;}const p=toView(e);
  if(drag.kind==='wall-draft'){if(!pendingWall)return;pendingWall.end=p;
    if(Math.hypot(p[0]-drag.start[0],p[1]-drag.start[1])>Math.max(8,8/zoom))drag.changed=true;
    drawOverlay();return;}
  if(drag.kind==='pan'){tx=drag.tx+(e.clientX-drag.sx);ty=drag.ty+(e.clientY-drag.sy);applyTransform();return;}
  if(drag.kind==='marquee'){drag.end=p;drawOverlay();return;}
  if(!drag.changed){if(Math.hypot(p[0]-drag.start[0],p[1]-drag.start[1])<3/zoom)return;remember();drag.changed=true;}
  if(drag.kind==='move'||drag.kind==='pole-move'){const items=drag.kind==='move'?state.devices:state.poles,ap=items.find(m=>m.id===drag.id);
    if(!ap)return;ap.x=drag.x+p[0]-drag.start[0];ap.y=drag.y+p[1]-drag.start[1];}
  if(drag.kind==='wall-move'){const w=state.walls.find(m=>m.id===drag.id);if(w){
    Object.assign(w,drag.original);translateObstruction(w,p[0]-drag.start[0],p[1]-drag.start[1]);}}
  if(drag.kind==='group-move')for(const entry of drag.originals){const item=collectionFor(entry.kind).find(m=>m.id===entry.id);if(!item)continue;
    Object.assign(item,JSON.parse(JSON.stringify(entry.original)));
    const dx=p[0]-drag.start[0],dy=p[1]-drag.start[1];
    if(entry.kind==='wall')translateObstruction(item,dx,dy);else{item.x+=dx;item.y+=dy;}}
  if(drag.kind==='wall-label'){const w=state.walls.find(m=>m.id===drag.id);if(w){
    w.labelDx=drag.dx+p[0]-drag.start[0];w.labelDy=drag.dy+p[1]-drag.start[1];}}
  if(drag.kind==='handle'){const ap=state.devices.find(m=>m.id===drag.id);if(ap){const delta=(p[0]-drag.start[0])*drag.unit[0]+(p[1]-drag.start[1])*drag.unit[1];
      const r=Math.max(0,drag.baseline+delta),shape={...ap,rangeFt:drag.reachFt};
      C.updateHandle(shape,drag.index,ap.x+drag.unit[0]*r,ap.y+drag.unit[1]*r,pointsPerFoot(),pageWalls());ap.radii=shape.radii;}}
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
  if(d.kind==='marquee'&&e.type!=='pointercancel'){rememberBulkGuidePoint(e);marqueeSelect(d.start,d.end,d.additive);}
  if(bulkMode&&d.selectionTarget&&e.type!=='pointercancel'){
    rememberBulkGuidePoint(e);
    if(!d.changed)setSelected(d.selectionTarget.kind,d.selectionTarget.id,true,true);
    else updateBulkGuide();
  }
  updateUndo();
}
function bind(){
  $('dismissStatus').onclick=dismissStatus;
  $('openBtn').onclick=()=>$('pdfFile').click();$('pdfFile').onchange=e=>{const f=e.target.files?.[0];if(f)void openPdf(f);e.target.value='';};
  $('pageSel').onchange=e=>{pageNum=Number(e.target.value);void renderPage();};
  $('scaleSel').onchange=e=>{state.scaleInch=Number(e.target.value);draw();};
  $('selectBtn').onclick=()=>setMode('select');$('placeBtn').onclick=()=>setMode('ap');$('addWall').onclick=()=>setMode('wall');
  const toggleBulkPicking=()=>{if(bulkMode){bulkMode=false;bulkGuideStage=selectedItems().length?'actions':null;}
    else{bulkMode=true;bulkGuideStage='pick';}
    setMode('select');updateBulkGuide();
    status(bulkMode?'Bulk selection ON. Click scattered icons one by one or drag a box; choose Done when finished.':
      selectedItems().length?'Selection complete. Choose Move group or Copy group in the floating menu.':'Bulk selection OFF. Shift-click still allows multiple selection.');};
  $('bulkSelectBtn').onclick=toggleBulkPicking;
  $('bulkGuideDone').onclick=()=>{if(bulkMode)toggleBulkPicking();};
  $('bulkGuideMore').onclick=()=>{if(!bulkMode)toggleBulkPicking();};
  $('bulkGuideMove').onclick=()=>{bulkGuideStage=null;updateBulkGuide();status('Drag any selected icon to move the full group. Undo restores the previous positions.');};
  $('bulkGuideCopy').onclick=()=>{bulkGuideStage=null;updateBulkGuide();copySelected();};
  $('bulkGuideClear').onclick=()=>{bulkGuideStage=null;clearSelected();syncSelection();drawOverlay();};
  $('selectAllPage').onclick=selectAllPage;
  $('clearSelection').onclick=()=>{clearSelected();syncSelection();drawOverlay();};
  $('reshapeBtn').onclick=()=>setMode(tool==='reshape'?'select':'reshape');$('cancelWall').onclick=()=>{cancelWall();setMode('select');};
  $('finishPolygon').onclick=finishFreeform;
  $('obstructionShape').onchange=()=>{if(pendingWall)cancelWall(false);if(tool==='wall')setMode('wall');else updateMode();};
  $('copyItem').onclick=copySelected;$('pasteItem').onclick=()=>pasteCopied();
  document.querySelectorAll('[data-step]').forEach((b)=>b.addEventListener('click',()=>{document.querySelectorAll('[data-step]').forEach(n=>n.removeAttribute('aria-current'));b.setAttribute('aria-current','step');$(b.dataset.step==='key'?'drawingKeySection':b.dataset.step+'Section')?.scrollIntoView({behavior:'smooth',block:'start'});}));
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
  slider('apIconScale',(a,t)=>{a.iconScale=clamp(Number(t.value)/100,.5,2.5);$('apIconScaleValue').textContent=Math.round(a.iconScale*100);});
  $('applyIconScaleToKind').onclick=()=>{const a=selectedAp();if(!a||selectedItems().length!==1)return;
    const matches=state.devices.filter(d=>d.kind===a.kind),size=apIconScale(a);
    if(!matches.length)return;remember();matches.forEach(d=>{d.iconScale=size;});draw();
    status(`Set ${matches.length} ${a.kind} AP symbol${matches.length===1?'':'s'} to ${Math.round(size*100)}% across all pages. Undo restores the previous sizes.`);};
  edit('apRadios',(a,t)=>{a.radioMode=t.value;if(a.radioMode!=='both')a.editBand=a.radioMode;syncApRangeFields(a);});
  $('apEditBand').onchange=e=>{const a=selectedAp();if(!a)return;a.editBand=e.target.value;syncApRangeFields(a);};
  for(const zone of ['strong','moderate','marginal'])slider(zone+'Range',(a,t)=>{
    const band=a.radioMode==='2.4'||a.radioMode==='5'?a.radioMode:a.editBand==='5'?'5':'2.4';
    const ranges=C.zoneRanges(a,band),value=Number(t.value);
    ranges[zone]=zone==='strong'?clamp(value,5,ranges.moderate):zone==='moderate'?clamp(value,ranges.strong,ranges.marginal):clamp(value,ranges.moderate,250);
    a.zoneRanges={...a.zoneRanges,[band]:ranges};t.value=ranges[zone];$(zone+'RangeValue').textContent=ranges[zone];
  });
  slider('apRotation',(a,t)=>{a.rot=Number(t.value);$('directionValue').textContent=t.value;});
  edit('apShowCoverage',(a,t)=>a.showCoverage=t.checked);
  $('softenShape').onclick=()=>{const a=selectedAp();if(!a)return;remember();C.softenShape(a);draw();status('Coverage rounded into a softer, organic shape. Undo is available.');};
  $('resetShape').onclick=()=>{const a=selectedAp();if(!a)return;remember();a.radii=C.shapeFor(a.kind);draw();};
  $('deleteAp').onclick=deleteSelected;
  $('wallAttenuation').oninput=e=>{const w=selectedWall();if(!w)return;w.attenuation=Number(e.target.value)/100;$('wallValue').textContent=e.target.value;draw();};
  $('wallAttenuation').onpointerdown=()=>{if(selectedWall())remember();};
  $('wallNote').onchange=e=>{const w=selectedWall();if(w){remember();w.note=e.target.value;refreshObstructionList();drawOverlay();}};
  $('obstructionList').onchange=e=>{const id=Number(e.target.value);if(!id){clearSelected();syncSelection();drawOverlay();return;}
    const w=pageWalls().find(m=>m.id===id);if(w)selectItem('wall',w.id);};
  $('obstructionClosedMode').onchange=e=>{const w=selectedWall(),shape=e.target.value;if(!w||!isFreeform(w.shape)||!isFreeform(shape))return;
    if(shape==='polygon'&&(!Array.isArray(w.points)||w.points.length<3)){
      e.target.value='polyline';status('Add at least three points before converting a line into a closed area.');return;}
    remember();w.shape=shape;refreshObstructionList();draw();
    status(shape==='polyline'?'Converted to an OPEN freeform line; every existing point is preserved.':'Converted to a CLOSED freeform area; every existing point is preserved.');};
  $('obstructionLabelText').onchange=e=>{const w=selectedWall();if(!w)return;remember();w.labelText=e.target.value;
    refreshObstructionList();drawOverlay();};
  let labelSizeStarted=false;
  $('obstructionLabelSize').addEventListener('pointerdown',()=>{if(selectedWall()&&!labelSizeStarted){remember();labelSizeStarted=true;}});
  $('obstructionLabelSize').oninput=e=>{const w=selectedWall();if(!w)return;if(!labelSizeStarted){remember();labelSizeStarted=true;}
    w.labelSize=clamp(Number(e.target.value),7,28);$('obstructionLabelSizeValue').textContent=w.labelSize;drawOverlay();};
  $('obstructionLabelSize').onchange=()=>{labelSizeStarted=false;};
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
    remember();state.poles=[];clearSelected();syncSelection();draw();status('Imported CCTV poles cleared. Undo is available.');};
  $('globalHeat').onchange=e=>{state.showCoverage=e.target.checked;drawHeat();};
  $('viewRadio').onchange=e=>{state.viewRadio=e.target.value;draw();};
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
  window.addEventListener('blur',closeContext);window.addEventListener('resize',()=>{closeContext();updateBulkGuide();});
  document.addEventListener('keydown',e=>{
    if(e.target instanceof Element&&e.target.closest('input,select,textarea,[contenteditable="true"]'))return;
    if(e.key==='Escape'){e.preventDefault();if(!$('wifiContextMenu').hidden)closeContext();else if(bulkMode){toggleBulkPicking();}
      else{if(pendingWall)cancelWall();else clearSelected();bulkGuideStage=null;bulkMode=false;setMode('select');syncSelection();drawOverlay();}return;}
    if(e.key==='Enter'&&isFreeform(pendingWall?.shape)){e.preventDefault();finishFreeform();return;}
    if((e.ctrlKey||e.metaKey)&&!e.altKey){const key=e.key.toLowerCase();
      if(key==='z'){e.preventDefault();$(e.shiftKey?'redoBtn':'undoBtn').click();return;}
      if(key==='y'){e.preventDefault();$('redoBtn').click();return;}
      if(key==='a'&&pdfDoc){e.preventDefault();selectAllPage();return;}
      if(key==='c'&&selectedItems().length){e.preventDefault();copySelected();return;}
      if(key==='v'&&copied){e.preventDefault();pasteCopied();return;}}
    if((e.key==='Delete'||e.key==='Backspace')&&(selectedItems().length||pendingWall)){e.preventDefault();deleteSelected();return;}
    if(selectedItems().length&&e.key.startsWith('Arrow')){e.preventDefault();
      const step=e.shiftKey?10:1,dx=e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0;
      const dy=e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0;
      remember();for(const {kind,item} of selectedItems()){if(kind==='wall')translateObstruction(item,dx,dy);else{item.x+=dx;item.y+=dy;}}draw();}
  });
  updateUndo();updateMode();status('Ready · Pilot v0.6.3');
}
async function exportPdf(){if(!pdfBytes||!pdfDoc){status('Open a PDF drawing first.');return;}
  if(!window.PDFLib){status('PDF exporter is unavailable.');return;}
  const btn=$('pdfBtn');btn.disabled=true;status('Exporting all pages with Wi-Fi heat maps…');
  try{
    const {PDFDocument,StandardFonts,rgb,degrees}=window.PDFLib,doc=await PDFDocument.load(pdfBytes.slice());
    const font=await doc.embedFont(StandardFonts.HelveticaBold),plainFont=await doc.embedFont(StandardFonts.Helvetica),pages=doc.getPages(),ppf=pointsPerFoot();
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
        if(w.showLabel===true&&w.labelText){const L=obstructionLabelPosition(w),labelText=asci(w.labelText).slice(0,120);
          const {size,width,height}=obstructionLabelMetrics(w);
          const a=conv(...L.anchor),b=conv(L.x,L.y),bottomLeftLabel=conv(L.x-width/2,L.y+height/2);
          page.drawLine({start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]},thickness:1.1,color:paint,opacity});
          page.drawRectangle({x:bottomLeftLabel[0],y:bottomLeftLabel[1],width,height,rotate:degrees(angle*180/Math.PI),
            color:rgb(1,1,1),opacity:.92,borderColor:paint,borderOpacity:opacity,borderWidth:1});
          const labelPoint=conv(L.x-width/2+7,L.y+size*.34);
          page.drawText(labelText,{x:labelPoint[0],y:labelPoint[1],font,size,color:paint,opacity,rotate:degrees(angle*180/Math.PI)});
        }
      });
      if(state.showPoles)poles.forEach(pole=>{const origin=conv(pole.x,pole.y);page.drawCircle({x:origin[0],y:origin[1],size:7,color:rgb(.78,.84,.88),borderColor:ink,borderWidth:1.4});
        C.poleHeads(pole,17*(pole.size||1)).forEach(h=>{const end=conv(h.x,h.y);page.drawLine({start:{x:origin[0],y:origin[1]},end:{x:end[0],y:end[1]},thickness:2,color:ink});page.drawCircle({x:end[0],y:end[1],size:3.6,color:rgb(.24,.34,.49)});});});
      aps.forEach(ap=>{const a=conv(ap.x,ap.y),size=apIconScale(ap);page.drawCircle({x:a[0],y:a[1],size:7*size,color:rgb(.91,.97,1),borderColor:rgb(.1,.38,.61),borderWidth:2*size});
        page.drawCircle({x:a[0],y:a[1],size:2*size,color:rgb(.1,.38,.61)});label(ap.name||'AP',ap.x+13*size,ap.y-9*size,9);});
      label('PRELIMINARY WIFI COVERAGE - ILLUSTRATIVE ONLY',24,24,9);
      if(window.ahtDrawingKey){
        const rotation=degrees(angle*180/Math.PI);
        const hexRgb=hex=>{const h=/^#[0-9a-f]{6}$/i.test(hex||'')?hex.slice(1):'1b6698';
          return rgb(parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255);};
        const keyText=(value,x,y,size,color,bold)=>{const [px,py]=conv(x,y);
          page.drawText(asci(value),{x:px,y:py,font:bold?font:plainFont,size,color,rotate:rotation});};
        const polygon=(points,fill,opacity,stroke,borderOpacity,borderWidth)=>{
          // Shared drawing keys use rectangle panels; transform their lower-left
          // corner into PDF space, respecting any source-page rotation.
          const bl=conv(...points[3]),top=conv(...points[0]),right=conv(...points[1]);
          const width=Math.hypot(right[0]-top[0],right[1]-top[1]);
          const height=Math.hypot(top[0]-bl[0],top[1]-bl[1]);
          page.drawRectangle({x:bl[0],y:bl[1],width,height,rotate:rotation,
            ...(fill?{color:fill,opacity}:{}),...(stroke?{borderColor:stroke,borderOpacity,borderWidth}:{})});
        };
        const drawIconPdf=(dev,x,y,size)=>{const center=conv(x,y),color=hexRgb(dev.color),s=size*.5;
          if(dev.kind==='wifi-ap'){
            page.drawCircle({x:center[0],y:center[1],size:s*.38,color:rgb(.91,.97,1),borderColor:color,borderWidth:Math.max(1,size*.08)});
            page.drawCircle({x:center[0],y:center[1],size:s*.12,color});
          }else if(dev.kind==='wifi-pole'){
            page.drawCircle({x:center[0],y:center[1],size:s*.34,color:rgb(.85,.89,.92),borderColor:color,borderWidth:1});
            const count=Math.min(5,Math.max(1,dev.headKinds?.length||1));
            for(let i=0;i<count;i++){const a=i/count*Math.PI*2,end=conv(x+Math.cos(a)*s*.8,y+Math.sin(a)*s*.8);
              page.drawLine({start:{x:center[0],y:center[1]},end:{x:end[0],y:end[1]},thickness:Math.max(1,size*.07),color});
              page.drawCircle({x:end[0],y:end[1],size:s*.12,color});}
          }else if(dev.kind==='wifi-obstruction'){
            const shape=dev.shape||'line';
            const points=shape==='ellipse'?Array.from({length:18},(_,i)=>{
              const a=i/18*Math.PI*2;return [x+Math.cos(a)*s*.85,y+Math.sin(a)*s*.53];}):
              shape==='rect'||shape==='polygon'?[[x-s*.8,y-s*.55],[x+s*.8,y-s*.55],[x+s*.8,y+s*.55],[x-s*.8,y+s*.55]]:
              [[x-s*.85,y+s*.3],[x+s*.85,y-s*.3]];
            const closed=shape==='ellipse'||shape==='rect'||shape==='polygon';
            for(let i=0;i<(closed?points.length:points.length-1);i++){
              const a=conv(...points[i]),b=conv(...points[(i+1)%points.length]);
              page.drawLine({start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]},thickness:Math.max(1.2,size*.10),color});}
          }
        };
        window.ahtDrawingKey.drawPdf({pageNumber:p,viewport,polygon,text:keyText,rgb,conv,page,drawIconPdf,hexRgb,PDFLib:window.PDFLib});
      }
    }
    const out=await doc.save();download(pdfName.replace(/\.pdf$/i,'')+' - Wi-Fi Heat Map.pdf',new Blob([out],{type:'application/pdf'}));status('Exported '+pages.length+' PDF pages. Original drawing unchanged.');
  }catch(e){console.error(e);status('PDF export failed: '+e.message);}finally{btn.disabled=false;}
}
bind();setupWifiDrawingKey();
})();
