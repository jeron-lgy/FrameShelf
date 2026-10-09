(function () {
  'use strict';
  if (window.__adobe_cep__) {
    var req = window.cep_node && window.cep_node.require;
    if (!req) throw new Error('CEP Node.js 未启用，请检查扩展安装。');
    var path = req('path'), processObject = req('process');
    var extensionPath = decodeURI(window.__adobe_cep__.getSystemPath('extension'));
    if (/^file:\/\/\//.test(extensionPath)) extensionPath = extensionPath.replace(/^file:\/\/\//, '');
    window.FrameShelfStorage = req(path.join(extensionPath, 'lib', 'files.cjs')).createStore(path.join(processObject.env.APPDATA, 'FrameShelf'));
  } else {
    window.FrameShelfStorage = {
      native: false,
      read: function (name, fallback) { var raw = localStorage.getItem('frameshelf-v2:' + name); return raw ? JSON.parse(raw) : fallback; },
      write: function (name, data) { localStorage.setItem('frameshelf-v2:' + name, JSON.stringify(data)); },
      imageUrl: function (file) { return file || ''; },
      availableNames: function (dir, plan) { return plan; }
    };
  }
}());
