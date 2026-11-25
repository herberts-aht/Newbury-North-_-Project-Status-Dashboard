/* AHT Drawing Key v1 — shared by the five plan markup tools.
   A unique legend row represents a distinct symbol present on the CURRENT sheet,
   never every item in the palette or every instance of that symbol. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const safe = s => String(s == null ? '' : s).replace(/[\u2010-\u2015]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\x20-\x7e]/g, '?');
  const node = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, String(v)));
    if (parent) parent.appendChild(n);
    return n;
  };
  const inside = (x,y,g) => x>=g.x && x<=g.x+g.w && y>=g.y && y<=g.y+g.h;
  const svgText = (parent, value, x, y, fontSize, color, weight) => {
    const n = node('text', { x, y, 'font-size': fontSize, fill: color, 'font-weight': weight || 400,
      'font-family': 'Arial,Helvetica,sans-serif', 'pointer-events': 'none' }, parent);
    n.textContent = value;
    return n;
  };
  function wrap(value, maxChars, maxLines) {
    const lines = [];
    String(value || '').split(/\n/).forEach(paragraph => {
      let line = '';
      paragraph.split(/\s+/).filter(Boolean).forEach(original => {
        let word = original;
        while (word.length > maxChars) {
          if (line) { lines.push(line); line = ''; }
          lines.push(word.slice(0,maxChars));word=word.slice(maxChars);
        }
        if ((line + ' ' + word).trim().length > maxChars && line) { lines.push(line); line = word; }
        else line = (line + ' ' + word).trim();
      });
      if (line) lines.push(line);
    });
    if (!lines.length) lines.push('');
    if (lines.length > maxLines) {
      const clipped = lines.slice(0, maxLines);
      clipped[maxLines - 1] = clipped[maxLines - 1].slice(0, Math.max(1, maxChars - 3)) + '...';
      return clipped;
    }
    return lines;
  }
  function defaultDefinition(tool, entry) {
    const name = (entry.defaultName || '').toLowerCase();
    if (/rough.in|prewire|pre-wire/.test(name)) return 'Future equipment rough-in; final display is not included.';
    if (/future/.test(name)) return 'Reserved for a possible future installation.';
    if (/monitor/.test(name)) return /desktop|tabletop/.test(name) ?
      'Computer or surveillance monitor on a desktop or tabletop stand.' :
      'Computer or surveillance monitor, wall-mounted; coordinate backing, mounting and cabling.';
    if (/cctv|camera/.test(tool)) return 'Proposed security device location; coverage is illustrative.';
    if (/access/.test(tool)) return 'Access control device at the indicated opening or location.';
    if (/shade/.test(tool)) return 'Shade system component; confirm mounting and control requirements.';
    if (/speaker|audio/.test(tool)) return 'Proposed audio device; verify final placement and coverage.';
    if (/wi.?fi/.test(tool)) {
      if (/pole/.test(name)) return 'Shared CCTV pole location; camera viewing cones are hidden.';
      if (/obstruction|barrier|pool|glass|concrete|wall/.test(name)) return 'Obstruction affecting estimated Wi-Fi coverage.';
      return 'Proposed Wi-Fi access point; adjust 2.4 and 5 GHz coverage separately.';
    }
    return 'Proposed device location; confirm final mounting and connections.';
  }
  function collectEntries(markers, p, adapter) {
    const map = new Map();
    (markers || []).forEach(m => {
      if ((Number(m.page) || 1) !== p || !adapter.isDevice(m) || !adapter.isVisible(m)) return;
      const dev = adapter.deviceFor(m);
      if (!dev) return;
      const id = String(adapter.variantKey(m));
      if (!map.has(id)) map.set(id, { id, marker:m, dev, defaultName:String(adapter.labelFor(m)), count:0 });
      map.get(id).count++;
    });
    return Array.from(map.values()).sort((a,b)=>a.defaultName.localeCompare(b.defaultName));
  }

  // Independent key-only icon settings: do not modify the placed marker.
  const iconModes=['auto','original','compact','tv','square','circle','line','hide'];
  const validHex=s=>/^#[0-9a-f]{6}$/i.test(String(s||''));
  function keyIconSettings(e){
    const o=e.iconEdit||{};
    return {mode:iconModes.includes(o.iconMode)?o.iconMode:'auto',
      scale:clamp(Number(o.iconScale)||1,.5,1.3),
      color:validHex(o.iconColor)?o.iconColor:(validHex(e.dev.color)?e.dev.color:'#17649a'),
      dx:clamp(Number(o.iconDx)||0,-25,25)/100,
      dy:clamp(Number(o.iconDy)||0,-25,25)/100};
  }
  function keyIcon(e,x,y,size){
    const o=keyIconSettings(e),dev={...e.dev,color:o.color,textColor:o.color,markerId:undefined};
    // Discard TV callouts in the legend, not on the actual drawing.
    if(dev.style==='avRectangle'||dev.style==='avMonitor')dev.tvLabelVisible=false;
    const wide=['avRectangle','avMonitor','avScreen','avProjector','soundbarSymbol'].includes(dev.style);
    const mode=o.mode==='auto'?(wide?'compact':'original'):o.mode;
    if(mode==='compact'){
      if(['avRectangle','avMonitor','avScreen','avProjector'].includes(dev.style)){
        dev.deviceWidth=dev.style==='avMonitor'?1.6:1.45;
        dev.deviceHeight=dev.style==='avMonitor'?.8:.42;
        dev.direction=0;
      }else if(dev.style==='soundbarSymbol'){dev.barLength=1.65;dev.barThickness=.42;dev.direction=0;}
    }
    let d=size*o.scale;
    if(mode==='original'&&wide){
      const w=Number(dev.style==='soundbarSymbol'?dev.barLength:dev.deviceWidth)||3;
      d=Math.min(d,size*1.6/Math.max(1,w));
    }
    return {mode,dev,d,x:x+size*o.dx,y:y+size*o.dy,color:o.color};
  }
  function create(adapter) {
    const state = { enabled: false, scale: 1, title: 'DEVICE KEY', positions: {}, hiddenPages: {}, edits: {} };
    const rootSvgId=adapter.rootSvgId||'ov',sceneId=adapter.sceneId||'annotationScene';
    const parent = document.getElementById('exportSection');
    if (!parent || !document.getElementById(rootSvgId)) throw new Error('AHT drawing key: editor sections not found');
    const exportStepNumber = parent.querySelector('.step-heading .step-number');
    if (exportStepNumber) exportStepNumber.textContent = '7';
    const section = document.createElement('section');
    section.id = 'drawingKeySection'; section.className = 'workflow-step aht-drawing-key-step';
    section.innerHTML = '<div class="step-heading"><span class="step-number">6</span><h2>Drawing Key</h2></div>' +
      '<p class="muted helper">Only unique icons actually placed on this PDF page appear in its key. A symbol used 30 times still gets just one row.</p>' +
      '<label class="aht-key-check"><input type="checkbox" id="ahtKeyEnabled"> Show key on marked-up PDF</label>' +
      '<label class="aht-key-check"><input type="checkbox" id="ahtKeyPageEnabled" checked> Show on this page</label>' +
      '<label class="lbl" for="ahtKeyTitle">Key heading</label><input id="ahtKeyTitle" type="text" value="DEVICE KEY" maxlength="80">' +
      '<label class="lbl" for="ahtKeyScale">Size <output id="ahtKeyScaleLabel">100%</output></label>' +
      '<input id="ahtKeyScale" type="range" min="65" max="200" step="5" value="100">' +
      '<p class="muted helper">Drag the key directly on the drawing to position it. X/Y is available below only for fine adjustments.</p>' +
      '<details class="aht-key-advanced"><summary>Fine-position with X/Y (optional)</summary>' +
      '<div class="aht-key-position"><label>X (%)<input id="ahtKeyX" type="number" min="0" max="100" step="1" value="70"></label>' +
      '<label>Y (%)<input id="ahtKeyY" type="number" min="0" max="100" step="1" value="4"></label></div></details>' +
      '<button type="button" id="ahtKeyReset">Reset position for this page</button>' +
      '<p class="muted helper">Size, location and visibility are saved with your work JSON.</p>' +
      '<h3 class="aht-key-subheading">Icons on this page</h3><p class="muted helper">Customize icons in the key without changing drawing symbols.</p><div id="ahtKeyRows"></div>';
    const style = document.createElement('style');
    style.textContent = '.aht-drawing-key-step{border-top:1px solid #c6dce9;margin-top:8px;padding-top:10px}' +
      '.aht-drawing-key-step .aht-key-check{display:flex;align-items:center;gap:8px;margin:10px 0;font-size:12px}' +
      '.aht-drawing-key-step input[type=text],.aht-drawing-key-step input[type=number]{width:100%;box-sizing:border-box;padding:7px;border:1px solid #adc9dc;border-radius:5px}' +
      '.aht-drawing-key-step input[type=range]{width:100%;accent-color:#17649a}' +
      '.aht-key-advanced{margin:9px 0}.aht-key-advanced summary{font-size:11px;color:#24577d;cursor:pointer}' +
      '.aht-key-position{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}' +
      '.aht-key-position label{font-size:11px;color:#314e67}.aht-key-position input{margin-top:4px}' +
      '.aht-key-subheading{font-size:13px;color:#123b5f;margin:16px 0 8px}' +
      '.aht-key-edit{border:1px solid #d2e1ec;border-radius:6px;background:#f7fafc;margin:7px 0;padding:9px}' +
      '.aht-key-edit-head{display:flex;gap:8px;align-items:center;margin-bottom:7px;font-size:11px;color:#506778}' +
      '.aht-key-edit-head svg{width:31px;height:31px;flex:none}' +
      '.aht-key-edit input,.aht-key-edit textarea{width:100%;box-sizing:border-box;font-size:12px;padding:6px;border:1px solid #b6cede;border-radius:4px;background:#fff}' +
      '.aht-key-edit textarea{min-height:51px;resize:vertical;margin-top:6px}' +
      '.aht-key-empty{font-size:12px;color:#60768a;margin:8px 0}' +
      '.aht-key-symbol{margin-top:8px;border-top:1px solid #d7e5ef;padding-top:8px}' +
      '.aht-key-symbol summary{cursor:pointer;font-size:12px;font-weight:600;color:#24577d}' +
      '.aht-key-symbol label{display:block;font-size:11px;color:#425b70;margin:7px 0}' +
      '.aht-key-symbol select,.aht-key-symbol input[type=range],.aht-key-symbol input[type=color]{display:block;width:100%;margin-top:3px}' +
      '.aht-key-symbol select{padding:5px;border:1px solid #b6cede;border-radius:4px;background:#fff}' +
      '.aht-key-symbol input[type=color]{height:30px}';
    document.head.appendChild(style);
    const existingBlock = document.getElementById('ahtStepKey');
    const exportBlock = document.getElementById('ahtStepexport');
    if (existingBlock) existingBlock.append(section);
    else if (exportBlock) {
      const block = document.createElement('section');
      block.id = 'ahtStepKey'; block.className = 'aht-step-block'; block.dataset.ahtStep = 'key';
      exportBlock.before(block); block.append(section);
    } else parent.before(section);
    const $ = id => document.getElementById(id);
    const currPage = () => Number(adapter.getPage()) || 1;
    const currView = () => adapter.getViewport();
    const position = p => state.positions[p] || { x: .70, y: .04 };
    const entriesForPage = p => collectEntries(adapter.getMarkers(),p,adapter);
    function formatEntry(e) {
      const edit = state.edits[e.id] || {};
      return { ...e, name: edit.name == null ? e.defaultName : edit.name,
        description: edit.description == null ? defaultDefinition(adapter.toolName, e) : edit.description, iconEdit:edit };
    }
    function layout(pageViewport, p) {
      const entries = entriesForPage(p).map(formatEntry);
      if (!entries.length || !pageViewport) return null;
      const fs = clamp(Math.max(pageViewport.width, pageViewport.height) / 160, 10, 31) * state.scale;
      const w = Math.min(pageViewport.width * .52, fs * 31);
      const chars = Math.max(12, Math.floor((w - fs * 4.5) / (fs * .50)));
      const rows = entries.map(e => ({ ...e, nameLines: wrap(e.name, chars, 2),
        detailLines: wrap(e.description, chars, 3) }));
      const head = fs * 2.45;
      let cursor = head;
      rows.forEach(r => { r.top = cursor; r.height = fs * (r.nameLines.length * 1.12 + r.detailLines.length * .96 + 1.12); cursor += r.height; });
      const h = cursor + fs * .65;
      const pos = position(p);
      const x = clamp(pos.x * pageViewport.width, 4, Math.max(4, pageViewport.width - w - 4));
      const y = clamp(pos.y * pageViewport.height, 4, Math.max(4, pageViewport.height - h - 4));
      return { entries: rows, fs, w, h, x, y };
    }
    // Legend-only icon geometry is identical in the on-screen SVG and exported PDF.
    function iconSvg(e,x,y,size,to){
      const v=keyIcon(e,x,y,size),{mode,dev,d,color}=v;
      if(mode==='hide')return;
      if(mode==='line'||(['original','compact'].includes(mode)&&['line','route'].includes(dev.kind))){
        node('line',{x1:v.x-d*.65,y1:v.y,x2:v.x+d*.65,y2:v.y,stroke:color,'stroke-width':d*.24,'stroke-linecap':'round'},to);
      }else if(mode==='circle'){
        node('circle',{cx:v.x,cy:v.y,r:d*.58,fill:'#fff',stroke:color,'stroke-width':Math.max(.6,d*.11)},to);
      }else if(mode==='tv'||mode==='square'){
        node('rect',{x:v.x-d*.68,y:v.y-d*.38,width:d*1.36,height:d*.76,rx:mode==='tv'?d*.06:0,
          fill:mode==='tv'?'#e7f0fa':'#ffffff',stroke:color,'stroke-width':Math.max(.6,d*.1)},to);
        if(mode==='tv')svgText(to,'TV',v.x-d*.3,v.y+d*.16,d*.4,color,700);
      }else if(dev.kind==='relocate')svgText(to,'MOVE',v.x-d*.5,v.y+d*.2,d*.34,color,700);
      else adapter.drawSvgIcon(dev,v.x,v.y,d,to);
    }
    function iconPdf(e,x,y,size,opt){
      const v=keyIcon(e,x,y,size),{mode,dev,d,color}=v;
      if(mode==='hide')return;
      const {polygon,text,rgb,conv,page,drawIconPdf,hexRgb,PDFLib}=opt,c=hexRgb(color,PDFLib);
      if(mode==='line'||(['original','compact'].includes(mode)&&['line','route'].includes(dev.kind))){
        const a=conv(v.x-d*.65,v.y),b=conv(v.x+d*.65,v.y);
        page.drawLine({start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]},thickness:d*.24,color:c});
      }else if(mode==='circle'){
        polygon(Array.from({length:32},(_,i)=>[v.x+Math.cos(i*Math.PI/16)*d*.58,
          v.y+Math.sin(i*Math.PI/16)*d*.58]),rgb(1,1,1),1,c,1,Math.max(.6,d*.11));
      }else if(mode==='tv'||mode==='square'){
        polygon([[v.x-d*.68,v.y-d*.38],[v.x+d*.68,v.y-d*.38],[v.x+d*.68,v.y+d*.38],[v.x-d*.68,v.y+d*.38]],
          mode==='tv'?rgb(.91,.95,.98):rgb(1,1,1),1,c,1,Math.max(.6,d*.1));
        if(mode==='tv')text('TV',v.x-d*.3,v.y+d*.16,d*.4,c,false);
      }else if(dev.kind==='relocate')text('MOVE',v.x-d*.5,v.y+d*.2,d*.34,c,false);
      else drawIconPdf(dev,v.x,v.y,d,polygon,text,hexRgb,PDFLib);
    }
    function paintSvg() {
      const scene = document.getElementById(sceneId);
      if (!scene) return;
      scene.querySelectorAll('[data-aht-drawing-key]').forEach(n => n.remove());
      const p = currPage(), vp = currView();
      if (!state.enabled || state.hiddenPages[p] || !vp) return;
      const g = layout(vp, p); if (!g) return;
      const main = node('g', { 'data-aht-drawing-key':'', transform:`translate(${g.x} ${g.y})`,
        style:'cursor:grab;touch-action:none;user-select:none' }, scene);
      node('title', {}, main).textContent = 'Drag the device key to move it';
      node('rect', { width:g.w, height:g.h, rx:g.fs*.25, fill:'#ffffff', 'fill-opacity':.96,
        stroke:'#1d5887','stroke-width':Math.max(.8,g.fs*.07) }, main);
      node('rect', { width:g.w, height:g.fs*2.22, rx:g.fs*.25, fill:'#e8f2f9' }, main);
      svgText(main, state.title, g.fs*.72, g.fs*1.53, g.fs*1.13, '#143a5d', 800);
      // Visual grip is editor-only, not part of the exported PDF.
      for (let i=0;i<3;i++) node('line',{x1:g.w-g.fs*(1.55+i*.28),x2:g.w-g.fs*(1.55+i*.28),
        y1:g.fs*.75,y2:g.fs*1.53,stroke:'#4d7998','stroke-width':g.fs*.09,'stroke-linecap':'round'},main);
      g.entries.forEach(e => {
        const ix=g.fs*1.6, iy=e.top+g.fs*1.26;
        iconSvg(e,ix,iy,g.fs*1.28,main);
        const tx=g.fs*3.35; let lineY=e.top+g.fs*1.06;
        e.nameLines.forEach(t => { svgText(main,t,tx,lineY,g.fs*.87,'#173b58',700);lineY+=g.fs*1.12; });
        e.detailLines.forEach(t => { svgText(main,t,tx,lineY,g.fs*.75,'#425b70',400);lineY+=g.fs*.96; });
        node('line',{x1:g.fs*.65,x2:g.w-g.fs*.65,y1:e.top+e.height-.12*g.fs,y2:e.top+e.height-.12*g.fs,
          stroke:'#dce8f0','stroke-width':.6},main);
      });
      main.addEventListener('click', ev => ev.stopPropagation());
      main.addEventListener('dblclick', ev => ev.stopPropagation());
    }
    function startDrag(ev,scene,main,g,p,vp) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      main.style.cursor='grabbing';
      const startX=ev.clientX,startY=ev.clientY;
      // Use the actual CLAMPED box coordinates, not the original requested
      // percentage (which may lie beyond the sheet edge and create a dead zone).
      const startBoxX=g.x,startBoxY=g.y;
      const matrix=scene.getScreenCTM();
      const factor=matrix?Math.max(.0001,Math.hypot(matrix.a,matrix.b)):1;
      const move=e=>{
        e.preventDefault();
        const dx=(e.clientX-startX)/factor,dy=(e.clientY-startY)/factor;
        state.positions[p]={x:clamp((startBoxX+dx)/vp.width,0,1),y:clamp((startBoxY+dy)/vp.height,0,1)};
        const loc=layout(vp,p);
        if(loc)main.setAttribute('transform',`translate(${loc.x} ${loc.y})`);
        syncPosition();
      };
      const end=()=>{
        main.style.cursor='grab';
        window.removeEventListener('pointermove',move);
        window.removeEventListener('pointerup',end);
        window.removeEventListener('pointercancel',end);
      };
      window.addEventListener('pointermove',move);
      window.addEventListener('pointerup',end);
      window.addEventListener('pointercancel',end);
    }
    function syncPosition() {
      const pos=position(currPage());
      $('ahtKeyX').value=Math.round(pos.x*100); $('ahtKeyY').value=Math.round(pos.y*100);
    }
    let lastSignature = '';
    function updateRows() {
      const p=currPage(), rows=entriesForPage(p);
      const signature=p+'|'+rows.map(r=>r.id+'='+r.count+':'+r.defaultName).join('|');
      if (lastSignature===signature) return;
      lastSignature=signature;
      const parent=$('ahtKeyRows'); parent.replaceChildren();
      if(!rows.length){const empty=document.createElement('p');empty.className='aht-key-empty';empty.textContent='No placed devices on this page yet. Place a device to add it automatically.';parent.append(empty);}
      rows.forEach(e=>{
        const card=document.createElement('div');card.className='aht-key-edit';
        const heading=document.createElement('div');heading.className='aht-key-edit-head';
        const sample=node('svg',{viewBox:'-24 -24 48 48'},heading);
        const summary=document.createElement('span');summary.textContent=e.defaultName+' · '+e.count+' placed';heading.append(summary);
        const name=document.createElement('input');name.type='text';name.maxLength=110;name.setAttribute('aria-label','Key name for '+e.defaultName);
        const description=document.createElement('textarea');description.maxLength=500;description.rows=2;description.setAttribute('aria-label','Brief key description for '+e.defaultName);
        const formatted=formatEntry(e);name.value=formatted.name;description.value=formatted.description;
        const preview=()=>{sample.replaceChildren();iconSvg(formatEntry(e),0,0,22,sample);};
        const change=edit=>{state.edits[e.id]={...(state.edits[e.id]||{}),...edit};preview();paintSvg();};
        name.addEventListener('input',()=>change({name:name.value}));
        description.addEventListener('input',()=>change({description:description.value}));
        const controls=document.createElement('details');controls.className='aht-key-symbol';
        const head=document.createElement('summary');head.textContent='Customize icon in key';controls.append(head);
        const field=(caption,input)=>{const label=document.createElement('label');label.append(document.createTextNode(caption),input);controls.append(label);return label;};
        const mode=document.createElement('select');
        [['auto','Auto - fit to key'],['original','Original icon (fitted)'],['compact','Compact icon'],
          ['tv','Simple TV screen'],['square','Square'],['circle','Circle'],['line','Line'],['hide','Hide icon']]
          .forEach(([v,t])=>{const opt=document.createElement('option');opt.value=v;opt.textContent=t;mode.append(opt);});
        field('Icon appearance',mode);
        const scale=document.createElement('input');scale.type='range';scale.min='50';scale.max='130';scale.step='5';
        const scaleLabel=field('Icon size',scale);
        const color=document.createElement('input');color.type='color';field('Icon color',color);
        const dx=document.createElement('input');dx.type='range';dx.min='-25';dx.max='25';dx.step='5';field('Move icon horizontally',dx);
        const dy=document.createElement('input');dy.type='range';dy.min='-25';dy.max='25';dy.step='5';field('Move icon vertically',dy);
        const reset=document.createElement('button');reset.type='button';reset.textContent='Reset icon';controls.append(reset);
        const sync=()=>{const v=keyIconSettings(formatEntry(e));mode.value=v.mode;scale.value=Math.round(v.scale*100);
          scaleLabel.firstChild.textContent='Icon size: '+Math.round(v.scale*100)+'%';
          color.value=v.color;dx.value=Math.round(v.dx*100);dy.value=Math.round(v.dy*100);};
        mode.addEventListener('change',()=>change({iconMode:mode.value}));
        scale.addEventListener('input',()=>{scaleLabel.firstChild.textContent='Icon size: '+scale.value+'%';change({iconScale:Number(scale.value)/100});});
        color.addEventListener('input',()=>change({iconColor:color.value}));
        dx.addEventListener('input',()=>change({iconDx:Number(dx.value)}));
        dy.addEventListener('input',()=>change({iconDy:Number(dy.value)}));
        reset.addEventListener('click',()=>{const o={...(state.edits[e.id]||{})};
          ['iconMode','iconScale','iconColor','iconDx','iconDy'].forEach(k=>delete o[k]);
          state.edits[e.id]=o;sync();preview();paintSvg();});
        sync();preview();card.append(heading,name,description,controls);parent.append(card);
      });
    }
    function refresh() {
      $('ahtKeyPageEnabled').checked=!state.hiddenPages[currPage()];
      syncPosition();updateRows();paintSvg();
    }
    $('ahtKeyEnabled').addEventListener('change',e=>{state.enabled=e.target.checked;refresh();});
    $('ahtKeyPageEnabled').addEventListener('change',e=>{state.hiddenPages[currPage()]=!e.target.checked;refresh();});
    $('ahtKeyTitle').addEventListener('input',e=>{state.title=e.target.value;paintSvg();});
    $('ahtKeyScale').addEventListener('input',e=>{state.scale=clamp(Number(e.target.value)/100,.65,2);
      $('ahtKeyScaleLabel').textContent=Math.round(state.scale*100)+'%';paintSvg();});
    const setPosition=()=>{state.positions[currPage()]={x:clamp(Number($('ahtKeyX').value)/100,0,1),
      y:clamp(Number($('ahtKeyY').value)/100,0,1)};paintSvg();};
    $('ahtKeyX').addEventListener('input',setPosition);$('ahtKeyY').addEventListener('input',setPosition);
    $('ahtKeyReset').addEventListener('click',()=>{delete state.positions[currPage()];refresh();});
    // The key takes priority over the viewport's placement/pan interaction,
    // even if the surrounding PDF is showing a placement crosshair. Capture
    // at #viewport and hit-test the drawn box in SVG/PDF-point coordinates;
    // this also works when a transparent SVG child fails native hit-testing.
    document.getElementById('viewport').addEventListener('pointerdown',ev=>{
      if(ev.button!==0||!state.enabled||state.hiddenPages[currPage()])return;
      const scene=document.getElementById(sceneId);
      const main=scene?.querySelector('[data-aht-drawing-key]');
      const vp=currView(),p=currPage();
      if(!scene||!main||!vp)return;
      const g=layout(vp,p),matrix=scene.getScreenCTM();
      if(!g||!matrix)return;
      const point=document.getElementById(rootSvgId).createSVGPoint();
      point.x=ev.clientX;point.y=ev.clientY;
      const local=point.matrixTransform(matrix.inverse());
      if(inside(local.x,local.y,g))startDrag(ev,scene,main,g,p,vp);
    },{capture:true});
    if (!adapter.sceneId) {
      const observer = new MutationObserver(mutations=>{
        if(mutations.some(m=>Array.from(m.addedNodes).some(n=>n.nodeType===1&&n.id==='annotationScene')))refresh();
      });
      observer.observe(document.getElementById(rootSvgId),{childList:true});
    }
    function drawPdf(opts) {
      if (!state.enabled || state.hiddenPages[opts.pageNumber]) return;
      const g=layout(opts.viewport,opts.pageNumber);if(!g)return;
      const {polygon,text,rgb,conv,page,drawIconPdf,hexRgb,PDFLib} = opts;
      const P=coords=>coords.map(([x,y])=>[x+g.x,y+g.y]);
      polygon(P([[0,0],[g.w,0],[g.w,g.h],[0,g.h]]),rgb(1,1,1),.96,rgb(.11,.35,.53),1,Math.max(.8,g.fs*.07));
      polygon(P([[0,0],[g.w,0],[g.w,g.fs*2.22],[0,g.fs*2.22]]),rgb(.91,.95,.98),1,null,0,0);
      text(safe(state.title),g.x+g.fs*.72,g.y+g.fs*1.53,g.fs*1.13,rgb(.08,.23,.36),false);
      g.entries.forEach(e=>{
        const ix=g.x+g.fs*1.6,iy=g.y+e.top+g.fs*1.26;
        iconPdf(e,ix,iy,g.fs*1.28,opts);
        const xx=g.x+g.fs*3.35;let yy=g.y+e.top+g.fs*1.06;
        e.nameLines.forEach(t=>{text(safe(t),xx,yy,g.fs*.87,rgb(.09,.23,.35),false);yy+=g.fs*1.12;});
        e.detailLines.forEach(t=>{text(safe(t),xx,yy,g.fs*.75,rgb(.26,.36,.44),false);yy+=g.fs*.96;});
      });
    }
    function serialize() { return JSON.parse(JSON.stringify(state)); }
    function restore(raw, legacyOn) {
      const s=raw&&typeof raw==='object'?raw:{};
      state.enabled = typeof s.enabled==='boolean'?s.enabled:legacyOn===true;
      state.scale=clamp(Number(s.scale)||1,.65,2);
      state.title=typeof s.title==='string'?s.title:'DEVICE KEY';
      state.positions=s.positions&&typeof s.positions==='object'?s.positions:{};
      state.hiddenPages=s.hiddenPages&&typeof s.hiddenPages==='object'?s.hiddenPages:{};
      state.edits=s.edits&&typeof s.edits==='object'?s.edits:{};
      $('ahtKeyEnabled').checked=state.enabled;$('ahtKeyTitle').value=state.title;
      $('ahtKeyScale').value=Math.round(state.scale*100);
      $('ahtKeyScaleLabel').textContent=Math.round(state.scale*100)+'%';
      lastSignature='';refresh();
    }
    refresh();
    return {refresh,serialize,restore,drawPdf,entriesForPage};
  }
  root.AHTDrawingKey={create,wrap,defaultDefinition,collectEntries,inside,keyIconSettings,keyIcon};
})(window);
