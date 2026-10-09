const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('fs'),path=require('path'),os=require('os');
const {createStore}=require('../extension/lib/files.cjs'), I=require('../extension/lib/images.cjs');
function root(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'fs-unit-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
test('Two stores cannot start simultaneous rendering and state lock is released',t=>{const dir=root(t),a=createStore(dir),b=createStore(dir);const release=a.acquireJob();assert.equal(b.jobActive(),true);assert.throws(()=>b.acquireJob(),/正在渲染/);release();assert.equal(b.jobActive(),false);assert.throws(()=>a.withStateLock(()=>{throw Error('fail');}));b.withStateLock(()=>b.write('x',1));assert.equal(a.read('x'),1);});
test('Unicode atomic publication preserves existing files and survives stage cleanup',t=>{
 const dir=root(t),s=createStore(path.join(dir,'配置')),stage=s.stage(dir),src=path.join(stage.directory,'frame.tif');fs.writeFileSync(src,'complete-data');
 fs.writeFileSync(path.join(dir,'产品_final.tif'),'existing');
 assert.throws(()=>s.publish(stage,src,'产品_final.tif','error'),/同名/);
 const out=s.publish(stage,src,'产品_final.tif','rename');assert.equal(out.filename,'产品_final_01.tif');s.cleanup(stage);
 assert.equal(fs.readFileSync(out.path,'utf8'),'complete-data');assert.equal(fs.readFileSync(path.join(dir,'产品_final.tif'),'utf8'),'existing');
 s.write('配置',{中文:'吸尘器'});s.write('配置',{中文:'新的值'});assert.deepEqual(s.read('配置'),{中文:'新的值'});
});
test('Stage ownership and file boundaries are enforced',t=>{
 const dir=root(t),s=createStore(path.join(dir,'config')),stage=s.stage(dir); fs.writeFileSync(path.join(dir,'outside'),'x');
 assert.throws(()=>s.publish(stage,path.join(dir,'outside'),'result.tif','rename'),/临时目录/);
 assert.throws(()=>s.cleanup({...stage,token:'wrong'}),/标识/);s.cleanup(stage);
});
function png(bits=8){const sig=Buffer.from('89504e470d0a1a0a','hex');function chunk(type,b){const x=Buffer.alloc(b.length+12);x.writeUInt32BE(b.length);x.write(type,4);b.copy(x,8);return x;}const h=Buffer.alloc(13);h.writeUInt32BE(32);h.writeUInt32BE(18,4);h[8]=bits;h[9]=6;return Buffer.concat([sig,chunk('IHDR',h),chunk('IDAT',Buffer.from([1])),chunk('IEND',Buffer.alloc(0))]);}
test('Metadata verification rejects truncation and depth mismatch',t=>{
 const f=path.join(root(t),'test.png');fs.writeFileSync(f,png(16));assert.equal(I.verify(f,{kind:'PNG',width:32,height:18,bits:16,alpha:true}).bits,16);
 assert.throws(()=>I.verify(f,{bits:8}),/参数不符/);fs.writeFileSync(f,png().subarray(0,40));assert.throws(()=>I.inspect(f),/截断|越界/);
});
function tiff(bits,little=true){
 const tags=[[256,4,1,32],[257,4,1,18],[258,3,1,bits],[259,3,1,1],[262,3,1,2],[273,4,1,0],[277,3,1,4],[278,4,1,18],[279,4,1,32*18*4*bits/8],[338,3,1,2],[339,3,1,bits===32?3:1]];
 const start=8+2+tags.length*12+4,b=Buffer.alloc(start+32*18*4*bits/8); b.write(little?'II':'MM');
 const w16=(v,o)=>little?b.writeUInt16LE(v,o):b.writeUInt16BE(v,o),w32=(v,o)=>little?b.writeUInt32LE(v,o):b.writeUInt32BE(v,o);
 w16(42,2);w32(8,4);w16(tags.length,8);tags[5][3]=start;tags.forEach((t,i)=>{const o=10+i*12;w16(t[0],o);w16(t[1],o+2);w32(t[2],o+4);(t[1]===3?w16:w32)(t[3],o+8);});return b;
}
for(const [bits,le] of [[8,true],[16,true],[16,false],[32,true]])test('TIFF metadata '+bits+' bits '+(le?'LE':'BE'),t=>{
 const file=path.join(root(t),'fixture.tif');fs.writeFileSync(file,tiff(bits,le));const expected={kind:'TIFF',width:32,height:18,bits,alpha:true,sampleType:bits===32?'float':'uint'};assert.equal(I.verify(file,expected).channels,4);
 fs.writeFileSync(file,tiff(bits,le).subarray(0,-1));assert.throws(()=>I.verify(file,expected),/截断/);
});
test('AE unspecified fourth channel gets template-specified alpha tag only',t=>{
 const file=path.join(root(t),'ae.tif'),bytes=tiff(8);const offset=10+9*12+8;bytes.writeUInt16LE(0,offset);fs.writeFileSync(file,bytes);
 assert.equal(I.normalizeTiffAlpha(file,{kind:'TIFF',alpha:true,color:'Premultiplied (Matted)'}),true);
 const out=fs.readFileSync(file);for(let i=0;i<bytes.length;i++)if(i!==offset)assert.equal(out[i],bytes[i]);assert.equal(I.verify(file,{kind:'TIFF',bits:8,alpha:true}).premultiplied,true);
 assert.equal(I.normalizeTiffAlpha(file,{kind:'TIFF',alpha:true,color:'Premultiplied (Matted)'}),false);
});

test('Preview waits for delayed complete PNG and times out incomplete writes',async t=>{
 const s=createStore(root(t)),stage=s.stage(),f=path.join(stage.directory,'preview.png');
 const writing=setTimeout(()=>fs.writeFileSync(f,png().subarray(0,40)),20);
 const complete=setTimeout(()=>fs.writeFileSync(f,png()),220);
 t.after(()=>{clearTimeout(writing);clearTimeout(complete);});
 await s.waitPreview(stage,f,2000);assert.equal(I.inspect(f).kind,'PNG');
 fs.writeFileSync(f,png().subarray(0,40));await assert.rejects(s.waitPreview(stage,f,200),/超时/);
});

test('Preview storage accepts both 8-bit and 16-bit native PNG and rejects unsupported depth',t=>{
 const s=createStore(root(t)),stage=s.stage(),f=path.join(stage.directory,'preview.png');
 for(const bits of [8,16]){fs.writeFileSync(f,png(bits));const saved=s.savePreview(stage,f,'preview'+bits);assert.equal(I.inspect(saved).bits,bits);assert.ok(s.imageUrl(saved).startsWith('data:image/png;base64,'));}
 fs.writeFileSync(f,png(32));assert.throws(()=>s.savePreview(stage,f,'bad'),/32/);
});
