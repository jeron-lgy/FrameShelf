const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs');
function host(){const ctx=vm.createContext({});vm.runInContext(`
var RQItemStatus={QUEUED:1,DONE:2,USER_STOPPED:3},GetSettingsFormat={STRING:1},PostRenderAction={NONE:0};
var fail='',rendered=[],restorationFail=false;
function File(p){this.fsName=p;this.name=p.split('/').pop();this.length=100;} File.decode=function(s){return s;};
function Folder(p){this.fsName=p;this.exists=true;}Folder.prototype.getFiles=function(){return [new File(this.fsName+'/frame_00000.tif')];};
function CompItem(id){this.id=id;this.width=64;this.height=36;this.pixelAspect=1;this.frameDuration=.04;this.duration=2;this.time=.4;this.displayStartFrame=0;this.workAreaStart=.2;this.workAreaDuration=1;this.name='浜у搧';this._layers=[{id:100,name:'A',solo:true,enabled:true},{id:101,name:'B',solo:false,enabled:true}];this.numLayers=2;}
CompItem.prototype.layer=function(i){return this._layers[i-1];};
var comp=new CompItem(1),items=[],om={file:new File('/user.tif'),applyTemplate:function(name){if(fail==='template')throw Error('template failure');},getSettings:function(){return {Format:'TIFF Sequence',Depth:'Trillions of Colors+',Channels:'RGB + Alpha',Color:'Straight',Resize:fail==='resize'?'true':'false',Crop:'false'};}};
function Item(c,original){this.comp=c;this.status=RQItemStatus.QUEUED;this.numOutputModules=1;this.original=original;this._render=true;}
Object.defineProperty(Item.prototype,'render',{get:function(){return this._render;},set:function(v){if(this.original&&v&&restorationFail)throw Error('restore failed');this._render=v;this.status=v?RQItemStatus.QUEUED:0;}});
Item.prototype.outputModule=function(){return om;};Item.prototype.setSettings=function(s){if(fail==='settings')throw Error('settings failure');if(s['Time Span']==='Work Area Only'){this.timeSpanStart=this.comp.workAreaStart;this.timeSpanDuration=this.comp.workAreaDuration;}};Item.prototype.remove=function(){items.splice(items.indexOf(this),1);};
var original=new Item(comp,true);items.push(original);
var queue={rendering:false,item:function(i){return items[i-1];},items:{add:function(c){var q=new Item(c,false);items.push(q);return q;}},render:function(){for(var i=0;i<items.length;i++)if(items[i].render){rendered.push(items[i].original?'original':'temporary');if(fail==='render')throw Error('render failure');items[i].status=fail==='cancel'?RQItemStatus.USER_STOPPED:RQItemStatus.DONE;}}};
Object.defineProperty(queue,'numItems',{get:function(){return items.length;}});
var app={version:'25.2',project:{file:new File('/project.aep'),activeItem:comp,numItems:1,item:function(){return comp;},renderQueue:queue,bitsPerChannel:16},preferences:{getPrefAsLong:function(){return 1;}},beginUndoGroup:function(){},endUndoGroup:function(){}};
`,ctx);vm.runInContext(fs.readFileSync('extension/host/main.jsx','utf8'),ctx);
function call(m,a={}){ctx.method=m;ctx.args=JSON.stringify(a);return JSON.parse(vm.runInContext('FrameShelf.dispatch(method,args)',ctx));}
const record=call('capture').data;record.layers[0].solo=false;record.layers[1].solo=true;return{ctx,call,record};}
for(const mode of ['', 'settings','template','resize','render','cancel'])test('Host restores layers and unrelated queue: '+(mode||'success'),()=>{
const h=host();h.ctx.fail=mode;const out=h.call('render',{record:h.record,template:'custom',directory:'/stage'});assert.equal(out.ok,!mode);assert.equal(h.ctx.comp.layer(1).solo,true);assert.equal(h.ctx.comp.layer(2).solo,false);assert.equal(h.ctx.original.render,true);assert.equal(h.ctx.items.length,1);assert.equal(h.ctx.comp.workAreaStart,.2);assert.equal(h.ctx.comp.workAreaDuration,1);assert.ok(!Array.from(h.ctx.rendered).includes('original'));if(mode==='cancel')assert.equal(out.cancelled,true);
});
test('Changed layer identity, aspect and frame ranges fail before any queue mutation',()=>{const h=host();for(const mutate of [r=>r.layers[0].id=999,r=>r.pixelAspect=2,r=>r.frameIndex=100]){const r=JSON.parse(JSON.stringify(h.record));mutate(r);assert.equal(h.call('render',{record:r}).ok,false);assert.equal(h.ctx.items.length,1);assert.equal(h.ctx.original.render,true);}});
test('Reordered layers use stable IDs; restore failure is separately recoverable',()=>{const h=host();h.ctx.comp._layers.reverse();assert.equal(h.call('render',{record:h.record,template:'custom',directory:'/stage'}).ok,true);h.ctx.restorationFail=true;const out=h.call('render',{record:h.record,template:'custom',directory:'/stage'});assert.equal(out.ok,false);assert.equal(out.needsRecovery,true);});

test('No undo group spans render, including render failures',()=>{for(const mode of ['', 'render']){const h=host();h.ctx.fail=mode;h.ctx.app.beginUndoGroup=()=>{throw Error('Undo group must not be opened');};h.ctx.app.endUndoGroup=()=>{throw Error('Undo group must not be closed');};const out=h.call('render',{record:h.record,template:'custom',directory:'/stage'});assert.equal(out.ok,!mode);if(mode)assert.match(out.error,/render failure/);}});
test('Direct preview never renders the queue and restores resolution/layers on success or failure',()=>{for(const fail of [false,true]){const h=host();h.ctx.comp.resolutionFactor=[2,2];h.ctx.File.prototype.exists=true;h.ctx.comp.saveFrameToPng=function(t,file){assert.equal(t,h.record.frameIndex*.04);if(fail)throw Error('preview failure');};h.ctx.app.project.renderQueue.render=function(){throw Error('Queue must not render');};const out=h.call('directPreview',{record:h.record,directory:'/preview'});assert.equal(out.ok,!fail);assert.deepEqual(Array.from(h.ctx.comp.resolutionFactor),[2,2]);assert.equal(h.ctx.comp.layer(1).solo,true);assert.equal(h.ctx.original.render,true);assert.equal(h.ctx.items.length,1);}});

test('Disabled layers reject solo writes: direct preview applies and restores safely',()=>{
 const h=host();vm.runInContext(`comp.resolutionFactor=[1,1];comp.saveFrameToPng=function(){};
 var layer=comp._layers[1],solo=false;layer.enabled=false;
 Object.defineProperty(layer,'solo',{get:function(){return solo;},set:function(v){if(!this.enabled)throw Error('disabled solo write');solo=v;}});`,h.ctx);
 h.record.layers[1].enabled=false;h.record.layers[1].solo=false;
 assert.equal(h.call('directPreview',{record:h.record,directory:'/stage'}).ok,true);
 h.record.layers[1].enabled=true;h.record.layers[1].solo=true;
 assert.equal(h.call('directPreview',{record:h.record,directory:'/stage'}).ok,true);
 assert.equal(vm.runInContext('comp.layer(2).enabled',h.ctx),false);
 assert.equal(vm.runInContext('comp.layer(2).solo',h.ctx),false);
});

test('Full-size PNG uses resolution 1 and restores resolution after extraction failure',()=>{for(const fail of [false,true]){const h=host();h.ctx.comp.width=15000;h.record.width=15000;h.ctx.comp.resolutionFactor=[4,4];h.ctx.comp.saveFrameToPng=function(){assert.deepEqual(Array.from(h.ctx.comp.resolutionFactor),[1,1]);if(fail)throw Error('png failure');};const out=h.call('directPng',{record:h.record,directory:'/stage'});assert.equal(out.ok,!fail);assert.deepEqual(Array.from(h.ctx.comp.resolutionFactor),[4,4]);assert.equal(h.ctx.comp.layer(1).solo,true);assert.equal(h.ctx.items.length,1);}});

test('Output path readback corruption stops before render and returns diagnostics',()=>{const h=host();vm.runInContext(`Object.defineProperty(om,'file',{get:function(){return new File('/corrupted/frame.tif');},set:function(){}});`,h.ctx);const out=h.call('render',{record:h.record,template:'custom',directory:'/中文/stage'});assert.equal(out.ok,false);assert.match(out.error,/回读路径/);assert.equal(out.diagnostics.requestedDirectory,'/中文/stage');assert.equal(out.diagnostics.assignedOutput,'/corrupted/frame.tif');assert.equal(h.ctx.rendered.length,0);assert.equal(h.ctx.items.length,1);});
