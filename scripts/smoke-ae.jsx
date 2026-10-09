// Isolated AE process only. Refuse every pre-existing project, even our own earlier fixture.
(function () {
    var root = new File($.fileName).parent.fsName, report = new File(root + '/report.json');
    if (app.project.numItems !== 0 || app.project.file) { return; }
    app.beginSuppressDialogs();
    var results = [], error = null;
    try {
        $.evalFile(new File(root + '/main.jsx'));
        function call(method, args) { var r = eval('(' + FrameShelf.dispatch(method, FrameShelf.stringify(args || {})) + ')'); if (!r.ok) { throw new Error(method + ': ' + r.error); } return r.data; }
        app.project.bitsPerChannel = 16;
        var c = app.project.items.addComp('产品_final', 64, 36, 1, 2, 25);
        c.layers.addSolid([1,0,0], 'compA',64,36,1,2);
        c.layers.addSolid([0,1,0], 'compB',64,36,1,2);
        c.time = 0.4; c.openInViewer();
        app.project.save(new File(root + '/fixture.aep'));
        var profiles = call('profiles'), tiff = null, png = null;
        for (var i=0;i<profiles.length;i++) { if (profiles[i].kind === 'TIFF' && !tiff) tiff=profiles[i]; if (profiles[i].kind === 'PNG' && profiles[i].bits===8 && !png) png=profiles[i]; }
        if (!tiff || !png) throw new Error('Missing TIFF or PNG profile');
        var unrelated = app.project.renderQueue.items.add(c); unrelated.outputModule(1).file = new File(root+'/MUST_NOT_RENDER.tif'); unrelated.render = true;
        c.layer(1).solo = false; c.layer(2).solo = true;
        var record = call('capture'); record.id='real-ae';
        c.layer(1).solo = true; c.layer(2).solo = false;
        function run(label, method, args) { var folder = new Folder(root+'/'+label); folder.create(); args.directory=folder.fsName; var output=call(method,args); if (!c.layer(1).solo || c.layer(2).solo || !unrelated.render || app.project.renderQueue.numItems!==1) throw new Error('State not restored '+label); results.push({label:label,output:output}); }
        run('probe','probe',{records:[record],template:tiff.name});
        run('small','render',{record:record,template:tiff.name});
        c.width=15000; c.height=8438; record.width=c.width; record.height=c.height;
        run('preview','render',{record:record,template:png.name,preview:true});
        run('large','render',{record:record,template:tiff.name});
        if (new File(root+'/MUST_NOT_RENDER.tif').exists) throw new Error('Unrelated queue was rendered');
    } catch(e) { error=String(e)+' line='+e.line; }
    finally {
        report.encoding='UTF-8'; report.open('w'); report.write(FrameShelf.stringify({version:app.version,error:error,results:results})); report.close();
        app.endSuppressDialogs(false);
        app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
        app.exitAfterLaunchAndEval=true;
    }
}());
