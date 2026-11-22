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

function harness(){
  const ids=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new FakeElement('div',m[1])]));
  const get=id=>ids.get(id),events={};let savedBlob=null;
  get('scaleSel').value='.125';get('newKind').value='ceiling';get('wallPreset').value='.85';
  get('wallPreset').selectedOptions=[{textContent:'Concrete / steel · High attenuation'}];
  get('poleImportScope').value='page';get('pageSel').value='1';get('placeMultiple').checked=false;
  for(const action of ['copy','paste','duplicate','delete','cancel-wall']){const el=new FakeElement('button');el.dataset.action=action;el.setAttribute('data-action',action);get('wifiContextMenu').append(el);}
  const document={getElementById:get,createElementNS:(_,tag)=>new FakeElement(tag),createElement:tag=>new FakeElement(tag),
    querySelectorAll:selector=>selector==='[data-step]'?['open','place','adjust','walls','review','export'].map(step=>{const e=new FakeElement('button');e.dataset.step=step;return e;}):[],
    addEventListener(type,fn){(events[type]||=[]).push(fn);},body:{append(){}}};
  const viewport={width:500,height:500,convertToPdfPoint:(x,y)=>[x,500-y],convertToViewportPoint:(x,y)=>[x,500-y]};
  const pdfPage={rotate:0,getViewport:()=>viewport,render:()=>({promise:Promise.resolve()})};
  const pdf={numPages:2,getPage:async()=>pdfPage};
  const ctx={window:{addEventListener(){},crypto:undefined,innerWidth:1200,innerHeight:900},document,Element:FakeElement,
    pdfjsLib:{getDocument:()=>({promise:Promise.resolve(pdf)})},Blob,URL:{createObjectURL(blob){savedBlob=blob;return 'blob:local';},revokeObjectURL(){}},
    console,Math,Number,Uint8Array,JSON,Array,Date,Promise,confirm:()=>true,setTimeout:()=>{},clearTimeout:()=>{}};
  vm.runInNewContext(core,ctx);vm.runInNewContext(ui,ctx);
  const page=async()=>{const f={name:'test.pdf',arrayBuffer:async()=>new ArrayBuffer(100)};
    get('pdfFile').onchange({target:{files:[f],value:''}});
    await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
  const screen=(x,y)=>{const transform=get('stage').style.transform.match(/translate\(([-.\d]+)px,([-.\d]+)px\) scale\(([-.\d]+)\)/);
    const [,tx,ty,zoom]=transform.map(Number);return {clientX:x*zoom+tx,clientY:y*zoom+ty};};
  const mouse=(type,x,y,target=get('overlay'))=>{const e={button:0,pointerId:1,target,...screen(x,y),preventDefault(){},stopPropagation(){}};
    get('viewport').dispatch(type,e);return e;};
  const currentWork=async()=>{get('saveBtn').onclick();return JSON.parse(await savedBlob.text());};
  return {get,page,mouse,currentWork,events};
}

test('layout is drawing-left and tools-right with full editing controls',()=>{
  assert.match(html,/#sidebar\{grid-column:2;grid-row:1/);
  assert.match(html,/#canvasArea\{grid-column:1;grid-row:1/);
  for(const id of ['selectBtn','undoBtn','redoBtn','placeMultiple','reshapeBtn','wifiContextMenu','cancelWall','clearPoles'])assert.match(html,new RegExp('id="'+id+'"'));
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

test('AP boundary handle actually changes saved shape, with copy/paste and undo',async()=>{
  const h=harness();await h.page();h.get('placeBtn').onclick();h.mouse('pointerdown',250,250);
  let before=await h.currentWork();assert.equal(before.devices.length,1);
  const findHandle=(n)=>{if(n.getAttribute?.('data-handle')==='0')return n;for(const ch of n.children||[]){const match=findHandle(ch);if(match)return match;}return null;};
  const handle=findHandle(h.get('overlay'));assert.ok(handle,'selected AP has visible boundary handles');
  const x=Number(handle.getAttribute('cx')),y=Number(handle.getAttribute('cy'));
  assert.ok(x>=0&&x<=500&&y>=0&&y<=500,'outline handle stays on the PDF when actual coverage reaches outside');
  h.mouse('pointerdown',x,y,handle);h.mouse('pointermove',x,y-120,handle);h.mouse('pointerup',x,y-120,handle);
  let work=await h.currentWork();assert.notEqual(work.devices[0].radii[0],before.devices[0].radii[0]);
  h.get('copyItem').onclick();h.get('pasteItem').onclick();work=await h.currentWork();assert.equal(work.devices.length,2);
  h.get('undoBtn').onclick();work=await h.currentWork();assert.equal(work.devices.length,1);
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
