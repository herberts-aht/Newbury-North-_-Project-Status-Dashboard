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
    if (/cctv|camera/.test(tool)) return 'Proposed security device location; coverage is illustrative.';
    if (/access/.test(tool)) return 'Access control device at the indicated opening or location.';
    if (/shade/.test(tool)) return 'Shade system component; confirm mounting and control requirements.';
    if (/speaker|audio/.test(tool)) return 'Proposed audio device; verify final placement and coverage.';
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
  function create(adapter) {
    const state = { enabled: false, scale: 1, title: 'DEVICE KEY', positions: {}, hiddenPages: {}, edits: {} };
    const parent = document.getElementById('exportSection');
    if (!parent || !document.getElementById('ov')) throw new Error('AHT drawing key: editor sections not found');
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
      '<h3 class="aht-key-subheading">Icons on this page</h3><div id="ahtKeyRows"></div>';
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
      '.aht-key-empty{font-size:12px;color:#60768a;margin:8px 0}';
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
        description: edit.description == null ? defaultDefinition(adapter.toolName, e) : edit.description };
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
    function iconSvg(e, x, y, size, to) {
      if (e.dev.kind === 'line' || e.dev.kind === 'route') {
        node('line', { x1: x-size*.55, y1:y, x2:x+size*.55, y2:y, stroke:e.dev.color || '#17649a',
          'stroke-width': size*.25, 'stroke-linecap':'round' }, to);
      } else if (e.dev.kind === 'relocate') svgText(to, 'MOVE', x-size*.5, y+size*.2, size*.34, e.dev.color || '#17649a', 700);
      else adapter.drawSvgIcon(e.dev, x, y, size, to);
    }
    function paintSvg() {
      const scene = document.getElementById('annotationScene');
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
        const ix=g.fs*1.68, iy=e.top+g.fs*1.26;
        iconSvg(e,ix,iy,g.fs*1.28,main);
        const tx=g.fs*3.2; let lineY=e.top+g.fs*1.06;
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
      const signature=p+'|'+rows.map(r=>r.id+'='+r.count).join('|');
      if (lastSignature===signature) return;
      lastSignature=signature;
      const parent=$('ahtKeyRows'); parent.replaceChildren();
      if(!rows.length){const empty=document.createElement('p');empty.className='aht-key-empty';empty.textContent='No placed devices on this page yet. Place a device to add it automatically.';parent.append(empty);}
      rows.forEach(e=>{
        const card=document.createElement('div');card.className='aht-key-edit';
        const heading=document.createElement('div');heading.className='aht-key-edit-head';
        const sample=node('svg',{viewBox:'-19 -19 38 38'},heading);
        iconSvg(e,0,0,22,sample);
        const summary=document.createElement('span');summary.textContent=e.defaultName+' · '+e.count+' placed';heading.append(summary);
        const name=document.createElement('input');name.type='text';name.maxLength=110;name.setAttribute('aria-label','Key name for '+e.defaultName);
        const description=document.createElement('textarea');description.maxLength=500;description.rows=2;description.setAttribute('aria-label','Brief key description for '+e.defaultName);
        const formatted=formatEntry(e);name.value=formatted.name;description.value=formatted.description;
        const change=()=>{state.edits[e.id]={name:name.value,description:description.value};paintSvg();};
        name.addEventListener('input',change);description.addEventListener('input',change);
        card.append(heading,name,description);parent.append(card);
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
      const scene=document.getElementById('annotationScene');
      const main=scene?.querySelector('[data-aht-drawing-key]');
      const vp=currView(),p=currPage();
      if(!scene||!main||!vp)return;
      const g=layout(vp,p),matrix=scene.getScreenCTM();
      if(!g||!matrix)return;
      const point=document.getElementById('ov').createSVGPoint();
      point.x=ev.clientX;point.y=ev.clientY;
      const local=point.matrixTransform(matrix.inverse());
      if(inside(local.x,local.y,g))startDrag(ev,scene,main,g,p,vp);
    },{capture:true});
    const observer = new MutationObserver(mutations=>{
      if(mutations.some(m=>Array.from(m.addedNodes).some(n=>n.nodeType===1&&n.id==='annotationScene')))refresh();
    });
    observer.observe(document.getElementById('ov'),{childList:true});
    function drawPdf(opts) {
      if (!state.enabled || state.hiddenPages[opts.pageNumber]) return;
      const g=layout(opts.viewport,opts.pageNumber);if(!g)return;
      const {polygon,text,rgb,conv,page,drawIconPdf,hexRgb,PDFLib} = opts;
      const P=coords=>coords.map(([x,y])=>[x+g.x,y+g.y]);
      polygon(P([[0,0],[g.w,0],[g.w,g.h],[0,g.h]]),rgb(1,1,1),.96,rgb(.11,.35,.53),1,Math.max(.8,g.fs*.07));
      polygon(P([[0,0],[g.w,0],[g.w,g.fs*2.22],[0,g.fs*2.22]]),rgb(.91,.95,.98),1,null,0,0);
      text(safe(state.title),g.x+g.fs*.72,g.y+g.fs*1.53,g.fs*1.13,rgb(.08,.23,.36),false);
      g.entries.forEach(e=>{
        const ix=g.x+g.fs*1.68,iy=g.y+e.top+g.fs*1.26;
        if(e.dev.kind==='line'||e.dev.kind==='route'){
          const a=conv(ix-g.fs*.65,iy),b=conv(ix+g.fs*.65,iy);
          page.drawLine({start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]},thickness:g.fs*.25,
            color:hexRgb(e.dev.color||'#17649a',PDFLib)});
        }else if(e.dev.kind==='relocate')text('MOVE',ix-g.fs*.45,iy,g.fs*.45,hexRgb(e.dev.color||'#17649a',PDFLib),false);
        else drawIconPdf(e.dev,ix,iy,g.fs*1.28,polygon,text,hexRgb,PDFLib);
        const xx=g.x+g.fs*3.2;let yy=g.y+e.top+g.fs*1.06;
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
  root.AHTDrawingKey={create,wrap,defaultDefinition,collectEntries,inside};
})(window);
