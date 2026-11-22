/* AHT Wi-Fi coverage geometry. Coordinates are PDF viewport points, not pixels.
   Illustrative planning estimate; not a measured propagation or RF design model. */
(function(root){
  'use strict';
  const COUNT=24, TAU=2*Math.PI;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const angle=i=>TAU*i/COUNT;
  const unit=a=>[Math.sin(a),-Math.cos(a)]; // 0 degrees points up the sheet
  const normalize=a=>(a%TAU+TAU)%TAU;
  function shapeFor(kind='ceiling'){
    return Array.from({length:COUNT},(_,i)=>{
      if(kind==='ceiling'||kind==='pole-omni')return 1;
      const c=Math.cos(angle(i));
      if(kind==='wall')return clamp(.15+.85*Math.max(0,c),.15,1);
      if(kind==='pole-directional')return clamp(.12+.88*Math.pow(Math.max(0,c),1.1),.12,1);
      return 1;
    });
  }
  const radiusPts=(ap,pointsPerFoot)=>clamp(Number(ap.rangeFt)||60,5,500)*pointsPerFoot;
  function radiusAt(ap,a,pointsPerFoot){
    const samples=Array.isArray(ap.radii)&&ap.radii.length===COUNT?ap.radii:shapeFor(ap.kind);
    const rel=normalize(a-(Number(ap.rot)||0)*Math.PI/180)/TAU*COUNT;
    const i=Math.floor(rel),t=rel-i;
    const scalar=Number(samples[i])*(1-t)+Number(samples[(i+1)%COUNT])*t;
    return radiusPts(ap,pointsPerFoot)*clamp(scalar,.06,2.5);
  }
  // Intersection of a finite AP ray and an obstruction segment.
  function intersectRay(origin,dir,maxDist,wall){
    const dx=Number(wall.x2)-Number(wall.x),dy=Number(wall.y2)-Number(wall.y);
    const cross=dir[0]*dy-dir[1]*dx;
    if(Math.abs(cross)<1e-8)return null;
    const qx=wall.x-origin[0],qy=wall.y-origin[1];
    const t=(qx*dy-qy*dx)/cross,u=(qx*dir[1]-qy*dir[0])/cross;
    return t>=0&&t<=maxDist&&u>=0&&u<=1?t:null;
  }
  function effectiveRadius(ap,a,pointsPerFoot,walls=[]){
    const dir=unit(a);let r=radiusAt(ap,a,pointsPerFoot);
    const crosses=walls.map(w=>({w,d:intersectRay([ap.x,ap.y],dir,r,w)}))
      .filter(x=>x.d!==null).sort((a,b)=>a.d-b.d);
    for(const {w,d} of crosses){
      const attenuation=clamp(Number(w.attenuation)||0,0,1);
      if(d<r)r=d+(r-d)*(1-attenuation);
    }
    return Math.max(0,r);
  }
  function pointAt(ap,a,pointsPerFoot,walls=[]){
    const dir=unit(a),r=effectiveRadius(ap,a,pointsPerFoot,walls);
    return [ap.x+dir[0]*r,ap.y+dir[1]*r];
  }
  // Draw an organic, C1-continuous outline through the same 24 editable
  // control points. Monotone cubic interpolation prevents new sharp spikes
  // or overshoot, even when an obstruction shortens neighboring rays.
  function smoothRadius(samples,index){
    const count=samples.length,i=Math.floor(index),t=index-i;
    const at=n=>samples[(n%count+count)%count];
    const a=at(i),b=at(i+1);
    const tangent=(left,right)=>left*right<=0?0:2*left*right/(left+right);
    const m0=tangent(a-at(i-1),b-a),m1=tangent(b-a,at(i+2)-b);
    const t2=t*t,t3=t2*t;
    const r=(2*t3-3*t2+1)*a+(t3-2*t2+t)*m0+(-2*t3+3*t2)*b+(t3-t2)*m1;
    return clamp(r,Math.min(a,b),Math.max(a,b));
  }
  function effectiveSamples(ap,pointsPerFoot,walls){
    const rotation=(Number(ap.rot)||0)*Math.PI/180;
    return Array.from({length:COUNT},(_,i)=>effectiveRadius(ap,angle(i)+rotation,pointsPerFoot,walls));
  }
  function smoothEffectiveRadius(ap,a,pointsPerFoot,walls=[]){
    const samples=effectiveSamples(ap,pointsPerFoot,walls);
    const index=normalize(a-(Number(ap.rot)||0)*Math.PI/180)/TAU*COUNT;
    return smoothRadius(samples,index);
  }
  function smoothBoundary(ap,pointsPerFoot,walls=[],stepsPerHandle=8){
    const samples=effectiveSamples(ap,pointsPerFoot,walls);
    const rotation=(Number(ap.rot)||0)*Math.PI/180;
    const steps=clamp(Math.round(stepsPerHandle),1,24),points=[];
    for(let i=0;i<COUNT;i++)for(let s=0;s<steps;s++){
      const index=i+s/steps,a=angle(index)+rotation,r=smoothRadius(samples,index),dir=unit(a);
      points.push([ap.x+dir[0]*r,ap.y+dir[1]*r]);
    }
    return points;
  }
  function softenShape(ap){
    const samples=Array.isArray(ap.radii)&&ap.radii.length===COUNT?ap.radii:shapeFor(ap.kind);
    const at=i=>Number(samples[(i+COUNT)%COUNT]);
    // A gentle circular five-point blur rounds older custom shapes without
    // changing the number of handles or preventing further manual edits.
    ap.radii=Array.from({length:COUNT},(_,i)=>clamp(
      .2*at(i)+.8*(at(i-2)+4*at(i-1)+6*at(i)+4*at(i+1)+at(i+2))/16,.06,2.5));
    return ap;
  }
  function nearestHandle(ap,x,y,pointsPerFoot,walls=[],tolerance=12){
    let best=null,distance=tolerance;
    for(let i=0;i<COUNT;i++){
      const a=angle(i)+(Number(ap.rot)||0)*Math.PI/180;
      const p=pointAt(ap,a,pointsPerFoot,walls),d=Math.hypot(x-p[0],y-p[1]);
      if(d<distance){distance=d;best=i;}
    }
    return best;
  }
  function updateHandle(ap,i,x,y,pointsPerFoot,walls=[]){
    const a=angle(i)+(Number(ap.rot)||0)*Math.PI/180,dir=unit(a);
    const dx=x-ap.x,dy=y-ap.y;
    let projected=Math.max(0,dx*dir[0]+dy*dir[1]);
    // Invert the wall shortening so the visible boundary follows the pointer.
    // At 100% blockage the handle cannot be pulled beyond the obstruction.
    const maxRange=radiusPts(ap,pointsPerFoot)*2.5;
    const crossings=walls.map(w=>({w,d:intersectRay([ap.x,ap.y],dir,maxRange,w)}))
      .filter(v=>v.d!==null).sort((a,b)=>b.d-a.d);
    for(const {w,d} of crossings){
      if(projected<=d)continue;
      const surviving=1-clamp(Number(w.attenuation)||0,0,1);
      projected=surviving>0?d+(projected-d)/surviving:d;
    }
    const samples=Array.isArray(ap.radii)&&ap.radii.length===COUNT?ap.radii.slice():shapeFor(ap.kind);
    const next=clamp(projected/radiusPts(ap,pointsPerFoot),.06,2.5),delta=next-samples[i];
    samples[i]=next;
    // A dragged handle softly pulls its neighbors too, like deforming a
    // flexible surface, instead of creating an isolated pointed vertex.
    for(const [distance,weight] of [[1,.72],[2,.40],[3,.12]]){
      for(const sign of [-1,1]){
        const neighbor=(i+sign*distance+COUNT)%COUNT;
        samples[neighbor]=clamp(samples[neighbor]+delta*weight,.06,2.5);
      }
    }
    ap.radii=samples;
    return ap;
  }
  function poleHeads(pole,iconSize=17){
    const heads=Array.isArray(pole.heads)?pole.heads:[];
    return heads.map((h,i)=>{
      const a=((Number(pole.rot)||0)+(Number(h.rel)||0))*Math.PI/180;
      const r=iconSize*(.80+Math.max(1,Number(h.tier)||1)*.38);
      return {kind:h.kind||'cam',x:pole.x+Math.sin(a)*r,y:pole.y-Math.cos(a)*r,tier:h.tier||1,index:i};
    });
  }
  function pdfFileName(name){return String(name||'').replace(/\\/g,'/').split('/').pop().trim().toLowerCase();}
  function importCctvPoles(source,pdfName){
    if(!source||!Array.isArray(source.markers))throw Error('Choose a CCTV work JSON file.');
    if(source.tool&&!/cctv/i.test(source.tool))throw Error('This JSON was not saved by the CCTV tool.');
    const same=!!pdfFileName(source.pdfName)&&pdfFileName(source.pdfName)===pdfFileName(pdfName);
    const poles=source.markers.filter(m=>m.type==='pole3').map(m=>({type:'pole3',page:Number(m.page)||1,
      x:Number(m.x),y:Number(m.y),rot:Number(m.rot)||0,size:Number(m.size)||1,
      heads:Array.isArray(m.heads)?JSON.parse(JSON.stringify(m.heads)):[],note:String(m.note||'')}))
      .filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
    return {poles,samePdf:same,sourceName:source.pdfName||'',ignoredMarkers:source.markers.length-poles.length};
  }
  root.AHTWifiCore={COUNT,TAU,angle,unit,shapeFor,radiusAt,effectiveRadius,smoothEffectiveRadius,smoothBoundary,softenShape,pointAt,nearestHandle,updateHandle,poleHeads,pdfFileName,importCctvPoles,clamp};
})(window);
