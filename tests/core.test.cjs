const {test}=require('node:test'), assert=require('node:assert/strict');
const C=require('../extension/js/core.js');
test('Window ownership merges records without overwriting naming changes',()=>{
 const stored={records:[{id:'a'},{id:'b'}],slots:[{recordId:'a',pattern:'新名称'}],fields:{A:'最新'},history:[{ok:true}]};
 const capture={records:[{id:'a',previewPath:'preview'}],slots:[],fields:{A:'旧'}};
 const merged=C.mergeSession(capture,stored,'capture');assert.equal(merged.fields.A,'最新');assert.equal(merged.records[0].previewPath,'preview');
 const exported=C.mergeSession({...stored,slots:[{recordId:'b',pattern:'新名称'}]},merged,'export');assert.equal(exported.slots[0].recordId,null);assert.equal(exported.records[0].previewPath,'preview');
});
test('Unicode names, variables, invalid Windows names',()=>{
 assert.equal(C.filename('{产品名}_Final','吸尘器'),'吸尘器_Final');
 assert.equal(C.filename('产品_final',''),'产品_final');
 for(const n of ['CON','A/B','a:b','x.','{unknown}']) assert.throws(()=>C.filename(n,''));
 assert.throws(()=>C.filename('{产品名}_A',''));
});
test('One record maps to several names; plan snapshots state; rejects duplicate names',()=>{
 const s=C.newSession('a'), p={supported:true,ext:'.tif',name:'自定义'};
 s.records=[{id:'r',projectKey:'a',layers:[{id:1,solo:true}]}];
 s.slots=[{id:'1',pattern:'产品_A',recordId:'r'},{id:'2',pattern:'产品_B',recordId:'r'}];
 const plan=C.buildPlan(s,p); s.records[0].layers[0].solo=false; assert.equal(plan[0].record.layers[0].solo,true); assert.equal(plan.length,2);
 s.slots[1].pattern='产品_a'; assert.throws(()=>C.buildPlan(s,p),/重复/);
 s.slots[1].selected=false; assert.equal(C.buildPlan(s,p).length,1);
 s.records[0].projectKey='other'; assert.throws(()=>C.buildPlan(s,p),/其他工程/);
});
test('Preset copies independent slots and mappings require real record IDs',()=>{
 const s=C.newSession('a'), p={id:'p',slots:['任意中文名']}; C.applyPreset(s,p); s.slots[0].pattern='改名'; assert.equal(p.slots[0],'任意中文名'); assert.throws(()=>C.assign(s,s.slots[0].id,'missing'));
 assert.equal(C.chooseAvailable('中文.tif',n=>['中文.tif','中文_01.tif'].includes(n)),'中文_02.tif');
});

test('Custom fields and case-sensitive time tokens expand with one supplied clock',()=>{
 const date=new Date(2026,9,9,17,4,6);
 assert.equal(C.filename('{命名A}_{命名B}_$YYYY$MM$DD_$hh$mm$ss','',{date,fields:{命名A:'吸尘器',命名B:'Final'}}),'吸尘器_Final_20261009_170406');
 assert.throws(()=>C.filename('$BAD','',{date}),/未知通配符/);
 assert.throws(()=>C.filename('{不存在}','',{date}),/未定义/);
 const session=C.newSession('p'),preset={id:'x',slots:['{命名A}_$DD'],fields:{命名A:'产品'}};C.applyPreset(session,preset);session.fields.命名A='修改';assert.equal(preset.fields.命名A,'产品');
});
test('Updating a combination keeps slot links and rejects other compositions',()=>{const s=C.newSession('p');s.records=[{id:'r',projectKey:'p',compId:1,compName:'A',label:'保留名称',previewPath:'old.png'}];s.slots=[{id:'slot',recordId:'r',pattern:'交付'}];assert.throws(()=>C.updateRecord(s,'r',{projectKey:'p',compId:2}),/源合成/);const updated=C.updateRecord(s,'r',{projectKey:'p',compId:1,frameIndex:12,layers:[{id:3,solo:true}]});assert.equal(updated.label,'保留名称');assert.equal(updated.previewPath,undefined);assert.equal(updated.frameIndex,12);assert.equal(s.slots[0].recordId,'r');});
test('Composition migration isolates records, mappings and history without changing legacy data',()=>{const legacy={records:[{id:'a',compId:1},{id:'b',compId:2}],slots:[{id:'sa',recordId:'a',pattern:'A'},{id:'sb',recordId:'b',pattern:'B'},{id:'empty',recordId:null,pattern:'空'}],history:[{slotId:'sa'},{slotId:'sb'}],fields:{X:'值'},product:'产品',presetId:'p'};const a=C.compositionSession('p',1,'同名',legacy),b=C.compositionSession('p',2,'同名',legacy);assert.deepEqual(a.records.map(r=>r.id),['a']);assert.deepEqual(b.slots.map(r=>r.id),['sb','empty']);assert.equal(a.history.length,1);a.fields.X='改';assert.equal(legacy.fields.X,'值');assert.notEqual(C.sessionKey('p',1),C.sessionKey('p',2));assert.notEqual(C.sessionKey('p',1),C.sessionKey('q',1));assert.throws(()=>C.mergeSession(a,b,'export'),/不同合成/);});
test('Export rejects records from another composition even within same project',()=>{const s=C.compositionSession('p',1,'A');s.records=[{id:'b',projectKey:'p',compId:2}];s.slots=[{id:'s',recordId:'b',pattern:'file'}];assert.throws(()=>C.buildPlan(s,{supported:true,ext:'.png'}),/其他合成/);});
test('Linked fields apply to chosen names, update expansion, and validate before mutation',()=>{const s=C.newSession('p');s.product='吸尘器';s.slots=[{id:'a',pattern:'{产品名}_A'},{id:'b',pattern:'{产品名}_B'}];C.addField(s,'版本','V01','all');assert.equal(C.filename(s.slots[1].pattern,s.product,{fields:s.fields}),'吸尘器_B_V01');s.fields.版本='V02';assert.equal(C.filename(s.slots[0].pattern,s.product,{fields:s.fields}),'吸尘器_A_V02');C.addField(s,'渠道','电商','a');assert.ok(s.slots[0].pattern.includes('{渠道}'));assert.ok(!s.slots[1].pattern.includes('{渠道}'));const before=JSON.stringify(s);for(const args of [['版本','x','all'],['bad','x','missing'],['产品名','x','all'],['空','','all']])assert.throws(()=>C.addField(s,...args));assert.equal(JSON.stringify(s),before);});
test('Ordered naming fields: shared values, per-slot names, ordering and separator survive presets',()=>{const s=C.newSession('p');s.product='吸尘器';s.slots=[{id:'a',pattern:'{产品名}_Product_$DD$hh$mm'},{id:'b',pattern:'{产品名}_Final_$DD$hh$mm'}];const d=new Date(2026,9,9,10,11);C.ensureNaming(s);assert.equal(C.slotFilename(s,s.slots[0],d),'吸尘器_Product_091011');s.naming.fields[0].value='风扇';assert.equal(C.slotFilename(s,s.slots[1],d),'风扇_Final_091011');s.naming.separator=' - ';C.moveField(s,s.naming.fields[2].id,0);assert.equal(C.slotFilename(s,s.slots[0],d),'091011 - 风扇 - Product');const preset=C.namingPreset(s,'x','保存');const next=C.newSession('q');C.applyPreset(next,preset);assert.equal(C.slotFilename(next,next.slots[1],d),'091011 - 风扇 - Final');next.naming.fields[1].value='改';assert.equal(s.naming.fields[1].value,'风扇');});
test('Irregular legacy rules retain their output on migration and empty separator works',()=>{const s=C.newSession('p');s.product='中文';s.slots=[{pattern:'{产品名}_$DD'},{pattern:'另一个_$hh_$mm'}];const d=new Date(2026,9,9,10,11);const before=s.slots.map(x=>C.slotFilename(s,x,d));C.ensureNaming(s);assert.deepEqual(s.slots.map(x=>C.slotFilename(s,x,d)),before);});
test('Export plan uses ordered names with one batch clock and catches separator errors',()=>{const s=C.newSession('p');s.records=[{id:'r',projectKey:'p'}];s.slots=[{id:'s',pattern:'旧名字',recordId:'r',values:{c:'Final'}}];s.naming={separator:'-',fields:[{id:'f',type:'fixed',value:'产品'},{id:'c',type:'custom'}]};assert.equal(C.buildPlan(s,{supported:true,ext:'.tif'})[0].filename,'产品-Final.tif');s.naming.separator='/';assert.throws(()=>C.buildPlan(s,{supported:true,ext:'.tif'}),/禁用/);s.naming.separator='';assert.equal(C.slotFilename(s,s.slots[0]),'产品Final');});
test('Deleted records cannot be resurrected by stale capture or export windows',()=>{const stored={projectKey:'p',compId:1,records:[{id:'a'},{id:'b'}],slots:[{recordId:'a',pattern:'保留名字'}]};const local={...stored,deletedRecordIds:['a'],records:[{id:'b'}]};const removed=C.mergeSession(local,stored,'export');assert.deepEqual(removed.records,[{id:'b'}]);assert.equal(removed.slots[0].recordId,null);assert.equal(removed.slots[0].pattern,'保留名字');const stale=C.mergeSession(stored,removed,'capture');assert.deepEqual(stale.records,[{id:'b'}]);});
