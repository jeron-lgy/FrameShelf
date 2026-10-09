const {test}=require('node:test'),assert=require('node:assert/strict');
const {createRunner}=require('../extension/js/jobs.js');
function fixture(fail){const writes=[],calls=[],results=[];let n=0;const store={native:true,stage:()=>({directory:'stage'+n++}),write:(k,v)=>writes.push([k,v]),verify:()=>{},cleanup:()=>{},publish:(s,p,name)=>({path:name,filename:name,bytes:10})};
const bridge={call:async(m,a)=>{calls.push(m);if(m==='snapshot')return {projectKey:'p'};if(m==='render'&&fail)throw fail;return {path:'image'};}};
const plan=[1,2].map(i=>({slotId:String(i),filename:i+'.tif',record:{projectKey:'p',width:1,height:1},profile:{name:'User',kind:'TIFF',bits:16}}));return{store,bridge,plan,writes,calls,results};}
test('Batch checkpoints success and restores recovery journal after each host call',async()=>{const f=fixture(),r=createRunner(f.bridge,f.store);const out=await r.batch(f.plan,{directory:'out',onResult:x=>f.results.push(x)});assert.equal(out.results.length,2);assert.equal(f.results.length,2);assert.equal(f.writes.at(-1)[1],null);assert.deepEqual(f.calls,['snapshot','probe','snapshot','render','snapshot','render']);});
test('Transport failure retains recovery snapshot and stops remaining renders',async()=>{const f=fixture(new Error('transport')),r=createRunner(f.bridge,f.store);await assert.rejects(r.batch(f.plan,{directory:'out',onResult:x=>f.results.push(x)}),/transport/);assert.equal(f.writes.at(-1)[1].pending,true);assert.equal(f.results.length,1);assert.equal(r.isRunning(),false);});
test('Known restored host failure clears journal; stop requests keep completed file',async()=>{const e=new Error('cancel');e.needsRecovery=false;const f=fixture(e),r=createRunner(f.bridge,f.store);await assert.rejects(r.batch(f.plan,{directory:'out'}));assert.equal(f.writes.at(-1)[1],null);
const g=fixture(),q=createRunner(g.bridge,g.store);const out=await q.batch(g.plan,{directory:'out',onResult:()=>q.stop()});assert.equal(out.stopped,true);assert.equal(out.results.length,1);});
test('Preview uses direct frame extraction rather than export render',async()=>{const f=fixture();let ready=false;f.store.waitPreview=async()=>{ready=true;};f.store.savePreview=()=>{assert.equal(ready,true);return '/preview.png';};const r=createRunner(f.bridge,f.store);const result=await r.preview({projectKey:'p',id:'r'});assert.equal(result.path,'/preview.png');assert.deepEqual(f.calls,['snapshot','directPreview']);});

test('Null native output retains recovery journal instead of accessing path',async()=>{
 const f=fixture();f.bridge.call=async m=>m==='snapshot'?{projectKey:'p'}:null;
 const r=createRunner(f.bridge,f.store);await assert.rejects(r.preview({projectKey:'p',id:'r'}),/恢复记录/);
 assert.equal(f.writes.at(-1)[1].pending,true);assert.equal(r.isRunning(),false);
});
