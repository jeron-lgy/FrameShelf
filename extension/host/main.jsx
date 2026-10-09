/* Frame Shelf: AE 25.x / ExtendScript ES3. All mutation stays in this adapter. */
var FrameShelf = (function () {
    function encode(v) {
        if (v === null || v === undefined) { return "null"; }
        if (typeof v === "string") { return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\x00-\x1f\u2028\u2029]/g, function (c) { return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4); }) + '"'; }
        if (typeof v === "number") { return isFinite(v) ? String(v) : "null"; }
        if (typeof v === "boolean") { return String(v); }
        var a = [], k;
        if (v instanceof Array) { for (k = 0; k < v.length; k++) { a.push(encode(v[k])); } return "[" + a.join(",") + "]"; }
        for (k in v) { if (v.hasOwnProperty(k)) { a.push(encode(k) + ":" + encode(v[k])); } }
        return "{" + a.join(",") + "}";
    }
    function decode(s) {
        if (!/^[\],:{}\s]*$/.test(s.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, "@").replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]").replace(/(?:^|:|,)(?:\s*\[)+/g, ""))) { throw new Error("无效的 JSON 请求。"); }
        return eval("(" + s + ")");
    }
    function key() { return app.project.file ? app.project.file.fsName : null; }
    function idle() {
        if (parseInt(app.version, 10) !== 25) { throw new Error("此测试版仅支持 AE 2025（25.x）。"); }
        if (!app.project) { throw new Error("请打开工程。"); }
        if (app.project.renderQueue.rendering) { throw new Error("AE 正在渲染，请等待当前任务完成。"); }
    }
    function permission() {
        if (app.preferences.getPrefAsLong("Main Pref Section", "Pref_SCRIPTING_FILE_NETWORK_SECURITY") !== 1) { throw new Error("请在 AE 首选项 → 脚本和表达式中，启用「允许脚本写入文件和访问网络」。"); }
    }
    function compById(id) {
        for (var i = 1; i <= app.project.numItems; i++) { var c = app.project.item(i); if (c.id === id && c instanceof CompItem) { return c; } }
        throw new Error("记录的主合成已不存在。");
    }
    function layerStates(comp) {
        var result = [];
        for (var i = 1; i <= comp.numLayers; i++) { var l = comp.layer(i); result.push({ id: l.id, name: l.name, solo: l.solo, enabled: l.enabled }); }
        return result;
    }
    function resolve(comp, states) {
        if (!(states instanceof Array) || comp.numLayers !== states.length) { throw new Error("图层数量已改变，请重新记录组合。"); }
        var map = {}, seen = {}, list = [], i;
        for (i = 1; i <= comp.numLayers; i++) { map["id" + comp.layer(i).id] = comp.layer(i); }
        for (i = 0; i < states.length; i++) {
            var s = states[i], name = "id" + s.id;
            if (!map[name] || seen[name] || typeof s.solo !== "boolean" || typeof s.enabled !== "boolean") { throw new Error("图层已被替换或记录无效：" + s.name); }
            seen[name] = true; list.push(map[name]);
        }
        return list;
    }
    function setLayerState(layer, state) {
        // AE rejects solo assignments on disabled layers, including no-op writes.
        if (layer.solo !== state.solo) {
            if (!layer.enabled) { layer.enabled = true; }
            layer.solo = state.solo;
        }
        if (layer.enabled !== state.enabled) { layer.enabled = state.enabled; }
    }
    function apply(comp, states) {
        var list = resolve(comp, states);
        for (var i = 0; i < list.length; i++) { setLayerState(list[i], states[i]); }
    }
    function checkedComp(record) {
        idle();
        if (!record || !record.projectKey || record.projectKey !== key()) { throw new Error("工程已切换或另存为，请在当前工程重新记录。"); }
        var comp = compById(record.compId);
        if (comp.width !== record.width || comp.height !== record.height || comp.pixelAspect !== record.pixelAspect || Math.abs(comp.frameDuration - record.frameDuration) > 0.0000001) { throw new Error("合成尺寸、像素比例或帧率已改变，请重新记录组合。"); }
        if (typeof record.frameIndex !== "number" || record.frameIndex < 0 || Math.floor(record.frameIndex) !== record.frameIndex || record.frameIndex * comp.frameDuration >= comp.duration - 0.0000001) { throw new Error("记录帧超出合成时长或无效。"); }
        resolve(comp, record.layers); return comp;
    }
    function info() {
        idle(); var c = app.project.activeItem;
        return { version: app.version, projectKey: key(), projectName: app.project.file ? File.decode(app.project.file.name) : "未保存工程",
            compId: c instanceof CompItem ? c.id : null, compName: c instanceof CompItem ? c.name : null, bits: app.project.bitsPerChannel, workingSpace: app.project.workingSpace,
            canWrite: app.preferences.getPrefAsLong("Main Pref Section", "Pref_SCRIPTING_FILE_NETWORK_SECURITY") === 1 };
    }
    function capture() {
        idle(); if (!key()) { throw new Error("请先保存一次工程，以便重新打开后仍能找到组合。之后的未保存修改可以正常记录和渲染。"); }
        var c = app.project.activeItem;
        if (!(c instanceof CompItem)) { throw new Error("请先激活主合成时间线。"); }
        var states = layerStates(c), solo = [], visible = [];
        for (var i = 0; i < states.length; i++) { if (states[i].enabled) { visible.push(states[i].name); } if (states[i].solo) { solo.push(states[i].name); } }
        var frame = Math.max(0, Math.min(Math.ceil(c.duration / c.frameDuration - 0.0000001) - 1, Math.round(c.time / c.frameDuration)));
        return { version: 2, projectKey: key(), compId: c.id, compName: c.name, width: c.width, height: c.height, pixelAspect: c.pixelAspect,
            frameDuration: c.frameDuration, frameIndex: frame, displayFrame: frame + c.displayStartFrame, layers: states,
            label: (solo.length ? solo : visible).join(" + ") || "空画面", capturedAt: new Date().getTime() };
    }
    function queueSignature(item) {
        var paths = [];
        for (var i = 1; i <= item.numOutputModules; i++) { var f = item.outputModule(i).file; paths.push(f ? f.fsName : ""); }
        return encode({ compId: item.comp.id, paths: paths });
    }
    function snapshot(args) {
        idle(); var comps = [], seen = {}, queue = [], i;
        for (i = 0; i < args.records.length; i++) {
            var c = checkedComp(args.records[i]);
            if (!seen["id" + c.id]) { comps.push({ compId: c.id, layers: layerStates(c), resolutionFactor: c.resolutionFactor, workAreaStart: c.workAreaStart, workAreaDuration: c.workAreaDuration }); seen["id" + c.id] = true; }
        }
        for (i = 1; i <= app.project.renderQueue.numItems; i++) {
            var q = app.project.renderQueue.item(i);
            if (q.status === RQItemStatus.QUEUED) { queue.push({ index: i, signature: queueSignature(q) }); }
        }
        return { projectKey: key(), comps: comps, queue: queue, createdAt: new Date().getTime() };
    }
    function restoreLayers(comp, saved, errors) {
        var layers;
        try { layers = resolve(comp, saved); } catch (e) { errors.push(String(e)); return; }
        for (var i = 0; i < layers.length; i++) {
            try { setLayerState(layers[i], saved[i]); } catch (e1) { errors.push("图层状态恢复失败：" + saved[i].name + " " + e1); }
        }
    }
    function restoreArea(comp, area, errors) {
        if (!area || typeof area.start !== "number" || typeof area.duration !== "number") { return; }
        try { comp.workAreaStart = area.start; comp.workAreaDuration = area.duration; }
        catch (e) { errors.push("工作区恢复失败：" + e.message); }
    }
    function transaction(comp, desired, work) {
        idle(); var saved = comp ? layerStates(comp) : null, savedArea = comp ? { start: comp.workAreaStart, duration: comp.workAreaDuration } : null, changedQueue = [], result, error = null, recoveryErrors = [], i;
        // Rendering can reset AE undo history. Restore explicit snapshots; never span render() with an undo group.
        try {
            var queue = app.project.renderQueue;
            for (i = 1; i <= queue.numItems; i++) {
                var q = queue.item(i);
                if (q.status === RQItemStatus.QUEUED) { changedQueue.push(q); q.render = false; }
            }
            if (comp && desired) { apply(comp, desired); }
            result = work();
        } catch (e) { error = e; }
        finally {
            if (comp) { restoreLayers(comp, saved, recoveryErrors); restoreArea(comp, savedArea, recoveryErrors); }
            for (i = 0; i < changedQueue.length; i++) { try { changedQueue[i].render = true; } catch (e3) { recoveryErrors.push("原渲染队列恢复失败：" + e3); } }

        }
        if (recoveryErrors.length) { var err = new Error((error ? String(error) + "；" : "") + recoveryErrors.join("；")); err.needsRecovery = true; throw err; }
        if (error) { throw error; } return result;
    }
    function recover(args) {
        idle(); var saved = args.snapshot, errors = [], i;
        if (!saved || saved.projectKey !== key()) { throw new Error("恢复记录属于其他工程。"); }
        // Validate every reference before changing anything.
        for (i = 0; i < saved.comps.length; i++) { resolve(compById(saved.comps[i].compId), saved.comps[i].layers); }
        for (i = 0; i < saved.queue.length; i++) {
            var q = saved.queue[i];
            if (q.index > app.project.renderQueue.numItems || queueSignature(app.project.renderQueue.item(q.index)) !== q.signature) { throw new Error("原队列已被修改，无法自动恢复；请在 AE 中检查勾选状态。"); }
        }
        for (i = 0; i < saved.comps.length; i++) { restoreLayers(compById(saved.comps[i].compId), saved.comps[i].layers, errors); if(saved.comps[i].resolutionFactor) { try { compById(saved.comps[i].compId).resolutionFactor = saved.comps[i].resolutionFactor; } catch(resError) { errors.push("预览分辨率恢复失败"); } } restoreArea(compById(saved.comps[i].compId), { start: saved.comps[i].workAreaStart, duration: saved.comps[i].workAreaDuration }, errors); }
        for (i = 0; i < saved.queue.length; i++) { try { app.project.renderQueue.item(saved.queue[i].index).render = true; } catch (e) { errors.push(String(e)); } }
        if (errors.length) { throw new Error(errors.join("；")); }
        return true;
    }
    function profile(name, om) {
        var s = om.getSettings(GetSettingsFormat.STRING), format = String(s.Format).toLowerCase(), depth = String(s.Depth).toLowerCase();
        var kind = null, ext = "", bits = 0;
        // ExtendScript does not reliably evaluate unparenthesized chained ternaries like modern JS.
        if (format.indexOf("tiff") >= 0) { kind = "TIFF"; ext = ".tif"; }
        else if (format.indexOf("png") >= 0) { kind = "PNG"; ext = ".png"; }
        else if (format.indexOf("jpeg") >= 0) { kind = "JPEG"; ext = ".jpg"; }
        if (depth.indexOf("trillions") >= 0) { bits = 16; }
        else if (depth.indexOf("floating") >= 0) { bits = 32; }
        else if (depth.indexOf("millions") >= 0) { bits = 8; }
        var alpha = s.Channels === "RGB + Alpha", rgb = s.Channels === "RGB" || alpha;
        return { name: name, format: s.Format, kind: kind, bits: bits, alpha: alpha, channels: s.Channels, color: s.Color, depth: s.Depth,
            supported: !!kind && !!bits && rgb, ext: ext,
            sampleType: bits === 32 ? "float" : "uint", hidden: name.indexOf("_HIDDEN") === 0 };
    }
    function scratch(work) {
        idle(); var c = null, item = null;
        try {
            c = app.project.items.addComp("__FrameShelf_profile_probe__", 32, 18, 1, 1, 25);
            item = app.project.renderQueue.items.add(c); item.render = false;
            return work(c, item);
        } finally { try { if (item) { item.remove(); } } finally { if (c) { c.remove(); } } }
    }
    function profiles() {
        return scratch(function (c, item) {
            var names = item.outputModule(1).templates, result = [];
            for (var i = 0; i < names.length; i++) {
                try { item.outputModule(1).applyTemplate(names[i]); var p = profile(names[i], item.outputModule(1)); if (p.supported) { result.push(p); } }
                catch (ignore) {}
            }
            return result;
        });
    }
    function configure(item, args, comp) {
        var factor = args.preview ? Math.max(1, Math.ceil(Math.max(comp.width, comp.height) / 960)) : 1;
        item.setSettings({ "Quality": "Best", "Resolution": factor + "," + factor, "Solo Switches": "Current Settings", "Effects": "Current Settings",
            "Proxy Use": "Use No Proxies", "Field Render": "Off", "Frame Rate": "Use comp's frame rate", "Frame Blending": "Current Settings",
            "Motion Blur": "Current Settings", "Guide Layers": "All Off", "Color Depth": "Current Settings" });
        // AE 25.2 quantizes RQItem.timeSpanDuration upward (0.04 becomes 0.04000651).
        // Comp work-area setters retain exact frame boundaries; transaction restores the original work area.
        var targetTime = (args.frameIndex || 0) * comp.frameDuration;
        comp.workAreaStart = targetTime; comp.workAreaDuration = comp.frameDuration;
        item.setSettings({ "Time Span": "Work Area Only" }); item.skipFrames = 0;
        item.outputModule(1).applyTemplate(args.template);
        var om = item.outputModule(1), p = profile(args.template, om);
        if (!p.supported) { throw new Error("请选择 TIFF、PNG 或 JPEG 的 RGB/RGBA 静帧输出模板。"); }
        if (args.preview && (p.kind !== "PNG" || p.bits !== 8)) { throw new Error("预览需要一个 PNG 8 位输出模板。"); }
        var settings = om.getSettings(GetSettingsFormat.STRING);
        if (settings.Resize === "true" || settings.Crop === "true") { throw new Error("当前模板启用了缩放或裁切；本工具按合成原尺寸导出，请在 AE 模板中关闭 Resize/Crop。"); }
        om.postRenderAction = PostRenderAction.NONE;
        var folder = new Folder(args.directory);
        if (!folder.exists) { throw new Error("本次临时输出目录不存在。"); }
        om.file = new File(folder.fsName + "/frame_[#####]" + p.ext);
        if (Math.abs(item.timeSpanStart - targetTime) > 0.0000001 || Math.abs(item.timeSpanDuration - comp.frameDuration) > 0.0000001) { throw new Error("AE 单帧范围校验失败：start=" + item.timeSpanStart + ", duration=" + item.timeSpanDuration + ", expected=" + targetTime + "/" + comp.frameDuration); }
        return { profile: p, factor: factor };
    }
    function execute(item, args, comp) {
        var configured = configure(item, args, comp);
        item.render = true;
        app.project.renderQueue.render();
        if (item.status === RQItemStatus.USER_STOPPED) { var stopped = new Error("渲染已在 AE 中停止。"); stopped.cancelled = true; throw stopped; }
        if (item.status !== RQItemStatus.DONE) { throw new Error("AE 未完成当前帧渲染，请检查 AE 的渲染错误。"); }
        var files = new Folder(args.directory).getFiles(), images = [];
        for (var i = 0; i < files.length; i++) { if (files[i] instanceof File && /\.(tiff?|png|jpe?g)$/i.test(files[i].name)) { images.push(files[i]); } }
        if (images.length !== 1 || images[0].length === 0) { throw new Error("单帧任务输出数量异常：" + images.length + " 张；范围 " + item.timeSpanStart + " / " + item.timeSpanDuration + " 秒；目录 " + args.directory); }
        return { path: images[0].fsName, profile: configured.profile, factor: configured.factor, width: comp.width, height: comp.height };
    }
    function directPreview(args) {
        permission(); var c = checkedComp(args.record), saved = layerStates(c), resolution = c.resolutionFactor;
        var file = new File(args.directory + "/preview.png"), error = null, errors = [];
        if (!(new Folder(args.directory)).exists) { throw new Error("预览临时目录不存在。"); }
        try {
            apply(c, args.record.layers);
            var factor = Math.max(1, Math.ceil(Math.max(c.width, c.height) / 960));
            c.resolutionFactor = [factor, factor];
            c.saveFrameToPng(args.record.frameIndex * c.frameDuration, file);
            // AE may finish writing after this script returns; Node waits for a complete PNG.
        } catch (e) { error = e; }
        finally {
            restoreLayers(c, saved, errors);
            try { c.resolutionFactor = resolution; } catch (e2) { errors.push("预览分辨率恢复失败：" + e2.message); }
        }
        if (errors.length) { var failure = new Error(errors.join("；")); failure.needsRecovery = true; throw failure; }
        if (error) { throw error; }
        return { path: file.fsName };
    }
    function render(args) {
        permission(); var c = checkedComp(args.record);
        args.frameIndex = args.record.frameIndex;
        return transaction(c, args.record.layers, function () {
            var item = null;
            try { item = app.project.renderQueue.items.add(c); return execute(item, args, c); }
            finally { if (item) { item.remove(); } }
        });
    }
    function probe(args) {
        idle(); permission();
        for (var i = 0; i < args.records.length; i++) { checkedComp(args.records[i]); }
        return transaction(null, null, function () {
            return scratch(function (c, item) {
                return execute(item, args, c);
            });
        });
    }
    var methods = { info: info, capture: capture, profiles: profiles, snapshot: snapshot, recover: recover, render: render, directPreview: directPreview, probe: probe,
        validate: function (args) { for (var i = 0; i < args.records.length; i++) { checkedComp(args.records[i]); } return info(); },
        chooseFolder: function () { var f = Folder.selectDialog("选择批量导出文件夹"); return f ? f.fsName : null; },
        openFolder: function (args) { var f = new Folder(args.path); if (!f.exists) { throw new Error("文件夹不存在。"); } return f.execute(); },
        editOutputTemplates: function () {
            idle();
            var names = ["Output Module...", "Output Module\u2026", "\u8f93\u51fa\u6a21\u5757...", "\u8f93\u51fa\u6a21\u5757\u2026"], id = 0;
            for (var i = 0; i < names.length; i++) { id = app.findMenuCommandId(names[i]); if (id > 0) { break; } }
            if (!id) { throw new Error("未找到原生模板菜单，请使用 AE 编辑 → 模板 → 输出模块，然后刷新列表。"); }
            app.executeCommand(id); return true;
        },
        showQueue: function () { app.project.renderQueue.showWindow(true); return true; }
    };
    return { stringify: encode, dispatch: function (method, json) {
        try { if (!methods.hasOwnProperty(method)) { throw new Error("未知操作。"); } return encode({ ok: true, data: methods[method](decode(json || "{}")) }); }
        catch (e) { return encode({ ok: false, error: String(e.message || e), line: e.line || null, needsRecovery: !!e.needsRecovery, cancelled: !!e.cancelled }); }
    } };
}());
