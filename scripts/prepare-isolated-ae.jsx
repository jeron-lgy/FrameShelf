(function () {
    if (app.project.numItems !== 0 || app.project.file) { return; }
    app.beginSuppressDialogs();
    try {
        app.project.bitsPerChannel = 16;
        var comp = app.project.items.addComp('FrameShelf_TEST', 64, 36, 1, 2, 25);
        var colors = [[1,0,0], [0,1,0], [0,0,1]];
        for (var i=0; i<3; i++) {
            var sub = app.project.items.addComp('comp' + String.fromCharCode(65+i), 20, 36, 1, 2, 25);
            sub.layers.addSolid(colors[i], 'color', 20, 36, 1, 2);
            var layer = comp.layers.add(sub);
            layer.property('ADBE Transform Group').property('ADBE Position').setValue([11+i*21,18]);
        }
        comp.time = 0.4; comp.openInViewer();
        var item = app.project.renderQueue.items.add(comp);
        item.outputModule(1).applyTemplate('TIFF Sequence with Alpha');
        item.render = false;
        app.project.renderQueue.showWindow(true);
        app.project.save(new File(Folder.temp.fsName + '/FrameShelf-test.aep'));
    } finally { app.endSuppressDialogs(false); }
}());
