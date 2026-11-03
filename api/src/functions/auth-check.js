'use strict';
const {app}=require('@azure/functions');
const {authenticateApiRequest}=require('../lib/entra-auth');
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
// Non-billable sign-in check. Does not call Foundry, Graph or SharePoint.
app.http('auth-check',{
  methods:['POST'],authLevel:'anonymous',route:'auth-check',
  handler:async request=>{
    const result=await authenticateApiRequest(request,process.env);
    return {status:result.ok?200:(result.status||401),jsonBody:result.ok?{ok:true}:{ok:false,error:result.error},headers};
  }
});
