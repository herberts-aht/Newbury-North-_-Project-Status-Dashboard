/* Lightweight DOM/PDF stubs exercise real Wi-Fi event handlers without a browser. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'AHT_wifi_heatmap_pilot_v1.html'),'utf8');
const core=fs.readFileSync(path.join(root,'aht-wifi-coverage-core-v1.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'aht-wifi-heatmap-ui-v1.js'),'utf8');

class FakeElement{
  constructor(tag='div',id=''){this.tagName=tag.toUpperCase();this.id=id;this.parentElement=null;this.children=[];this.dataset={};this.attributes={};this.style={};this.listeners={};
    this.classList={toggle:()=>{},remove:()=>{}};this.hidden=false;this.value='';this.checked=false;this.disabled=false;this.textContent='';this.offsetWidth=168;this.offsetHeight=176;}
  setAttribute(key,value){this.attributes[key]=String(value);if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=String(value);}
  getAttribute(key){return this.attributes[key]||null;}
  append(...nodes){nodes.forEach(n=>{n.parentElement=this;this.children.push(n);});}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
  dispatch(type,event){for(const fn of this.listeners[type]||[])fn(event);}
  contains(target){while(target){if(target===this)return true;target=target.parentElement;}return false;}
  closest(selector){let el=this;while(el){if(el.matches(selector))return el;el=el.parentElement;}return null;}
  matches(selector){if(selector==='button[data-action]')return this.tagName==='BUTTON'&&!!this.dataset.action;
    const match=selector.match(/^\[data-([a-z-]+)\]$/);if(match)return this.attributes['data-'+match[1]]!=null;
    const action=selector.match(/^(?:button)?\[data-action="([a-z-]+)"\]$/);return action&&this.dataset.action===action[1];}
  querySelector(selector){const queue=this.children.slice();while(queue.length){const item=queue.shift();if(item.matches(selector))return item;queue.push(...item.children);}return null;}
  getBoundingClientRect(){return {left:0,top:0,width:1000,height:650};}
  setPointerCapture(){}releasePointerCapture(){}scrollIntoView(){}click(){this.onclick?.();}remove(){}
  getContext(){return {clearRect(){},save(){},restore(){},createLinearGradient(){return {addColorStop(){}};},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){}};}
}

function harness({drawingKey=false,clock=false}={}){
  const ids=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new FakeElement('div',m[1])]));
  const get=id=>ids.get(id),events={};let savedBlob=null;
  get('scaleSel').value='.125';get('newKind').value='ceiling';get('wallPreset').value='.85';get('obstructionShape').value='line';
  get('wallPreset').selectedOptions=[{textContent:'Concrete / steel · High attenuation'}];
  get('poleImportScope').value='page';get('pageSel').value='1';get('placeMultiple').checked=false;
  for(const action of ['copy','paste','duplicate','delete','cancel-wall']){const el=new FakeElement('button');el.dataset.action=action;el.setAttribute('data-action',action);get('wifiContextMenu').append(el);}
  const document={getElementById:get,createElementNS:(_,tag)=>new FakeElement(tag),createElement:tag=>new FakeElement(tag),
    querySelectorAll:selector=>selector==='[data-step]'?['open','place','adjust','walls','review','key','export'].map(step=>{const e=new FakeElement('button');e.dataset.step=step;return e;}):[],
    addEventListener(type,fn){(events[type]||=[]).push(fn);},body:{append(){}}};
  const viewport={width:500,height:500,convertToPdfPoint:(x,y)=>[x,500-y],convertToViewportPoint:(x,y)=>[x,500-y]};
  const pdfPage={rotate:0,getViewport:()=>viewport,render:()=>({promise:Promise.resolve()})};
  const pdf={numPages:2,getPage:async()=>pdfPage};
  const timers=new Map();let nextTimer=1;
  const ctx={window:{addEventListener(){},crypto:undefined,innerWidth:1200,innerHeight:900},document,Element:FakeElement,
    pdfjsLib:{getDocument:()=>({promise:Promise.resolve(pdf)})},Blob,URL:{createObjectURL(blob){savedBlob=blob;return 'blob:local';},revokeObjectURL(){}},
    console,Math,Number,Uint8Array,JSON,Array,Date,Promise,confirm:()=>true,
    setTimeout:(fn,delay)=>{if(!clock)return;const id=nextTimer++;timers.set(id,{fn,delay});return id;},
    clearTimeout:id=>{timers.delete(id);}};
  let keyAdapter=null,keyState={enabled:false,edits:{},positions:{},hiddenPages:{}},keyPdfCalls=[];
  if(drawingKey)ctx.window.AHTDrawingKey={create(adapter){keyAdapter=adapter;return {
    refresh(){},serialize(){return JSON.parse(JSON.stringify(keyState));},
    restore(saved){keyState=saved||{enabled:false};},drawPdf(opts){if(keyState.enabled)keyPdfCalls.push(opts.pageNumber);}
  };}};
  vm.runInNewContext(core,ctx);vm.runInNewContext(ui,ctx);
  const page=async()=>{const f={name:'test.pdf',arrayBuffer:async()=>new ArrayBuffer(100)};
    get('pdfFile').onchange({target:{files:[f],value:''}});
    await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
  const screen=(x,y)=>{const transform=get('stage').style.transform.match(/translate\(([-.\d]+)px,([-.\d]+)px\) scale\(([-.\d]+)\)/);
    const [,tx,ty,zoom]=transform.map(Number);return {clientX:x*zoom+tx,clientY:y*zoom+ty};};
  const mouse=(type,x,y,target=get('overlay'),options={})=>{const e={button:0,pointerId:1,target,...screen(x,y),...options,preventDefault(){},stopPropagation(){}};
    get('viewport').dispatch(type,e);return e;};
  const currentWork=async()=>{get('saveBtn').onclick();return JSON.parse(await savedBlob.text());};
  const fireTimers=duration=>{for(const [id,t] of timers){if(t.delay<=duration){timers.delete(id);t.fn();}}};
  return {get,page,mouse,currentWork,events,window:ctx.window,get keyAdapter(){return keyAdapter;},keyPdfCalls,fireTimers};
}

test('layout is drawing-left and tools-right with full editing controls',()=>{
  assert.match(html,/#sidebar\{grid-column:2;grid-row:1/);
  assert.match(html,/#canvasArea\{grid-column:1;grid-row:1/);
  assert.match(html,/#selectBtn\{grid-column:1 \/ -1/,'Select/Adjust gets a full row above Undo/Redo');
  assert.doesNotMatch(html,/id="wallBtn"/,'no second obstruction button appears in AP placement');
  assert.match(html,/id="obstructionShape"/);
  assert.match(html,/#addWall\.active\{background:#147568/,'active drawing button has a distinct green state');
  for(const id of ['selectBtn','undoBtn','redoBtn','bulkSelectBtn','bulkSelectionCount','selectAllPage','clearSelection','placeMultiple','reshapeBtn','softenShape','wifiContextMenu','cancelWall','clearPoles','obstructionFinishDock','obstructionList','obstructionColor','obstructionOpacity','obstructionVisible','obstructionLabelVisible','obstructionLabelSize','apRadios','apEditBand','apIconScale','apIconScaleValue','applyIconScaleToKind','strongRange','moderateRange','marginalRange','viewRadio'])assert.match(html,new RegExp('id="'+id+'"'));
});

test('bottom-left status notice dismisses automatically and has a close button',()=>{
  const h=harness({clock:true});
  assert.equal(h.get('status').hidden,false);
  h.fireTimers(5500);assert.equal(h.get('status').hidden,true,'ready notice disappears after a few seconds');
  h.get('addWall').onclick();assert.equal(h.get('status').hidden,false,'a new action shows the next notice');
  h.get('dismissStatus').onclick();assert.equal(h.get('status').hidden,true,'close button dismisses immediately');
  assert.match(html,/#status\[hidden\]\{display:none\}/);
});

test('Wi-Fi has a dedicated Drawing Key step before export, using the shared draggable module',()=>{
  assert.match(html,/<button data-step="key"><b>6<\/b>Key<\/button>/);
  assert.match(html,/<button data-step="export"><b>7<\/b>Export<\/button>/);
  assert.match(html,/aht-drawing-key-v1\.js\?v=/);
  assert.match(ui,/sceneId:'overlay'/);
  assert.match(ui,/window\.ahtDrawingKey\?\.refresh\(\)/);
});

test('Wi-Fi key includes only distinct symbols actually visible on the current drawing',async()=>{
  const h=harness({drawingKey:true});await h.page();
  h.get('placeMultiple').checked=true;h.get('placeBtn').onclick();h.mouse('pointerdown',120,120);h.mouse('pointerdown',240,140);
  h.get('selectBtn').onclick();h.get('obstructionShape').value='line';h.get('addWall').onclick();
  h.mouse('pointerdown',80,250);h.mouse('pointermove',240,250);h.mouse('pointerup',240,250);
  const script=fs.readFileSync(path.join(root,'aht-drawing-key-v1.js'),'utf8'),context={window:{}};
  vm.runInNewContext(script,context);
  const entries=context.window.AHTDrawingKey.collectEntries(h.keyAdapter.getMarkers(),1,h.keyAdapter);
  assert.equal(entries.length,2,'two identical APs yield one AP row plus one barrier row');
  assert.equal(entries.find(e=>e.id==='wifi:ap').count,2);
  assert.ok(entries.some(e=>e.id.startsWith('wifi:obstruction:')));
  h.get('showWalls').onchange({target:{checked:false}});
  const hidden=context.window.AHTDrawingKey.collectEntries(h.keyAdapter.getMarkers(),1,h.keyAdapter);
  assert.equal(hidden.length,1,'globally hidden obstructions disappear from the key');
  assert.equal(hidden[0].defaultName,'Wi-Fi Access Point');
});

test('Wi-Fi key settings are preserved through work JSON and invoked on the marked-up PDF',async()=>{
  const h=harness({drawingKey:true});await h.page();h.get('addWall').onclick();
  h.mouse('pointerdown',100,150);h.mouse('pointermove',230,150);h.mouse('pointerup',230,150);
  const keySettings={enabled:true,title:'WIFI DEVICE KEY',scale:1.4,positions:{1:{x:.3,y:.4}},hiddenPages:{},edits:{'wifi:obstruction:line:Concrete / steel:#815f9c':{name:'Wall',description:'High attenuation'}}};
  h.window.ahtDrawingKey.restore(keySettings);
  const saved=await h.currentWork();assert.equal(saved.version,5);
  assert.equal(saved.drawingKey.title,'WIFI DEVICE KEY');
  await h.get('workFile').onchange({target:{files:[{text:async()=>JSON.stringify(saved)}],value:''}});
  assert.equal((await h.currentWork()).drawingKey.scale,1.4);
  const pages=Array.from({length:2},()=>({drawLine(){},drawRectangle(){},drawCircle(){},drawText(){}}));
  h.window.PDFLib={PDFDocument:{load:async()=>({embedFont:async()=>({}),getPages:()=>pages,save:async()=>new Uint8Array([1])})},
    StandardFonts:{HelveticaBold:'bold',Helvetica:'plain'},rgb:(...x)=>x,degrees:n=>n};
  await h.get('pdfBtn').onclick();
  assert.deepEqual(h.keyPdfCalls,[1],'key is exported only on the marked drawing page');
});

test('freeform LINE displays CCTV-style Enter prompt and stays OPEN when Enter finishes it',async()=>{
  const h=harness();await h.page();h.get('obstructionShape').value='polyline';h.get('addWall').onclick();
  assert.match(h.get('addWall').textContent,/DRAWING ACTIVE/);
  for(const p of [[100,110],[170,130],[205,170]]){h.mouse('pointerdown',...p);h.mouse('pointerup',...p);}
  assert.equal(h.get('obstructionFinishDock').hidden,false);
  assert.equal(h.get('obstructionFinishTitle').textContent,'FREEFORM LINE ACTIVE');
  assert.match(h.get('obstructionFinishHint').textContent,/stays OPEN/);
  const event={key:'Enter',target:new FakeElement('div'),preventDefault(){}};
  for(const handler of h.events.keydown)handler(event);
  const saved=await h.currentWork();assert.equal(saved.version,5);
  assert.equal(saved.walls.length,1);assert.equal(saved.walls[0].shape,'polyline');
  assert.equal(saved.walls[0].points.length,3);
  const group=h.get('overlay').children.find(n=>n.getAttribute?.('data-wall'));
  assert.ok(group);assert.ok(!group.children[0].getAttribute('d').trim().endsWith('Z'),'open line is not closed in SVG');
  assert.equal(h.get('obstructionFinishDock').hidden,true);
  assert.match(h.get('addWall').textContent,/Draw obstruction on PDF/,'button returns to inactive blue state');
});

test('freeform AREA visibly closes on Enter, while Escape cancels an unfinished route',async()=>{
  const h=harness();await h.page();h.get('obstructionShape').value='polygon';h.get('addWall').onclick();
  for(const p of [[100,110],[170,110],[190,170]]){h.mouse('pointerdown',...p);h.mouse('pointerup',...p);}
  assert.equal(h.get('obstructionFinishTitle').textContent,'FREEFORM AREA ACTIVE');
  assert.match(h.get('obstructionFinishHint').textContent,/CLOSES to first dot/);
  for(const handler of h.events.keydown)handler({key:'Enter',target:new FakeElement('div'),preventDefault(){}});
  const saved=await h.currentWork();assert.equal(saved.walls[0].shape,'polygon');
  const group=h.get('overlay').children.find(n=>n.getAttribute?.('data-wall'));
  assert.ok(group.children[0].getAttribute('d').trim().endsWith('Z'));
  h.get('obstructionShape').value='polyline';h.get('addWall').onclick();h.mouse('pointerdown',220,220);
  for(const handler of h.events.keydown)handler({key:'Escape',target:new FakeElement('div'),preventDefault(){}});
  assert.equal(h.get('obstructionFinishDock').hidden,true);
  assert.equal((await h.currentWork()).walls.length,1,'cancelled partial route is not saved');
  assert.match(h.get('addWall').textContent,/Draw obstruction on PDF/);
});

test('an existing closed freeform drawing can become an open line without redrawing',async()=>{
  const h=harness();await h.page();h.get('obstructionShape').value='polygon';h.get('addWall').onclick();
  for(const p of [[100,100],[170,110],[190,160],[100,175]]){h.mouse('pointerdown',...p);h.mouse('pointerup',...p);}
  h.get('finishPolygon').onclick();const initial=(await h.currentWork()).walls[0];
  assert.equal(h.get('obstructionClosedModeRow').hidden,false);
  h.get('obstructionClosedMode').onchange({target:{value:'polyline'}});
  const updated=(await h.currentWork()).walls[0];assert.equal(updated.shape,'polyline');
  assert.deepEqual(updated.points,initial.points,'all original points remain in the same places');
  const group=h.get('overlay').children.find(n=>n.getAttribute?.('data-wall'));
  assert.ok(!group.children[0].getAttribute('d').trim().endsWith('Z'));
  h.get('undoBtn').onclick();assert.equal((await h.currentWork()).walls[0].shape,'polygon');
});

test('dragging a wall creates a real line, and Delete/Undo work',async()=>{
  const h=harness();await h.page();h.get('addWall').onclick();
  h.mouse('pointerdown',100,100);h.mouse('pointermove',230,100);h.mouse('pointerup',230,100);
  let work=await h.currentWork();assert.equal(work.walls.length,1);assert.ok(Math.abs(work.walls[0].x-100)<1e-6);assert.ok(Math.abs(work.walls[0].x2-230)<1e-6);
  h.get('deleteWall').onclick();work=await h.currentWork();assert.equal(work.walls.length,0);
  h.get('undoBtn').onclick();work=await h.currentWork();assert.equal(work.walls.length,1);
});

test('two-click wall can be cancelled before finishing',async()=>{
  const h=harness();await h.page();h.get('addWall').onclick();h.mouse('pointerdown',80,80);h.mouse('pointerup',80,80);
  assert.equal(h.get('cancelWall').hidden,false);h.get('cancelWall').onclick();
  assert.equal(h.get('cancelWall').hidden,true);assert.equal((await h.currentWork()).walls.length,0);
});

test('a second click completes the obstruction and makes its end handles available',async()=>{
  const h=harness();await h.page();h.get('addWall').onclick();
  h.mouse('pointerdown',60,80);h.mouse('pointerup',60,80);
  h.mouse('pointerdown',180,135);h.mouse('pointerup',180,135);
  assert.equal((await h.currentWork()).walls.length,1);
  const all=(n)=>[n,...n.children.flatMap(all)];
  assert.equal(all(h.get('overlay')).filter(n=>n.getAttribute?.('data-wall-handle')).length,2);
});

test('rectangle obstruction drags, resizes, moves, deletes and restores with Undo',async()=>{
  const h=harness();await h.page();h.get('obstructionShape').value='rect';h.get('addWall').onclick();
  h.mouse('pointerdown',80,100);h.mouse('pointermove',200,170);h.mouse('pointerup',200,170);
  let w=(await h.currentWork()).walls[0];assert.equal(w.shape,'rect');assert.ok(Math.abs(w.x2-200)<1e-6);
  const corner=h.get('overlay').children.find(n=>n.getAttribute?.('data-wall-handle')==='c2');
  assert.ok(corner,'rectangle has draggable resize corners');
  h.mouse('pointerdown',200,170,corner);h.mouse('pointermove',235,190,corner);h.mouse('pointerup',235,190,corner);
  w=(await h.currentWork()).walls[0];assert.ok(Math.abs(w.x2-235)<1e-6);assert.ok(Math.abs(w.y2-190)<1e-6);
  const group=h.get('overlay').children.find(n=>n.getAttribute?.('data-wall'));
  h.mouse('pointerdown',150,140,group.children[0]);h.mouse('pointermove',170,155,group.children[0]);h.mouse('pointerup',170,155,group.children[0]);
  w=(await h.currentWork()).walls[0];assert.ok(Math.abs(w.x-100)<1e-6);assert.ok(Math.abs(w.y-115)<1e-6);
  h.get('deleteWall').onclick();assert.equal((await h.currentWork()).walls.length,0);
  h.get('undoBtn').onclick();assert.equal((await h.currentWork()).walls.length,1);
});

test('ellipse obstruction creates a rounded pool footprint and can be copied',async()=>{
  const h=harness();await h.page();h.get('obstructionShape').value='ellipse';h.get('addWall').onclick();
  h.mouse('pointerdown',90,90);h.mouse('pointermove',210,190);h.mouse('pointerup',210,190);
  const work=await h.currentWork();assert.equal(work.walls.length,1);assert.equal(work.walls[0].shape,'ellipse');
  const group=h.get('overlay').children.find(n=>n.getAttribute?.('data-wall'));
  assert.equal(group.children[0].getAttribute('d').split(' L ').length,64);
  h.get('copyItem').onclick();h.get('pasteItem').onclick();
  const after=await h.currentWork();assert.equal(after.walls.length,2);assert.equal(after.walls[1].shape,'ellipse');
  assert.ok(Math.abs(after.walls[1].x-(after.walls[0].x+18))<1e-6);
});

test('freeform obstruction polygon supports editable vertices, moving and JSON reload',async()=>{
  const h=harness();await h.page();h.get('obstructionShape').value='polygon';h.get('addWall').onclick();
  for(const p of [[100,110],[160,110],[175,160],[100,170]]){h.mouse('pointerdown',...p);h.mouse('pointerup',...p);}
  assert.equal(h.get('finishPolygon').hidden,false);
  h.get('finishPolygon').onclick();
  let w=(await h.currentWork()).walls[0];assert.equal(w.shape,'polygon');assert.equal(w.points.length,4);
  const handle=h.get('overlay').children.find(n=>n.getAttribute?.('data-wall-handle')==='v1');assert.ok(handle);
  h.mouse('pointerdown',160,110,handle);h.mouse('pointermove',180,120,handle);h.mouse('pointerup',180,120,handle);
  w=(await h.currentWork()).walls[0];assert.ok(Math.abs(w.points[1][0]-180)<1e-6);
  const group=h.get('overlay').children.find(n=>n.getAttribute?.('data-wall'));
  h.mouse('pointerdown',130,140,group.children[0]);h.mouse('pointermove',145,160,group.children[0]);h.mouse('pointerup',145,160,group.children[0]);
  w=(await h.currentWork()).walls[0];assert.ok(Math.abs(w.points[0][0]-115)<1e-6);
  h.get('copyItem').onclick();h.get('pasteItem').onclick();
  const saved=await h.currentWork();assert.equal(saved.walls.length,2);
  assert.ok(Math.abs(saved.walls[1].points[0][0]-133)<1e-6);
  await h.get('workFile').onchange({target:{files:[{text:async()=>JSON.stringify(saved)}],value:''}});
  const reloaded=await h.currentWork();assert.equal(reloaded.walls.length,2);
  assert.equal(reloaded.walls[1].shape,'polygon');assert.equal(reloaded.walls[1].points.length,4);
});

test('obstructions have draggable callout labels, selectable colors and individual visibility controls',async()=>{
  const h=harness();await h.page();h.get('obstructionShape').value='rect';h.get('addWall').onclick();
  h.mouse('pointerdown',100,100);h.mouse('pointermove',220,200);h.mouse('pointerup',220,200);
  h.get('obstructionLabelText').onchange({target:{value:'WATER HEATER'}});
  h.get('obstructionLabelVisible').onchange({target:{checked:true}});
  h.get('obstructionLabelSize').oninput({target:{value:'19'}});
  h.get('obstructionLabelSize').onchange();
  const label=h.get('overlay').children.find(n=>n.getAttribute?.('data-wall-label'));
  assert.ok(label,'attached label appears with draggable box');
  h.mouse('pointerdown',192,126,label.children[0]);h.mouse('pointermove',220,146,label.children[0]);h.mouse('pointerup',220,146,label.children[0]);
  h.get('obstructionColor').onchange({target:{value:'#00aaee'}});
  h.get('obstructionOpacity').oninput({target:{value:'35'}});
  h.get('obstructionOpacity').onchange();
  let work=await h.currentWork(),w=work.walls[0];
  assert.equal(w.labelText,'WATER HEATER');assert.equal(w.showLabel,true);
  assert.equal(w.labelSize,19);assert.equal(h.get('obstructionLabelSizeValue').textContent,19);
  assert.ok(Math.abs(w.labelDx-60)<1e-6);assert.ok(Math.abs(w.labelDy+4)<1e-6);
  assert.equal(w.color,'#00aaee');assert.equal(w.opacity,.35);
  h.get('obstructionVisible').onchange({target:{checked:false}});
  assert.equal((await h.currentWork()).walls[0].show,false);
  assert.ok(h.get('overlay').children.find(n=>n.getAttribute?.('data-wall-label')),'label can remain visible while outline is hidden');
  h.get('obstructionLabelVisible').onchange({target:{checked:false}});
  assert.ok(!h.get('overlay').children.find(n=>n.getAttribute?.('data-wall')),'both may be hidden');
  assert.equal(h.get('obstructionList').children.length,2,'hidden item remains accessible in selector');
  h.get('obstructionList').onchange({target:{value:String(w.id)}});
  assert.equal(h.get('wallFields').hidden,false);
  h.get('obstructionVisible').onchange({target:{checked:true}});
  work=await h.currentWork();assert.equal(work.walls[0].show,true);
  await h.get('workFile').onchange({target:{files:[{text:async()=>JSON.stringify(work)}],value:''}});
  w=(await h.currentWork()).walls[0];assert.equal(w.color,'#00aaee');assert.equal(w.labelText,'WATER HEATER');
  assert.equal(w.labelSize,19,'per-obstruction text size survives work JSON reload');
});

test('red/orange/yellow ranges and 2.4/5 GHz radio modes can be edited independently',async()=>{
  const h=harness();await h.page();h.get('placeBtn').onclick();h.mouse('pointerdown',240,220);
  let ap=(await h.currentWork()).devices[0];
  assert.equal(ap.radioMode,'both');assert.equal(ap.zoneRanges['2.4'].marginal,60);
  assert.equal(ap.zoneRanges['5'].marginal,45);
  h.get('apEditBand').onchange({target:{value:'5'}});
  h.get('strongRange').dispatch('input',{target:{value:'24'}});
  h.get('moderateRange').dispatch('input',{target:{value:'35'}});
  h.get('marginalRange').dispatch('input',{target:{value:'72'}});
  ap=(await h.currentWork()).devices[0];
  assert.deepEqual([ap.zoneRanges['5'].strong,ap.zoneRanges['5'].moderate,ap.zoneRanges['5'].marginal],[24,35,72]);
  assert.deepEqual([ap.zoneRanges['2.4'].strong,ap.zoneRanges['2.4'].moderate,ap.zoneRanges['2.4'].marginal],[25,40,60]);
  h.get('apEditBand').onchange({target:{value:'2.4'}});
  h.get('strongRange').dispatch('input',{target:{value:'200'}});
  ap=(await h.currentWork()).devices[0];
  assert.equal(ap.zoneRanges['2.4'].strong,40,'strong distance cannot exceed orange');
  h.get('apRadios').dispatch('change',{target:{value:'2.4'}});
  assert.equal((await h.currentWork()).devices[0].radioMode,'2.4');
  assert.equal(h.get('apEditBand').disabled,true,'only the enabled radio may be adjusted');
  h.get('viewRadio').onchange({target:{value:'5'}});
  const saved=await h.currentWork();assert.equal(saved.viewRadio,'5');
  await h.get('workFile').onchange({target:{files:[{text:async()=>JSON.stringify(saved)}],value:''}});
  assert.equal(h.get('viewRadio').value,'5');
  assert.equal((await h.currentWork()).devices[0].zoneRanges['5'].marginal,72);
  h.get('undoBtn').onclick();
  assert.equal(h.get('undoBtn').disabled,true,'work reload clears prior undo history');
});

test('older Wi-Fi work JSON restores labels and legacy AP coverage without requiring new fields',async()=>{
  const h=harness();await h.page();h.get('placeBtn').onclick();h.mouse('pointerdown',210,180);
  const old=await h.currentWork();old.version=3;delete old.viewRadio;
  delete old.devices[0].radioMode;delete old.devices[0].editBand;delete old.devices[0].zoneRanges;
  await h.get('workFile').onchange({target:{files:[{text:async()=>JSON.stringify(old)}],value:''}});
  assert.equal(h.get('viewRadio').value,'combined');
  const current=await h.currentWork();assert.equal(current.devices.length,1);
  assert.equal(current.devices[0].rangeFt,60);
  assert.equal(current.version,5);
  h.get('overlay').querySelector('[data-ap]');
});

test('PDF export includes the outlines of rectangle, ellipse and polygon obstructions',async()=>{
  const h=harness();await h.page();
  const drawLines=[],drawRectangles=[],drawTexts=[];const pages=Array.from({length:2},()=>({drawLine:opts=>drawLines.push(opts),drawRectangle:opts=>drawRectangles.push(opts),drawCircle(){},drawText:(s,opts)=>drawTexts.push({s,opts})}));
  h.window.PDFLib={PDFDocument:{load:async()=>({embedFont:async()=>({}),getPages:()=>pages,save:async()=>new Uint8Array([1])})},
    StandardFonts:{HelveticaBold:'test'},rgb:(...v)=>v,degrees:n=>n};
  for(const [shape,a,b] of [['rect',[50,70],[150,170]],['ellipse',[180,70],[300,170]]]){
    h.get('obstructionShape').value=shape;h.get('addWall').onclick();h.mouse('pointerdown',...a);h.mouse('pointermove',...b);h.mouse('pointerup',...b);
  }
  h.get('obstructionShape').value='polygon';h.get('addWall').onclick();
  for(const p of [[340,90],[420,100],[390,170]]){h.mouse('pointerdown',...p);h.mouse('pointerup',...p);}
  h.get('finishPolygon').onclick();
  h.get('obstructionLabelText').onchange({target:{value:'POOL EDGE'}});
  h.get('obstructionLabelVisible').onchange({target:{checked:true}});
  h.get('obstructionLabelSize').oninput({target:{value:'22'}});
  h.get('obstructionLabelSize').onchange();
  h.get('obstructionShape').value='polyline';h.get('addWall').onclick();
  for(const p of [[100,300],[180,310],[190,380]]){h.mouse('pointerdown',...p);h.mouse('pointerup',...p);}
  for(const handler of h.events.keydown)handler({key:'Enter',target:new FakeElement('div'),preventDefault(){}});
  await h.get('pdfBtn').onclick();
  assert.equal(drawLines.length,4+64+3+2+1,'PDF exports open polyline segments and the attached leader line');
  assert.equal(drawRectangles.length,1,'callout box exports');
  assert.ok(drawTexts.some(t=>t.s==='POOL EDGE'),'editable label text exports');
  assert.equal(drawTexts.find(t=>t.s==='POOL EDGE').opts.size,22,'PDF label uses edited text size');
  assert.equal(h.get('pdfBtn').disabled,false);
});

test('AP boundary handle actually changes saved shape, with copy/paste and undo',async()=>{
  const h=harness();await h.page();h.get('placeBtn').onclick();h.mouse('pointerdown',250,250);
  let before=await h.currentWork();assert.equal(before.devices.length,1);
  const findContour=(n)=>{if(n.getAttribute?.('data-boundary-ap'))return n;for(const ch of n.children||[]){const match=findContour(ch);if(match)return match;}return null;};
  const outline=findContour(h.get('overlay'));assert.ok(outline);
  assert.equal(outline.getAttribute('d').split(' L ').length,192,'organic outline uses 192 small segments');
  const findHandle=(n)=>{if(n.getAttribute?.('data-handle')==='0')return n;for(const ch of n.children||[]){const match=findHandle(ch);if(match)return match;}return null;};
  const handle=findHandle(h.get('overlay'));assert.ok(handle,'selected AP has visible boundary handles');
  const x=Number(handle.getAttribute('cx')),y=Number(handle.getAttribute('cy'));
  assert.ok(x>=0&&x<=500&&y>=0&&y<=500,'outline handle stays on the PDF when actual coverage reaches outside');
  h.mouse('pointerdown',x,y,handle);h.mouse('pointermove',x,y-120,handle);h.mouse('pointerup',x,y-120,handle);
  let work=await h.currentWork();assert.notEqual(work.devices[0].radii[0],before.devices[0].radii[0]);
  h.get('copyItem').onclick();h.get('pasteItem').onclick();work=await h.currentWork();assert.equal(work.devices.length,2);
  h.get('undoBtn').onclick();work=await h.currentWork();assert.equal(work.devices.length,1);
});

test('softening a previously sharp coverage outline is undoable',async()=>{
  const h=harness();await h.page();h.get('placeBtn').onclick();h.mouse('pointerdown',250,250);
  const handle=h.get('overlay').children.flatMap(g=>g.children).find(el=>el.getAttribute?.('data-handle')==='0');
  assert.ok(handle);
  const x=Number(handle.getAttribute('cx')),y=Number(handle.getAttribute('cy'));
  h.mouse('pointerdown',x,y,handle);h.mouse('pointermove',x,y-120,handle);h.mouse('pointerup',x,y-120,handle);
  const before=JSON.stringify((await h.currentWork()).devices[0].radii);
  h.get('softenShape').onclick();
  assert.notEqual(JSON.stringify((await h.currentWork()).devices[0].radii),before);
  h.get('undoBtn').onclick();
  assert.equal(JSON.stringify((await h.currentWork()).devices[0].radii),before);
});

test('mismatched CCTV PDF is blocked; matching import excludes unrelated cameras',async()=>{
  const h=harness();await h.page();
  const source={tool:'CCTV',pdfName:'different.pdf',markers:[{type:'pole3',page:1,x:100,y:100,heads:[{kind:'cam',rel:0,tier:1}]},{type:'cam',page:1,x:50,y:50}]};
  const importFile=async obj=>h.get('cctvFile').onchange({target:{files:[{text:async()=>JSON.stringify(obj)}],value:''}});
  await importFile(source);assert.equal((await h.currentWork()).poles.length,0);
  await importFile({...source,pdfName:'test.pdf',pageCount:42});assert.equal((await h.currentWork()).poles.length,0);
  await importFile({...source,pdfName:'test.pdf',pageDimensions:{1:{width:600,height:600}}});assert.equal((await h.currentWork()).poles.length,0);
  await importFile({...source,pdfName:'test.pdf'});const work=await h.currentWork();assert.equal(work.poles.length,1);
  assert.equal(work.poles[0].x,100);assert.equal(work.poles[0].heads.length,1);
  h.get('clearPoles').onclick();assert.equal((await h.currentWork()).poles.length,0);
});

test('right-click menu copies, pastes at position, and deletes the selected item',async()=>{
  const h=harness();await h.page();h.get('placeBtn').onclick();h.mouse('pointerdown',120,120);
  const item=h.get('overlay').children.find(el=>el.getAttribute?.('data-ap'));
  assert.ok(item);
  const menu=h.get('wifiContextMenu');
  const rightClick={target:item,...{clientX:270,clientY:240},preventDefault(){},stopPropagation(){}};
  h.get('viewport').dispatch('contextmenu',rightClick);
  assert.equal(menu.hidden,false);
  menu.dispatch('click',{target:menu.querySelector('[data-action="copy"]')});
  assert.equal(menu.hidden,true);
  h.get('viewport').dispatch('contextmenu',{...rightClick,target:h.get('overlay')});
  menu.dispatch('click',{target:menu.querySelector('[data-action="paste"]')});
  assert.equal((await h.currentWork()).devices.length,2);
  h.get('viewport').dispatch('contextmenu',{...rightClick,target:h.get('overlay')});
  menu.dispatch('click',{target:menu.querySelector('[data-action="delete"]')});
  assert.equal((await h.currentWork()).devices.length,1);
});

test('an imported CCTV pole can be moved, deleted and restored through Undo',async()=>{
  const h=harness();await h.page();
  const source={tool:'CCTV',pdfName:'test.pdf',markers:[{type:'pole3',page:1,x:135,y:145,heads:[{kind:'ptz',rel:35,tier:1}]}]};
  await h.get('cctvFile').onchange({target:{files:[{text:async()=>JSON.stringify(source)}],value:''}});
  const pole=h.get('overlay').children.find(el=>el.getAttribute?.('data-pole'));
  assert.ok(pole);
  h.mouse('pointerdown',135,145,pole);h.mouse('pointermove',185,165,pole);h.mouse('pointerup',185,165,pole);
  let work=await h.currentWork();assert.ok(Math.abs(work.poles[0].x-185)<1e-6);
  h.get('deletePole').onclick();assert.equal((await h.currentWork()).poles.length,0);
  h.get('undoBtn').onclick();work=await h.currentWork();assert.equal(work.poles.length,1);
  assert.ok(Math.abs(work.poles[0].x-185)<1e-6);
});

test('AP icon size is independent of coverage, exports at selected size, and applies by mount type across pages',async()=>{
  const h=harness();await h.page();h.get('placeMultiple').checked=true;h.get('placeBtn').onclick();
  h.mouse('pointerdown',100,100);h.mouse('pointerdown',210,100);
  h.get('newKind').value='wall';h.mouse('pointerdown',320,100);
  h.get('pageSel').onchange({target:{value:'2'}});
  await new Promise(resolve=>setImmediate(resolve));
  h.get('newKind').value='ceiling';h.mouse('pointerdown',125,150);
  h.get('pageSel').onchange({target:{value:'1'}});
  await new Promise(resolve=>setImmediate(resolve));
  h.get('selectBtn').onclick();
  const first=h.get('overlay').children.find(el=>el.getAttribute?.('data-ap')==='1');
  h.mouse('pointerdown',100,100,first);h.mouse('pointerup',100,100,first);
  const coverageBefore=JSON.stringify((await h.currentWork()).devices[0].radii);
  h.get('apIconScale').dispatch('input',{target:{value:'175'}});
  h.get('apIconScale').dispatch('change',{});
  let work=await h.currentWork();assert.equal(work.devices[0].iconScale,1.75);
  assert.equal(work.devices[1].iconScale,1,'other same-type AP unchanged until apply');
  assert.equal(JSON.stringify(work.devices[0].radii),coverageBefore,'coverage shape is not resized');
  h.get('applyIconScaleToKind').onclick();work=await h.currentWork();
  assert.deepEqual(work.devices.map(a=>a.iconScale),[1.75,1.75,1,1.75]);
  assert.equal(h.get('apIconScaleValue').textContent,175);
  const svg=h.get('overlay').children.find(el=>el.getAttribute?.('data-ap')==='2');
  assert.equal(Number(svg.children.find(c=>c.getAttribute?.('fill')==='#eaf6fd').getAttribute('r')),15.75);
  const circles=[];
  h.window.PDFLib={PDFDocument:{load:async()=>({embedFont:async()=>({}),getPages:()=>Array.from({length:2},()=>({drawLine(){},drawRectangle(){},drawCircle:o=>circles.push(o),drawText(){}})),save:async()=>new Uint8Array([1])})},
    StandardFonts:{HelveticaBold:'bold',Helvetica:'plain'},rgb:(...x)=>x,degrees:n=>n};
  h.get('globalHeat').onchange({target:{checked:false}});
  await h.get('pdfBtn').onclick();
  assert.equal(circles.filter(c=>c.size===12.25).length,3,'three ceiling AP outer symbols export at 175%');
  assert.equal(circles.filter(c=>c.size===7).length,1,'wall AP keeps its default symbol size');
  h.get('undoBtn').onclick();assert.deepEqual((await h.currentWork()).devices.map(a=>a.iconScale),[1.75,1,1,1],
    'one undo restores all same-type APs without reverting the original individual edit');
  const saved=await h.currentWork();
  await h.get('workFile').onchange({target:{files:[{text:async()=>JSON.stringify(saved)}],value:''}});
  assert.deepEqual((await h.currentWork()).devices.map(a=>a.iconScale),[1.75,1,1,1],
    'symbol-size choices survive save and reopen');
});

test('bulk select box moves APs, pole and obstruction together; group copy/paste/delete are undoable',async()=>{
  const h=harness();await h.page();h.get('placeMultiple').checked=true;h.get('placeBtn').onclick();
  h.mouse('pointerdown',100,110);h.mouse('pointerdown',210,140);
  h.get('selectBtn').onclick();h.get('obstructionShape').value='line';h.get('addWall').onclick();
  h.mouse('pointerdown',100,300);h.mouse('pointermove',230,300);h.mouse('pointerup',230,300);
  await h.get('cctvFile').onchange({target:{files:[{text:async()=>JSON.stringify({tool:'CCTV',pdfName:'test.pdf',markers:[{type:'pole3',page:1,x:350,y:350,heads:[{kind:'ptz',rel:30,tier:1}]}]})}],value:''}});
  h.get('bulkSelectBtn').onclick();assert.equal(h.get('bulkSelectBtn').getAttribute('aria-pressed'),'true');
  h.mouse('pointerdown',60,65);h.mouse('pointermove',410,405);h.mouse('pointerup',410,405);
  assert.match(h.get('bulkSelectionCount').textContent,/4 items selected/);
  assert.equal(h.get('selectedFields').hidden,true,'individual AP editing is hidden while group selected');
  let before=await h.currentWork();const ap=h.get('overlay').children.find(el=>el.getAttribute?.('data-ap')==='1');
  h.mouse('pointerdown',100,110,ap);h.mouse('pointermove',130,135,ap);h.mouse('pointerup',130,135,ap);
  let work=await h.currentWork();
  assert.deepEqual(work.devices.map(a=>[a.x,a.y]),[[130,135],[240,165]]);
  assert.deepEqual([work.walls[0].x,work.walls[0].x2,work.walls[0].y],[130,260,325]);
  assert.deepEqual([work.poles[0].x,work.poles[0].y],[380,375]);
  assert.match(h.get('bulkSelectionCount').textContent,/4 items selected/,'group stays selected after move');
  h.get('undoBtn').onclick();work=await h.currentWork();
  assert.deepEqual(work.devices.map(a=>[a.x,a.y]),before.devices.map(a=>[a.x,a.y]));
  assert.ok(Math.abs(work.walls[0].x-100)<1e-6);assert.ok(Math.abs(work.poles[0].x-350)<1e-6);
  h.get('selectAllPage').onclick();assert.match(h.get('bulkSelectionCount').textContent,/4 items selected/);
  const menu=h.get('wifiContextMenu'),selectedAp=h.get('overlay').children.find(el=>el.getAttribute?.('data-ap')==='1');
  h.get('viewport').dispatch('contextmenu',{target:selectedAp,clientX:250,clientY:230,preventDefault(){},stopPropagation(){}});
  assert.equal(menu.querySelector('[data-action="copy"]').textContent,'Copy 4 selected',
    'right-click on a member does not collapse the group');
  menu.dispatch('click',{target:menu.querySelector('[data-action="copy"]')});
  h.get('pasteItem').onclick();work=await h.currentWork();
  assert.deepEqual([work.devices.length,work.walls.length,work.poles.length],[4,2,2]);
  assert.ok(Math.abs(work.devices[2].x-118)<1e-6);assert.ok(Math.abs(work.walls[1].x2-248)<1e-6);
  assert.ok(Math.abs(work.poles[1].y-368)<1e-6);
  assert.match(h.get('bulkSelectionCount').textContent,/4 items selected/,'pasted items become the new group');
  h.get('undoBtn').onclick();work=await h.currentWork();
  assert.deepEqual([work.devices.length,work.walls.length,work.poles.length],[2,1,1],
    'single undo removes all four pasted items');
  h.get('selectAllPage').onclick();
  h.get('viewport').dispatch('contextmenu',{target:h.get('overlay'),clientX:340,clientY:280,preventDefault(){},stopPropagation(){}});
  assert.equal(menu.querySelector('[data-action="delete"]').textContent,'Delete 4 selected');
  menu.dispatch('click',{target:menu.querySelector('[data-action="delete"]')});
  work=await h.currentWork();assert.equal(work.devices.length+work.walls.length+work.poles.length,0);
  h.get('undoBtn').onclick();work=await h.currentWork();assert.equal(work.devices.length+work.walls.length+work.poles.length,4);
});

test('Shift-click toggles group membership without entering bulk mode and supports group nudging',async()=>{
  const h=harness();await h.page();h.get('placeMultiple').checked=true;h.get('placeBtn').onclick();
  h.mouse('pointerdown',100,100);h.mouse('pointerdown',220,110);h.get('selectBtn').onclick();
  const aps=()=>h.get('overlay').children.filter(el=>el.getAttribute?.('data-ap'));
  const first=aps()[0];
  h.mouse('pointerdown',100,100,first,{shiftKey:true});
  assert.match(h.get('bulkSelectionCount').textContent,/2 items selected/);
  for(const keydown of h.events.keydown)keydown({key:'ArrowRight',target:new FakeElement('div'),preventDefault(){}});
  assert.ok((await h.currentWork()).devices.every((a,i)=>Math.abs(a.x-[101,221][i])<1e-6));
  h.mouse('pointerdown',100,100,aps()[0],{shiftKey:true});
  assert.match(h.get('bulkSelectionCount').textContent,/1 item selected/);
  h.get('clearSelection').onclick();assert.equal(h.get('bulkSelectionCount').textContent,'No items selected');
});
