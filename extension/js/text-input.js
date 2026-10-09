(function (root) {
  'use strict';
  function createGate(doc, now, schedule, cancel) {
    now = now || Date.now; schedule = schedule || setTimeout; cancel = cancel || clearTimeout;
    var composing = false, until = 0, revision = 0;
    function touch() { revision++; until = now() + 350; }
    doc.addEventListener('compositionstart', function () { composing = true; touch(); }, true);
    doc.addEventListener('compositionend', function () { composing = false; touch(); }, true);
    ['focusin', 'focusout', 'input'].forEach(function (type) { doc.addEventListener(type, touch, true); });
    function blocked() { return composing || now() < until || /^(INPUT|SELECT|TEXTAREA)$/.test((doc.activeElement || {}).tagName || ''); }
    function bind(input, save) {
      var pending = null, localComposition = false, previous = input.value;
      function commit() {
        pending = null;
        if (localComposition) return;
        if (input.value !== previous) { save(); previous = input.value; }
      }
      function queue() { if (pending !== null) cancel(pending); pending = schedule(commit, 0); }
      input.addEventListener('compositionstart', function () { localComposition = true; if (pending !== null) cancel(pending); });
      input.addEventListener('compositionend', function () { localComposition = false; queue(); });
      input.addEventListener('input', function (event) { if (!localComposition && !event.isComposing) queue(); });
      input.addEventListener('change', function () { if (!localComposition) { if (pending !== null) cancel(pending); commit(); } });
    }
    return { blocked: blocked, revision: function () { return revision; }, bind: bind };
  }
  if (typeof module === 'object' && module.exports) module.exports = { createGate: createGate };
  if (root) root.FrameShelfTextInput = { createGate: createGate };
}(typeof window !== 'undefined' ? window : null));
