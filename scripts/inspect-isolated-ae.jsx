// Must be launched with AfterFX -m -r. Refuses to touch a non-empty project.
(function () {
    var out = new File(Folder.temp.fsName + '/FrameShelf-inspect.txt');
    out.encoding = 'UTF-8';
    function write(s) { if (out.open('a')) { out.writeln(s); out.close(); } }
    if (out.exists) { out.remove(); }
    write('AE=' + app.version + ' initialItems=' + app.project.numItems);
    if (app.project.numItems !== 0 || app.project.file) { write('REFUSED: non-empty project'); return; }
    app.beginSuppressDialogs();
    var comp = null, rq = null;
    try {
        comp = app.project.items.addComp('FS_ISOLATED_INSPECTION', 32, 18, 1, 2, 25);
        rq = app.project.renderQueue.items.add(comp);
        write('RENDER SPEC ' + rq.getSettings(GetSettingsFormat.SPEC).toSource());
        write('RENDER SETTABLE ' + rq.getSettings(GetSettingsFormat.STRING_SETTABLE).toSource());
        var names = rq.outputModule(1).templates;
        for (var i = 0; i < names.length; i++) {
            try {
                rq.outputModule(1).applyTemplate(names[i]);
                write('TEMPLATE ' + names[i] + ' ' + rq.outputModule(1).getSettings(GetSettingsFormat.STRING).toSource());
            } catch (e) { write('TEMPLATE ERROR ' + names[i] + ' ' + e); }
        }
        write('OM SETTABLE ' + rq.outputModule(1).getSettings(GetSettingsFormat.STRING_SETTABLE).toSource());
        write('DONE');
    } catch (e) { write('ERROR ' + e + ' line=' + e.line); }
    finally {
        if (rq) { rq.remove(); }
        if (comp) { comp.remove(); }
        app.endSuppressDialogs(false);
        app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
        app.exitAfterLaunchAndEval = true;
    }
}());
