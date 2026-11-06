'use strict';
/* AHT PM-initiated transcription via Azure Speech Fast Transcription (2025-10-15).
 * Authenticated API; no SharePoint access or writes. Original audio stays in SharePoint.
 * The PM must explicitly review and save transcript via existing Field Reporting UI.
 */
const {authenticateApiRequest}=require('./entra-auth');
const HEADERS={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(status,body)=>({status,jsonBody:body,headers:HEADERS});
const MAX=15*1024*1024;
const API_VERSION='2025-10-15';

// Only allow an HTTPS Azure Cognitive Services resource root, never a browser-provided URL.
function speechEndpoint(value){
 try{
  const url=new URL(String(value||''));
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))return null;
  if(!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cognitiveservices\.azure\.com$/i.test(url.hostname))return null;
  return url.origin;
 }catch{return null;}
}

function transcriptFromResult(json){
 if(!json||!Array.isArray(json.combinedPhrases))return '';
 return json.combinedPhrases.map(p=>typeof p?.text==='string'?p.text.trim():'').filter(Boolean).join('\n').trim();
}

async function transcribeRequest(req,{env=process.env,fetchFn=fetch,authenticate=authenticateApiRequest}={}){
 if(req.method!=='POST')return reply(405,{ok:false,error:'POST required.'});
 if(env.AHT_AI_ENABLED!=='true')return reply(503,{ok:false,error:'Azure AI is disabled.'});
 const actor=await authenticate(req,env);
 if(!actor.ok)return reply(actor.status||401,{ok:false,error:actor.error||'Unauthorized.'});
 const endpoint=speechEndpoint(env.AHT_SPEECH_ENDPOINT);
 if(!endpoint||!String(env.AHT_SPEECH_API_KEY||'').trim())
  return reply(503,{ok:false,error:'Azure Speech settings are incomplete.'});
 const contentType=req.headers.get('content-type')||'';
 if(!/^multipart\/form-data\s*;/i.test(contentType))return reply(415,{ok:false,error:'Upload audio as multipart form data.'});
 const claimed=Number(req.headers.get('content-length')||0);
 if(claimed>MAX+65536)return reply(413,{ok:false,error:'Recording exceeds the 15 MB limit.'});
 let file;
 try{const form=await req.formData();file=form.get('file');}
 catch{return reply(400,{ok:false,error:'Invalid audio upload.'});}
 if(!file||typeof file.arrayBuffer!=='function'||!Number.isFinite(file.size)||file.size<100||file.size>MAX)
  return reply(400,{ok:false,error:'Provide one recording of 15 MB or less.'});
 const type=String(file.type||'').toLowerCase().split(';')[0];
 const ext=String(file.name||'').toLowerCase().match(/\.(webm|m4a|mp4|ogg)$/)?.[1];
 const expected={webm:['audio/webm','video/webm','application/octet-stream'],m4a:['audio/mp4','audio/x-m4a','application/octet-stream'],mp4:['audio/mp4','video/mp4','application/octet-stream'],ogg:['audio/ogg','application/ogg','application/octet-stream']};
 if(!ext||!expected[ext].includes(type))return reply(415,{ok:false,error:'Unsupported recording type.'});
 const buffer=Buffer.from(await file.arrayBuffer());
 const actualType=type==='application/octet-stream'?({m4a:'audio/mp4',mp4:'audio/mp4',webm:'audio/webm',ogg:'audio/ogg'}[ext]):type;
 const forward=new FormData();
 forward.append('definition',JSON.stringify({locales:['en-US']}));
 forward.append('audio',new Blob([buffer],{type:actualType}),`recording.${ext}`);
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),55000);
 try{
  const response=await fetchFn(`${endpoint}/speechtotext/transcriptions:transcribe?api-version=${API_VERSION}`,{
   method:'POST',headers:{'Ocp-Apim-Subscription-Key':env.AHT_SPEECH_API_KEY},body:forward,signal:controller.signal
  });
  if(!response.ok){
   const msg=response.status===429?'Speech transcription rate limit reached.':
     [401,403].includes(response.status)?'Azure Speech rejected the resource key or access. Verify the Speech resource settings.':
     response.status===413?'Azure Speech rejected the recording size.':
     'Azure Speech transcription failed. Confirm the Speech resource, region, and recording format.';
   return reply(response.status===429?429:502,{ok:false,error:msg});
  }
  const json=await response.json();
  const transcript=transcriptFromResult(json);
  if(!transcript||transcript.length>12000)return reply(422,{ok:false,error:'No usable transcript returned (12,000 character limit).'});
  return reply(200,{ok:true,transcript});
 }catch(ex){return reply(ex?.name==='AbortError'?504:502,{ok:false,error:ex?.name==='AbortError'?'Transcription timed out.':'Could not process recording.'});}
 finally{clearTimeout(timeout);}
}
module.exports={transcribeRequest,speechEndpoint,transcriptFromResult};
