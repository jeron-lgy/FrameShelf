const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
test('CEP script is ASCII-only and Unicode, percent, quotes and backslashes round-trip',async()=>{
 const args={directory:'D:\\中文😀\\100%\\引号"目录',template:'中文模板'};
 let transmitted;
 const window={__adobe_cep__:{evalScript(script,callback){transmitted=script;vm.runInNewContext(script,{FrameShelf:{dispatch(method,json){assert.equal(method,'render');assert.deepEqual(JSON.parse(json),args);}}});callback('{"ok":true,"data":true}');}}};
 vm.runInNewContext(fs.readFileSync('extension/js/bridge.js','utf8'),{window,Promise,JSON});
 assert.equal(await window.FrameShelfBridge.call('render',args),true);
 assert.match(transmitted,/^[\x00-\x7f]*$/);
});

