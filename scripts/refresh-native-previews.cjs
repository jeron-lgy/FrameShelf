// Developer repair utility: render existing records through the current host adapter,
// then merge only successful thumbnail fields into the latest on-disk session.
const fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process');
const {createStore}=require('../extension/lib/files.cjs');
const root=path.join(process.env.APPDATA,'FrameShelf'),store=createStore(root);
const sessions=fs.readdirSync(root).filter(n=>n.endsWith('.json')).map(n=>{try{return JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));}catch(_){return null;}}).filter(d=>d&&d.projectKey&&Array.isArray(d.records)&&d.records.length);
if(sessions.length!==1)throw Error('Expected exactly one stored project; select one explicitly before using this developer utility.');
const session=sessions[0],dir=fs.mkdtempSync(path.join(os.tmpdir(),'FrameShelf-previews-'));
const jobs=session.records.map(record=>({record,stage:store.stage()}));
fs.copyFileSync(path.join(__dirname,'../extension/host/main.jsx'),path.join(dir,'host.jsx'));
fs.writeFileSync(path.join(dir,'jobs.json'),JSON.stringify(jobs),'utf8');
const jsx=`(function(){app.beginSuppressDialogs();var root=new File($.fileName).parent.fsName;$.evalFile(new File(root+'/host.jsx'));var f=new File(root+'/jobs.json');f.encoding='UTF-8';f.open('r');var jobs=eval('('+f.read()+')');f.close();var outputs=[];try{for(var i=0;i<jobs.length;i++){var j=jobs[i];var result=eval('('+FrameShelf.dispatch('render',FrameShelf.stringify({record:j.record,template:'PNG',directory:j.stage.directory,preview:true}))+')');outputs.push({id:j.record.id,result:result});if(!result.ok)break;}}finally{app.endSuppressDialogs(false);var report=new File(root+'/report.json');report.encoding='UTF-8';report.open('w');report.write(FrameShelf.stringify(outputs));report.close();}}());`;
fs.writeFileSync(path.join(dir,'run.jsx'),'\uFEFF'+jsx,'utf8');
fs.writeFileSync(path.join(dir,'context.json'),JSON.stringify({projectKey:session.projectKey,jobs}));
fs.writeFileSync('.test-output/preview-repair-root.txt',dir);
spawnSync('C:/Program Files/Adobe/Adobe After Effects 2025/Support Files/AfterFX.com',['-r',path.join(dir,'run.jsx')],{windowsHide:true});
console.log('Started preview repair; report directory: '+dir);
