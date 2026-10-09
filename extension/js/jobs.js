(function () {
  'use strict';
  function createRunner(bridge, store, onStatus) {
    var running = false, stop = false;
    function status(message, current, total) { if (onStatus) onStatus({ message: message, current: current || 0, total: total || 0 }); }
    function expected(profile, width, height) { return { kind: profile.kind, bits: profile.bits, alpha: profile.alpha, sampleType: profile.sampleType, width: width, height: height }; }
    async function hostJob(method, args, records, projectKey) {
      if (store.read && store.read('recovery:' + projectKey, null)) throw new Error('存在未处理的恢复记录，请先恢复或手动检查 AE 状态。');
      var snapshot = await bridge.call('snapshot', { records: records });
      store.write('recovery:' + projectKey, { pending: true, snapshot: snapshot, directory: args.directory, method: method, at: Date.now() });
      try {
        var result = await bridge.call(method, args);
        store.write('recovery:' + projectKey, null);
        return result;
      } catch (error) {
        // A normal AE exception completed the host transaction. A transport error has no such guarantee.
        if (error.needsRecovery === false) store.write('recovery:' + projectKey, null);
        throw error;
      }
    }
    async function preview(record, template) {
      if (running) throw new Error('已有任务正在执行。');
      if (!store.native) return { demo: true };
      var release = store.acquireJob ? store.acquireJob() : function () {};
      running = true;
      var stage;
      try {
        status('生成组合预览…');
        stage = store.stage();
        var result = await hostJob('render', { record: record, template: template, directory: stage.directory, preview: true }, [record], record.projectKey);
        var previewPath = store.savePreview(stage, result.path, record.id);
        store.cleanup(stage);
        return { path: previewPath, at: Date.now() };
      } finally { running = false; release(); }
    }
    async function batch(plan, options) {
      if (running) throw new Error('已有任务正在执行。');
      if (!store.native) throw new Error('这是界面演示，不能导出文件。请在 AE 2025 内使用插件。');
      if (!plan || !plan.length) throw new Error('导出清单为空。');
      var release = store.acquireJob ? store.acquireJob() : function () {};
      running = true; stop = false;
      var results = [], profile = plan[0].profile, projectKey = plan[0].record.projectKey, probeStage;
      try {
        status('验证输出模板与组合…', 0, plan.length);
        probeStage = store.stage(options.directory);
        var probe = await hostJob('probe', { records: plan.map(function (j) { return j.record; }), template: profile.name, directory: probeStage.directory }, plan.map(function (j) { return j.record; }), projectKey);
        if (store.normalizeOutput) store.normalizeOutput(probeStage, probe.path, profile);
        store.verify(probe.path, expected(profile, 32, 18));
        store.cleanup(probeStage);
        for (var i = 0; i < plan.length; i++) {
          if (stop) break;
          var job = plan[i], stage = store.stage(options.directory), completed = null;
          status('正在渲染 ' + job.filename, i, plan.length);
          try {
            var output = await hostJob('render', { record: job.record, template: profile.name, directory: stage.directory }, [job.record], projectKey);
            var normalizedAlpha = store.normalizeOutput ? store.normalizeOutput(stage, output.path, profile) : false;
            store.verify(output.path, expected(profile, job.record.width, job.record.height));
            var published = store.publish(stage, output.path, job.filename, options.conflict);
            completed = { slotId: job.slotId, ok: true, path: published.path, filename: published.filename, bytes: published.bytes, normalizedAlpha: normalizedAlpha, at: Date.now() };
            results.push(completed);
            // Persist success immediately; a later failure does not erase completed work.
            if (options.onResult) options.onResult(completed);
            try { store.cleanup(stage); } catch (cleanupError) { completed.cleanupWarning = cleanupError.message; }
            status('已导出 ' + published.filename, i + 1, plan.length);
          } catch (error) {
            if (completed) { error.message = '文件已导出到 ' + completed.path + '，但结果记录保存失败：' + error.message; error.results = results; throw error; }
            var failed = { slotId: job.slotId, ok: false, filename: job.filename, error: error.message, staging: stage.directory, at: Date.now() };
            results.push(failed);
            if (options.onResult) options.onResult(failed);
            error.results = results; throw error;
          }
        }
        return { results: results, stopped: stop && results.length < plan.length };
      } catch (error) {
        if (!results.length && options.onResult) options.onResult({ ok: false, filename: '输出前检查 · ' + profile.name, error: error.message, staging: probeStage ? probeStage.directory : '', at: Date.now() });
        throw error;
      } finally { running = false; release(); }
    }
    return { preview: preview, batch: batch, stop: function () { stop = true; }, isRunning: function () { return running; } };
  }
  if (typeof window !== 'undefined') window.FrameShelfJobs = { createRunner: createRunner };
  if (typeof module === 'object' && module.exports) module.exports = { createRunner: createRunner };
}());
