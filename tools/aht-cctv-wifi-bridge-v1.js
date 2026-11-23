/* Pass CCTV pole coordinates to the Wi-Fi Heat Map without camera view cones.
   Clipboard is local to this browser origin; saved CCTV JSON remains a fallback. */
(function(){
  'use strict';
  const section=document.getElementById('reviewSection');
  if(!section)return;
  const panel=document.createElement('div');
  panel.style.cssText='margin:12px 0;padding:10px;border:1px solid #b7d4e6;background:#f0f8fd;border-radius:7px';
  const heading=document.createElement('strong');heading.textContent='Wi-Fi Heat Map · CCTV pole handoff';
  heading.style.cssText='color:#174a6b;font-size:12px';panel.append(heading);
  const help=document.createElement('p');help.style.cssText='font-size:11px;color:#4f687c;margin:5px 0 9px';
  help.textContent='Copy pole locations and mounted camera heads to the Wi-Fi tool. Camera viewing cones are never copied.';panel.append(help);
  const actions=document.createElement('div');actions.style.cssText='display:flex;gap:6px;flex-wrap:wrap';
  const message=document.createElement('div');message.setAttribute('role','status');message.style.cssText='margin-top:6px;font-size:11px;color:#315d7c';
  function add(label,scope){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.style.cssText='flex:1;min-width:120px';
    button.addEventListener('click',async()=>{
      button.disabled=true;
      try{
        if(!pdfDoc||!pdfBytes){message.textContent='Open the CCTV PDF before copying pole positions.';return;}
        const poles=markers.filter(m=>m.type==='pole3'&&(scope==='all'||sel.has(m.id)));
        if(!poles.length){message.textContent=scope==='all'?'No CCTV camera poles on this PDF.':'Select one or more camera poles on the drawing first.';return;}
        const pageDimensions={};
        for(const p of new Set(poles.map(m=>Number(m.page)||1))){const page=await pdfDoc.getPage(p),viewport=page.getViewport({scale:1});pageDimensions[p]={width:viewport.width,height:viewport.height};}
        let pdfHash='';
        if(window.crypto?.subtle){try{const bytes=pdfBytes instanceof Uint8Array?pdfBytes.slice():new Uint8Array(pdfBytes);
          const digest=await window.crypto.subtle.digest('SHA-256',bytes);
          pdfHash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');}catch(_){/* Filenames/page dimensions remain required. */}}
        const data={tool:'CCTV',version:7,clipboard:true,pdfName,pdfHash,pageCount:pdfDoc.numPages,pageDimensions,pageRotations:{...pageRotations},markers:poles};
        localStorage.setItem('aht:wifi:poles:v1',JSON.stringify(data));
        message.textContent=`Copied ${poles.length} pole(s). Open Wi-Fi Heat Map on the same PDF and press “Paste CCTV poles.”`;
      }catch(e){message.textContent='Browser copy unavailable: '+e.message+'. Save the CCTV work JSON and import it in Wi-Fi instead.';}
      finally{button.disabled=false;}
    });actions.append(button);
  }
  add('Copy selected poles for Wi-Fi','selected');add('Copy all poles for Wi-Fi','all');
  panel.append(actions,message);section.append(panel);
})();
