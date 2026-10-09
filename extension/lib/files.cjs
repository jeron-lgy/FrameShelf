'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const images = require('./images.cjs');
const core = require('../js/core.js');
function createStore(root) {
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(root, 'previews'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scratch'), { recursive: true });
  const digest = name => crypto.createHash('sha256').update(name, 'utf8').digest('hex').slice(0, 32);
  const fileFor = name => path.join(root, digest(name) + '.json');
  function activeLock(name) {
    const file = path.join(root, name + '.lock');
    if (!fs.existsSync(file)) return false;
    let owner;
    try { owner = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return true; }
    try { process.kill(owner.pid, 0); return true; }
    catch (e) { if (e.code !== 'ESRCH') return true; }
    // A process which has exited cannot still be rendering or writing this store.
    if (fs.readFileSync(file, 'utf8') === JSON.stringify(owner)) fs.unlinkSync(file);
    return fs.existsSync(file);
  }
  function acquireLock(name) {
    activeLock(name);
    const file = path.join(root, name + '.lock'), token = crypto.randomBytes(12).toString('hex');
    try { fs.writeFileSync(file, JSON.stringify({ pid: process.pid, token }), { flag: 'wx', encoding: 'utf8' }); }
    catch (e) { if (e.code === 'EEXIST') throw new Error(name === 'render' ? '另一个 Frame Shelf 窗口正在渲染，请等待完成。' : '另一窗口正在保存，请稍后重试。'); throw e; }
    return function () { const owner = JSON.parse(fs.readFileSync(file, 'utf8')); if (owner.token !== token) throw new Error('任务锁归属异常。'); fs.unlinkSync(file); };
  }
  function withStateLock(work) { const release = acquireLock('state'); try { return work(); } finally { release(); } }
  function read(name, fallback) {
    const file = fileFor(name);
    if (!fs.existsSync(file)) return fallback;
    try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
    catch (error) { throw new Error('记录文件损坏，原文件已保留：' + file); }
  }
  function write(name, value) {
    const file = fileFor(name), temp = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    const fd = fs.openSync(temp, 'wx');
    try { fs.writeFileSync(fd, JSON.stringify(value, null, 2), 'utf8'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    try { fs.renameSync(temp, file); }
    catch (e) { if (fs.existsSync(temp)) fs.unlinkSync(temp); throw e; }
  }
  function stage(outputDirectory) {
    const parent = fs.realpathSync(outputDirectory || path.join(root, 'scratch'));
    if (!fs.statSync(parent).isDirectory()) throw new Error('输出位置不是文件夹。');
    const directory = fs.mkdtempSync(path.join(parent, '.frameshelf-'));
    const token = crypto.randomBytes(12).toString('hex');
    fs.writeFileSync(path.join(directory, 'owner.json'), JSON.stringify({ token, parent }), { encoding: 'utf8', flag: 'wx' });
    return { directory, parent, token };
  }
  function assertStage(job, file) {
    const real = fs.realpathSync(job.directory);
    if (real !== path.resolve(job.directory) || path.dirname(real) !== job.parent || !path.basename(real).startsWith('.frameshelf-')) throw new Error('临时目录归属不符。');
    const owner = JSON.parse(fs.readFileSync(path.join(real, 'owner.json'), 'utf8'));
    if (owner.token !== job.token || owner.parent !== job.parent) throw new Error('临时目录标识不符。');
    if (file && (path.dirname(fs.realpathSync(file)) !== real || fs.lstatSync(file).isSymbolicLink())) throw new Error('输出文件不在本次临时目录内。');
    return real;
  }
  function cleanup(job) {
    const real = assertStage(job);
    for (const entry of fs.readdirSync(real, { withFileTypes: true })) if (!entry.isFile()) throw new Error('临时目录中出现意外子目录，已保留供检查。');
    for (const name of fs.readdirSync(real)) fs.unlinkSync(path.join(real, name));
    fs.rmdirSync(real);
  }
  function publish(job, source, filename, policy) {
    assertStage(job, source);
    if (path.basename(filename) !== filename) throw new Error('最终名称必须是文件名。');
    core.filename(filename, '');
    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = policy === 'rename' ? core.chooseAvailable(filename, name => fs.existsSync(path.join(job.parent, name))) : filename;
      const target = path.join(job.parent, candidate);
      if (target.length > 240) throw new Error('输出路径过长，请缩短目录或文件名。');
      try {
        fs.linkSync(source, target);
        return { path: target, filename: candidate, bytes: fs.statSync(target).size };
      } catch (error) {
        if (error.code === 'EEXIST' && policy === 'rename') continue;
        if (error.code === 'EEXIST') throw new Error('同名文件已存在：' + candidate);
        throw new Error('无法安全提交输出（' + error.code + '）。请选择支持硬链接的本地 NTFS 目录。原图保留在 ' + source);
      }
    }
    throw new Error('输出名称持续冲突，请更换目录。');
  }
  function availableNames(directory, plan, policy) {
    if (!directory || !fs.statSync(directory).isDirectory()) throw new Error('请选择可用输出目录。');
    const seen = new Set();
    return plan.map(job => {
      const exists = name => seen.has(name.toLowerCase()) || fs.existsSync(path.join(directory, name));
      const filename = policy === 'rename' ? core.chooseAvailable(job.filename, exists) : job.filename;
      if (exists(filename)) throw new Error('已存在同名文件：' + filename);
      seen.add(filename.toLowerCase());
      return Object.assign({}, job, { filename });
    });
  }
  async function waitPreview(job, source, timeoutMs = 60000) {
    assertStage(job);
    if (path.dirname(path.resolve(source)) !== path.resolve(job.directory)) throw new Error('预览文件不在本次临时目录内。');
    const deadline = Date.now() + timeoutMs;
    let previous = '';
    while (Date.now() < deadline) {
      try {
        assertStage(job, source);
        const info = images.inspect(source), stat = fs.statSync(source);
        if (info.kind !== 'PNG') throw new Error('预览不是 PNG。');
        const stamp = stat.size + ':' + stat.mtimeMs;
        if (stamp === previous) return;
        previous = stamp;
      } catch (_) { previous = ''; }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error('等待 AE 预览文件超时；组合已保留，可稍后重试预览。');
  }
  function savePreview(job, source, recordId) {
    assertStage(job, source);
    const info = images.inspect(source);
    if (info.kind !== 'PNG' || (info.bits !== 8 && info.bits !== 16) || Math.max(info.width, info.height) > 1600 || fs.statSync(source).size > 16 * 1024 * 1024) throw new Error('预览图片超出限制：' + info.kind + ' / ' + info.bits + ' 位 / ' + info.width + '×' + info.height + ' / ' + fs.statSync(source).size + ' 字节。');
    const target = path.join(root, 'previews', digest(recordId) + '.png');
    fs.copyFileSync(source, target);
    return target;
  }
  function validateDirectory(value) {
    const directory = String(value || '').trim().replace(/^"(.*)"$/, '$1');
    if (!path.isAbsolute(directory)) throw new Error('请输入完整文件夹路径。');
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) throw new Error('文件夹不存在，请检查路径。');
    return path.normalize(directory);
  }
  function imageUrl(file) {
    if (!file || !fs.existsSync(file)) return '';
    const real = fs.realpathSync(file), previewRoot = fs.realpathSync(path.join(root, 'previews'));
    if (path.dirname(real) !== previewRoot || fs.statSync(real).size > 16 * 1024 * 1024) return '';
    return 'data:image/png;base64,' + fs.readFileSync(real).toString('base64');
  }
  return { root, native: true, read, write, stage, cleanup, publish, availableNames, validateDirectory, waitPreview, savePreview, imageUrl, verify: images.verify,
    normalizeOutput: (job, file, profile) => { assertStage(job, file); return images.normalizeTiffAlpha(file, profile); },
    withStateLock, acquireJob: () => acquireLock('render'), jobActive: () => activeLock('render') };
}
module.exports = { createStore };
