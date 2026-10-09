(function (root, factory) {
  var api = factory();
  if (typeof window !== 'undefined') window.FrameShelfCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  function filename(pattern, product, context) {
    context = context || {};
    var d = context.date || new Date(), pad = function (v) { return String(v).padStart(2, '0'); };
    var tokens = { YYYY: String(d.getFullYear()), YY: pad(d.getFullYear() % 100), MM: pad(d.getMonth() + 1), DD: pad(d.getDate()), hh: pad(d.getHours()), mm: pad(d.getMinutes()), ss: pad(d.getSeconds()) };
    var original = String(pattern);
    pattern = original.replace(/\$([A-Za-z]+)/g, function (all, key) { if (!Object.prototype.hasOwnProperty.call(tokens, key)) throw new Error('未知通配符：' + all); return tokens[key]; });
    pattern = pattern.replace(/\{([^{}]+)\}/g, function (all, key) { if (key === '产品名') return all; if (!context.fields || !Object.prototype.hasOwnProperty.call(context.fields, key)) throw new Error('未定义名称字段：' + key); return String(context.fields[key]); });
    var name = String(pattern).replace(/\{产品名\}/g, String(product || '').trim()).trim();
    if (!name || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name)) {
      throw new Error('名称不能为空，且不能含 Windows 禁用字符或以点/空格结尾：' + name);
    }
    if (/[{}]/.test(name)) throw new Error('仅支持 {产品名} 变量：' + name);
    if (String(pattern).indexOf('{产品名}') >= 0 && !String(product || '').trim()) throw new Error('请先填写产品名称。');
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) throw new Error('Windows 保留名称：' + name);
    if (name.length > 160) throw new Error('文件名过长，请缩短至 160 个字符以内。');
    return name;
  }
  function defaults() {
    return {
      version: 2, presets: [{ id: 'starter', name: '产品交付 · 三张', slots: ['{产品名}_Prouduct', '{产品名}_Final', '{产品名}_BG'] }],
      settings: { outputTemplate: '', outputDir: '', autoPreview: true, conflict: 'rename', previewTemplate: '' }
    };
  }
  function newSession(projectKey) {
    return { version: 2, projectKey: projectKey, records: [], slots: [], product: '', presetId: 'starter', history: [] };
  }
  function sessionKey(projectKey, compId) { return 'composition:' + JSON.stringify([projectKey, compId]); }
  function compositionSession(projectKey, compId, compName, legacy, preset) {
    var result = newSession(projectKey); result.version = 3; result.compId = compId; result.compName = compName;
    var records = legacy && legacy.records.filter(function (r) { return r.compId === compId; });
    if (records && records.length) {
      result.records = JSON.parse(JSON.stringify(records)); result.product = legacy.product; result.presetId = legacy.presetId;
      result.fields = Object.assign({}, legacy.fields || {});
      var ids = records.map(function (r) { return r.id; });
      result.slots = JSON.parse(JSON.stringify(legacy.slots.filter(function (s) { return !s.recordId || ids.indexOf(s.recordId) >= 0; })));
      var slots = result.slots.map(function (s) { return s.id; });
      result.history = JSON.parse(JSON.stringify(legacy.history.filter(function (h) { return slots.indexOf(h.slotId) >= 0; })));
    } else if (preset) applyPreset(result, preset);
    return result;
  }
  function applyPreset(session, preset) {
    session.presetId = preset.id;
    session.fields = Object.assign({}, preset.fields || {});
    session.slots = preset.slots.map(function (name,i) { return { id: uid(), pattern: name, recordId: null, selected: true, values: Object.assign({},preset.values && preset.values[i] || {}) }; });
    delete session.naming; if (preset.naming) { session.naming = JSON.parse(JSON.stringify(preset.naming)); session.product = preset.product || ''; }
  }
  function buildPlan(session, profile) {
    if (!profile || !profile.supported || !profile.ext) throw new Error('请选择有效的 AE 静帧输出模板。');
    var selected = session.slots.filter(function (slot) { return slot.selected !== false; });
    if (!selected.length) throw new Error('请至少勾选一个命名槽位。');
    var seen = Object.create(null), batchDate = new Date();
    return selected.map(function (slot) {
      var record = session.records.find(function (item) { return item.id === slot.recordId; });
      if (!record) throw new Error('请为「' + slot.pattern + '」分配组合，或取消勾选该槽位。');
      if (session.compId != null && record.compId !== session.compId) throw new Error('组合属于其他合成，不能在当前合成导出。');
      if (record.projectKey !== session.projectKey) throw new Error('组合属于其他工程，请重新记录。');
      var name = slotFilename(session, slot, batchDate) + profile.ext;
      var key = name.toLowerCase();
      if (seen[key]) throw new Error('输出名称重复：' + name);
      seen[key] = true;
      return { slotId: slot.id, record: JSON.parse(JSON.stringify(record)), filename: name, profile: JSON.parse(JSON.stringify(profile)) };
    });
  }
  function chooseAvailable(name, exists) {
    if (!exists(name)) return name;
    var dot = name.lastIndexOf('.'), base = dot < 0 ? name : name.slice(0, dot), ext = dot < 0 ? '' : name.slice(dot);
    for (var i = 1; i < 100000; i++) {
      var candidate = base + '_' + String(i).padStart(2, '0') + ext;
      if (!exists(candidate)) return candidate;
    }
    throw new Error('同名文件过多，请更换输出目录。');
  }
  function assign(session, slotId, recordId) {
    var slot = session.slots.find(function (s) { return s.id === slotId; });
    if (!slot) throw new Error('命名槽位已不存在。');
    if (recordId && !session.records.some(function (r) { return r.id === recordId; })) throw new Error('组合已不存在。');
    slot.recordId = recordId || null;
  }
  function ensureNaming(session) {
    if (session.naming) return;
    session.legacyNaming = JSON.parse(JSON.stringify({ product: session.product, fields: session.fields, slots: session.slots }));
    var parts = session.slots.map(function (s) { return s.pattern.split('_'); });
    var uniform = parts.length && parts.every(function (p) { return p.length === parts[0].length; });
    session.naming = { separator: uniform ? '_' : '', fields: [] };
    session.slots.forEach(function (s) { s.values = {}; });
    var count = uniform ? parts[0].length : 1;
    for (var i = 0; i < count; i++) {
      var values = session.slots.map(function (s, n) { return uniform ? parts[n][i] : s.pattern; });
      var same = values.length && values.every(function (v) { return v === values[0]; });
      var raw = values[0] || '', field = { id: uid(), type: 'custom', label: '自定义名字', value: '' };
      if (same && raw === '{产品名}') { field.type = 'fixed'; field.label = '产品名'; field.value = session.product || ''; }
      else if (same && /^\{[^{}]+\}$/.test(raw) && session.fields && Object.prototype.hasOwnProperty.call(session.fields,raw.slice(1,-1))) { field.type='fixed'; field.label=raw.slice(1,-1); field.value=session.fields[field.label]; }
      else if (same && /^([\$](YYYY|YY|MM|DD|hh|mm|ss))+$/.test(raw)) { field.type='wildcard'; field.label='日期时间'; field.value=raw; }
      else if (same && !/[{$]/.test(raw)) { field.type='fixed'; field.label='固定名称'; field.value=raw; }
      else { field.legacy = values.some(function (v) { return /[{$]/.test(v); }); session.slots.forEach(function (s,n) { s.values[field.id]=values[n]; }); }
      session.naming.fields.push(field);
    }
  }
  function slotFilename(session, slot, date) {
    if (!session.naming) return filename(slot.pattern, session.product, { fields: session.fields, date: date });
    if (typeof session.naming.separator !== 'string' || session.naming.separator.length > 10) throw new Error('字段分隔符最多 10 个字符');
    var parts = session.naming.fields.map(function (f) {
      if (f.type === 'wildcard') { if (!/^(?:\$(?:YYYY|YY|MM|DD|hh|mm|ss)|[^$A-Za-z])+$/.test(f.value)) throw new Error('通配符请使用 $YYYY、$MM、$DD、$hh、$mm、$ss'); return filename(f.value, '', { date: date }); }
      var value = f.type === 'fixed' ? f.value : ((slot.values || {})[f.id] || '');
      return f.legacy && value ? filename(value, session.product, { fields: session.fields, date: date }) : value;
    });
    var name = parts.join(session.naming.separator);
    if (!name.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name) || name.length > 160) throw new Error('文件名为空、过长或含 Windows 禁用字符');
    return name;
  }
  function moveField(session, id, targetIndex) {
    var fields=session.naming.fields, index=fields.findIndex(function(f){return f.id===id;});
    if(index<0) return;
    var field=fields.splice(index,1)[0]; fields.splice(Math.max(0,Math.min(fields.length,targetIndex)),0,field);
  }
  function namingPreset(session, id, name) { return { id:id, name:name, slots:session.slots.map(function(s){return s.pattern;}), fields:Object.assign({},session.fields||{}), product:session.product, naming:JSON.parse(JSON.stringify(session.naming)), values:session.slots.map(function(s){return Object.assign({},s.values||{});}) }; }
  function addField(session, name, value, targetId) {
    name = String(name || '').trim(); value = String(value || '').trim();
    if (!name || /[{}$]/.test(name) || ['产品名','__proto__','constructor','prototype'].indexOf(name) >= 0) throw new Error('字段名称无效或保留');
    if (!value) throw new Error('请填写字段内容。');
    var fields = session.fields || {};
    if (Object.prototype.hasOwnProperty.call(fields, name)) throw new Error('字段已存在');
    var targets = targetId === 'all' ? session.slots : session.slots.filter(function (s) { return s.id === targetId; });
    if (!targets.length) throw new Error('请先添加或选择输出名称。');
    session.fields = fields; fields[name] = value;
    targets.forEach(function (s) { s.pattern += (s.pattern && !/[_-]$/.test(s.pattern) ? '_' : '') + '{' + name + '}'; });
  }
  function updateRecord(session, id, captured) {
    var index = session.records.findIndex(function (r) { return r.id === id; });
    if (index < 0) throw new Error('组合已不存在。');
    var old = session.records[index];
    if (old.projectKey !== captured.projectKey || old.compId !== captured.compId) throw new Error('请先激活此组合的源合成：' + old.compName);
    var record = Object.assign({}, captured, { id: old.id, label: old.label });
    session.records[index] = record;
    return record;
  }
  function mergeSession(local, stored, role) {
    if (!stored) return local;
    if (local.projectKey !== stored.projectKey || local.compId !== stored.compId) throw new Error('不能合并不同合成的数据。');
    var merged = Object.assign({}, role === 'capture' ? stored : local);
    merged.deletedRecordIds = Array.from(new Set((stored.deletedRecordIds || []).concat(local.deletedRecordIds || [])));
    merged.records = (role === 'capture' ? local.records : stored.records).filter(function(r){return merged.deletedRecordIds.indexOf(r.id)<0;});
    var ids = merged.records.map(function (r) { return r.id; });
    merged.slots = (merged.slots || []).map(function (slot) { return Object.assign({}, slot, { recordId: ids.indexOf(slot.recordId) >= 0 ? slot.recordId : null }); });
    return merged;
  }
  return { ensureNaming: ensureNaming, slotFilename: slotFilename, moveField: moveField, namingPreset: namingPreset, addField: addField, sessionKey: sessionKey, compositionSession: compositionSession, updateRecord: updateRecord, mergeSession: mergeSession, uid: uid, filename: filename, defaults: defaults, newSession: newSession, applyPreset: applyPreset,
    buildPlan: buildPlan, chooseAvailable: chooseAvailable, assign: assign };
}));
