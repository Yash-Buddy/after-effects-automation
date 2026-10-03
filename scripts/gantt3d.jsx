(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open Frame 21181 and click its timeline first."); return; }

    // ---- settings ----
    var TOTAL = 10;
    var CAM_TIME = 2.0;
    var TILT_Y = -20;
    var TILT_X = 8;
    var FAR = 1.35;
    var STAGGER = 0.3;
    var RISE = 100;
    var POP = 100;
    var DUR = 0.8;
    var FADE = 0.4;

    var BAR_START = 2.6;   // when the first bar starts growing
    var BAR_STEP = 0.25;   // delay between bars
    var GROW = 0.7;        // seconds for each bar to grow
    var SORT_LEFT_TO_RIGHT = true;   // start with the bar whose left end is furthest left

    var BG = 14;
    var PARENT = 1;
    var POPS = [ [13], [12, 2] ];
    var BARS = [11, 10, 9, 8, 7, 6, 5, 4, 3];
    // ------------------

    var W = comp.width, H = comp.height, i, g, n;

    function ease(prop) {
        try {
            var e = new KeyframeEase(0, 75);
            for (var k = 1; k <= prop.numKeys; k++) prop.setTemporalEaseAtKey(k, [e], [e]);
        } catch (err) {}
    }

    var seen = {};
    function extendInside(c) {
        if (seen[c.id]) return;
        seen[c.id] = true;
        try { if (c.duration < TOTAL) c.duration = TOTAL; } catch (e0) {}
        for (var j = 1; j <= c.numLayers; j++) {
            var IL = c.layer(j);
            if (IL instanceof CameraLayer || IL instanceof LightLayer) continue;
            try { if (IL.source instanceof CompItem) extendInside(IL.source); } catch (e1) {}
            try { IL.outPoint = TOTAL; } catch (e2) {}
        }
    }

    // mask rectangle: left edge is always fixed at the layer's left end
    function rect(right, h) {
        var s = new Shape();
        s.vertices = [[-2, -2], [right, -2], [right, h + 2], [-2, h + 2]];
        s.inTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
        s.outTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
        s.closed = true;
        return s;
    }

    function addGrow(layer, t0) {
        var masks = layer.property("ADBE Mask Parade");
        for (var m = masks.numProperties; m >= 1; m--) {
            if (masks.property(m).name === "Grow") masks.property(m).remove();
        }
        var mk = masks.addProperty("ADBE Mask Atom");
        mk.name = "Grow";
        var mp = mk.property("ADBE Mask Shape");
        mp.setValueAtTime(0, rect(-2, layer.height));                 // hidden from the start
        mp.setValueAtTime(t0, rect(-2, layer.height));                // still zero width
        mp.setValueAtTime(t0 + GROW, rect(layer.width + 2, layer.height)); // full width, grown from the left
        ease(mp);
    }

    function leftEdge(layer) {
        try {
            var tr = layer.property("ADBE Transform Group");
            var p = tr.property("ADBE Position").value;
            var a = tr.property("ADBE Anchor Point").value;
            var s = tr.property("ADBE Scale").value[0] / 100;
            return p[0] - a[0] * s;
        } catch (e) { return 0; }
    }

    app.beginUndoGroup("Gantt 3D");

    for (i = comp.numLayers; i >= 1; i--) {
        var nm = comp.layer(i).name;
        if (nm === "Orbit Camera" || nm === "Orbit Null") comp.layer(i).remove();
    }

    if (comp.numLayers !== 14) {
        alert("Expected 14 layers but found " + comp.numLayers + ".\nThe layer numbers no longer match, so nothing was changed.");
        app.endUndoGroup();
        return;
    }

    comp.duration = TOTAL;
    comp.workAreaStart = 0;
    comp.workAreaDuration = TOTAL;
    for (i = 1; i <= comp.numLayers; i++) {
        var L = comp.layer(i);
        try { if (L.source instanceof CompItem) extendInside(L.source); } catch (e3) {}
        try { L.inPoint = 0; L.outPoint = TOTAL; } catch (e4) {}
    }

    var names = ["ADBE Position", "ADBE Position_0", "ADBE Position_1", "ADBE Position_2", "ADBE Opacity"];
    for (i = 1; i <= comp.numLayers; i++) {
        var L2 = comp.layer(i);
        try { L2.threeDLayer = true; } catch (e5) {}
        var tr0 = L2.property("ADBE Transform Group");
        for (n = 0; n < names.length; n++) {
            try { var p0 = tr0.property(names[n]); if (p0) p0.expression = ""; } catch (e6) {}
        }
    }

    try { comp.layer(BG).property("ADBE Transform Group").property("ADBE Opacity").setValue(100); } catch (e7) {}

    // tag, subheader, page number: rise + fade in
    for (g = 0; g < POPS.length; g++) {
        var t0 = CAM_TIME + g * STAGGER;
        var k1 = 'ease(time,' + t0 + ',' + (t0 + DUR) + ',1,0)';
        for (n = 0; n < POPS[g].length; n++) {
            var idx = POPS[g][n];
            if (idx === BG || idx === PARENT) continue;
            var tr = comp.layer(idx).property("ADBE Transform Group");
            var pos = tr.property("ADBE Position");
            if (pos.dimensionsSeparate) {
                try {
                    tr.property("ADBE Position_1").expression = 'value + ' + RISE + '*' + k1 + ';';
                    tr.property("ADBE Position_2").expression = 'value - ' + POP + '*' + k1 + ';';
                } catch (e8) {}
            } else {
                pos.expression = 'var k=' + k1 + '; var v=value; (v.length==3) ? v+[0,' + RISE + '*k,-' + POP + '*k] : v+[0,' + RISE + '*k];';
            }
            tr.property("ADBE Opacity").expression = 'value*ease(time,' + t0 + ',' + (t0 + FADE) + ',0,1);';
        }
    }

    // bars: leftmost first, each one grows from its left end
    var order = BARS.slice(0);
    if (SORT_LEFT_TO_RIGHT) {
        order.sort(function (a, b) { return leftEdge(comp.layer(a)) - leftEdge(comp.layer(b)); });
    }
    for (n = 0; n < order.length; n++) {
        if (order[n] === BG || order[n] === PARENT) continue;
        addGrow(comp.layer(order[n]), BAR_START + n * BAR_STEP);
    }

    // camera (arrives at CAM_TIME, then holds still)
    var nul = comp.layers.addNull();
    nul.name = "Orbit Null";
    nul.threeDLayer = true;
    var ntr = nul.property("ADBE Transform Group");
    ntr.property("ADBE Position").setValue([W / 2, H / 2, 0]);

    var cam = comp.layers.addCamera("Orbit Camera", [W / 2, H / 2]);
    var zoom = cam.property("ADBE Camera Options Group").property("ADBE Camera Zoom").value;
    cam.parent = nul;
    try { cam.property("ADBE Transform Group").property("ADBE Point of Interest").setValue([0, 0, 0]); } catch (e9) {}

    var cpos = cam.property("ADBE Transform Group").property("ADBE Position");
    cpos.setValueAtTime(0, [0, 0, -zoom * FAR]);
    cpos.setValueAtTime(CAM_TIME, [0, 0, -zoom]);
    ease(cpos);

    var ry = ntr.property("ADBE Rotate Y");
    var rx = ntr.property("ADBE Rotate X");
    ry.setValueAtTime(0, TILT_Y); ry.setValueAtTime(CAM_TIME, 0); ease(ry);
    rx.setValueAtTime(0, TILT_X); rx.setValueAtTime(CAM_TIME, 0); ease(rx);

    app.endUndoGroup();
    alert("Done. Set the viewer to Active Camera and press 0 on the keypad for a RAM preview.");
})();