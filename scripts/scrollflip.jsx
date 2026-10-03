(function () {
    var MAIN = app.project.activeItem;
    if (!(MAIN instanceof CompItem)) {
        alert("Open Comp 1 and click on its timeline first.");
        return;
    }

    // ---- settings you can change (seconds / pixels) ----
    var ENTER = 0.8;        // drop in from above
    var HOLD_BEFORE = 0.5;  // pause showing BEFORE
    var UP = 0.7;           // move upward (BEFORE face)
    var DOWN = 0.7;         // move back down (AFTER face)
    var HOLD_AFTER = 1.5;   // pause showing AFTER
    var EXIT = 0.8;         // leave downward
    var LIFT = 250;         // how far it moves up before flipping
    var NULL_NAME = "Null 2";
    // -----------------------------------------------------

    var flipStart = ENTER + HOLD_BEFORE;
    var flipEnd = flipStart + UP + DOWN;
    var exitStart = flipEnd + HOLD_AFTER;
    var total = exitStart + EXIT;
    var cx = MAIN.width / 2, cy = MAIN.height / 2, H = MAIN.height;

    app.beginUndoGroup("Lift flip setup");

    var i, j, slides = [], others = [];
    for (i = MAIN.numLayers; i >= 1; i--) {
        var L = MAIN.layer(i);
        if (L.name === "Scroll") { L.remove(); continue; }
        if (L.source instanceof CompItem) slides.push(L);
        else others.push(L);
    }
    if (slides.length === 0) {
        alert("No pre-comp layers found in " + MAIN.name);
        app.endUndoGroup();
        return;
    }

    // order by the number in the pre-comp name (Pre-comp 2, 3, 4...)
    function num(l) { return parseInt(l.source.name.replace(/\D/g, ""), 10) || 0; }
    slides.sort(function (a, b) { return num(a) - num(b); });

    var n = slides.length;
    var lastEnd = 0;

    for (i = 0; i < n; i++) {
        var layer = slides[i];
        var start = i * exitStart;

        layer.startTime = start;
        layer.inPoint = start;
        layer.outPoint = start + total;
        lastEnd = start + total;

        // position: drop in, hold, up, down, hold, exit
        var pos = layer.property("Position");
        while (pos.numKeys > 0) pos.removeKey(1);
        pos.expression =
            'var t = time - startTime;\n' +
            'var cx = ' + cx + ', cy = ' + cy + ', y;\n' +
            'if (t < ' + ENTER + ') y = ease(t, 0, ' + ENTER + ', -600, cy);\n' +
            'else if (t < ' + flipStart + ') y = cy;\n' +
            'else if (t < ' + (flipStart + UP) + ') y = ease(t, ' + flipStart + ', ' + (flipStart + UP) + ', cy, cy - ' + LIFT + ');\n' +
            'else if (t < ' + flipEnd + ') y = ease(t, ' + (flipStart + UP) + ', ' + flipEnd + ', cy - ' + LIFT + ', cy);\n' +
            'else if (t < ' + exitStart + ') y = cy;\n' +
            'else y = ease(t, ' + exitStart + ', ' + total + ', cy, ' + (H + 600) + ');\n' +
            '[cx, y];';

        // flip inside the pre-comp: 0 -> 180 across the up + down movement
        var src = layer.source;
        var nul = null;
        for (j = 1; j <= src.numLayers; j++) {
            if (src.layer(j).name === NULL_NAME) nul = src.layer(j);
        }
        if (nul) {
            nul.threeDLayer = true;
            var rx = nul.property("ADBE Transform Group").property("ADBE Rotate X");
            while (rx.numKeys > 0) rx.removeKey(1);
            rx.expression = 'ease(time, ' + flipStart + ', ' + flipEnd + ', 0, 180);';
        }
    }

    // make the comp and background last until the last slide leaves
    MAIN.duration = lastEnd + 0.5;
    for (i = 0; i < others.length; i++) {
        others[i].outPoint = MAIN.duration;
    }

    app.endUndoGroup();
    alert("Done. Press Spacebar to preview.");
})();