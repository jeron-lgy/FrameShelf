const {test}=require('node:test'),assert=require('node:assert/strict');
const {createGate}=require('../extension/js/text-input.js');
function target(){const events={};return {value:'',activeElement:{tagName:'BODY'},addEventListener(n,fn){(events[n]||(events[n]=[])).push(fn);},emit(n,e={}){(events[n]||[]).forEach(fn=>fn(e));}};}
test('IME focus loss blocks polling and invalidates an in-flight response',()=>{
 const doc=target();let time=1000;const gate=createGate(doc,()=>time);const revision=gate.revision();
 doc.emit('compositionstart');doc.emit('focusout');time+=1000;
 assert.equal(gate.blocked(),true);assert.notEqual(gate.revision(),revision);
 doc.emit('compositionend');assert.equal(gate.blocked(),true);time+=351;assert.equal(gate.blocked(),false);
});
test('Chinese commits after final input, never persists intermediate pinyin',()=>{
 const doc=target(),input=target(),tasks=new Map(),saved=[];let id=0;
 const gate=createGate(doc,Date.now,fn=>{tasks.set(++id,fn);return id;},key=>tasks.delete(key));
 gate.bind(input,()=>saved.push(input.value));
 input.emit('compositionstart');input.value='xi';input.emit('input',{isComposing:true});assert.equal(tasks.size,0);
 input.emit('compositionend');assert.equal(saved.length,0);
 input.value='吸尘器';input.emit('input');for(const fn of tasks.values())fn();tasks.clear();assert.deepEqual(saved,['吸尘器']);
 input.emit('change');assert.equal(saved.length,1);
 input.value='洗地机';input.emit('input');input.emit('change');assert.deepEqual(saved,['吸尘器','洗地机']);
});
