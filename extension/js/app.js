(function () {
  'use strict';
  var exportWindow = window.__adobe_cep__ ? window.__adobe_cep__.getExtensionId() === 'com.frameshelf.ae.exportpanel' : new URLSearchParams(location.search).get('window') === 'export';
  document.body.classList.add(exportWindow ? 'export-window' : 'capture-window');
  var popup = null, projectMode = false;
  function projectScope() { return exportWindow && projectMode; }
  function refreshProject(value) { return C.refreshProjectRecords(value, S.compositionSessions(value.projectKey), S.read('session:' + value.projectKey, null)); }
  var C = window.FrameShelfCore, B = window.FrameShelfBridge, S = window.FrameShelfStorage;
  var $ = function (id) { return document.getElementById(id); }, config, session, profiles = [], busy = false, info, accept;
  function node(tag, text, cls) { var n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
  var inputGate = window.FrameShelfTextInput.createGate(document);
  function bindText(input, save) { inputGate.bind(input, function () { try { save(); } catch (e) { notice(e.message, true); } }); }
  function button(text, fn) { var b = node('button', text, 'quiet'); b.type = 'button'; b.onclick = guard(fn); return b; }
  var noticeTimer;
  function notice(text, error) { clearTimeout(noticeTimer); if (text && !error) noticeTimer = setTimeout(function () { $('notice').hidden = true; }, 4500); $('notice').hidden = !text; $('notice').textContent = text || ''; $('notice').className = error ? 'warning' : ''; }
  function guard(fn) { return async function (event) { if (busy) return; lock(true); try { await fn(event); } catch (e) { notice(e.message, true); checkRecovery(); } finally { lock(false); } }; }
  function persistUnlocked() {
    if (exportWindow) S.write('config', config);
    else { var current = S.read('config', null); if (!current) S.write('config', config); else { if (!current.settings.previewTemplate && config.settings.previewTemplate) { current.settings.previewTemplate = config.settings.previewTemplate; S.write('config', current); } config = current; } }
    if (session && session.scope === 'project') {
      refreshProject(session);
      S.write(C.projectSessionKey(session.projectKey), Object.assign({}, session, { records: [] }));
      return;
    }
    if (session && session.compId != null) { session = C.mergeSession(session, S.read(C.sessionKey(session.projectKey, session.compId), null), exportWindow ? 'export' : 'capture'); S.write(C.sessionKey(session.projectKey, session.compId), session); }
  }
  function persist() { return S.withStateLock ? S.withStateLock(persistUnlocked) : persistUnlocked(); }
  function openExport() {
    if (exportWindow) { page('board'); return; }
    if (window.__adobe_cep__) window.__adobe_cep__.requestOpenExtension('com.frameshelf.ae.exportpanel', '');
    else { popup = window.open('index.html?window=export', 'frameshelf-export', 'width=1280,height=800,resizable=yes'); if (!popup) throw new Error('浏览器拦截了弹出窗口，请允许此页面打开窗口。'); popup.focus(); }
  }
  function lock(value) { busy = value; document.body.classList.toggle('busy', value); document.querySelectorAll('button,input,select').forEach(function (n) { if (n.id !== 'stop-button') n.disabled = value; }); $('progress-track').hidden = !value; }
  var runner = window.FrameShelfJobs.createRunner(B, S, function (s) { $('status').textContent = s.message; $('progress-fill').style.width = (s.total ? 100 * s.current / s.total : 0) + '%'; });
  function page(name) { if (name === 'named') drawNamed(); if (exportWindow && name === 'workspace') name = 'board'; document.querySelectorAll('.page').forEach(function (n) { n.hidden = n.id !== name; }); document.querySelectorAll('.tab').forEach(function (n) { n.classList.toggle('active', n.dataset.page === name || (exportWindow && name === 'board' && n.dataset.page === 'workspace')); }); }
  function profile() { return profiles.find(function (p) { return p.name === config.settings.outputTemplate; }); }
  function checkRecovery() { $('recovery-banner').hidden = !session || !S.read('recovery:' + session.projectKey, null); }
  function modal(title, content, label, fn) { $('dialog-title').textContent = title; $('dialog-content').replaceChildren(content); $('dialog-submit').textContent = label; accept = fn; $('dialog').showModal(); }
  function ask(title, value, fn) { var input = node('input'); input.value = value; input.required = true; input.setAttribute('aria-label', title); modal(title, input, '保存', function () { return fn(input.value.trim()); }); input.focus(); }
  function image(record) { var src = record.previewPath ? S.imageUrl(record.previewPath) : ''; if (src) { var img = node('img'); img.src = src; img.alt = record.label; return img; } return node('span', B.demo ? '演示组合 · 无实图' : (record.previewError ? '预览失败 · 点预览重试' : '尚未生成预览'), 'placeholder'); }
  var picked = null, activeSlot = null, cursorStart = null, cursorEnd = null;
  function deleteCombination(id) {
    session.deletedRecordIds = (session.deletedRecordIds || []).concat(id);
    session.records = session.records.filter(function(r){return r.id !== id;});
    session.slots.forEach(function(s){if(s.recordId===id)s.recordId=null;});
    if(picked===id)picked=null;
    persist();render();notice('已删除组合，关联卡槽的名称已保留。');
  }
  function drawBoard() {
    $('board-records').replaceChildren(); $('board-targets').replaceChildren();
    session.records.forEach(function (r) {
      var card = node('article',null,'board-card' + (picked === r.id ? ' picked' : ''));
      var select = button(session.scope === 'project' ? r.compName + ' [#' + r.compId + '] · ' + r.label : r.label, function () { picked = r.id; drawBoard(); }); select.className='source-select';select.prepend(image(r));select.draggable=true;
      select.ondragstart = function(e){if(busy){e.preventDefault();return;}e.dataTransfer.setData('text/plain',r.id);};
      var remove=button('删除组合',function(){deleteCombination(r.id);});remove.className='source-delete';remove.setAttribute('aria-label','删除组合 '+r.label);
      card.append(select); if (session.scope !== 'project') card.append(remove);$('board-records').append(card);
    });
    session.slots.forEach(function (s) {
      var card = node('article', null, 'board-card target' + (activeSlot === s.id ? ' editing' : '')); card.dataset.id = s.id;
      var top = node('div', null, 'slot-top'), check = node('input');
      check.type = 'checkbox'; check.checked = s.selected !== false; check.setAttribute('aria-label', '导出 ' + s.pattern);
      var result = node('small', null, 'filename-preview');
      function filename() { try { result.textContent = C.slotFilename(session, session.slots.find(function(x){return x.id===s.id;}) || s) + (profile() ? profile().ext : ''); } catch (e) { result.textContent = e.message; } }
      check.onchange = function () { s.selected = check.checked; session.slots.find(function (x) { return x.id === s.id; }).selected = check.checked; card.classList.toggle('not-selected', !check.checked); persist(); totals(); };
      var remove = button('删除卡槽', function () { session.slots = session.slots.filter(function (x) { return x.id !== s.id; }); persist(); render(); }); remove.title = '删除输出名称';
      top.append(check, result);
      var inputs = node('div',null,'slot-custom-fields');
      session.naming.fields.filter(function(f){return f.type==='custom';}).forEach(function(f){
        var label=node('label',f.label), input=node('input'); input.value=(s.values||{})[f.id]||'';input.setAttribute('aria-label',f.label+' · 输出 '+(session.slots.indexOf(s)+1));
        bindText(input,function(){var current=session.slots.find(function(x){return x.id===s.id;});current.values=current.values||{};current.values[f.id]=input.value;persist();updateNames();});label.append(input);inputs.append(label);
      });
      var r = session.records.find(function (r) { return r.id === s.recordId; });
      var visual = button('', function () { if (!picked) { notice('先点选左侧组合，或把组合拖入此卡片。'); return; } C.assign(session, s.id, picked); persist(); render(); });
      visual.className = 'assignment-visual'; visual.setAttribute('aria-label', '分配组合到 ' + s.pattern); visual.append(r ? image(r) : node('span', '拖入组合 / 点击分配', 'drop-hint'));
      var actions = node('div', null, 'slot-actions'); actions.append(button('清除分配', function () { C.assign(session, s.id, null); persist(); render(); }), remove); card.append(top, inputs, visual, node('small', r ? (session.scope === 'project' ? r.compName + ' [#' + r.compId + '] · ' : '') + r.label : '尚未分配'), actions); filename();
      if (s.selected === false) card.classList.add('not-selected');
      card.ondragover = function (e) { if (!busy) { e.preventDefault(); card.classList.add('drag-over'); } }; card.ondragleave = function () { card.classList.remove('drag-over'); };
      card.ondrop = guard(function (e) { e.preventDefault(); C.assign(session, s.id, e.dataTransfer.getData('text/plain')); persist(); render(); }); $('board-targets').append(card);
    });
  }

  function render() {
    if (!session) return;
    C.ensureNaming(session);
    if (!$('named').hidden) drawNamed();
    $('load-demo').hidden = session.scope === 'project';
    $('record-count').textContent = session.records.length; $('history-count').textContent = session.history.length;
    $('gallery').replaceChildren(); var query = $('search').value.toLowerCase();
    session.records.filter(function (r) { return (r.label + r.compName).toLowerCase().includes(query); }).forEach(function (r, i) {
      var card = node('article', null, 'record'); card.draggable = true; card.dataset.id = r.id;
      card.ondragstart = function (e) { if (busy) { e.preventDefault(); return; } e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'copy'; };
      var visual = node('div', null, 'record-image'); visual.append(image(r), node('span', String(i + 1).padStart(2, '0'), 'record-number'));
      var body = node('div', null, 'record-body'); body.append(node('div', r.label, 'record-title'), node('div', r.compName + ' · 帧 ' + r.displayFrame + ' · ' + r.width + ' × ' + r.height, 'record-meta'));
      var actions = node('div', null, 'record-actions'); actions.append(button('更新组合', function () { return updateCombination(r); }), button('预览', function () { return preview(r); }), button('改名', function () { ask('组合名称', r.label, function (name) { if (!name) throw new Error('名称不能为空'); r.label = name; persist(); render(); }); }), button('移除', function () { deleteCombination(r.id); }));
      body.append(actions); card.append(visual, body); $('gallery').append(card);
    });
    $('empty-library').hidden = !!session.records.length; $('library-note').hidden = !session.records.length;
    $('preset').replaceChildren(); config.presets.forEach(function (p) { var o = new Option(p.name, p.id); $('preset').add(o); }); $('preset').value = session.presetId;

    $('history-list').replaceChildren(); session.history.slice().reverse().forEach(function (h) { var row = node('div', null, 'history-item' + (h.ok ? '' : ' failed')); row.append(node('strong', h.filename), node('p', h.ok ? h.path : h.error), node('small', new Date(h.at).toLocaleString())); $('history-list').append(row); });
    if (!session.history.length) $('history-list').append(node('p', '导出完成后，结果会保存在这里。', 'muted'));
    drawFields();
    drawBoard(); totals(); settings(); checkRecovery(); lock(busy);
  }
  var fieldDragging = false;
  function drawFields() {
    $('fields-editor').replaceChildren();
    var names={fixed:'固定名称',wildcard:'通配符字段',custom:'自定义名字'};
    session.naming.fields.forEach(function(f,index){
      var row=node('div',null,'ordered-field'), badge=node('span',String(index+1),'field-number'), body=node('div',null,'ordered-body');row.dataset.fieldId=f.id;
      var title=node('input');title.value=f.label;title.setAttribute('aria-label','字段标题 '+(index+1));title.onchange=function(){session.naming.fields.find(function(x){return x.id===f.id;}).label=title.value||names[f.type];persist();render();};
      body.append(title,node('small',names[f.type]));
      if(f.type!=='custom'){var value=node('input');value.value=f.value;value.setAttribute('aria-label',f.label+' 内容');bindText(value,function(){session.naming.fields.find(function(x){return x.id===f.id;}).value=value.value;persist();updateNames();});body.append(value);}
      else body.append(node('small','在每张输出卡片分别填写'));
      var actions=node('div',null,'order-actions');
      var up=button('上移',function(){C.moveField(session,f.id,index-1);persist();render();}),down=button('下移',function(){C.moveField(session,f.id,index+1);persist();render();});
      actions.append(up,down,button('删除',function(){session.naming.fields=session.naming.fields.filter(function(x){return x.id!==f.id;});persist();render();}));
      row.append(badge,body,actions);
      badge.style.touchAction='none'; badge.onpointerdown=function(e){e.preventDefault();fieldDragging=true;badge.setPointerCapture(e.pointerId);};
      badge.onpointermove=function(e){if(!fieldDragging)return;document.querySelectorAll('.ordered-field').forEach(function(r){r.classList.remove('drag-over');});var target=document.elementFromPoint(e.clientX,e.clientY);var dest=target&&target.closest('.ordered-field');if(dest)dest.classList.add('drag-over');};
      badge.onpointerup=function(e){if(!fieldDragging)return;fieldDragging=false;var target=document.elementFromPoint(e.clientX,e.clientY),dest=target&&target.closest('.ordered-field');if(dest){var to=session.naming.fields.findIndex(function(x){return x.id===dest.dataset.fieldId;});C.moveField(session,f.id,to);persist();render();}};
      badge.onpointercancel=function(){fieldDragging=false;render();};

      row.ondragstart=function(e){if(/INPUT|SELECT/.test(e.target.tagName)){e.preventDefault();return;}fieldDragging=true;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-frameshelf-field',f.id);};
      row.ondragend=function(){fieldDragging=false;row.classList.remove('drag-over');};
      row.ondragover=function(e){if(Array.from(e.dataTransfer.types).includes('application/x-frameshelf-field')){e.preventDefault();row.classList.add('drag-over');}};row.ondragleave=function(){row.classList.remove('drag-over');};
      row.ondrop=guard(function(e){e.preventDefault();e.stopPropagation();fieldDragging=false;var id=e.dataTransfer.getData('application/x-frameshelf-field');if(id){C.moveField(session,id,index);persist();render();}});
      $('fields-editor').append(row);
    });
    $('field-separator').value=session.naming.separator;
  }
  function updateNames() {
    document.querySelectorAll('#board-targets .target').forEach(function (card) {
      var slot = session.slots.find(function (s) { return s.id === card.dataset.id; });
      if (!slot) return;
      var output = card.querySelector('.filename-preview');
      try { output.textContent = C.slotFilename(session, slot) + (profile() ? profile().ext : ''); output.classList.remove('invalid'); }
      catch (e) { output.textContent = e.message; output.classList.add('invalid'); }
    });
  }
  function totals() { $('assignment-count').textContent = session.slots.filter(function (s) { return s.recordId; }).length + ' / ' + session.slots.length + ' 已分配'; $('export-count').textContent = session.slots.filter(function (s) { return s.selected !== false; }).length; }
  function settings() {
    var select = $('output-template'); select.replaceChildren(new Option('请选择 AE 模板', ''));
    profiles.filter(function (p) { return !p.hidden; }).forEach(function (p) { select.add(new Option(p.name, p.name)); }); select.value = config.settings.outputTemplate;
    var p = profile(); $('profile-details').textContent = p ? p.kind + ' · ' + p.bits + ' 位 · ' + p.channels : '使用 AE 中保存的输出模块模板';
    $('directory-label').textContent = config.settings.outputDir || '选择文件夹';
  }

  function adoptInfo(next) {
    info = next;
    $('host-label').textContent = B.demo ? '浏览器演示' : 'AE ' + info.version;
    $('project-bits').textContent = info.bits + ' BPC';
    if (projectScope() && info.projectKey) {
      var projectChanged = !session || session.scope !== 'project' || session.projectKey !== info.projectKey;
      if (projectChanged) {
        session = S.read(C.projectSessionKey(info.projectKey), null);
        if (!session) { session = C.newSession(info.projectKey); session.scope = 'project'; session.compId = null; C.applyPreset(session, config.presets[0]); }
        refreshProject(session); picked = null; activeSlot = null; lastShared = '';
      }
      $('scope-label').textContent = '当前工程全部组合：' + info.projectName;
      $('project-name').textContent = info.projectName;
      if (projectChanged) render();
      return projectChanged;
    }
    if (!info.projectKey || info.compId == null) {
      $('scope-label').textContent = '请保存工程并激活合成时间线';
      $('project-name').textContent = info.projectName;
      if (!session || session.scope === 'project' || session.compId != null || session.projectKey !== info.projectKey) { session = C.newSession(info.projectKey); session.compId = null; picked = null; activeSlot = null; render(); }
      return false;
    }
    var changed = !session || session.projectKey !== info.projectKey || session.compId !== info.compId;
    if (changed) {
      var read = function () {
        var key = C.sessionKey(info.projectKey, info.compId), saved = S.read(key, null);
        if (!saved) { saved = C.compositionSession(info.projectKey, info.compId, info.compName, S.read('session:' + info.projectKey, null), config.presets[0]); S.write(key, saved); }
        return saved;
      };
      session = S.withStateLock ? S.withStateLock(read) : read();
      picked = null; activeSlot = null; $('search').value = '';
    }
    session.compName = info.compName;
    $('project-name').textContent = info.projectName + ' / ' + info.compName;
    $('scope-label').textContent = '当前合成：' + info.compName;
    if (changed) render();
    return changed;
  }
  async function sync() {
    if (S.jobActive && S.jobActive()) throw new Error('另一个窗口正在渲染，请等待完成后刷新合成。');
    adoptInfo(await B.call('info'));
  }
  async function reload() { if (S.jobActive && S.jobActive()) { profiles = S.read('profiles', []); render(); return; } profiles = await B.call('profiles'); S.write('profiles', profiles); render(); }
  async function preview(r) { if (B.demo) { notice('演示模式没有 AE 实际画面。'); return; } if (S.read('recovery:' + r.projectKey, null)) throw new Error('请先处理上次中断任务的恢复记录。');  try { var result = await runner.preview(r); r.previewPath = result.path; r.previewAt = result.at; delete r.previewError; persist(); render(); } catch (e) { r.previewError = e.message; persist(); render(); throw e; } }
  var namedBoard, namedKey;
  function boardFrom(source) {
    var model = {
      product: source.product, fields: Object.assign({}, source.fields),
      slots: source.slots.map(function (slot) {
        return {id: C.uid(), pattern: slot.pattern, values: Object.assign({}, slot.values)};
      })
    };
    if (source.naming) model.naming = JSON.parse(JSON.stringify(source.naming));
    C.ensureNaming(model);
    return model;
  }
  function namedFilename(board, slot) {
    return (slot.override ? C.filename(slot.override, board.product, {fields: board.fields}) :
      C.slotFilename(board, slot)) + '.png';
  }
  function persistNamed() { S.write(namedKey, namedBoard); }
  async function saveNamed(key, slot) {
    if (B.demo) throw new Error('请在 AE 中保存当前帧。');
    var record = await B.call('capture');
    if (key !== 'named:' + C.sessionKey(record.projectKey, record.compId)) {
      await sync(); throw new Error('当前合成已切换，请在对应占位上重新保存。');
    }
    var filename = namedFilename(namedBoard, slot);
    var destination = S.pngDestination(record.projectKey);
    var result = await runner.savePng(record, destination.directory, filename, true);
    slot.lastFile = result.filename;
    slot.path = result.path;
    slot.frame = record.displayFrame;
    slot.thumbnail = result.thumbnail;
    persistNamed();
    drawNamed();
    notice('已保存：' + result.path);
  }
  function editNamed(slot) {
    var initial = slot.override || '';
    if (!initial) { try { initial = C.slotFilename(namedBoard, slot); } catch (_) {} }
    ask('占位文件名（不含 .png）', initial, function (value) {
      var name = value.trim();
      if (!name) throw new Error('请输入文件名。');
      C.filename(name, namedBoard.product, {fields: namedBoard.fields});
      if (!namedBoard.slots.some(function (item) { return item.id === slot.id; })) namedBoard.slots.push(slot);
      slot.override = name; persistNamed(); drawNamed();
    });
  }
  function drawNamed() {
    var grid = $('named-grid');
    grid.replaceChildren();
    var available = session && session.projectKey && session.compId != null;
    $('named-controls').hidden = !available;
    $('named-add').hidden = !available;
    $('named-comp').textContent = available ? session.compName : '请保存工程并激活要保存的合成。';
    if (!available) { namedKey = null; namedBoard = null; return; }
    var key = 'named:' + C.sessionKey(session.projectKey, session.compId);
    if (key !== namedKey) {
      namedKey = key; namedBoard = S.read(key, null);
      if (!namedBoard) { namedBoard = boardFrom(session); persistNamed(); }
    }
    var select = $('named-preset'), previous = select.value;
    select.replaceChildren(new Option('当前合成的分层导出命名', ''));
    config.presets.forEach(function (preset) { select.add(new Option(preset.name, preset.id)); });
    select.value = previous;
    namedBoard.slots.forEach(function (slot) {
      var card = node('article', null, 'named-card');
      var save = button('', function () { return saveNamed(key, slot); });
      save.className = 'named-save';
      var visual = node('span', null, 'named-visual');
      if (slot.thumbnail) { var img = node('img'); img.src = slot.thumbnail; img.alt = ''; visual.append(img); }
      else visual.append(node('span', '＋ 保存当前帧'));
      var label;
      try { label = namedFilename(namedBoard, slot); } catch (err) { label = err.message; }
      save.title = '保存当前帧 · ' + label;
      save.append(visual, node('strong', label));
      var actions = node('div', null, 'record-actions');
      actions.append(button('改名', function () { editNamed(slot); }), button('移除占位', function () {
        namedBoard.slots = namedBoard.slots.filter(function (item) { return item.id !== slot.id; });
        persistNamed(); drawNamed();
      }));
      card.append(save);
      if (slot.lastFile) {
        var last = node('small', '帧 ' + slot.frame + ' · ' + slot.lastFile);
        last.title = slot.path; card.append(last);
      }
      card.append(actions); grid.append(card);
    });
  }
  $('named-add').onclick = guard(function () { editNamed({id: C.uid(), pattern: '', values: {}}); });
  $('named-import').onclick = guard(function () {
    var preset = config.presets.find(function (p) { return p.id === $('named-preset').value; });
    var source = session;
    if (preset) { source = C.newSession(session.projectKey); C.applyPreset(source, preset); }
    var replacement = boardFrom(source);
    modal('套用命名', node('p', '将当前合成的占位列表替换为 ' + replacement.slots.length + ' 个新占位。已保存的 PNG 会保留。'), '套用', function () {
      namedBoard = replacement; persistNamed(); drawNamed();
    });
  });
  async function savePng() {
    if (B.demo) throw new Error('请在 AE 2025 内使用保存 PNG 并复制。');
    var record = await B.call('capture');
    var destination = S.pngDestination(record.projectKey);
    var result = await runner.savePng(record, destination.directory, destination.filename);
    $('status').textContent = 'PNG 文件已复制 · 可前往微信 / 飞书粘贴';
    notice('已保存并复制 PNG 文件：' + result.path + '。请粘贴为文件发送，以保留透明通道。');
  }
  async function capture() { await sync(); var r = await B.call('capture'); if (!session || r.projectKey !== session.projectKey || r.compId !== session.compId) throw new Error('合成已切换，请重新点击添加组合。'); r.id = C.uid(); session.records.push(r); persist(); render(); try { await preview(r); $('status').textContent = '组合已记录，可以继续调整独显并添加'; } catch(e) { notice('组合已记录，预览失败：' + e.message,true); } }
  async function updateCombination(old) {
    if (S.jobActive && S.jobActive()) throw new Error('请等待当前渲染完成。');
    if (S.read('recovery:' + old.projectKey, null)) throw new Error('请先处理上次中断任务的恢复记录。');
    var captured = await B.call('capture');
    var record = C.updateRecord(session, old.id, captured);
    persist(); render();
    notice('已更新组合的图层开关与当前帧，保留名称和卡槽分配。');
    await preview(record);
  }
  async function review() {
    if (B.demo) throw new Error('浏览器只演示交互。请在 AE 2025 中执行真实导出。');
    var current = await B.call('info'); if (!session || current.projectKey !== session.projectKey || (session.scope !== 'project' && current.compId !== session.compId)) { adoptInfo(current); throw new Error('当前合成已变化，请核对卡槽后再次导出。'); }
    checkRecovery(); if (!$('recovery-banner').hidden) throw new Error('请先处理上次中断任务的恢复记录。');
    if (session.scope === 'project') persist();
    var plan = C.buildPlan(session, profile()), options = { directory: config.settings.outputDir, conflict: config.settings.conflict };
    plan = S.availableNames(options.directory, plan, options.conflict); await B.call('validate', { records: plan.map(function (j) { return j.record; }) });
    var wrap = node('div'), table = node('table', null, 'review-table'); plan.forEach(function (j) { var tr = node('tr'); tr.append(node('td', j.filename), node('td', j.record.compName + ' [#' + j.record.compId + '] · ' + j.record.label), node('td', j.record.width + ' × ' + j.record.height + ' / 帧 ' + j.record.displayFrame)); table.append(tr); });
    wrap.append(node('p', options.directory), table, node('p', '渲染期间 AE 会被占用。按记录的独显组合与帧输出，内容取自当前工程；输出设置取自所选 AE 模板。', 'review-note'));
    modal('核对 ' + plan.length + ' 个输出', wrap, '开始渲染', async function () {
      lock(true); $('stop-button').hidden = false; notice('');
      try {
        var confirmed = await B.call('info');
        if (confirmed.projectKey !== session.projectKey || (session.scope !== 'project' && confirmed.compId !== session.compId)) throw new Error('工程或合成已切换，请重新检查导出清单。');
        if (session.scope === 'project') {
          refreshProject(session);
          plan.forEach(function (job) {
            var latest = session.records.find(function (r) { return r.id === job.record.id; });
            if (!latest || JSON.stringify(latest) !== JSON.stringify(job.record)) throw new Error('组合已删除或更新，请重新检查导出清单：' + job.record.label);
          });
        }
        options.onResult = function (r) { session.history.push(r); persist(); }; var result = await runner.batch(plan, options); notice(result.stopped ? '已停止，完成的文件已保留。' : '已完成 ' + result.results.length + ' 个文件。'); }
      finally { lock(false); $('stop-button').hidden = true; render(); $('status').textContent = '任务已结束'; }
    });
  }
  $('dialog-form').onsubmit = async function (e) { e.preventDefault(); var fn = accept; $('dialog').close(); try { await fn(); } catch (err) { notice(err.message, true); checkRecovery(); } };
  ['dialog-close', 'dialog-cancel'].forEach(function (id) { $(id).onclick = function () { $('dialog').close(); }; });
  document.querySelectorAll('[data-page]').forEach(function (b) { b.onclick = guard(function () { page(b.dataset.page); }); });
  $('edit-output-template').onclick = guard(async function () { if (B.demo) { notice('请在 AE 中打开原生输出模块模板窗口。'); return; } if (S.jobActive && S.jobActive()) throw new Error('请等待渲染完成后修改模板。'); var release = S.acquireJob ? S.acquireJob() : function () {}; try { await B.call('editOutputTemplates'); } finally { release(); } await reload(); notice('模板列表已刷新'); });
  function toggleSaveMenu(open) {
    $('save-menu').hidden = !open;
    $('save-options').setAttribute('aria-expanded', String(open));
  }
  $('save-options').onclick = function () { toggleSaveMenu($('save-menu').hidden); };
  document.addEventListener('click', function (e) {
    if (e.target.closest('#save-options') || e.target.closest('#save-menu') && !e.target.closest('button')) return;
    toggleSaveMenu(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('save-menu').hidden) { toggleSaveMenu(false); $('save-options').focus(); }
  });
  $('normal-save').onclick = guard(savePng);
  $('queue-template').onclick = guard(async function () {
    await reload();
    var select = node('select');
    select.setAttribute('aria-label', '完美保存默认模板');
    select.add(new Option('自动选择透明 PNG', ''));
    profiles.filter(function (p) { return p.supported && !p.hidden; }).forEach(function (p) { select.add(new Option(p.name, p.name)); });
    select.value = S.read('perfect-save-template', '') || '';
    modal('完美保存默认模板', select, '保存', function () { S.write('perfect-save-template', select.value); });
  });
  $('queue-png').onclick = guard(async function () {
    if (B.demo) throw new Error('请在 AE 中使用完美保存。');
    var release = S.acquireJob();
    try {
      var record = await B.call('capture');
      var destination = S.pngDestination(record.projectKey);
      var result = await B.call('queuePng', { record: record, directory: destination.directory, filename: destination.filename, template: S.read('perfect-save-template', '') });
      notice('已加入渲染队列 · ' + result.template + ' · ' + result.path + '。点击 AE 的「渲染」开始输出。');
    } finally { release(); }
  });
  $('save-png-copy').onclick = guard(savePng);
  ['add-record', 'empty-add'].forEach(function (id) { $(id).onclick = guard(capture); }); $('export-button').onclick = guard(exportWindow ? review : openExport); $('export-top').onclick = guard(openExport);
  $('sync-project').onclick = guard(sync); $('reload-profiles').onclick = guard(reload); $('search').oninput = render;
  $('refresh-previews').onclick = guard(async function () { for (var i = 0; i < session.records.length; i++) await preview(session.records[i]); });
  $('field-separator').oninput=function(){session.naming.separator=this.value;persist();updateNames();};
  $('add-slot').onclick=guard(function(){var values={};session.naming.fields.filter(function(f){return f.type==='custom';}).forEach(function(f){values[f.id]='';});session.slots.push({id:C.uid(),pattern:'新名称',values:values,recordId:null,selected:true});persist();render();});
  $('preset').onchange = function () { var p = config.presets.find(function (p) { return p.id === $('preset').value; }); if (p) { C.applyPreset(session, p); persist(); render(); } };
  $('save-preset').onclick = guard(function () { ask('保存为新命名预设', '我的命名预设', function (name) { if (!name || !session.slots.length) throw new Error('请填写预设名称并至少保留一个槽位。'); var p = C.namingPreset(session,C.uid(),name); config.presets.push(p); session.presetId = p.id; persist(); render(); }); });
  $('close-board').onclick = guard(function () { if (window.__adobe_cep__) window.__adobe_cep__.closeExtension(); else window.close(); });
  $('add-field').onchange = function () {
    if(!this.value) return;
    var type=this.value,labels={fixed:'固定名称',wildcard:'日期时间',custom:'自定义名字'};
    session.naming.fields.push({id:C.uid(),type:type,label:labels[type],value:type==='wildcard'?'$YYYY$MM$DD':type==='fixed'?'名称':''});
    this.value='';persist();render();
  };
  $('update-preset').onclick = guard(function () { var p = config.presets.find(function (p) { return p.id === session.presetId; }); if (!p) throw new Error('请先另存为一个预设'); Object.assign(p,C.namingPreset(session,p.id,p.name)); persist(); notice('预设已更新：' + p.name); });
  $('delete-preset').onclick = guard(function () { config.presets = config.presets.filter(function (p) { return p.id !== session.presetId; }); session.presetId = ''; persist(); render(); });
  $('output-template').onchange = function () { config.settings.outputTemplate = this.value; persist(); render(); };
  $('enter-directory').onclick = guard(function () { ask('输出文件夹路径', config.settings.outputDir || '', function (value) { config.settings.outputDir = S.validateDirectory ? S.validateDirectory(value) : value; persist(); settings(); }); });
  $('choose-directory').onclick = guard(async function () { var dir = await B.call('chooseFolder', { initialPath: config.settings.outputDir || '' }); if (dir) { config.settings.outputDir = dir; persist(); settings(); } });
  $('stop-button').onclick = function () { runner.stop(); $('status').textContent = '停止请求已记录，等待当前帧结束…'; };
  $('recover').onclick = guard(async function () { var journal = S.read('recovery:' + session.projectKey, null); await B.call('recover', { snapshot: journal.snapshot }); S.write('recovery:' + session.projectKey, null); checkRecovery(); notice('已恢复任务前的图层开关和原队列勾选状态。'); });
  $('dismiss-recovery').onclick = guard(function () { S.write('recovery:' + session.projectKey, null); checkRecovery(); });
  $('load-demo').onclick = guard(async function () { if (session.records.length) return; session.product = '吸尘器'; for (var i = 0; i < 3; i++) { var r = await B.call('capture'); r.id = C.uid(); session.records.push(r); if (session.slots[i]) session.slots[i].recordId = r.id; } config.settings.outputTemplate = profiles[0].name; S.write(C.sessionKey(session.projectKey, session.compId), session); persist(); render(); });
  var lastShared = '';
  var polling = false;
  async function refreshShared() {
    if (!config || fieldDragging || polling || busy || $('dialog').open || inputGate.blocked() || (S.jobActive && S.jobActive())) return;
    polling = true;
    var inputRevision = inputGate.revision();
    try {
      var next = await B.call('info');
      if (inputRevision !== inputGate.revision() || fieldDragging || busy || $('dialog').open || inputGate.blocked()) return;
      adoptInfo(next);
      if (session && session.scope === 'project') {
        var projectSaved = S.read(C.projectSessionKey(session.projectKey), session);
        refreshProject(projectSaved);
        var projectConfig = S.read('config', config), projectSignature = JSON.stringify([projectSaved, projectConfig]);
        if (projectSignature !== lastShared) { lastShared = projectSignature; session = projectSaved; config = projectConfig; render(); }
        return;
      }
      if (!session || session.compId == null) return;
      var saved = S.read(C.sessionKey(session.projectKey, session.compId), null), cfg = S.read('config', config), signature = JSON.stringify([saved,cfg]);
      if (signature !== lastShared) { lastShared = signature; if (saved) session = saved; config = cfg; render(); }
    } catch (e) { notice('合成同步失败：' + e.message, true); }
    finally { polling = false; }
  }
  $('project-scope-toggle').onchange = guard(async function () {
    var desired = $('project-scope-toggle').checked;
    try { persist(); projectMode = desired; await sync(); lastShared = ''; }
    catch (error) { projectMode = session && session.scope === 'project'; $('project-scope-toggle').checked = projectMode; throw error; }
  });
  if (exportWindow) {
    $('board-tools').append(document.querySelector('.naming'));
    document.querySelector('.toolbar').append(document.querySelector('.tabs'), $('close-board'));
    document.querySelector('.tabs [data-page=workspace]').firstChild.textContent = '命名导出 ';
    document.querySelector('#output-heading').append($('assignment-count'));
    document.querySelector('.status-line').append(document.querySelector('.host-indicator'));
    $('close-board').textContent = '关闭';
    document.title = 'Frame Shelf · 命名与导出';
  } else {
    $('export-button').querySelector('span').textContent = '打开命名与导出窗口 ↗';
  }
  window.addEventListener('focus', refreshShared);
  window.setInterval(refreshShared, 1000);
  async function init() { lock(true); $('status').textContent = '正在读取工程与模板…'; try { config = S.read('config', null) || C.defaults(); config.settings = Object.assign(C.defaults().settings, config.settings); $('demo-banner').hidden = !B.demo; await sync(); await reload(); page(exportWindow ? 'board' : 'workspace'); $('status').textContent = '准备就绪'; } catch (e) { notice(e.message, true); $('status').textContent = '初始化失败，请检查 AE 工程或重新打开面板'; } finally { lock(false); } }
  init();
}());
