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
    button.addEventListener('click',()=>{
      try{
        const poles=markers.filter(m=>m.type==='pole3'&&(scope==='all'||sel.has(m.id)));
        if(!poles.length){message.textContent=scope==='all'?'No CCTV camera poles on this PDF.':'Select one or more camera poles on the drawing first.';return;}
        const data={tool:'CCTV',version:7,pdfName,pageRotations:{...pageRotations},markers:poles};
        localStorage.setItem('aht:wifi:poles:v1',JSON.stringify(data));
        message.textContent=`Copied ${poles.length} pole(s). Open Wi-Fi Heat Map on the same PDF and press “Paste CCTV poles.”`;
      }catch(e){message.textContent='Browser copy unavailable: '+e.message+'. Save the CCTV work JSON and import it in Wi-Fi instead.';}
    });actions.append(button);
  }
  add('Copy selected poles for Wi-Fi','selected');add('Copy all poles for Wi-Fi','all');
  panel.append(actions,message);section.append(panel);
})();
