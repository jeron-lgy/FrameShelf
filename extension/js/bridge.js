(function () {
  'use strict';
  var demo = !window.__adobe_cep__, demoCount = 0;
  function call(method, args) {
    if (!demo && method === 'chooseFolder') return new Promise(function (resolve, reject) {
      try {
        if (!window.cep || !window.cep.fs || !window.cep.fs.showOpenDialogEx) throw new Error('当前 CEP 不支持此选择器，请使用输入路径。');
        var selected = window.cep.fs.showOpenDialogEx(false, true, '选择输出文件夹', (args && args.initialPath) || '', [], '', '选择文件夹');
        if (!selected || selected.err) throw new Error('文件夹选择器无法打开，请使用输入路径。');
        resolve(selected.data && selected.data.length ? selected.data[0] : null);
      } catch (error) { reject(error); }
    });
    if (!demo) return new Promise(function (resolve, reject) {
      var script = 'FrameShelf.dispatch(' + JSON.stringify(method) + ',' + JSON.stringify(JSON.stringify(args || {})) + ')';
      // Keep the CEP transport ASCII-only; ExtendScript decodes Unicode escapes.
      script = script.replace(/[\u007f-\uffff]/g, function (c) { return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); });
      window.__adobe_cep__.evalScript(script, function (raw) {
        try {
          var result = JSON.parse(raw);
          if (result.diagnostics && window.FrameShelfStorage && window.FrameShelfStorage.logDiagnostic) {
            window.FrameShelfStorage.logDiagnostic({ method: method, directory: args && args.directory, template: args && args.template, ok: result.ok, error: result.error, host: result.diagnostics });
          }
          if (!result.ok) { var error = new Error(result.error + (result.line ? '（脚本行 ' + result.line + '）' : '')); error.needsRecovery = result.needsRecovery; error.cancelled = result.cancelled; throw error; }
          resolve(result.data);
        } catch (error) { reject(raw === 'EvalScript error.' ? new Error('AE 脚本未加载，请重开面板。') : error); }
      });
    });
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        if (method === 'info' || method === 'validate') return resolve({ version: '25.x · 演示', projectKey: 'demo:project', projectName: '产品视觉.aep', bits: 16, workingSpace: 'sRGB IEC61966-2.1', canWrite: true, compId: Number(localStorage.getItem('frameshelf-demo-comp') || 1), compName: '产品_' + (localStorage.getItem('frameshelf-demo-comp') || 1) });
        if (method === 'capture') { demoCount++; return resolve({ version: 2, projectKey: 'demo:project', compId: Number(localStorage.getItem('frameshelf-demo-comp') || 1), compName: '产品_' + (localStorage.getItem('frameshelf-demo-comp') || 1), width: 15000, height: 8438,
          frameIndex: 120, displayFrame: 120, frameDuration: 1 / 24, layers: [], capturedAt: Date.now(), label: ['compA + compB', 'compC', 'compA'][(demoCount - 1) % 3] }); }
        if (method === 'profiles') return resolve([
          { name: '我的 TIFF 16 位', format: 'TIFF Sequence', kind: 'TIFF', bits: 16, alpha: true, channels: 'RGB + Alpha', color: 'Straight (Unmatted)', ext: '.tif', sampleType: 'uint', supported: true },
          { name: 'PNG', format: 'PNG Sequence', kind: 'PNG', bits: 8, alpha: true, channels: 'RGB + Alpha', color: 'Straight (Unmatted)', ext: '.png', sampleType: 'uint', supported: true },
          { name: 'JPG', format: 'JPEG Sequence', kind: 'JPEG', bits: 8, alpha: false, channels: 'RGB', color: 'Premultiplied (Matted)', ext: '.jpg', sampleType: 'uint', supported: true }
        ]);
        if (method === 'chooseFolder') return resolve('D:\\交付\\吸尘器');
        if (method === 'render' || method === 'probe') return reject(new Error('界面演示不执行真实渲染。请在 AE 2025 中使用扩展。'));
        if (method === 'showQueue' || method === 'openFolder' || method === 'recover') return resolve(true);
        if (method === 'snapshot') return resolve({ projectKey: 'demo:project', comps: [], queue: [] });
        reject(new Error('未知的演示操作：' + method));
      }, 60);
    });
  }
  window.FrameShelfBridge = { call: call, demo: demo };
}());
