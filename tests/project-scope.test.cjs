const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../extension/js/core.js');
function source(compId,id){return {projectKey:'p',compId,records:[{id,compId,projectKey:'p',compName:'同名',width:100,height:50}],slots:[]};}
test('Project aggregation isolates project, respects tombstones and migrated empty comps',()=>{
 const a=source(1,'a'),b=source(2,'b'),foreign={...source(3,'x'),projectKey:'other'};
 const s={...C.newSession('p'),scope:'project',compId:null,slots:[{id:'s',pattern:'名称',recordId:'b'}]};
 C.refreshProjectRecords(s,[a,b,foreign],null);assert.deepEqual(s.records.map(r=>r.id),['a','b']);
 const before=JSON.stringify(a);s.records[0].label='local';assert.equal(JSON.stringify(a),before);
 b.deletedRecordIds=['b'];C.refreshProjectRecords(s,[a,b],{projectKey:'p',records:[...b.records,{...source(4,'legacy').records[0]}]});
 assert.deepEqual(s.records.map(r=>r.id),['a','legacy']);assert.equal(s.slots[0].recordId,null);assert.equal(s.slots[0].pattern,'名称');
 b.records=[];C.refreshProjectRecords(s,[b],{projectKey:'p',records:source(2,'b').records});assert.equal(s.records.length,0);
});
test('Cross-comp project plan preserves sources, rejects foreign projects, duplicate names and IDs',()=>{
 const s={...C.newSession('p'),scope:'project',compId:null,slots:[{id:'1',pattern:'A',recordId:'a'},{id:'2',pattern:'B',recordId:'b'}]};
 C.refreshProjectRecords(s,[source(1,'a'),source(2,'b')]);const profile={supported:true,ext:'.png'};
 assert.deepEqual(C.buildPlan(s,profile).map(j=>j.record.compId),[1,2]);
 s.slots[1].pattern='A';assert.throws(()=>C.buildPlan(s,profile),/重复/);s.slots[1].pattern='B';
 s.records[1].projectKey='other';assert.throws(()=>C.buildPlan(s,profile),/其他工程/);
 assert.throws(()=>C.refreshProjectRecords(s,[source(1,'a'),source(2,'a')]),/ID 冲突/);
});
