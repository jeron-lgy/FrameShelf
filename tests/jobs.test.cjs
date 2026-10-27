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

test('PNG publishes before copying, requires alpha and keeps saved file on clipboard failure',async()=>{
 for(const fail of [false,true]){
 const f=fixture(),events=[];f.store.waitPreview=async()=>events.push('wait');
 f.store.verify=(p,e)=>{assert.equal(e.alpha,true);assert.equal(e.width,15000);events.push('verify');};
 f.store.publish=()=>{events.push('publish');return {path:'saved.png'};};
 f.store.cleanup=()=>events.push('cleanup');
 f.store.copyPngFile=async p=>{assert.equal(p,'saved.png');events.push('copy');if(fail)throw Error('locked');};
 const r=createRunner(f.bridge,f.store),work=r.savePng({projectKey:'p',width:15000,height:100},'out','image.png');
 if(fail)await assert.rejects(work,/PNG 已保存到 saved.png.*locked/);else assert.equal((await work).path,'saved.png');
 assert.deepEqual(events,['wait','verify','publish','cleanup','copy']);assert.deepEqual(f.calls,['snapshot','directPng']);assert.equal(r.isRunning(),false);
 }
});
test('PNG alpha validation failure never publishes or touches clipboard',async()=>{const f=fixture();let copied=false;f.store.waitPreview=async()=>{};f.store.verify=()=>{throw Error('alpha');};f.store.publish=()=>{throw Error('must not publish');};f.store.copyPngFile=async()=>{copied=true;};const r=createRunner(f.bridge,f.store);await assert.rejects(r.savePng({projectKey:'p'},'out','x.png'),/alpha/);assert.equal(copied,false);assert.equal(r.isRunning(),false);});
