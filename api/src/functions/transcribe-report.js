'use strict';
const {app}=require('@azure/functions');
const {transcribeRequest}=require('../lib/transcribe');
app.http('transcribe-report',{methods:['POST'],authLevel:'anonymous',route:'transcribe-report',handler:async request=>transcribeRequest(request)});
