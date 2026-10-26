import test from "node:test";
import assert from "node:assert/strict";
import {workflowActions,workflowRequest} from "../src/workflows";
const id="00000000-0000-4000-8000-000000000001";
test("workflow actions reject unknown operations and client role injection",()=>{
 assert.equal(workflowRequest.safeParse({action:"execute_sql",data:{}}).success,false);
 assert.equal(workflowActions.case_action.safeParse({id,status:"RESOLVED",note:"Done",role:"FINANCE"}).success,false);
});
test("refund completion requires amount, date, gateway reference and payout evidence",()=>{
 const complete={refundId:id,stage:"COMPLETED",amount:1200,completedOn:"2026-10-26",reference:"RF-001",confirmation:"Gateway confirms funds returned"};
 assert.equal(workflowActions.finance_update.safeParse(complete).success,true);
 for(const field of ["amount","completedOn","reference","confirmation"]){const body={...complete};delete (body as Record<string,unknown>)[field];assert.equal(workflowActions.finance_update.safeParse(body).success,false,field);}
 assert.equal(workflowActions.finance_update.safeParse({refundId:id,stage:"INITIATED",reference:"RF-001"}).success,true);
});
test("call confirmation requires affirmative evidence rather than an unclear response",()=>{
 assert.equal(workflowActions.call_approval.safeParse({id,explicitApproval:false,evidence:"Unclear response"}).success,false);
 assert.equal(workflowActions.call_approval.safeParse({id,explicitApproval:true,evidence:"Professional explicitly accepts this booking"}).success,true);
});
test("intake, private notes and task data have bounded payloads",()=>{
 assert.equal(workflowActions.private_note.safeParse({appointmentId:id,body:"x".repeat(16001)}).success,false);
 assert.equal(workflowActions.intake_submit.safeParse({serviceId:id,answers:{summary:"x".repeat(8001)}}).success,false);
 assert.equal(workflowActions.progress_submit.safeParse({revisionId:id,taskId:id,completed:true,measurements:{weight:"70"}}).success,true);
});
