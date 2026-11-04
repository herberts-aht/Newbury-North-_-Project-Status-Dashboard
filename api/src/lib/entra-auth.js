'use strict';
/* AHT Entra bearer-token validation. No shared client secret and no trust in caller-supplied identity fields. */
const TENANT='5a5d8945-36e4-407e-89ba-5e5cc456ff3b';
const API_ID='b6151c38-5c7b-47c1-8f33-f1a3b08edbe6';
const DASHBOARD_ID='bf827b7e-aede-449e-bdfa-e6cee3dad6ca';
const SCOPE='Analyze.Reports';
const isGuid=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s||''));
let keysets;
function reject(status,error){return {ok:false,status,error};}
function allowedUserIds(env){
  return String(env.AHT_AI_ALLOWED_USER_IDS||'').split(',').map(x=>x.trim().toLowerCase()).filter(isGuid);
}
async function authenticateApiRequest(req,env=process.env,{joseLibrary=null,keysetsOverride=null}={}){
  // Restrict first rollout to explicit Entra object IDs; no allow-list means access denied.
  const allowed=allowedUserIds(env);
  if(!allowed.length)return reject(503,'AI authorized-user list is not configured.');
  // SWA managed Functions can replace the standard Authorization header with an internal token.
  // Read only our explicitly supplied end-user API token header; never fall back to Authorization.
  const raw=req.headers.get('x-aht-access-token')||'';
  const match=/^Bearer\s+([^\s]+)$/i.exec(raw);
  if(!match||match[1].length>12000)return reject(401,'A valid AHT API access token is required.');
  let jose,decoded,claims;
  try{
    jose=joseLibrary||await import('jose');
    // Unverified version is used ONLY to select Microsoft's tenant-specific JWKS endpoint.
    // All claims are subsequently verified with jwtVerify below.
    decoded=jose.decodeJwt(match[1]);
    if(!['1.0','2.0'].includes(decoded.ver))return reject(401,'Unsupported Entra token version.');
    const v2=decoded.ver==='2.0';
    const issuer=v2?`https://login.microsoftonline.com/${TENANT}/v2.0`:`https://sts.windows.net/${TENANT}/`;
    if(!keysets)keysets={};
    if(!keysets[decoded.ver])keysets[decoded.ver]=jose.createRemoteJWKSet(new URL(
      `https://login.microsoftonline.com/${TENANT}/discovery/${v2?'v2.0/':''}keys`
    ));
    const verifier=keysetsOverride?.[decoded.ver]||keysets[decoded.ver];
    const result=await jose.jwtVerify(match[1],verifier,{
      issuer,audience:[API_ID,`api://${API_ID}`],algorithms:['RS256'],clockTolerance:'45s'
    });
    claims=result.payload;
  }catch{
    return reject(401,'Microsoft access token could not be verified.');
  }
  if(claims.tid?.toLowerCase()!==TENANT)return reject(403,'Wrong Microsoft Entra tenant.');
  const client=String(claims.azp||claims.appid||'').toLowerCase();
  if(client!==DASHBOARD_ID)return reject(403,'This API token was not issued to AHT Project Control.');
  if(!String(claims.scp||'').split(/\s+/).includes(SCOPE))return reject(403,'Missing Analyze.Reports permission.');
  const userId=String(claims.oid||'').toLowerCase();
  if(!isGuid(userId)||!allowed.includes(userId))return reject(403,'User is not authorized for AHT AI analysis.');
  return {ok:true,userId};
}
module.exports={authenticateApiRequest,allowedUserIds};
