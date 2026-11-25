const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'aht-drawing-key-v1.js'), 'utf8');
const window = {};
vm.runInNewContext(script, {window});
const {collectEntries, wrap, inside} = window.AHTDrawingKey;
const adapter = {
  isDevice:m=>!['area','arrow_note'].includes(m.type),
  isVisible:m=>!m.hidden,
  deviceFor:m=>({key:m.type,label:m.type,color:'#164d7d'}),
  variantKey:m=>m.variant||m.type,
  labelFor:m=>m.variant||m.type
};

test('43 identical access control symbols yield ONE key entry, not 43 rows', () => {
  const markers = Array.from({length:43}, (_,i)=>({type:'basic_access',id:i+1,page:i%2+1}));
  const first = collectEntries(markers,1,adapter);
  const second = collectEntries(markers,2,adapter);
  assert.equal(first.length,1);
  assert.equal(second.length,1);
  assert.equal(first[0].count,22);
  assert.equal(second[0].count,21);
});

test('only placed, visible, real symbols on the current drawing appear', () => {
  const markers=[
    {type:'basic_access',page:1},{type:'basic_access',page:1},
    {type:'reader',page:2},{type:'camera',page:1,hidden:true},
    {type:'arrow_note',page:1},{type:'area',page:1}
  ];
  const rows=collectEntries(markers,1,adapter);
  assert.deepEqual(Array.from(rows,r=>r.id),['basic_access']);
  assert.equal(rows[0].count,2);
});

test('different actual icon variants receive separate rows but duplicate variants do not', () => {
  const rows=collectEntries([
    {type:'tv',variant:'TV - Installed',page:1},
    {type:'tv',variant:'TV - Installed',page:1},
    {type:'tv',variant:'TV - Rough-in',page:1}
  ],1,adapter);
  assert.equal(rows.length,2);
  assert.deepEqual(Array.from(rows,r=>r.count),[2,1]);
});

test('descriptions wrap to fit rather than creating extra key entries', () => {
  const rows=wrap('Access control device at the indicated opening or location',24,3);
  assert.ok(rows.length>=2 && rows.length<=3);
  assert.ok(rows.every(r=>r.length<=24));
});

test('viewport hit-test prioritizes key dragging over placement crosshairs', () => {
  const key={x:294,y:32,w:310,h:86};
  assert.equal(inside(300,70,key),true);
  assert.equal(inside(290,70,key),false);
  assert.match(script, /getElementById\('viewport'\)\.addEventListener\('pointerdown'/);
  assert.match(script, /\{capture:true\}/);
  assert.match(script, /startBoxX\+dx/);
  assert.doesNotMatch(script, /getElementById\('ov'\)\.addEventListener\('pointerdown'/);
});


test('TV legend defaults to a compact footprint without the displaced callout', () => {
  const input = { key:'tv', kind:'point', style:'avRectangle', deviceWidth:6.5, deviceHeight:.6,
    direction:90, tvLabelVisible:true, tvLabelDx:900, tvLabelDy:-300, markerId:44, color:'#164d7d' };
  const legend = window.AHTDrawingKey.keyIcon({dev:input,iconEdit:{}},100,80,18);
  assert.equal(legend.mode,'compact');
  assert.equal(legend.dev.tvLabelVisible,false);
  assert.equal(legend.dev.markerId,undefined);
  assert.equal(legend.dev.deviceWidth,1.45);
  assert.equal(legend.dev.direction,0);
  assert.equal(input.tvLabelVisible,true);
  assert.equal(input.deviceWidth,6.5);
});

test('per-entry legend appearance overrides are limited and independently normalized', () => {
  const d={key:'tv',kind:'point',style:'avRectangle',deviceWidth:5.5,color:'#164d7d'};
  const entry={dev:d,iconEdit:{iconMode:'original',iconScale:1.3,iconColor:'#112233',iconDx:20,iconDy:-10}};
  const result=window.AHTDrawingKey.keyIcon(entry,30,40,20);
  assert.equal(result.color,'#112233');
  assert.equal(result.dev.color,'#112233');
  assert.equal(result.dev.tvLabelVisible,false);
  assert.ok(result.d<20);
  assert.equal(result.x,34);
  assert.equal(result.y,38);
  assert.equal(d.color,'#164d7d');
});

test('legend icon edits use existing JSON edit storage and a shared PDF rendering path', () => {
  assert.match(script,/state\.edits\[e\.id\]=\{\.\.\.\(state\.edits\[e\.id\]\|\|\{\}\),\.\.\.edit\}/);
  assert.match(script,/iconPdf\(e,ix,iy,g\.fs\*1\.28,opts\)/);
  assert.match(script,/state\.edits=s\.edits&&typeof s\.edits==='object'\?s\.edits:\{\}/);
});
