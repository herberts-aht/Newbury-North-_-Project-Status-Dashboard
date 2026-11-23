/* Shared selection enhancements run in six established AHT drawing editors. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const dir=path.join(__dirname,'..');
const details=fs.readFileSync(path.join(dir,'aht-drawing-details-v1.js'),'utf8');
const pages=[
  'AHT_pir_tool_flow_v9_9.html',
  'AHT_cctv_workflow_pilot_v3.html',
  'AHT_access_workflow_pilot_v3.html',
  'AHT_device_locations_pilot_v1.html',
  'AHT_shades_tool_pilot_v3.html',
  'AHT_speakers_workflow_pilot_v5.html'
];

test('all six established drawing tools load bulk box selection and retain native marquee rendering',()=>{
  for(const filename of pages){const html=fs.readFileSync(path.join(dir,filename),'utf8');
    assert.match(html,/aht-drawing-details-v1\.js\?v=20261123-box1/,filename);
    assert.match(html,/mode\s*:\s*'marq'/,`${filename} native marquee remains available`);
    assert.match(html,/drag\.mode === 'marq'/,`${filename} renders native selection box`);
    assert.match(html,/sel = new Set\(pageMarkers\(\)\.filter/,`${filename} finishes native box selection`);
    assert.match(html,/id: 'marq'/,`${filename} contains SVG box layer`);
  }
  assert.match(details,/Select another icon, or/,'the individual-picking Done popup remains in place');
  assert.match(details,/Bulk Select \/ Box/,'the mode button explains both selection methods');
});

function pointerHarness(){
  const start=details.indexOf('  let bulkDragCandidate=null,bulkBoxCandidate=null;');
  const end=details.indexOf('  // Prevent default drawing navigation keys',start);
  assert.ok(start>0&&end>start,'extract the installed shared viewport capture handlers');
  const handlers={},updates=[];
  class FakeElement{constructor(id){this.id=id;this.attributes={};}
    closest(){return this.id?{getAttribute:()=>String(this.id)}:null;}}
  const sandbox={
    Element:FakeElement,bulkMode:true,spaceDown:false,calMode:null,
    markers:[{id:1,page:1,x:40,y:50},{id:2,page:1,x:150,y:140},{id:3,page:1,x:300,y:300}],
    sel:new Set(),pageNum:1,vp:{width:500,height:500},drag:null,guidedStage:null,
    surface:{contains:()=>true},viewport:{addEventListener(type,fn){(handlers[type]||=[]).push(fn);},setPointerCapture(){}},
    toView:event=>[event.x,event.y],saveNotice:'',rememberPointer(event){sandbox.pickedAt=[event.x,event.y];},
    refresh(){updates.push('refresh');},sync(){updates.push(`sync:${sandbox.sel.size}`);},
    requestAnimationFrame(fn){updates.push(fn);}
  };
  vm.runInNewContext(details.slice(start,end),sandbox,{filename:'aht-drawing-details-selection-handlers.js'});
  const event=(x,y,id=null)=>({button:0,pointerId:7,target:new FakeElement(id),x,y,
    ctrlKey:false,metaKey:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}});
  const fire=(type,e)=>{for(const cb of handlers[type]||[])cb(e);};
  const flush=()=>{for(const callback of updates.splice(0)){if(typeof callback==='function')callback();}};
  return {sandbox,updates,event,fire,flush};
}

test('ordinary drag over blank plan in Bulk Select starts the native box with pointer capture',()=>{
  const h=pointerHarness(),e=h.event(20,30);
  h.fire('pointerdown',e);
  assert.equal(e.prevented,true);assert.equal(e.stopped,true);
  assert.equal(h.sandbox.drag.mode,'marq');
  assert.deepEqual([...h.sandbox.drag.start],[20,30]);
  // Native editor pointermove/pointerup logic consumes this existing mode.
  h.sandbox.drag.cur=[200,180];
  h.fire('pointerup',h.event(200,180));
  h.sandbox.sel=new Set([1,2]);h.sandbox.drag=null;
  h.flush();
  assert.ok(h.updates.includes('sync:2'),'floating count refreshes after native box completion');
  assert.deepEqual(h.sandbox.pickedAt,[200,180],'Done popup is positioned by the ending pointer');
});

test('individual picking still adds a distant icon and does not start a marquee',()=>{
  const h=pointerHarness();h.fire('pointerdown',h.event(40,50,1));
  assert.deepEqual([...h.sandbox.sel],[1]);assert.equal(h.sandbox.drag,null);
  h.fire('pointerdown',h.event(300,300,3));
  assert.deepEqual([...h.sandbox.sel],[1,3]);assert.equal(h.sandbox.drag,null);
  assert.equal(h.updates.filter(x=>x==='refresh').length,2);
});

test('Space-pan, calibration, modifier gestures and out-of-sheet clicks are not turned into boxes',()=>{
  const h=pointerHarness();
  for(const change of [{spaceDown:true},{spaceDown:false,calMode:{p1:null}},{calMode:null}]){
    Object.assign(h.sandbox,change);
    const e=h.event(35,40);if(change.calMode===null)e.ctrlKey=true;
    h.fire('pointerdown',e);
    assert.equal(h.sandbox.drag,null);
    assert.equal(e.stopped,undefined,'native tool gesture is allowed through');
  }
  h.fire('pointerdown',h.event(-20,40));
  assert.equal(h.sandbox.drag,null,'outside the PDF cannot initiate a box');
});
