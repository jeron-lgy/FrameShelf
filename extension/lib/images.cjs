'use strict';
const fs = require('fs');
function inspect(file) {
  const fd = fs.openSync(file, 'r'), size = fs.fstatSync(fd).size;
  function read(offset, length) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > size || length > 4 * 1024 * 1024) throw new Error('图片数据越界或文件被截断。');
    const buffer = Buffer.alloc(length);
    if (fs.readSync(fd, buffer, 0, length, offset) !== length) throw new Error('图片读取不完整。');
    return buffer;
  }
  try {
    const signature = read(0, 8);
    if (signature.toString('hex') === '89504e470d0a1a0a') return png(read, size);
    if (signature.slice(0, 2).toString() === 'II' || signature.slice(0, 2).toString() === 'MM') return tiff(read, size, signature);
    if (signature.readUInt16BE(0) === 0xffd8) return jpeg(read, size);
    throw new Error('无法识别图片格式。');
  } finally { fs.closeSync(fd); }
}
function png(read, size) {
  let offset = 8, info, idat = false, ended = false;
  while (offset < size) {
    const head = read(offset, 8), length = head.readUInt32BE(0), type = head.slice(4).toString('ascii');
    if (offset + 12 + length > size) throw new Error('PNG 数据块被截断。');
    if (!info && type !== 'IHDR') throw new Error('PNG 缺少首个 IHDR。');
    if (type === 'IHDR') {
      if (info || length !== 13) throw new Error('PNG IHDR 无效。');
      const b = read(offset + 8, 13), color = b[9];
      info = { kind: 'PNG', width: b.readUInt32BE(0), height: b.readUInt32BE(4), bits: b[8], alpha: color === 4 || color === 6,
        channels: { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color], sampleType: 'uint' };
    }
    if (type === 'tRNS') info.alpha = true;
    if (type === 'IDAT' && length > 0) idat = true;
    if (type === 'IEND') { if (length !== 0) throw new Error('PNG IEND 无效。'); ended = true; break; }
    offset += length + 12;
  }
  if (!ended || !idat || !info.width || !info.height || !info.channels) throw new Error('PNG 结构不完整。');
  return info;
}
function tiff(read, size, head) {
  const le = head.slice(0, 2).toString() === 'II';
  const u16 = (b, o) => le ? b.readUInt16LE(o) : b.readUInt16BE(o);
  const u32 = (b, o) => le ? b.readUInt32LE(o) : b.readUInt32BE(o);
  if (u16(head, 2) !== 42) throw new Error('只支持标准 TIFF（当前尺寸不需要 BigTIFF）。');
  const offset = u32(head, 4), count = u16(read(offset, 2), 0);
  if (count < 1 || count > 4096) throw new Error('TIFF 标签数量异常。');
  const table = read(offset + 2, count * 12 + 4), tags = {};
  const wanted = new Set([256, 257, 258, 259, 262, 273, 277, 279, 284, 324, 325, 338, 339]);
  for (let i = 0; i < count; i++) {
    const o = i * 12, tag = u16(table, o);
    if (!wanted.has(tag)) continue;
    const type = u16(table, o + 2), n = u32(table, o + 4), bytes = { 1: 1, 3: 2, 4: 4 }[type];
    if (!bytes || n < 1 || n > 100000) throw new Error('TIFF 标签类型或长度异常。');
    const values = n * bytes <= 4 ? table.slice(o + 8, o + 12) : read(u32(table, o + 8), n * bytes);
    tags[tag] = [];
    for (let j = 0; j < n; j++) tags[tag].push(bytes === 1 ? values[j] : bytes === 2 ? u16(values, j * 2) : u32(values, j * 4));
  }
  if (u32(table, count * 12) !== 0) throw new Error('输出为多页 TIFF；当前任务要求单帧图片。');
  const scalar = (tag, fallback) => tags[tag] ? tags[tag][0] : fallback;
  const offsets = tags[273] || tags[324], lengths = tags[279] || tags[325];
  if (!offsets || !lengths || offsets.length !== lengths.length) throw new Error('TIFF 缺少像素块索引。');
  for (let i = 0; i < offsets.length; i++) if (!lengths[i] || offsets[i] < 8 || offsets[i] + lengths[i] > size) throw new Error('TIFF 像素块被截断。');
  const bits = tags[258] || [1], sample = tags[339] || [1];
  if (bits.some(b => b !== bits[0]) || sample.some(s => s !== sample[0])) throw new Error('不支持不同通道使用不同位深。');
  return { kind: 'TIFF', width: scalar(256, 0), height: scalar(257, 0), bits: bits[0], channels: scalar(277, 1),
    alpha: (tags[338] || []).some(v => v === 1 || v === 2), premultiplied: (tags[338] || []).includes(1),
    sampleType: sample[0] === 1 ? 'uint' : sample[0] === 3 ? 'float' : 'int', photometric: scalar(262, -1), compression: scalar(259, 1) };
}
function jpeg(read, size) {
  if (read(size - 2, 2).readUInt16BE(0) !== 0xffd9) throw new Error('JPEG 缺少结束标记。');
  let offset = 2, info;
  while (offset < size - 2) {
    if (read(offset++, 1)[0] !== 255) throw new Error('JPEG 标记无效。');
    let marker = read(offset++, 1)[0];
    while (marker === 255) marker = read(offset++, 1)[0];
    if (marker === 218 || marker === 217) break;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    const length = read(offset, 2).readUInt16BE(0);
    if (length < 2 || offset + length > size) throw new Error('JPEG 数据块被截断。');
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      const b = read(offset + 2, 6);
      info = { kind: 'JPEG', bits: b[0], height: b.readUInt16BE(1), width: b.readUInt16BE(3), channels: b[5], alpha: false, sampleType: 'uint' };
    }
    offset += length;
  }
  if (!info || !info.width || !info.height) throw new Error('JPEG 尺寸信息缺失。');
  return info;
}
function verify(file, expected) {
  const info = inspect(file);
  for (const key of ['kind', 'width', 'height', 'bits', 'alpha']) {
    if (expected[key] !== undefined && info[key] !== expected[key]) throw new Error('输出参数不符：' + key + ' 实际 ' + info[key] + '，需要 ' + expected[key] + '。');
  }
  if (info.sampleType !== (expected.sampleType || 'uint')) throw new Error('输出像素数据类型与模板不符。');
  if (info.kind === 'TIFF' && info.photometric !== 2) throw new Error('TIFF 不是 RGB 图像。');
  if (info.channels !== (info.alpha ? 4 : 3)) throw new Error('输出通道不是预期的 RGB / RGBA。');
  return info;
}
function normalizeTiffAlpha(file, profile) {
  if (profile.kind !== 'TIFF' || !profile.alpha) return false;
  const info = inspect(file);
  if (info.kind !== 'TIFF' || info.channels !== 4 || info.photometric !== 2 || info.alpha) return false;
  let tagValue;
  if (profile.color === 'Premultiplied (Matted)') tagValue = 1;
  else if (profile.color === 'Straight (Unmatted)') tagValue = 2;
  else throw new Error('TIFF 的第四通道没有 Alpha 标记，且模板未提供可识别的 Alpha 类型。');
  const fd = fs.openSync(file, 'r+');
  try {
    const h = Buffer.alloc(8); fs.readSync(fd, h, 0, 8, 0);
    const le = h.toString('ascii', 0, 2) === 'II';
    const u16 = (b,o) => le ? b.readUInt16LE(o) : b.readUInt16BE(o);
    const u32 = (b,o) => le ? b.readUInt32LE(o) : b.readUInt32BE(o);
    const ifd = u32(h,4), countBuffer = Buffer.alloc(2); fs.readSync(fd,countBuffer,0,2,ifd);
    const count = u16(countBuffer,0), row = Buffer.alloc(12);
    for (let i=0;i<count;i++) {
      const pos = ifd+2+i*12; fs.readSync(fd,row,0,12,pos);
      if (u16(row,0) !== 338) continue;
      if (u16(row,2) !== 3 || u32(row,4) !== 1 || u16(row,8) !== 0) throw new Error('TIFF 额外通道标签不符合已知的 AE 输出结构。');
      const value=Buffer.alloc(2); if(le)value.writeUInt16LE(tagValue);else value.writeUInt16BE(tagValue);
      fs.writeSync(fd,value,0,2,pos+8); fs.fsyncSync(fd); return true;
    }
    throw new Error('TIFF 缺少 ExtraSamples 标签，无法安全标记 Alpha。');
  } finally { fs.closeSync(fd); }
}
module.exports = { inspect, verify, normalizeTiffAlpha };
