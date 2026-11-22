/* Run: node --test tools/tests/aht-wifi-coverage.test.cjs */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../aht-wifi-coverage-core-v1.js'),'utf8'),context);
const C=context.window.AHTWifiCore;
const ap=(kind='ceiling')=>({x:200,y:200,rot:0,rangeFt:60,kind,radii:C.shapeFor(kind)});

test('omni AP reaches equally in all directions',()=>{
  const p=ap();
  for(let i=0;i<C.COUNT;i++)assert.ok(Math.abs(C.radiusAt(p,C.angle(i),3)-180)<1e-8);
});

test('directional profiles attenuate backwards and rotate with AP',()=>{
  for(const kind of ['wall','pole-directional']){
    const p=ap(kind);
    assert.ok(C.radiusAt(p,0,3)>C.radiusAt(p,Math.PI,3)*5);
    p.rot=90;
    assert.ok(C.radiusAt(p,Math.PI/2,3)>C.radiusAt(p,3*Math.PI/2,3)*5);
  }
});

test('obstruction reduces coverage only where the ray intersects the wall',()=>{
  const p=ap();
  const wall={x:150,y:170,x2:250,y2:170,attenuation:.8};
  const north=C.effectiveRadius(p,0,3,[wall]);
  const south=C.effectiveRadius(p,Math.PI,3,[wall]);
  assert.ok(Math.abs(north-(30+(180-30)*.2))<1e-7);
  assert.ok(Math.abs(south-180)<1e-7);
});

test('dragged outer boundary handle moves independently',()=>{
  const p=ap();
  C.updateHandle(p,0,200,-70,3);
  assert.ok(Math.abs(C.effectiveRadius(p,0,3)-270)<1e-6);
  assert.ok(Math.abs(C.effectiveRadius(p,Math.PI/2,3)-180)<1e-6);
});

test('boundary handle targets visible distance with a partial wall',()=>{
  const p=ap();
  const wall={x:150,y:170,x2:250,y2:170,attenuation:.5};
  C.updateHandle(p,0,200,95,3,[wall]);
  assert.ok(Math.abs(C.effectiveRadius(p,0,3,[wall])-105)<1e-6);
});

test('CCTV imports poles and heads at original coordinates only',()=>{
  const source={tool:'CCTV',pdfName:'same.pdf',markers:[
    {type:'pole3',x:22.5,y:190.25,page:2,rot:270,size:1.5,heads:[{kind:'ptz',rel:45,tier:2}]},
    {type:'cam',x:7,y:8,page:3}
  ]};
  const imported=C.importCctvPoles(source,'same.pdf');
  assert.equal(imported.samePdf,true);
  assert.equal(imported.poles.length,1);
  assert.equal(imported.poles[0].x,22.5);
  assert.equal(imported.poles[0].y,190.25);
  assert.equal(imported.poles[0].page,2);
  assert.equal(imported.poles[0].rot,270);
  assert.equal(imported.poles[0].heads[0].kind,'ptz');
  const heads=C.poleHeads(imported.poles[0]);
  assert.equal(heads.length,1);
  assert.ok(Number.isFinite(heads[0].x));
});

test('mismatched or missing PDF filenames cannot be treated as a verified match',()=>{
  const source={tool:'CCTV',pdfName:'one.pdf',markers:[{type:'pole3',x:9,y:9}]};
  assert.equal(C.importCctvPoles(source,'two.pdf').samePdf,false);
  assert.equal(C.importCctvPoles({...source,pdfName:''},'two.pdf').samePdf,false);
  assert.equal(C.importCctvPoles(source,'').samePdf,false);
  assert.equal(C.importCctvPoles(source,'C:\\Plans\\ONE.PDF').samePdf,true);
});
