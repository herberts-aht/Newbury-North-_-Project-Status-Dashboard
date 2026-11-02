'use strict';
const {app}=require('@azure/functions');
const {analyzeRequest}=require('../lib/analyze');
app.http('analyze-report',{
  methods:['POST'],authLevel:'anonymous',route:'analyze-report',
  handler:async(request,context)=>{
    // Only metadata is logged, never the field report, AI output or secret.
    context.log('AHT AI analyze-report request received');
    return analyzeRequest(request);
  }
});
