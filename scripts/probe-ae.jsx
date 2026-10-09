// Read-only inspection of the running AE instance. Does not change the project.
(function () {
    var root = new File($.fileName).parent.parent;
    $.evalFile(new File(root.fsName + "/extension/host/main.jsx"));
    var result = FrameShelf.dispatch("info", "{}");
    var file = new File(root.fsName + "/.test-output/ae-probe.json");
    file.encoding = "UTF-8";
    if (file.open("w")) { file.write(result); file.close(); }
}());
