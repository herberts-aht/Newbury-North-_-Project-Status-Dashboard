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

test('rectangle, pool ellipse and irregular polygon attenuate rays through their footprints',()=>{
  const p=ap();
  const rect={shape:'rect',x:250,y:150,x2:350,y2:250,attenuation:.8};
  const ellipse={shape:'ellipse',x:270,y:160,x2:330,y2:240,attenuation:.7};
  const polygon={shape:'polygon',points:[[250,180],[330,200],[250,220]],attenuation:.6};
  assert.equal(C.obstructionOutline(rect).length,4);
  assert.equal(C.obstructionOutline(ellipse).length,64);
  assert.equal(C.obstructionOutline(polygon).length,3);
  const expected=(distance,attenuation)=>distance+(180-distance)*(1-attenuation);
  assert.ok(Math.abs(C.effectiveRadius(p,Math.PI/2,3,[rect])-expected(50,.8))<1e-6);
  assert.ok(Math.abs(C.effectiveRadius(p,Math.PI/2,3,[ellipse])-expected(70,.7))<1e-6);
  assert.ok(Math.abs(C.effectiveRadius(p,Math.PI/2,3,[polygon])-expected(50,.6))<1e-6);
  assert.ok(Math.abs(C.effectiveRadius(p,0,3,[rect])-180)<1e-6);
  assert.ok(Math.abs(C.effectiveRadius(p,0,3,[ellipse])-180)<1e-6);
  assert.ok(Math.abs(C.effectiveRadius(p,0,3,[polygon])-180)<1e-6);
});

test('freeform OPEN line never adds an invisible closing segment',()=>{
  const p=ap(),points=[[250,180],[330,200],[250,220]];
  const open={shape:'polyline',points,attenuation:.6},closed={shape:'polygon',points,attenuation:.6};
  assert.equal(C.obstructionOutline(open).length,3);
  const east=C.angle(6),expected=distance=>distance+(180-distance)*.4;
  assert.ok(Math.abs(C.effectiveRadius(p,east,3,[open])-expected(130))<1e-6);
  assert.ok(Math.abs(C.effectiveRadius(p,east,3,[closed])-expected(50))<1e-6);
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

test('organic coverage boundary is smooth, closed and passes through all 24 editable handles',()=>{
  const p=ap();
  C.updateHandle(p,0,200,-100,3);
  const boundary=C.smoothBoundary(p,3,[],8);
  assert.equal(boundary.length,192);
  for(let i=0;i<C.COUNT;i++){
    const fromHandle=C.pointAt(p,C.angle(i),3),fromContour=boundary[i*8];
    assert.ok(Math.hypot(fromHandle[0]-fromContour[0],fromHandle[1]-fromContour[1])<1e-6);
  }
  // A single pulled-out handle produces a gradual lobe, not 24 hard facets.
  assert.ok(boundary[4][1]<boundary[8][1]);
  const atHandle=boundary[0],before=boundary.at(-1),after=boundary[1];
  const tangentBefore=Math.atan2(atHandle[1]-before[1],atHandle[0]-before[0]);
  const tangentAfter=Math.atan2(after[1]-atHandle[1],after[0]-atHandle[0]);
  assert.ok(Math.abs(Math.atan2(Math.sin(tangentBefore-tangentAfter),Math.cos(tangentBefore-tangentAfter)))<.3);
  assert.ok(p.radii[1]>1&&p.radii[2]>1,'adjacent handles gently follow the dragged handle');
  assert.equal(p.radii[6],1,'distant handles remain independent');
});

test('an old sharply edited contour can be softened without deleting its custom shape',()=>{
  const p=ap();p.radii[0]=2.5;
  C.softenShape(p);
  assert.ok(p.radii[0]>1&&p.radii[0]<2.5);
  assert.ok(p.radii[1]>1&&p.radii[23]>1);
  assert.equal(p.radii[8],1);
});

test('smoothed wall-limited boundary never overshoots neighboring control distances',()=>{
  const p=ap(),wall={x:150,y:170,x2:250,y2:170,attenuation:.85};
  const points=C.smoothBoundary(p,3,[wall]);
  const center=[p.x,p.y];
  for(let i=0;i<C.COUNT;i++){
    const a=C.effectiveRadius(p,C.angle(i),3,[wall]);
    const b=C.effectiveRadius(p,C.angle(i+1),3,[wall]);
    for(let step=0;step<8;step++){
      const point=points[i*8+step],r=Math.hypot(point[0]-center[0],point[1]-center[1]);
      assert.ok(r>=Math.min(a,b)-1e-7&&r<=Math.max(a,b)+1e-7);
      assert.ok(Math.abs(r-C.smoothEffectiveRadius(p,C.angle(i+step/8),3,[wall]))<1e-6);
    }
  }
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

test('radio-specific red, orange, yellow reaches remain independent and ordered',()=>{
  const p=ap();p.radioMode='both';p.zoneRanges={
    '2.4':{strong:15,moderate:35,marginal:90},
    '5':{strong:7,moderate:18,marginal:40}
  };
  const range24=C.zoneRanges(p,'2.4'),range5=C.zoneRanges(p,'5');
  assert.equal(range24.strong,15);assert.equal(range24.moderate,35);assert.equal(range24.marginal,90);
  assert.equal(range5.strong,7);assert.equal(range5.moderate,18);assert.equal(range5.marginal,40);
  assert.equal(C.outerReach(p,'combined'),90);
  assert.equal(C.outerReach(p,'5'),40);
  const c24=C.coverageContours(p,3,[],'2.4'),c5=C.coverageContours(p,3,[],'5');
  assert.equal(Math.hypot(c24.strong[0][0]-p.x,c24.strong[0][1]-p.y),45);
  assert.equal(Math.hypot(c24.marginal[0][0]-p.x,c24.marginal[0][1]-p.y),270);
  assert.equal(Math.hypot(c5.marginal[0][0]-p.x,c5.marginal[0][1]-p.y),120);
  assert.equal(c24.marginal.length,192);
  p.radioMode='5';assert.equal(C.outerReach(p,'combined'),40);
  assert.equal(C.coverageContours(p,3,[],'2.4').marginal.length,0,'disabled radio does not paint');
});

test('combined frequency heat map is the longest reach in each color, even when 5 GHz is stronger',()=>{
  const p=ap();p.radioMode='both';p.zoneRanges={
    '2.4':{strong:12,moderate:26,marginal:65},
    '5':{strong:20,moderate:42,marginal:50}
  };
  const combined=C.coverageContours(p,2,[],'combined');
  for(const [zone,ft] of [['strong',20],['moderate',42],['marginal',65]]){
    assert.ok(Math.abs(Math.hypot(combined[zone][0][0]-p.x,combined[zone][0][1]-p.y)-ft*2)<1e-8);
  }
  const wall={shape:'line',x:150,y:170,x2:250,y2:170,attenuation:.8};
  const withWall=C.coverageContours(p,2,[wall],'combined');
  assert.ok(Math.hypot(...withWall.marginal[0].map((v,i)=>v-[p.x,p.y][i]))<130);
});

test('older APs without radio fields get backward-compatible range defaults',()=>{
  const p=ap();delete p.zoneRanges;delete p.radioMode;
  assert.deepEqual(Object.values(C.zoneRanges(p,'2.4')).join(','),'25,40,60');
  assert.deepEqual(Object.values(C.zoneRanges(p,'5')).join(','),'18,30,45');
  assert.equal(C.outerReach(p),60);
  assert.equal(C.coverageContours(p,3).marginal.length,192);
});
