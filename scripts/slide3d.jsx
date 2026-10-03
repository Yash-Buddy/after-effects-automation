(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open Frame 21180 and click its timeline first."); return; }

    // ---- settings ----
    var TOTAL = 10;        // comp length in seconds
    var CAM_TIME = 2.0;    // camera arrives and settles at this time, then stays still
    var TILT_Y = -20;      // start tilt (degrees)
    var TILT_X = 8;
    var FAR = 1.35;        // camera starts this many times further back
    var STAGGER = 0.5;     // delay between pieces
    var RISE = 100;        // pixels each piece rises
    var POP = 100;         // pixels each piece travels forward in Z
    var DUR = 0.8;         // rise time
    var FADE = 0.4;        // fade time

    // layer numbers in the CLEAN comp (without Orbit Camera / Orbit Null)
    var BG = 25;                                  // black rectangle, never animated
    var GROUPS = [
        [7],                                      // 1. tag (Badge)
        [4, 3, 2],                                // 2. headline block
        [8, 6, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], // 3. chart panel
        [9, 5]                                    // 4. footer (Date, Badge 2)
    ];
    // ------------------

    var W = comp.width, H = comp.height, i, g, n;

    function ease(prop) {
        try {
            var e = new KeyframeEase(0, 75);
            for (var k = 1; k <= prop.numKeys; k++) prop.setTemporalEaseAtKey(k, [e], [e]);
        } catch (err) {}
    }

    // extends a pre-comp AND every layer inside it (including nested pre-comps)
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

    app.beginUndoGroup("Slide 3D");

    // 1. remove old camera and null
    for (i = comp.numLayers; i >= 1; i--) {
        var nm = comp.layer(i).name;
        if (nm === "Orbit Camera" || nm === "Orbit Null") comp.layer(i).remove();
    }

    // 2. safety check
    if (comp.numLayers !== 25) {
        alert("Expected 25 layers but found " + comp.numLayers + ".\nThe layer numbers in GROUPS no longer match, so nothing was changed.");
        app.endUndoGroup();
        return;
    }

    // 3. comp length, then extend every layer, including the ones inside pre-comps
    comp.duration = TOTAL;
    comp.workAreaStart = 0;
    comp.workAreaDuration = TOTAL;
    for (i = 1; i <= comp.numLayers; i++) {
        var L = comp.layer(i);
        try { if (L.source instanceof CompItem) extendInside(L.source); } catch (e3) {}
        try { L.inPoint = 0; L.outPoint = TOTAL; } catch (e4) {}
    }

    // 4. clear old expressions and make every layer 3D
    var names = ["ADBE Position", "ADBE Position_0", "ADBE Position_1", "ADBE Position_2", "ADBE Opacity"];
    for (i = 1; i <= comp.numLayers; i++) {
        var L2 = comp.layer(i);
        try { L2.threeDLayer = true; } catch (e5) {}
        var tr0 = L2.property("ADBE Transform Group");
        for (n = 0; n < names.length; n++) {
            try { var p0 = tr0.property(names[n]); if (p0) p0.expression = ""; } catch (e6) {}
        }
    }

    // 5. background: always visible, never animated
    try { comp.layer(BG).property("ADBE Transform Group").property("ADBE Opacity").setValue(100); } catch (e7) {}

    // 6. pop-up animation, one group after another (everything stays until the end)
    for (g = 0; g < GROUPS.length; g++) {
        var t0 = CAM_TIME + g * STAGGER;
        var k1 = 'ease(time,' + t0 + ',' + (t0 + DUR) + ',1,0)';
        for (n = 0; n < GROUPS[g].length; n++) {
            var idx = GROUPS[g][n];
            if (idx === BG || idx < 1 || idx > comp.numLayers) continue;
            var P = comp.layer(idx);
            var tr = P.property("ADBE Transform Group");
            var pos = tr.property("ADBE Position");
            if (pos.dimensionsSeparate) {
                try {
                    tr.property("ADBE Position_1").expression = 'value + ' + RISE + '*' + k1 + ';';
                    tr.property("ADBE Position_2").expression = 'value - ' + POP + '*' + k1 + ';';
                } catch (e8) {}
            } else {
                pos.expression = 'var k=' + k1 + '; var v=value; (v.length==3) ? v+[0,' + RISE + '*k,-' + POP + '*k] : v+[0,' + RISE + '*k];';
            }
            tr.property("ADBE Opacity").expression =
                'value*ease(time,' + t0 + ',' + (t0 + FADE) + ',0,1);';
        }
    }

    // 7. camera on a null at the center (arrives at CAM_TIME, then holds still)
    var nul = comp.layers.addNull();
    nul.name = "Orbit Null";
    nul.threeDLayer = true;
    var ntr = nul.property("ADBE Transform Group");
    ntr.property("ADBE Position").setValue([W / 2, H / 2, 0]);

    var cam = comp.layers.addCamera("Orbit Camera", [W / 2, H / 2]);
    var zoom = cam.property("ADBE Camera Options Group").property("ADBE Camera Zoom").value;
    cam.parent = nul;
    try { cam.property("ADBE Transform Group").property("ADBE Point of Interest").setValue([0, 0, 0]); } catch (e9) {}

    // only two keyframes: far -> exact framing. No keyframe after that, so no zoom at the end.
    var cpos = cam.property("ADBE Transform Group").property("ADBE Position");
    cpos.setValueAtTime(0, [0, 0, -zoom * FAR]);
    cpos.setValueAtTime(CAM_TIME, [0, 0, -zoom]);
    ease(cpos);

    var ry = ntr.property("ADBE Rotate Y");
    var rx = ntr.property("ADBE Rotate X");
    ry.setValueAtTime(0, TILT_Y); ry.setValueAtTime(CAM_TIME, 0); ease(ry);
    rx.setValueAtTime(0, TILT_X); rx.setValueAtTime(CAM_TIME, 0); ease(rx);

    app.endUndoGroup();
    alert("Done. Click the viewer, set it to Active Camera and press 0 on the keypad for a RAM preview.");
})();