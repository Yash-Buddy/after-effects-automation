// Diagonal Cascade: skewed rounded cards sliding top-right -> bottom-left, seamless loop.
// File > Scripts > Run Script File. Pick 12-13 JPG/PNG (sorted by name).
(function () {
    var W = 1920, H = 1080, FPS = 30, DUR = 10;   // 16:9 landscape
    var CH = H * 0.5, CW = CH / 1.7, CORNER = 0.08;
    var HEAD = "Motion posters\rPresent. Without panic.";
    var BG = [0.49, 0.78, 0.20];   // brat green

    var isWin = ($.os.indexOf("Windows") !== -1);
    var flt = isWin ? "Images:*.jpg;*.jpeg;*.png" : function (f) {
        return (f instanceof Folder) || /\.(jpe?g|png)$/i.test(f.name);
    };
    var sel = File.openDialog("Select 12-13 JPG/PNG", flt, true);
    if (!sel) { alert("No files selected."); return; }
    var files = (sel instanceof File) ? [sel] : sel;
    files.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    files = files.slice(0, 13);

    function rr(x0, y0, x1, y1, r) {
        var k = 0.5523 * r, s = new Shape();
        s.vertices = [[x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r], [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r]];
        s.inTangents = [[-k, 0], [0, 0], [0, -k], [0, 0], [k, 0], [0, 0], [0, k], [0, 0]];
        s.outTangents = [[0, 0], [k, 0], [0, 0], [0, k], [0, 0], [-k, 0], [0, 0], [0, -k]];
        s.closed = true;
        return s;
    }

    app.beginUndoGroup("Diagonal Cascade");
    try {
        var items = [];
        for (var i = 0; i < files.length; i++) items.push(app.project.importFile(new ImportOptions(files[i])));
        var N = Math.max(items.length, 12);

        var comp = app.project.items.addComp("Diagonal Cascade", W, H, 1, DUR, FPS);
        comp.bgColor = BG;
        comp.layers.addSolid(BG, "BG", W, H, 1);

        // white grid over the background (Screen removes the black solid)
        var g = comp.layers.addSolid([0, 0, 0], "GRID", W, H, 1);
        g.blendingMode = BlendingMode.SCREEN;
        g.property("ADBE Transform Group").property("ADBE Opacity").setValue(60);
        try {
            var ge = g.property("ADBE Effect Parade").addProperty("ADBE Grid");
            ge.property("Size From").setValue(3);
            ge.property("Width").setValue(90);
            ge.property("Height").setValue(90);
            ge.property("Border").setValue(3);
            ge.property("Color").setValue([1, 1, 1]);
        } catch (e) { alert("Grid effect: " + e); }

        var ctl = comp.layers.addNull();
        ctl.name = "CONTROLS";
        function sl(n, v) {
            var e = ctl.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
            e.name = n; e.property(1).setValue(v);
        }
        sl("Loops", 1);     // whole number = seamless; negative = reverse
        sl("Skew", -30);    // shear angle
        sl("Tilt", 0);      // extra rotation

        for (var n = 0; n < N; n++) {
            var L = comp.layers.add(items[n % items.length]);
            L.name = "Card " + (n + 1);
            var s = Math.max(CW / L.width, CH / L.height);
            var tg = L.property("ADBE Transform Group");
            tg.property("ADBE Scale").setValue([s * 100, s * 100]);

            var cs = CW / s, chs = CH / s, x0 = (L.width - cs) / 2, y0 = (L.height - chs) / 2;
            L.property("ADBE Mask Parade").addProperty("ADBE Mask Atom")
                .property("ADBE Mask Shape").setValue(rr(x0, y0, x0 + cs, y0 + chs, cs * CORNER));

            tg.property("ADBE Position").expression =
                'var t=((' + n + '/' + N + '+thisComp.layer("CONTROLS").effect("Loops")(1)*time/thisComp.duration)%1+1)%1;' +
                'var u=t*1.6-0.3;[thisComp.width*(0.98-0.5*u),thisComp.height*u];';
            var fxp = L.property("ADBE Effect Parade");
            var gb = null, nm = ["Grow Bounds", "ADBE Grow Bounds"];
            for (var q = 0; q < nm.length && !gb; q++) { try { gb = fxp.addProperty(nm[q]); } catch (e) {} }
            if (gb) { try { gb.property(1).setValue(Math.round(cs * 0.5)); } catch (e) {} }
            var tf = fxp.addProperty("ADBE Geometry2");
            tf.property("Skew").expression = 'thisComp.layer("CONTROLS").effect("Skew")(1);';
            tf.property("Skew Axis").setValue(90);
            tg.property("ADBE Rotate Z").expression = 'thisComp.layer("CONTROLS").effect("Tilt")(1);';
        }

        var t = comp.layers.addText(HEAD);
        var tp = t.property("ADBE Text Properties").property("ADBE Text Document");
        var td = tp.value;
        td.fontSize = 96; td.fillColor = [0.05, 0.05, 0.05]; td.applyFill = true;
        td.justification = ParagraphJustification.LEFT_JUSTIFY;
        try { td.font = "HelveticaNeue-Light"; } catch (e) {}
        tp.setValue(td);
        t.property("ADBE Transform Group").property("ADBE Position").setValue([W * 0.06, H * 0.2]);
        comp.openInViewer();
        alert("Done: " + N + " cards.");
    } catch (err) {
        alert(err.toString() + "\nLine: " + err.line);
    }
    app.endUndoGroup();
})();
