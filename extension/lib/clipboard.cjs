'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const images = require('./images.cjs');

function copyPngFile(file) {
  if (process.platform !== 'win32') return Promise.reject(new Error('文件剪贴板目前仅支持 Windows。'));
  const absolute = fs.realpathSync(file);
  images.verify(absolute, { kind: 'PNG', alpha: true });
  // Pass the path as data, never interpolate it into executable PowerShell text.
  return new Promise((resolve, reject) => {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    execFile(executable, ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'copy-png.ps1')], {
      windowsHide: true, timeout: 15000,
      env: Object.assign({}, process.env, { FRAMESHELF_PNG_FILE: absolute })
    }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim()));
      else resolve(absolute);
    });
  });
}
module.exports = { copyPngFile };
