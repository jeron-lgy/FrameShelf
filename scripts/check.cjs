'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let count = 0;
function walk(dir) { for (const e of fs.readdirSync(dir, {withFileTypes:true})) { const f = path.join(dir,e.name); if (e.isDirectory()) walk(f); else if (/\.(?:js|cjs|jsx)$/.test(f)) { new vm.Script(fs.readFileSync(f,'utf8'),{filename:f}); count++; } } }
walk('extension'); walk('scripts');
const html = fs.readFileSync('extension/index.html','utf8');
for (const m of html.matchAll(/(?:src|href)="((?:js|css)\/[^"#]+)"/g)) if (!fs.existsSync(path.join('extension',m[1]))) throw new Error('Missing '+m[1]);
console.log('Syntax and entry paths checked: '+count+' scripts');
