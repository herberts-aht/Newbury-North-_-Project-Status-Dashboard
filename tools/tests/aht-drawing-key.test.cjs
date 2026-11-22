const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'aht-drawing-key-v1.js'), 'utf8');
const window = {};
vm.runInNewContext(script, {window});
const {collectEntries, wrap} = window.AHTDrawingKey;
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

test('drag pointerdown reaches the key without a capturing overlay interceptor', () => {
  assert.match(script, /main\.addEventListener\('pointerdown'/);
  assert.doesNotMatch(script, /getElementById\('ov'\)\.addEventListener\('pointerdown'/);
});
