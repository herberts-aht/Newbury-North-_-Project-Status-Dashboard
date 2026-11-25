const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'AHT_device_locations_pilot_v1.html'), 'utf8');
const keyScript = fs.readFileSync(path.join(__dirname, '..', 'aht-drawing-key-v1.js'), 'utf8');
const appScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(Boolean);
const app = appScripts.find(text => text.includes('function actualDev(dev, m)'));
assert.ok(app, 'main device locations JavaScript should exist');
function extract(name) {
  const marker = 'function ' + name + '(';
  const start = app.indexOf(marker);
  assert.ok(start >= 0, 'missing ' + name);
  const lineEnd = app.indexOf('\n', start);
  const firstLine = app.slice(start, lineEnd);
  if (firstLine.includes('}')) return firstLine;
  const end = app.indexOf('\n}', start);
  assert.ok(end > start, 'missing end of ' + name);
  return app.slice(start, end + 2);
}
const modelSource = `
  const DEV = {
    tv:{key:'tv',style:'avRectangle',label:'TV / Display',color:'#304f94'},
    monitor:{key:'monitor',style:'avMonitor',label:'Computer / Surveillance Monitor',color:'#137d98'}
  };
  const TV_STATUS_LABELS={confirmed:'Confirmed TV',future:'Future TV',prewire:'Prewire only'};
  const MONITOR_STATUS_LABELS={confirmed:'Confirmed Monitor',future:'Future Monitor',prewire:'Prewire only'};
  const MONITOR_DEFAULT_COLORS={confirmed:'#137d98',future:'#8872b4',prewire:'#849aa5'};
  const tvTypeColors={confirmed:'#304f94',future:'#8963b5',prewire:'#8995a4'};
  const validTvColor=value=>/^#[0-9a-f]{6}$/i.test(String(value||''));
  const isAVDevice=d=>!!d&&['tv','monitor'].includes(d.key);
  const isDisplayDevice=d=>!!d&&['tv','monitor'].includes(d.key);
  const displayDefaultName=m=>m?.type==='monitor'?'MONITOR':'TV';
  const isSpeaker=()=>false;
  const isSoundbar=()=>false;
  const isLandscape=()=>false;
  const mountLabel=m=>m.mount||'wall';
  const polyFor=()=>[];
  const tvLabelGeometry=()=>{throw Error('Key icon should suppress movable callout');};
  const wScreen=()=>0;
  const isSoundbarDevice=()=>false;
  ${['tvStatusOf','tvColorOf','tvLabelMain','tvLabelSub','tvLabelScaleOf','mountOf','speakerLabel','actualDev','iconParts'].map(extract).join('\n')}
  this.monitorModel={mountOf,speakerLabel,actualDev,iconParts};
`;
const model = vm.runInNewContext(modelSource, {});
const {mountOf,speakerLabel,actualDev,iconParts} = model.monitorModel;
const keyRoot={};vm.runInNewContext(keyScript,{window:keyRoot});

test('inline device location JavaScript remains parseable',()=>{
  for(const src of appScripts)assert.doesNotThrow(()=>new Function(src));
});
test('desktop and wall mounted monitors have separate key variants',()=>{
  const desk={type:'monitor',mount:'table',tvStatus:'confirmed'};
  const wall={type:'monitor',mount:'wall',tvStatus:'confirmed'};
  assert.equal(mountOf(desk),'table');
  assert.equal(mountOf(wall),'wall');
  assert.match(speakerLabel(desk),/Monitor — Desktop \/ tabletop — Confirmed/);
  assert.match(speakerLabel(wall),/Monitor — Wall-mounted — Confirmed/);
  assert.notEqual(speakerLabel(desk),speakerLabel(wall));
  assert.match(speakerLabel({...desk,tvStatus:'prewire'}),/Rough-in only/);
});
test('monitor display label, dimensions and color remain independent from TV',()=>{
  const desk={type:'monitor',mount:'table',tvStatus:'confirmed'};
  const dev=actualDev({key:'monitor',style:'avMonitor',color:'#137d98',fill:'#effaff'},desk);
  assert.equal(dev.tvLabelText,'MONITOR');
  assert.equal(dev.tvLabelVisible,true);
  assert.equal(dev.deviceWidth,2.4);
  assert.equal(dev.deviceHeight,1.1);
  assert.equal(dev.color,'#137d98');
  assert.equal(actualDev({key:'monitor',style:'avMonitor',color:'#137d98'},{...desk,tvStatus:'future'}).color,'#8872b4');
  assert.equal(actualDev({key:'tv',style:'avRectangle',color:'#304f94'}, {type:'tv',mount:'wall'}).color,'#304f94');
});
test('screen and PDF share distinctive desk-stand and wall-bracket geometry',()=>{
  const d={type:'monitor',mount:'table'};
  const base={key:'monitor',style:'avMonitor',color:'#137d98',fill:'#effaff'};
  const desk=iconParts({...actualDev(base,d),tvLabelVisible:false},100,100,10);
  const wall=iconParts({...actualDev(base,{type:'monitor',mount:'wall'}),tvLabelVisible:false},100,100,10);
  assert.ok(desk.polys.length>=5);
  assert.ok(wall.polys.length>=5);
  assert.notDeepEqual(JSON.parse(JSON.stringify(desk.polys)),JSON.parse(JSON.stringify(wall.polys)));
  assert.match(app,/const P = iconParts\(dev, cx, cy, d\);/);
});
test('legend suppresses movable monitor callouts without changing placed marker',()=>{
  const input={key:'monitor',style:'avMonitor',kind:'point',mount:'table',tvLabelVisible:true,
    tvLabelText:'MONITOR',markerId:7,deviceWidth:2.4,color:'#137d98'};
  const legend=keyRoot.AHTDrawingKey.keyIcon({dev:input,iconEdit:{}},100,100,18);
  assert.equal(legend.mode,'compact');
  assert.equal(legend.dev.tvLabelVisible,false);
  assert.equal(legend.dev.markerId,undefined);
  assert.equal(legend.dev.mount,'table');
  assert.equal(input.tvLabelVisible,true);
  assert.equal(input.markerId,7);
});
test('conversion selects only TVs and preserves work-file identity',()=>{
  assert.match(app,/filter\(m=>m\?\.type==='tv'\)/);
  assert.match(app,/selected\.forEach\(m=>\{m\.type='monitor';m\.mount=mount;/);
  assert.match(app,/pushUndo\(\);\s*selected\.forEach/);
  assert.match(app,/const okM = m => DEV\[m\.type\]/);
  assert.match(html,/id="monitorConvertSelected"/);
  assert.match(html,/id="monitorConvertMount"/);
});

test('wall-mounted monitors have no pedestal and use the same screen footprint',()=>{
  const base={key:'monitor',style:'avMonitor',color:'#137d98',fill:'#effaff'};
  const table=iconParts({...actualDev(base,{type:'monitor',mount:'table'}),tvLabelVisible:false},100,100,10);
  const wall=iconParts({...actualDev(base,{type:'monitor',mount:'wall'}),tvLabelVisible:false},100,100,10);
  assert.equal(table.polys.length,wall.polys.length+2);
  assert.deepEqual(JSON.parse(JSON.stringify(table.polys.slice(0,2))),JSON.parse(JSON.stringify(wall.polys.slice(0,2))));
});
test('TV and monitor labels drag by the same handle and text cannot intercept the pointer',()=>{
  assert.match(app,/m\\?\\.type==='tv'\\|\\|m\\?\\.type==='monitor'/);
  assert.match(app,/h==='tv-label'/);
  assert.match(app,/color:dev\\.color,noHit:true/);
  assert.match(app,/t\\.noHit\\?\\{style:'pointer-events:none'\\}/);
  assert.match(html,/id="displayLabelDragGuide"/);
  assert.match(html,/id="displayLabelSizeGuide"/);
});
