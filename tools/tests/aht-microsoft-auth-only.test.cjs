/* Guard against reintroducing shared-password demo authentication to public code. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html');
const auth=read('js/auth.js');
const config=read('js/config.js');
const dashboard=read('js/dashboard.js');
const microsoftAccess=read('js/microsoft-access.js');

test('Microsoft Entra is configured as the sole login provider',()=>{
  assert.match(config,/authProvider:\s*["']microsoft["']/);
  assert.match(auth,/const AuthProvider\s*=\s*MicrosoftAuthProvider/);
  assert.match(auth,/Only Microsoft Entra authentication is supported/);
  assert.doesNotMatch(auth,/\bDemoAuthProvider\b|\bTEMP_PASSWORDS\b|\bpasswordForUser\b/);
});

test('sign-in screen only offers Microsoft and has no shared-password entry',()=>{
  assert.match(html,/id="loginBtn"[^>]*>Sign in with Microsoft/);
  assert.doesNotMatch(html,/id="loginPassword"|id="loginUser"|Temporary Password|id="adminPasswordProfile"/);
  assert.doesNotMatch(auth,/\bloginPassword\b|\bloginUser\b/);
});

test('user administration does not assign legacy password profiles',()=>{
  for(const text of [html,dashboard,microsoftAccess]){
    assert.doesNotMatch(text,/\bpasswordProfile\b|\badminPasswordProfile\b|\blegacyPasswordControls\b/);
  }
  assert.match(html,/id="adminUserActive"/);
  assert.match(dashboard,/adminUserActive\.checked/);
});

test('no hard-coded temporary authentication password remains in active files',()=>{
  assert.doesNotMatch([html,auth].join('\n'),/Stacy Administrator\s*—|AHT Internal\s*—|Temporary local passwords are assigned/i);
});
